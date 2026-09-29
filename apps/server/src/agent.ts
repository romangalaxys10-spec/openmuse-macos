import "./config.ts";
import { HttpAgent } from "@ag-ui/client";
import {
  type AgentsFactory,
  type CopilotKitIntelligence,
  CopilotRuntime,
  createCopilotHonoHandler,
} from "@copilotkit/runtime/v2";
import type { Auth } from "./auth.ts";
import type { Config } from "./config.ts";
import { ConversationAgent } from "./engine/conversation.ts";
import type { AgentService } from "./engine/service.ts";

export function agentConfigured(config: Config) {
  return (
    config.agentBackend === "sample" ||
    (config.agentBackend === "agui"
      ? Boolean(config.agentUrl)
      : Boolean(
          config.model &&
            (process.env.OPENAI_API_KEY ||
              process.env.ANTHROPIC_API_KEY ||
              process.env.GOOGLE_API_KEY),
        ))
  );
}
export function makeRuntime(
  config: Config,
  service: AgentService,
  auth: Auth,
  intelligence: CopilotKitIntelligence,
) {
  const agents: AgentsFactory = async ({ request }) => {
    const owner = await auth.owner(request.headers.get("authorization") ?? undefined);
    const agentInstance =
      config.agentBackend === "sample"
        ? new ConversationAgent(config, service, owner)
        : config.agentBackend === "agui"
          ? new HttpAgent({
              url: config.agentUrl ?? "http://127.0.0.1:1/unconfigured",
              headers: config.agentToken ? { Authorization: `Bearer ${config.agentToken}` } : {},
            })
          : new ConversationAgent(config, service, owner);

    return new Proxy(
      { default: agentInstance },
      {
        get(target, prop: string) {
          if (prop in target) return (target as any)[prop];
          return agentInstance;
        },
      },
    );
  };

  const richRuntime =
    config.richThreads !== false
      ? new CopilotRuntime({
          agents,
          intelligence,
          identifyUser: async (request) => ({
            id: await auth.owner(request.headers.get("authorization") ?? undefined),
            name: "OpenMuse user",
          }),
          generateThreadNames: false,
        })
      : new CopilotRuntime({
          agents,
        });

  const sseRuntime = new CopilotRuntime({ agents });

  const richMultiHandler = createCopilotHonoHandler({
    runtime: richRuntime,
    basePath: "/api/copilotkit",
    mode: "multi-route",
  });
  const richSingleHandler = createCopilotHonoHandler({
    runtime: richRuntime,
    basePath: "/api/copilotkit",
    mode: "single-route",
  });

  const sseMultiHandler = createCopilotHonoHandler({
    runtime: sseRuntime,
    basePath: "/api/copilotkit",
    mode: "multi-route",
  });
  const sseSingleHandler = createCopilotHonoHandler({
    runtime: sseRuntime,
    basePath: "/api/copilotkit",
    mode: "single-route",
  });

  return {
    async fetch(request: Request) {
      let isSingle = false;
      let singleMethod: string | undefined;
      let clone: Request | undefined;
      try {
        clone = request.clone();
        if (request.method === "POST") {
          const contentType = request.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const body = await request.clone().json().catch(() => null);
            if (body && typeof body.method === "string") {
              isSingle = true;
              singleMethod = body.method;
            }
          }
        }
      } catch {}

      const pathname = new URL(request.url).pathname;
      const isRunOrConnect =
        (!isSingle && (pathname.includes("/run") || pathname.includes("/connect"))) ||
        (isSingle && (singleMethod === "agent/run" || singleMethod === "agent/connect"));

      let res: Response;
      if (isRunOrConnect) {
        if (isSingle) {
          res = await sseSingleHandler.fetch(request);
          if (res.status === 404 && clone) {
            res = await sseMultiHandler.fetch(clone);
          }
        } else {
          res = await sseMultiHandler.fetch(request);
        }
        return res;
      }

      if (isSingle) {
        res = await richSingleHandler.fetch(request);
        if (res.status === 404 && clone) {
          res = await richMultiHandler.fetch(clone);
        }
      } else {
        res = await richMultiHandler.fetch(request);
      }

      const isInfo =
        (!isSingle && pathname.endsWith("/info")) ||
        (isSingle && singleMethod === "info");

      if (isInfo && res.status === 200) {
        try {
          const data = await res.json();
          data.mode = "sse";
          if (data.threadEndpoints) {
            data.threadEndpoints.realtimeMetadata = false;
          }
          return new Response(JSON.stringify(data), {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        } catch {
          return res;
        }
      }

      return res;
    },
  };
}

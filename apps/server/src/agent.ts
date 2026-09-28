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
  const agents: AgentsFactory = async ({ request }) => ({
    default:
      config.agentBackend === "sample"
        ? new ConversationAgent(
            config,
            service,
            await auth.owner(request.headers.get("authorization") ?? undefined),
          )
        : config.agentBackend === "agui"
          ? new HttpAgent({
              url: config.agentUrl ?? "http://127.0.0.1:1/unconfigured",
              headers: config.agentToken ? { Authorization: `Bearer ${config.agentToken}` } : {},
            })
          : new ConversationAgent(
              config,
              service,
              await auth.owner(request.headers.get("authorization") ?? undefined),
            ),
  });
  const runtime = new CopilotRuntime({
    agents,
  });
  const multiHandler = createCopilotHonoHandler({
    runtime,
    basePath: "/api/copilotkit",
    mode: "multi-route",
  });
  const singleHandler = createCopilotHonoHandler({
    runtime,
    basePath: "/api/copilotkit",
    mode: "single-route",
  });
  return {
    async fetch(request: Request) {
      let isSingle = false;
      let clone: Request | undefined;
      try {
        clone = request.clone();
        if (request.method === "POST") {
          const contentType = request.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const body = await request.clone().json().catch(() => null);
            if (body && typeof body.method === "string") {
              isSingle = true;
            }
          }
        }
      } catch {}

      if (isSingle) {
        const res = await singleHandler.fetch(request);
        if (res.status === 404 && clone) {
          return multiHandler.fetch(clone);
        }
        return res;
      }
      return multiHandler.fetch(request);
    },
  };
}

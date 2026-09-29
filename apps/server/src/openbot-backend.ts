import { Hono } from "hono";
import type { BrowserService } from "./browser.ts";
import type { ComputerService } from "./computer.ts";
import type { Config } from "./config.ts";

export function openbotRoutes(
  browser: BrowserService,
  computer: ComputerService,
  _config: Config,
) {
  const app = new Hono<{ Variables: { owner: string } }>();

  let controlHolder: "bot" | "human" = "bot";
  let controlSince = new Date().toISOString();
  let controlRequested = false;
  let controlReason: string | undefined;
  let controlRequestedAt: string | undefined;

  const handleMe = (c: any) => {
    const owner = c.get("owner") || "local-user";
    return c.json({
      user: {
        id: owner,
        email: `${owner}@openmuse.local`,
      },
    });
  };

  const handleCapabilities = (c: any) => {
    return c.json({
      mode: "intelligence" as const,
      durableHistory: true,
      generativeUi: true,
    });
  };

  const handleChannels = async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const agentIds =
      Array.isArray(body.agentIds) && body.agentIds.length > 0
        ? body.agentIds
        : ["default"];
    return c.json({
      channel: {
        id: `chan-${Date.now()}`,
        threadId: `thread-${Date.now()}`,
        agentIds,
      },
    });
  };

  const handleStatus = (c: any) => {
    const botId = c.req.param("botId");
    return c.json({
      botId,
      state: "ready" as const,
      reason: "OpenMuse Computer & Browser Active",
    });
  };

  const handleSnapshot = async (c: any) => {
    return c.json({
      snapshotId: Date.now(),
      url: "https://openmuse.local",
      title: "OpenMuse Desktop",
      truncated: false,
      elements: [
        {
          ref: "openmuse-workspace",
          role: "main",
          name: "OpenMuse Agent Workspace",
        },
      ],
    });
  };

  const handleNavigate = async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const url = typeof body.url === "string" ? body.url : "https://openmuse.local";
    const start = Date.now();
    let title = "OpenMuse Navigation";
    let text = "Page loaded successfully";

    try {
      const owner = c.get("owner") || "local-user";
      if (browser) {
        const session = await browser.observe(owner, url).catch(() => null);
        if (session) {
          title = session.title || title;
          text = session.text || text;
        }
      }
    } catch {}

    return c.json({
      url,
      title,
      text,
      truncated: false,
      elapsedMs: Math.max(1, Date.now() - start),
    });
  };

  const handleControl = (c: any) => {
    return c.json({
      holder: controlHolder,
      since: controlSince,
      requested: controlRequested,
      ...(controlReason ? { reason: controlReason } : {}),
      ...(controlRequestedAt ? { requestedAt: controlRequestedAt } : {}),
    });
  };

  const handleControlRequest = async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    controlRequested = true;
    controlReason = body.reason || "User requested control handover";
    controlRequestedAt = new Date().toISOString();
    return c.json({
      holder: controlHolder,
      since: controlSince,
      requested: controlRequested,
      reason: controlReason,
      requestedAt: controlRequestedAt,
    });
  };

  const handleControlTake = (c: any) => {
    controlHolder = "human";
    controlSince = new Date().toISOString();
    controlRequested = false;
    controlReason = undefined;
    controlRequestedAt = undefined;
    return c.json({
      holder: controlHolder,
      since: controlSince,
      requested: controlRequested,
    });
  };

  const handleControlRelease = (c: any) => {
    controlHolder = "bot";
    controlSince = new Date().toISOString();
    controlRequested = false;
    controlReason = undefined;
    controlRequestedAt = undefined;
    return c.json({
      holder: controlHolder,
      since: controlSince,
      requested: controlRequested,
    });
  };

  // Mount endpoints both with and without /api prefix
  app.get("/me", handleMe);
  app.get("/api/me", handleMe);

  app.get("/capabilities", handleCapabilities);
  app.get("/api/capabilities", handleCapabilities);

  app.post("/channels", handleChannels);
  app.post("/api/channels", handleChannels);

  app.get("/computers/:botId/status", handleStatus);
  app.get("/api/computers/:botId/status", handleStatus);

  app.post("/computers/:botId/snapshot", handleSnapshot);
  app.post("/api/computers/:botId/snapshot", handleSnapshot);

  app.post("/computers/:botId/navigate", handleNavigate);
  app.post("/api/computers/:botId/navigate", handleNavigate);

  app.get("/computers/:botId/control", handleControl);
  app.get("/api/computers/:botId/control", handleControl);

  app.post("/computers/:botId/control/request", handleControlRequest);
  app.post("/api/computers/:botId/control/request", handleControlRequest);

  app.post("/computers/:botId/control/take", handleControlTake);
  app.post("/api/computers/:botId/control/take", handleControlTake);

  app.post("/computers/:botId/control/release", handleControlRelease);
  app.post("/api/computers/:botId/control/release", handleControlRelease);

  return app;
}

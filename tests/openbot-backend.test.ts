import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { before } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { OpenBotAdapter } from "../packages/backends/src/openbot.ts";

let db: Store,
  app: Awaited<ReturnType<typeof createApp>>["app"],
  config: Config,
  adapter: OpenBotAdapter;

before(async () => {
  const directory = await mkdtemp(join(tmpdir(), "openmuse-openbot-"));
  db = await createStore();
  config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "sample",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
    openbotEnabled: true,
  };
  ({ app } = await createApp(db, config));

  const transport = {
    runtimeUrl: "http://localhost:8787/api/openbot/copilotkit",
    async request(path: string, init: RequestInit = {}) {
      const url = `http://localhost:8787/api/openbot${path.startsWith("/") ? path : `/${path}`}`;
      return app.request(url, init);
    },
  };
  adapter = new OpenBotAdapter({ enabled: true, agentId: "default", transport });
});

test("embedded OpenBot probe reports authenticated Intelligence capabilities", async () => {
  const probe = await adapter.probe();
  assert.equal(probe.state, "authenticated");
  if (probe.state === "authenticated") {
    assert.equal(probe.mode, "intelligence");
    assert.equal(probe.durableHistory, true);
    assert.equal(probe.generativeUi, true);
  }
});

test("embedded OpenBot reports computer status as ready", async () => {
  const status = await adapter.computerStatus("default");
  assert.equal(status.botId, "default");
  assert.equal(status.state, "ready");
});

test("embedded OpenBot snapshot returns active workspace elements", async () => {
  const snapshot = await adapter.snapshot("default");
  assert.equal(typeof snapshot.snapshotId, "number");
  assert.ok(snapshot.elements.length > 0);
  assert.equal(snapshot.truncated, false);
});

test("embedded OpenBot navigate succeeds and returns page metrics", async () => {
  const result = await adapter.navigate("default", { url: "https://example.com" });
  assert.ok(result.url.startsWith("https://example.com"));
  assert.ok(result.elapsedMs >= 0);
  assert.equal(result.truncated, false);
});

test("embedded OpenBot handles control state and handover lifecycle", async () => {
  const initial = await adapter.computerControl("default");
  assert.equal(initial.holder, "bot");
  assert.equal(initial.requested, false);

  const requested = await adapter.requestControl("default", "Need manual authorization");
  assert.equal(requested.requested, true);
  assert.equal(requested.reason, "Need manual authorization");

  const taken = await adapter.takeControl("default");
  assert.equal(taken.holder, "human");
  assert.equal(taken.requested, false);

  const released = await adapter.releaseControl("default");
  assert.equal(released.holder, "bot");
  assert.equal(released.requested, false);
});

test("embedded OpenBot creates conversation channels", async () => {
  const channel = await adapter.createConversation("default");
  assert.ok(channel.channelId.startsWith("chan-"));
  assert.ok(channel.threadId.startsWith("thread-"));
  assert.deepEqual(channel.agentIds, ["default"]);
});

test("workspace snapshot reflects connected OpenBot status and capabilities", async () => {
  const session = await app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const token = (await session.json()).token;
  const workspaceRes = await app.request("/api/workspace", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(workspaceRes.status, 200);
  const workspace = await workspaceRes.json();
  const openbotConnection = workspace.connections.find((c: any) => c.id === "openbot");
  assert.ok(openbotConnection);
  assert.equal(openbotConnection.status, "connected");
  assert.equal(workspace.runtime.openbotConfigured, true);
});

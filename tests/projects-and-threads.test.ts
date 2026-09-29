import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";

let db: Store;
let app: Awaited<ReturnType<typeof createApp>>["app"];
let config: Config;
let token: string;
let directory: string;

const headers = () => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "openmuse-proj-"));
  db = await createStore();
  config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "sample",
    intelligenceApiKey: "test-key",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  ({ app } = await createApp(db, config));
  const res = await app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 200);
  token = (await res.json()).token;
});

after(async () => {
  await db.close();
  await rm(directory, { recursive: true, force: true });
});

test("Projects CRUD endpoints manage workspace project groupings", async () => {
  // Initially empty list
  const listRes1 = await app.request("/api/projects", { headers: headers() });
  assert.equal(listRes1.status, 200);
  const initial = await listRes1.json();
  assert.equal(Array.isArray(initial), true);

  // Create project
  const createRes = await app.request("/api/projects", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: "Launch Campaign",
      description: "Q3 Website and Product launch",
      color: "purple",
    }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.name, "Launch Campaign");
  assert.equal(created.color, "purple");
  assert.equal(created.status, "active");
  assert.ok(created.id);

  // Update project
  const patchRes = await app.request(`/api/projects/${created.id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ name: "Launch Campaign V2", color: "rose" }),
  });
  assert.equal(patchRes.status, 200);
  const patched = await patchRes.json();
  assert.equal(patched.name, "Launch Campaign V2");
  assert.equal(patched.color, "rose");

  // Verify list contains updated
  const listRes2 = await app.request("/api/projects", { headers: headers() });
  const all = await listRes2.json();
  assert.equal(all.some((p: any) => p.id === created.id && p.name === "Launch Campaign V2"), true);

  // Delete project
  const delRes = await app.request(`/api/projects/${created.id}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(delRes.status, 200);

  const listRes3 = await app.request("/api/projects", { headers: headers() });
  const remaining = await listRes3.json();
  assert.equal(remaining.some((p: any) => p.id === created.id), false);
});

test("Project Tasks CRUD endpoints manage tasks under projects", async () => {
  // Create task
  const createRes = await app.request("/api/project-tasks", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title: "Write landing page copy",
      description: "Draft 3 headline variations",
      projectId: "proj-alpha",
      priority: "high",
    }),
  });
  assert.equal(createRes.status, 201);
  const task = await createRes.json();
  assert.equal(task.title, "Write landing page copy");
  assert.equal(task.projectId, "proj-alpha");
  assert.equal(task.status, "todo");
  assert.equal(task.priority, "high");

  // Query project tasks
  const projTasksRes = await app.request(`/api/projects/proj-alpha/tasks`, {
    headers: headers(),
  });
  assert.equal(projTasksRes.status, 200);
  const projTasks = await projTasksRes.json();
  assert.equal(projTasks.length >= 1, true);
  assert.equal(projTasks.some((t: any) => t.id === task.id), true);

  // Patch status to done
  const patchRes = await app.request(`/api/project-tasks/${task.id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(patchRes.status, 200);
  const patched = await patchRes.json();
  assert.equal(patched.status, "done");

  // Delete task
  const delRes = await app.request(`/api/project-tasks/${task.id}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(delRes.status, 200);
});

test("Thread metadata endpoints support tags, rename, and archive", async () => {
  const threadId = "test-session-123";

  // Patch metadata: rename and tags
  const patchRes = await app.request(`/api/threads/${threadId}/meta`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      name: "Competitor Market Analysis",
      tags: ["research", "urgent"],
      projectId: "proj-beta",
    }),
  });
  assert.equal(patchRes.status, 200);
  const meta = await patchRes.json();
  assert.equal(meta.name, "Competitor Market Analysis");
  assert.deepEqual(meta.tags, ["research", "urgent"]);
  assert.equal(meta.projectId, "proj-beta");

  // Get metadata
  const getRes = await app.request(`/api/threads/${threadId}/meta`, {
    headers: headers(),
  });
  assert.equal(getRes.status, 200);
  const fetched = await getRes.json();
  assert.equal(fetched.name, "Competitor Market Analysis");
  assert.deepEqual(fetched.tags, ["research", "urgent"]);

  // Archive
  const archRes = await app.request(`/api/threads/${threadId}/archive`, {
    method: "POST",
    headers: headers(),
  });
  assert.equal(archRes.status, 200);

  // Delete
  const delRes = await app.request(`/api/threads/${threadId}`, {
    method: "DELETE",
    headers: headers(),
  });
  assert.equal(delRes.status, 200);
});

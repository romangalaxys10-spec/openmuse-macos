import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import type { Store } from "../db.ts";

export class LocalIntelligence extends CopilotKitIntelligence {
  constructor(
    private readonly db: Store,
    config: { apiKey: string; apiUrl?: string },
  ) {
    super(config);
  }

  override async getOrCreateThread(params: any): Promise<any> {
    const userId = params.userId || "local-user";
    const existing = await this.db.get<any>(userId, "threads", params.threadId);
    if (existing) {
      return { thread: existing, created: false };
    }
    const isMain = String(params.threadId).includes("main");
    const thread = {
      id: params.threadId,
      name: params.name || (isMain ? "Main chat" : "New conversation"),
      userId,
      agentId: params.agentId || "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: false,
    };
    await this.db.put(userId, "threads", thread);
    return { thread, created: true };
  }

  override async getThread(params: any): Promise<any> {
    const userId = params.userId || "local-user";
    const thread = await this.db.get<any>(userId, "threads", params.threadId);
    if (thread) return thread;
    const isMain = String(params.threadId).includes("main");
    return {
      id: params.threadId,
      name: isMain ? "Main chat" : "New conversation",
      userId,
      agentId: params.agentId || "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: false,
    };
  }

  override async createThread(params: any): Promise<any> {
    const userId = params.userId || "local-user";
    const isMain = String(params.threadId).includes("main");
    const thread = {
      id: params.threadId,
      name: params.name || (isMain ? "Main chat" : "New conversation"),
      userId,
      agentId: params.agentId || "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: false,
    };
    await this.db.put(userId, "threads", thread);
    return thread;
  }

  override async getThreadMessages(params: any): Promise<any> {
    const userId = params.userId || "local-user";
    const saved = await this.db.get<{ messages: any[] }>(
      userId,
      "conversations",
      params.threadId,
    );
    return { messages: saved?.messages ?? [] };
  }

  override async listThreads(params: any): Promise<any> {
    const userId = params.userId || "local-user";
    const all = (await this.db.list<any>(userId, "threads")) ?? [];
    const threads = all
      .filter((t: any) => (params.includeArchived ? true : !t.archived))
      .sort((a: any, b: any) =>
        (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""),
      );
    return {
      threads,
      joinCode: "local-join-code",
      joinToken: "local-join-token",
      nextCursor: null,
    };
  }

  override async updateThread(params: any): Promise<any> {
    const userId = params.userId || "local-user";
    const existing = (await this.db.get<any>(userId, "threads", params.threadId)) ?? {};
    const updates = params.updates ?? params;
    const updated = {
      ...existing,
      ...updates,
      id: params.threadId,
      updatedAt: new Date().toISOString(),
    };
    await this.db.put(userId, "threads", updated);
    return updated;
  }

  override async archiveThread(params: any): Promise<any> {
    const userId = params.userId || "local-user";
    const existing = (await this.db.get<any>(userId, "threads", params.threadId)) ?? {
      id: params.threadId,
    };
    await this.db.put(userId, "threads", {
      ...existing,
      archived: true,
      updatedAt: new Date().toISOString(),
    });
  }

  override async deleteThread(params: any): Promise<any> {
    const userId = params.userId || "local-user";
    await this.db.remove(userId, "threads", params.threadId);
    await this.db.remove(userId, "conversations", params.threadId);
  }

  override async annotate(_params: any): Promise<any> {
    return { ok: true };
  }

  override async getInspectorMetadata(): Promise<any> {
    return undefined;
  }

  override async getRuntimeEntitlements(): Promise<any> {
    return {
      status: "ready",
      entitlement: {
        source: "selfHosted",
        active: true,
      },
    };
  }

  override async ɵsubscribeToThreads(): Promise<any> {
    return {
      joinCode: "local-join-code",
      joinToken: "local-join-token",
    };
  }

  override async ɵsubscribeToMemories(): Promise<any> {
    return {
      joinCode: "local-join-code",
      joinToken: "local-join-token",
    };
  }

  override async ɵacquireThreadLock(params: any): Promise<any> {
    return {
      threadId: params.threadId,
      runId: params.runId,
      joinToken: "local-join-token",
    };
  }

  override async ɵcleanupThreadLock(_params: any): Promise<any> {
    return;
  }

  override async ɵrenewThreadLock(_params: any): Promise<any> {
    return { renewed: true };
  }

  override async ɵconnectThread(params: any): Promise<any> {
    return {
      threadId: params.threadId,
      joinToken: "local-join-token",
    };
  }

  override ɵgetClientWsUrl(): string {
    return "";
  }
}

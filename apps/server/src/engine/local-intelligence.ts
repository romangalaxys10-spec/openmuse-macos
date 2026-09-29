import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import type { Store } from "../db.ts";

function isCloudAuthFailure(err: any): boolean {
  if (!err) return false;
  if (err.message === "Platform unavailable") return false;
  const msg = String(err.message || err);
  const status = (err as any).status || (err as any).statusCode;
  return (
    status === 401 ||
    status === 403 ||
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("Unauthorized") ||
    msg.includes("Forbidden") ||
    msg.includes("Invalid token") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("fetch failed") ||
    msg.includes("missing joinToken")
  );
}

export class LocalIntelligence extends CopilotKitIntelligence {
  constructor(
    private readonly db: Store,
    config: { apiKey: string; apiUrl?: string },
  ) {
    super(config);
  }

  override async getOrCreateThread(params: any): Promise<any> {
    try {
      const res = await super.getOrCreateThread(params);
      const userId = params.userId || "local-user";
      const thread = {
        id: params.threadId,
        name: params.name || "Main chat",
        userId,
        agentId: params.agentId || "default",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archived: false,
      };
      await this.db.put(userId, "threads", thread);
      return res;
    } catch (err: any) {
      if (isCloudAuthFailure(err)) {
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
      throw err;
    }
  }

  override async getThread(params: any): Promise<any> {
    try {
      return await super.getThread(params);
    } catch (err: any) {
      if (isCloudAuthFailure(err)) {
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
      throw err;
    }
  }

  override async createThread(params: any): Promise<any> {
    try {
      return await super.createThread(params);
    } catch (err: any) {
      if (isCloudAuthFailure(err)) {
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
      throw err;
    }
  }

  override async getThreadMessages(params: any): Promise<any> {
    try {
      return await super.getThreadMessages(params);
    } catch (err: any) {
      if (isCloudAuthFailure(err)) {
        const userId = params.userId || "local-user";
        const saved = await this.db.get<{ messages: any[] }>(
          userId,
          "conversations",
          params.threadId,
        );
        return { messages: saved?.messages ?? [] };
      }
      throw err;
    }
  }

  override async listThreads(params: any): Promise<any> {
    try {
      return await super.listThreads(params);
    } catch (err: any) {
      if (isCloudAuthFailure(err)) {
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
      throw err;
    }
  }

  override async updateThread(params: any): Promise<any> {
    try {
      const res = await super.updateThread(params);
      const userId = params.userId || "local-user";
      const existing = (await this.db.get<any>(userId, "threads", params.threadId)) ?? {};
      const updates = params.updates ?? params;
      await this.db.put(userId, "threads", {
        ...existing,
        ...updates,
        id: params.threadId,
        updatedAt: new Date().toISOString(),
      });
      return res;
    } catch (err: any) {
      if (isCloudAuthFailure(err)) {
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
      throw err;
    }
  }

  override async archiveThread(params: any): Promise<any> {
    try {
      await super.archiveThread(params);
      const userId = params.userId || "local-user";
      const existing = (await this.db.get<any>(userId, "threads", params.threadId)) ?? {
        id: params.threadId,
      };
      await this.db.put(userId, "threads", {
        ...existing,
        archived: true,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      if (isCloudAuthFailure(err)) {
        const userId = params.userId || "local-user";
        const existing = (await this.db.get<any>(userId, "threads", params.threadId)) ?? {
          id: params.threadId,
        };
        await this.db.put(userId, "threads", {
          ...existing,
          archived: true,
          updatedAt: new Date().toISOString(),
        });
        return;
      }
      throw err;
    }
  }

  override async deleteThread(params: any): Promise<any> {
    try {
      await super.deleteThread(params);
    } catch (err: any) {
      if (!isCloudAuthFailure(err)) throw err;
    }
    const userId = params.userId || "local-user";
    await this.db.remove(userId, "threads", params.threadId);
    await this.db.remove(userId, "conversations", params.threadId);
  }

  override async annotate(params: any): Promise<any> {
    try {
      return await super.annotate(params);
    } catch {
      return { ok: true };
    }
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
    try {
      return await super.ɵconnectThread(params);
    } catch (err: any) {
      if (isCloudAuthFailure(err)) {
        return {
          threadId: params.threadId,
          joinToken: "local-join-token",
        };
      }
      throw err;
    }
  }

  override ɵgetClientWsUrl(): string {
    return "";
  }
}

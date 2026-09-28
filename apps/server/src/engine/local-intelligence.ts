import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import type { Store } from "../db.ts";

function isAuthOrCloudFailure(err: any): boolean {
  if (!err) return false;
  const status = err.status ?? err.statusCode;
  const msg = String(err.message || "");
  if (status === 401 || status === 403) return true;
  if (msg.includes("AUTH_UNAUTHENTICATED") || msg.includes("Authentication is required")) return true;
  if (msg.includes("401") || msg.includes("403")) return true;
  if (msg.includes("fetch failed") || msg.includes("ENOTFOUND")) return true;
  return false;
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
      return await super.getOrCreateThread(params);
    } catch (err: any) {
      if (isAuthOrCloudFailure(err)) {
        await this.db.insertIfAbsent(params.userId, "threads", {
          id: params.threadId,
          name: "Main chat",
          userId: params.userId,
          agentId: params.agentId,
          createdAt: new Date().toISOString(),
          archived: false,
        });
        const thread =
          (await this.db.get(params.userId, "threads", params.threadId)) ?? {
            id: params.threadId,
            name: "Main chat",
            userId: params.userId,
            agentId: params.agentId,
            createdAt: new Date().toISOString(),
            archived: false,
          };
        return { thread, created: true };
      }
      throw err;
    }
  }

  override async getThread(params: any): Promise<any> {
    try {
      return await super.getThread(params);
    } catch (err: any) {
      if (isAuthOrCloudFailure(err)) {
        const thread = await this.db.get(params.userId, "threads", params.threadId);
        if (thread) return thread;
        return {
          id: params.threadId,
          name: "Main chat",
          userId: params.userId,
          agentId: params.agentId,
          createdAt: new Date().toISOString(),
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
      if (isAuthOrCloudFailure(err)) {
        const thread = {
          id: params.threadId,
          name: params.name || "Main chat",
          userId: params.userId,
          agentId: params.agentId,
          createdAt: new Date().toISOString(),
          archived: false,
        };
        await this.db.put(params.userId, "threads", thread);
        return thread;
      }
      throw err;
    }
  }

  override async getThreadMessages(params: any): Promise<any> {
    try {
      return await super.getThreadMessages(params);
    } catch (err: any) {
      if (isAuthOrCloudFailure(err)) {
        const saved = await this.db.get<{ messages: any[] }>(
          params.userId,
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
      if (isAuthOrCloudFailure(err)) {
        const threads = (await this.db.list(params.userId, "threads")) ?? [];
        return { threads };
      }
      throw err;
    }
  }

  override async updateThread(params: any): Promise<any> {
    try {
      return await super.updateThread(params);
    } catch (err: any) {
      if (isAuthOrCloudFailure(err)) {
        const existing =
          (await this.db.get(params.userId, "threads", params.threadId)) ?? {};
        const updated = { ...existing, ...params, id: params.threadId };
        await this.db.put(params.userId, "threads", updated);
        return { thread: updated };
      }
      throw err;
    }
  }

  override async archiveThread(params: any): Promise<any> {
    try {
      return await super.archiveThread(params);
    } catch (err: any) {
      if (isAuthOrCloudFailure(err)) {
        const existing = (await this.db.get<{ id: string; [key: string]: unknown }>(
          params.userId,
          "threads",
          params.threadId,
        )) ?? { id: params.threadId };
        await this.db.put(params.userId, "threads", { ...existing, archived: true });
        return;
      }
      throw err;
    }
  }

  override async deleteThread(params: any): Promise<any> {
    try {
      return await super.deleteThread(params);
    } catch (err: any) {
      if (isAuthOrCloudFailure(err)) {
        await this.db.remove(params.userId, "threads", params.threadId);
        return;
      }
      throw err;
    }
  }

  override async annotate(_params: any): Promise<any> {
    return { ok: true };
  }

  override async ɵacquireThreadLock(params: any): Promise<any> {
    try {
      return await super.ɵacquireThreadLock(params);
    } catch {
      return {
        threadId: params.threadId,
        runId: params.runId,
        joinToken: "local-join-token",
      };
    }
  }

  override async ɵcleanupThreadLock(params: any): Promise<any> {
    try {
      return await super.ɵcleanupThreadLock(params);
    } catch {
      return;
    }
  }

  override async ɵrenewThreadLock(params: any): Promise<any> {
    try {
      return await super.ɵrenewThreadLock(params);
    } catch {
      return { renewed: true };
    }
  }

  override async ɵconnectThread(params: any): Promise<any> {
    try {
      return await super.ɵconnectThread(params);
    } catch {
      return { ok: true };
    }
  }
}

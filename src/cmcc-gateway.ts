// Node 版网关实例：替代 Cloudflare Durable Object
// 每个新消息账号一个实例，各自维护一条 WebSocket 长连接
import type { Hono } from "hono";

import {
  DEFAULT_CMCC_SERVER,
  DEFAULT_CMCC_UPLOAD,
  DEFAULT_CMCC_VERSION,
} from "./constants.js";
import type { Bindings } from "./env.js";
import { ensureConnected } from "./gateway/connection.js";
import { createGatewayApp } from "./gateway/router.js";
import { errorMessage } from "./http.js";

/** ws 库 WebSocket 的最小接口，避免和 DOM 的 WebSocket 类型打架 */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** 常量：WebSocket.OPEN */
export const WS_OPEN = 1;

interface KvStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(at: number): Promise<void>;
  getAlarm(): Promise<number | null>;
}

export interface GatewayStateLike {
  id: string;
  storage: KvStore;
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * 基于 SQLite 的 KV：接收人、inbox、最后帧、账号 Key 都落盘，重启不丢。
 * 表：kv(key TEXT PRIMARY KEY, value TEXT NOT NULL)
 */
export class SqliteKv implements KvStore {
  private alarmAt: number | null = null;
  private readonly prefix: string;

  constructor(
    private readonly db: D1Database | undefined,
    namespace: string,
  ) {
    this.prefix = `gw:${namespace}:`;
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    if (!this.db) return undefined;
    const row = await this.db
      .prepare("SELECT value FROM kv WHERE key = ?")
      .bind(this.prefix + key)
      .first<{ value: string }>();
    if (!row) return undefined;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return undefined;
    }
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    if (!this.db) return;
    await this.db
      .prepare(
        "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .bind(this.prefix + key, JSON.stringify(value))
      .run();
  }

  async delete(key: string): Promise<boolean> {
    if (!this.db) return false;
    await this.db
      .prepare("DELETE FROM kv WHERE key = ?")
      .bind(this.prefix + key)
      .run();
    return true;
  }

  async setAlarm(at: number): Promise<void> {
    this.alarmAt = at;
  }

  async getAlarm(): Promise<number | null> {
    return this.alarmAt;
  }
}

export class CmccGateway {
  readonly state: GatewayStateLike;
  readonly bindings: Bindings;

  ws: SocketLike | null = null;
  authenticated = false;
  connectPromise: Promise<void> | null = null;
  authResolve: (() => void) | null = null;
  authReject: ((reason?: unknown) => void) | null = null;
  authTimeout: ReturnType<typeof setTimeout> | null = null;
  heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  lastPongAt = 0;
  lastConnectAt = 0;
  lastDisconnectAt = 0;
  lastError: string | null = null;
  /** 该实例专属的移动 API Key（多账号时从 DB 下发并持久化），空则回落到环境变量 */
  storedApiKey: string | null = null;

  readonly app: Hono;
  private readonly storage: SqliteKv;

  constructor(
    readonly accountId: string,
    bindings: Bindings,
    db: D1Database | undefined,
  ) {
    this.bindings = bindings;
    this.storage = new SqliteKv(db, accountId);
    this.state = {
      id: accountId,
      storage: this.storage,
      waitUntil: (promise: Promise<unknown>) => {
        // Node 里没有 waitUntil，直接跑，吞掉错误避免 unhandled rejection
        void Promise.resolve(promise).catch(() => undefined);
      },
    };
    this.app = createGatewayApp(this);
  }

  /** 从持久化存储恢复 API Key（启动时调用一次） */
  async restore(): Promise<void> {
    const stored = await this.storage.get<string>("apiKey");
    if (typeof stored === "string" && stored) this.storedApiKey = stored;
  }

  get cmccApiKey(): string {
    return String(this.storedApiKey || this.bindings.CMCC_API_KEY || "").trim();
  }

  async setApiKey(apiKey: string): Promise<void> {
    this.storedApiKey = apiKey || null;
    if (apiKey) {
      await this.storage.put("apiKey", apiKey);
    } else {
      await this.storage.delete("apiKey");
    }
    // 换了 Key 必须断开重连，否则还是用旧凭证
    try {
      this.ws?.close(1000, "apikey changed");
    } catch {
      // ignore
    }
    this.ws = null;
    this.authenticated = false;
  }

  get serverUrl(): string {
    return (
      String(this.bindings.CMCC_SERVER_URL || "").trim() || DEFAULT_CMCC_SERVER
    );
  }

  get uploadBaseUrl(): string {
    return (
      String(this.bindings.CMCC_UPLOAD_URL || "").trim() || DEFAULT_CMCC_UPLOAD
    ).replace(/\/+$/, "");
  }

  get cmccVersion(): string {
    return (
      String(this.bindings.CMCC_VERSION || "").trim() || DEFAULT_CMCC_VERSION
    );
  }

  isOpen(): this is this & { ws: SocketLike } {
    return this.ws !== null && this.ws.readyState === WS_OPEN;
  }

  async fetch(request: Request): Promise<Response> {
    return this.app.fetch(request);
  }

  /** 保活：由 index.ts 的定时器周期调用 */
  async keepAlive(): Promise<void> {
    try {
      await ensureConnected(this);
    } catch (error) {
      this.lastError = errorMessage(error);
    }
  }
}

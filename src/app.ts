import { Hono } from "hono";

import { extractPush, isPushPath, recordAndFanout } from "./admin/hook.js";
import type { PushInfo } from "./admin/hook.js";
import { createAdminApp } from "./admin/routes.js";
import {
  findToken,
  getAccount,
  getTokenChannels,
  listAccounts,
  listChannels,
} from "./admin/store.js";
import { CmccGateway } from "./cmcc-gateway.js";
import type { Bindings, HonoEnv } from "./env.js";
import { errorMessage, getAuthToken, json } from "./http.js";
import { VERSION } from "./version.js";

const DEFAULT_ACCOUNT = "default";

/** 账号 → 网关实例（懒创建，一个账号一条长连接） */
export class GatewayRegistry {
  private readonly map = new Map<string, CmccGateway>();

  constructor(
    private readonly bindings: Bindings,
    private readonly db: D1Database | undefined,
  ) {}

  async get(accountId: string): Promise<CmccGateway> {
    const cached = this.map.get(accountId);
    if (cached) return cached;

    const gateway = new CmccGateway(accountId, this.bindings, this.db);
    await gateway.restore();
    this.map.set(accountId, gateway);
    return gateway;
  }

  all(): CmccGateway[] {
    return [...this.map.values()];
  }
}

export interface AppBundle {
  app: Hono<HonoEnv>;
  registry: GatewayRegistry;
  /** Hono 的 context.env 需要显式传入（Node 没有 Worker 的自动注入） */
  env: Bindings;
}

export function createApp(
  bindings: Bindings,
  db: D1Database | undefined,
): AppBundle {
  const registry = new GatewayRegistry(bindings, db);
  const env: Bindings = { ...bindings, DB: db, registry };

  /** 令牌没指定账号、或指定的账号不存在/停用时，退回最近连通过的启用账号 */
  async function resolveAccountId(preferred?: string | null): Promise<string> {
    if (!db) return preferred || DEFAULT_ACCOUNT;
    if (preferred) {
      const account = await getAccount(db, preferred);
      if (account && account.enabled === 1) return account.id;
    }
    const rows = (await listAccounts(db)).filter((row) => row.enabled === 1);
    // 优先「已记录接收人」的账号，其次最近连通过的——否则默认可能落到没配好的号上
    rows.sort((a, b) => {
      const ra = a.recipient ? 1 : 0;
      const rb = b.recipient ? 1 : 0;
      if (ra !== rb) return rb - ra;
      return (b.last_ok_at || 0) - (a.last_ok_at || 0);
    });
    return rows[0] ? rows[0].id : preferred || DEFAULT_ACCOUNT;
  }

  async function healthPayload(
    accountId?: string,
  ): Promise<Record<string, unknown>> {
    const id = await resolveAccountId(accountId);
    try {
      const gateway = await registry.get(id);
      const response = await gateway.fetch(
        new Request("https://cmcc.internal/health"),
      );
      const detail = (await response.json()) as Record<string, unknown>;
      return {
        ok: true,
        service: "cmcc-message-gateway",
        version: VERSION,
        runtime: "node",
        account: id,
        connected: Boolean(detail.connected),
        authenticated: Boolean(detail.authenticated),
        hasRecipient: Boolean(detail.hasRecipient),
        lastError: detail.lastError ?? null,
        lastPongAt: detail.lastPongAt ?? null,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        ok: false,
        service: "cmcc-message-gateway",
        version: VERSION,
        runtime: "node",
        account: id,
        connected: false,
        authenticated: false,
        hasRecipient: false,
        error: errorMessage(error),
        timestamp: Date.now(),
      };
    }
  }

  async function configureAccount(accountId: string): Promise<string | null> {
    if (!db) return "数据库未就绪";
    const account = await getAccount(db, accountId);
    if (!account) return "账号不存在";
    try {
      const gateway = await registry.get(accountId);
      await gateway.setApiKey(account.api_key || "");
      if (account.recipient) {
        await gateway.state.storage.put("currentRecipient", {
          id: account.recipient,
          source: "config",
          updatedAt: Date.now(),
        });
      }
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  async function connectAccount(accountId: string): Promise<string | null> {
    try {
      const gateway = await registry.get(accountId);
      const response = await gateway.fetch(
        new Request("https://cmcc.internal/connect"),
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        return data.message || `HTTP ${response.status}`;
      }
      const data = (await response.json()) as {
        connected?: boolean;
        authenticated?: boolean;
      };
      if (!data.connected) return "WebSocket 未连接";
      if (!data.authenticated) return "已连接但未通过鉴权（Key 可能无效）";
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  /** 转发给账号实例；推送类请求顺带记日志 + fanout */
  async function deliver(
    request: Request,
    tokenName = "",
    tokenId = "",
    accountId = DEFAULT_ACCOUNT,
  ): Promise<Response> {
    const gateway = await registry.get(accountId);
    const path = new URL(request.url).pathname;
    const push = isPushPath(request.method, path);

    if (!push) {
      return await gateway.fetch(request);
    }

    let info: PushInfo = { kind: "text", title: "", body: "" };
    try {
      info = await extractPush(request.clone() as unknown as Request, path);
    } catch {
      info = { kind: "text", title: "", body: "" };
    }

    // 空消息直接拒绝，不投递任何地方
    if (!info.title && !info.body) {
      return json({ ok: false, code: 400, message: "消息内容不能为空" }, 400);
    }

    let allowed: string[] | null = null;
    if (db && tokenId) {
      allowed = await getTokenChannels(db, tokenId);
    }

    // 文本 + 令牌明确勾选通道 → 完全交给通道，主链路不参与
    const channelOnly = info.kind === "text" && Array.isArray(allowed);

    // Node 里没有 waitUntil，用 fire-and-forget 模拟：不阻塞响应
    const wait = (task: Promise<unknown>): void => {
      void task.catch(() => undefined);
    };

    const url = new URL(request.url);
    const isAsync =
      url.searchParams.get("async") === "1" ||
      request.headers.get("x-async") === "1";

    const runFanout = async (response: Response): Promise<void> => {
      if (!db) return;
      await recordAndFanout(env, response, info, tokenName, request, tokenId, {
        allowed,
        skip: [],
      });
    };

    if (isAsync) {
      const forward = request.clone() as unknown as Request;
      wait(
        (async (): Promise<void> => {
          let inner: Response;
          if (channelOnly) {
            inner = json({
              ok: true,
              code: 200,
              message: "已按令牌绑定的通道投递",
              data: { status: "channel_only", messageId: null },
            });
          } else {
            inner = await gateway.fetch(forward);
          }
          await runFanout(inner);
        })(),
      );
      return json(
        {
          ok: true,
          code: 202,
          message: "已入队，后台投递（结果见面板日志）",
          data: { status: "queued", messageId: null },
        },
        202,
      );
    }

    const skip: string[] = [];
    let response: Response;

    if (channelOnly) {
      response = json({
        ok: true,
        code: 200,
        message: "已按令牌绑定的通道投递",
        data: { status: "channel_only", messageId: null },
      });
    } else {
      response = await gateway.fetch(request);
      // 全选模式：跳过指向主链路账号的新消息通道，避免同号收两条
      if (!Array.isArray(allowed) && db) {
        const rows = await listChannels(db);
        for (const row of rows) {
          if (row.type !== "cmcc") continue;
          try {
            const cfg = JSON.parse(row.config) as { account_id?: string };
            if ((cfg.account_id || DEFAULT_ACCOUNT) === accountId) {
              skip.push(row.id);
            }
          } catch {
            // 配置坏了交给 dispatch 报错
          }
        }
      }
    }

    wait(
      recordAndFanout(env, response, info, tokenName, request, tokenId, {
        allowed,
        skip,
      }),
    );

    return response;
  }

  const app = new Hono<HonoEnv>();

  app.route(
    "/",
    createAdminApp({
      health: (_bindings, accountId) => healthPayload(accountId),
      configure: (_bindings, accountId) => configureAccount(accountId),
      connect: (_bindings, accountId) => connectAccount(accountId),
      deliver: (_bindings, request) =>
        deliver(request, "面板测试", "", DEFAULT_ACCOUNT),
    }),
  );

  app.use("*", async (context, next) => {
    const path = context.req.path;
    if (
      path === "/" ||
      path === "/health" ||
      path === "/admin" ||
      path.startsWith("/admin/")
    ) {
      await next();
      return;
    }

    // 内部接口只允许进程内调用，外部一律 404
    if (path.startsWith("/internal/")) {
      return json({ ok: false, code: 404, message: "Not Found" }, 404);
    }

    const token = getAuthToken(context.req.raw);
    if (!token) {
      return json({ ok: false, code: 401, message: "Unauthorized" }, 401);
    }

    if (env.API_TOKEN && token === env.API_TOKEN) {
      context.set("tokenName", "内置 API_TOKEN");
      context.set("tokenId", "");
      context.set("accountId", await resolveAccountId(null));
      await next();
      return;
    }

    if (db) {
      const row = await findToken(db, token);
      if (row) {
        context.set("tokenName", row.name);
        context.set("tokenId", row.id);
        context.set("accountId", await resolveAccountId(row.account_id));
        await next();
        return;
      }
    }

    return json({ ok: false, code: 401, message: "Unauthorized" }, 401);
  });

  app.get("/", async () => json(await healthPayload()));
  app.get("/health", async (context) => {
    const accountId = context.req.query("account") || DEFAULT_ACCOUNT;
    const payload = await healthPayload(accountId);
    return json(payload, payload.connected ? 200 : 503);
  });

  app.all("*", (context) =>
    deliver(
      context.req.raw as unknown as Request,
      context.get("tokenName") || "",
      context.get("tokenId") || "",
      context.get("accountId") || DEFAULT_ACCOUNT,
    ),
  );

  return { app, registry, env };
}

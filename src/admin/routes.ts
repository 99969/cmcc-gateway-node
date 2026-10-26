// /admin 页面与 /admin/api/* 管理接口
import { Hono } from "hono";

import type { Bindings, HonoEnv } from "../env.js";
import { errorMessage, json } from "../http.js";
import { PANEL_HTML } from "./panel.js";
import { BUILD, VERSION } from "../version.js";
import {
  accountResult,
  clearLogs,
  createAccount,
  createChannel,
  createToken,
  deleteAccount,
  deleteChannel,
  deleteToken,
  getAccount,
  listAccounts,
  listChannels,
  listLogs,
  listTokens,
  stats,
  toggleAccount,
  toggleChannel,
  toggleToken,
  updateAccount,
  updateChannel,
  updateTokenAccount,
  updateTokenChannels,
} from "./store.js";
import { dispatchChannel } from "./dispatch.js";

/** 反代后 req.url 是内网地址，优先用 BASE_URL 生成对外链接 */
function publicOrigin(context: { env: Bindings; req: { url: string } }): string {
  const configured = String(context.env.BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(context.req.url).origin;
}

export interface AdminDeps {
  health: (env: Bindings, accountId?: string) => Promise<Record<string, unknown>>;
  deliver: (env: Bindings, request: Request) => Promise<Response>;
  /** 给某个账号的 DO 实例下发 API Key（多账号） */
  configure: (env: Bindings, accountId: string) => Promise<string | null>;
  /** 主动建立该账号的连接 */
  connect: (env: Bindings, accountId: string) => Promise<string | null>;
}

function provided(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const header = request.headers.get("x-admin-token");
  if (header) return header.trim();
  return (new URL(request.url).searchParams.get("admin") || "").trim();
}

export function createAdminApp(deps: AdminDeps): Hono<HonoEnv> {
  const admin = new Hono<HonoEnv>();

  admin.get("/admin", () => {
    const html = PANEL_HTML;
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, must-revalidate",
        expires: "0",
        "x-panel-version": `${VERSION} (${BUILD})`,
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
      },
    });
  });

  // ---------------------------------------------- GitHub 一键登录
  admin.get("/admin/oauth/start", async (context) => {
    const clientId = context.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return new Response("未配置 GITHUB_CLIENT_ID", { status: 500 });
    }
    const database = db(context);
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const state = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await database
      .prepare("INSERT INTO oauth_states (state, expires_at) VALUES (?, ?)")
      .bind(state, Date.now() + 10 * 60_000)
      .run();
    await database
      .prepare("DELETE FROM oauth_states WHERE expires_at < ?")
      .bind(Date.now())
      .run();
    const origin = publicOrigin(context);
    const redirectUri = `${origin}/admin/oauth/callback`;
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", "read:user");
    authorize.searchParams.set("state", state);
    return Response.redirect(authorize.toString(), 302);
  });

  admin.get("/admin/oauth/callback", async (context) => {
    const origin = publicOrigin(context);
    const fail = (message: string): Response =>
      Response.redirect(
        `${origin}/admin#loginerror=${encodeURIComponent(message)}`,
        302,
      );

    const database = db(context);
    const url = new URL(context.req.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (url.searchParams.get("error") || !code || !state) {
      return fail("GitHub 授权被取消");
    }

    const stateRow = await database
      .prepare("SELECT expires_at FROM oauth_states WHERE state = ?")
      .bind(state)
      .first<{ expires_at: number }>();
    await database
      .prepare("DELETE FROM oauth_states WHERE state = ?")
      .bind(state)
      .run();
    if (!stateRow || stateRow.expires_at < Date.now()) {
      return fail("授权已过期，请重试");
    }

    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_id: context.env.GITHUB_CLIENT_ID,
          client_secret: context.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${origin}/admin/oauth/callback`,
        }),
      },
    );
    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
    };
    if (!tokenData.access_token) {
      return fail("GitHub 换取令牌失败");
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${tokenData.access_token}`,
        "user-agent": "cmcc-message-gateway",
        accept: "application/vnd.github+json",
      },
    });
    const user = (await userResponse.json()) as { login?: string };
    const allowed = String(context.env.GITHUB_ADMIN_LOGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowed.length === 0) {
      return fail("未配置 GITHUB_ADMIN_LOGINS，GitHub 登录已禁用");
    }
    if (!user.login || !allowed.includes(user.login)) {
      return fail(`GitHub 账号 ${user.login || "?"} 无管理权限`);
    }

    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const session =
      "sess_" +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const expiresAt = Date.now() + 30 * 86_400_000;
    await database
      .prepare("INSERT INTO sessions (token, expires_at, created_at) VALUES (?, ?, ?)")
      .bind(session, expiresAt, Date.now())
      .run();
    await database
      .prepare("DELETE FROM sessions WHERE expires_at < ?")
      .bind(Date.now())
      .run();

    return Response.redirect(`${origin}/admin#session=${session}`, 302);
  });

  admin.use("/admin/api/*", async (context, next) => {
    const token = provided(context.req.raw);
    if (context.env.ADMIN_TOKEN && token === context.env.ADMIN_TOKEN) {
      await next();
      return;
    }
    // GitHub 登录产生的会话
    if (token && context.env.DB) {
      const row = await context.env.DB.prepare(
        "SELECT expires_at FROM sessions WHERE token = ?",
      )
        .bind(token)
        .first<{ expires_at: number }>();
      if (row && row.expires_at > Date.now()) {
        await next();
        return;
      }
    }
    return json({ ok: false, code: 401, message: "管理令牌无效" }, 401);
  });

  const db = (context: { env: Bindings }): D1Database => {
    const database = context.env.DB;
    if (!database) throw new Error("D1 未绑定（DB）");
    return database;
  };

  admin.get("/admin/api/overview", async (context) => {
    const database = db(context);
    const [s, health] = await Promise.all([stats(database), deps.health(context.env)]);
    return json({ ok: true, stats: s, health });
  });

  // ------------------------------------------------------------- tokens
  admin.get("/admin/api/tokens", async (context) =>
    json({ ok: true, tokens: await listTokens(db(context)) }),
  );

  admin.post("/admin/api/tokens", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      name?: string;
      note?: string;
      channels?: string[] | null;
      account_id?: string | null;
    };
    const channels = Array.isArray(body.channels)
      ? body.channels.map(String)
      : null;
    const row = await createToken(
      db(context),
      String(body.name || "").trim(),
      String(body.note || "").trim(),
      channels,
      body.account_id ? String(body.account_id) : null,
    );
    return json({ ok: true, token: row });
  });

  admin.post("/admin/api/tokens/:id/channels", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      channels?: string[] | null;
    };
    const channels = Array.isArray(body.channels)
      ? body.channels.map(String)
      : null;
    await updateTokenChannels(db(context), context.req.param("id"), channels);
    return json({ ok: true });
  });

  admin.post("/admin/api/tokens/:id/toggle", async (context) => {
    await toggleToken(db(context), context.req.param("id"));
    return json({ ok: true });
  });

  admin.delete("/admin/api/tokens/:id", async (context) => {
    await deleteToken(db(context), context.req.param("id"));
    return json({ ok: true });
  });

  // ----------------------------------------------------------- channels
  admin.get("/admin/api/channels", async (context) =>
    json({ ok: true, channels: await listChannels(db(context)) }),
  );

  admin.post("/admin/api/channels", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      name?: string;
      type?: string;
      config?: Record<string, unknown>;
    };
    const type = String(body.type || "");
    const allowed = ["cmcc", "wecom_bot", "wecom_app", "http_get", "http_post"];
    if (!allowed.includes(type)) {
      return json({ ok: false, message: "不支持的通道类型" }, 400);
    }
    const chName = String(body.name || "").trim() || type;
    let config = (body.config || {}) as Record<string, unknown>;

    // 新消息通道：只收 api_key，账号在底层自动创建
    if (type === "cmcc") {
      const apiKey = String(config.api_key || "").trim();
      if (!apiKey) {
        return json({ ok: false, message: "新消息通道需要 API Key（ak_...）" }, 400);
      }
      const recipient = String(config.recipient || "").trim();
      const account = await createAccount(
        db(context),
        chName,
        apiKey,
        recipient,
      );
      config = { account_id: account.id };
      if (recipient) config.recipient = recipient;
    }

    const row = await createChannel(db(context), chName, type, config);
    return json({ ok: true, channel: row });
  });

  // 修改通道：名称 + 该类型的全部配置项（cmcc 的 Key 留空表示不修改）
  admin.post("/admin/api/channels/:id", async (context) => {
    const id = context.req.param("id");
    const body = (await context.req.json().catch(() => ({}))) as {
      name?: string;
      config?: Record<string, unknown>;
    };
    const rows = await listChannels(db(context));
    const channel = rows.find((row) => row.id === id);
    if (!channel) return json({ ok: false, message: "通道不存在" }, 404);

    const chName = String(body.name || "").trim() || channel.name;
    const input = (body.config || {}) as Record<string, unknown>;

    let old: Record<string, unknown> = {};
    try {
      old = JSON.parse(channel.config) as Record<string, unknown>;
    } catch {
      old = {};
    }

    let config: Record<string, unknown> = {};
    let hint: string | null = null;

    if (channel.type === "cmcc") {
      const accountId = String(old.account_id || "");
      const account = accountId ? await getAccount(db(context), accountId) : null;
      if (!account) {
        return json(
          { ok: false, message: "底层账号不存在，建议删除后重新添加这条通道" },
          404,
        );
      }
      const apiKey = String(input.api_key || "").trim();
      const recipient = String(input.recipient || "").trim();

      await updateAccount(
        db(context),
        account.id,
        chName,
        apiKey || null,
        recipient || null,
      );
      config = { account_id: account.id };
      if (recipient) config.recipient = recipient;

      if (apiKey) {
        const configureError = await deps.configure(context.env, account.id);
        if (configureError) {
          await accountResult(db(context), account.id, false, configureError);
          return json({ ok: false, message: configureError }, 400);
        }
        const connectError = await deps.connect(context.env, account.id);
        if (connectError) {
          await accountResult(db(context), account.id, false, connectError);
          return json({ ok: false, message: connectError }, 400);
        }
        await accountResult(db(context), account.id, true, "");
        const health = await deps.health(context.env, account.id);
        if (!health.hasRecipient) {
          hint = "已保存并连上；该号码还没有接收人，用该号码手机给 ClawBot 发一条消息即可";
        }
      }
    } else if (channel.type === "wecom_bot") {
      const webhook = String(input.webhook || "").trim();
      if (!webhook) return json({ ok: false, message: "请填 Webhook 地址或 key" }, 400);
      config = { webhook };
    } else if (channel.type === "wecom_app") {
      const corp = String(input.corp_id || "").trim();
      // Secret 留空 = 保留原来的
      const secret = String(input.secret || "").trim() || String(old.secret || "");
      const agent = String(input.agent_id || "").trim();
      if (!corp || !secret || !agent) {
        return json(
          { ok: false, message: "CorpID / Secret / AgentID 都要填" },
          400,
        );
      }
      config = {
        corp_id: corp,
        secret,
        agent_id: agent,
        to_user: String(input.to_user || "").trim() || "@all",
      };
    } else if (channel.type === "http_get" || channel.type === "http_post") {
      const url = String(input.url || "").trim();
      if (!url) return json({ ok: false, message: "请填 URL" }, 400);
      config = { url };
      const headers = String(input.headers || "").trim();
      if (headers) config.headers = headers;
      if (channel.type === "http_post") {
        config.body_template =
          String(input.body_template || "").trim() ||
          '{"title":"{title}","body":"{body}"}';
      }
    } else {
      return json({ ok: false, message: `未知通道类型 ${channel.type}` }, 400);
    }

    await updateChannel(db(context), id, chName, config);
    return json({ ok: true, hint });
  });

  admin.post("/admin/api/channels/:id/toggle", async (context) => {
    await toggleChannel(db(context), context.req.param("id"));
    return json({ ok: true });
  });

  admin.delete("/admin/api/channels/:id", async (context) => {
    await deleteChannel(db(context), context.req.param("id"));
    return json({ ok: true });
  });

  // 新消息通道换 Key（底层账号跟着换，接收人保留）
  admin.post("/admin/api/channels/:id/key", async (context) => {
    const id = context.req.param("id");
    const body = (await context.req.json().catch(() => ({}))) as {
      api_key?: string;
    };
    const apiKey = String(body.api_key || "").trim();
    if (!apiKey) return json({ ok: false, message: "API Key 不能为空" }, 400);

    const rows = await listChannels(db(context));
    const channel = rows.find((row) => row.id === id);
    if (!channel) return json({ ok: false, message: "通道不存在" }, 404);
    if (channel.type !== "cmcc") {
      return json({ ok: false, message: "只有新消息通道支持改 Key" }, 400);
    }

    let config: { account_id?: string } = {};
    try {
      config = JSON.parse(channel.config) as { account_id?: string };
    } catch {
      config = {};
    }
    const accountId = config.account_id || "";
    const account = accountId ? await getAccount(db(context), accountId) : null;
    if (!account) return json({ ok: false, message: "底层账号不存在" }, 404);

    await updateAccount(
      db(context),
      account.id,
      account.name,
      apiKey,
      account.recipient,
    );
    const configureError = await deps.configure(context.env, account.id);
    if (configureError) {
      await accountResult(db(context), account.id, false, configureError);
      return json({ ok: false, message: configureError }, 400);
    }
    const connectError = await deps.connect(context.env, account.id);
    if (connectError) {
      await accountResult(db(context), account.id, false, connectError);
      return json({ ok: false, message: connectError }, 400);
    }
    await accountResult(db(context), account.id, true, "");
    const health = await deps.health(context.env, account.id);
    return json({
      ok: true,
      hasRecipient: Boolean(health.hasRecipient),
      hint: health.hasRecipient
        ? null
        : "Key 已更新并连上；该号码还没有接收人，用该号码手机给 ClawBot 发一条消息即可",
    });
  });

  admin.post("/admin/api/channels/:id/test", async (context) => {
    const id = context.req.param("id");
    const rows = await listChannels(db(context));
    const channel = rows.find((row) => row.id === id);
    if (!channel) return json({ ok: false, message: "通道不存在" }, 404);
    const error = await dispatchChannel(context.env, channel, {
      title: "通道测试",
      body: `新消息网关 ${new Date().toLocaleString("zh-CN")}`,
      text: `【通道测试】新消息网关 ${new Date().toLocaleString("zh-CN")}`,
    });
    if (error) return json({ ok: false, message: error }, 400);
    return json({ ok: true });
  });

  // --------------------------------------------------------------- logs
  admin.get("/admin/api/logs", async (context) => {
    const limit = Number(context.req.query("limit") || 100);
    const keyword = (context.req.query("q") || "").trim();
    return json({
      ok: true,
      logs: await listLogs(db(context), limit, keyword),
    });
  });

  admin.delete("/admin/api/logs", async (context) => {
    await clearLogs(db(context));
    return json({ ok: true });
  });

  // ------------------------------------------------- 面板内测试推送
  admin.post("/admin/api/push", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      title?: string;
      body?: string;
    };
    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    if (!title && !text) {
      return json({ ok: false, message: "标题和正文不能都为空" }, 400);
    }
    const request = new Request("https://cmcc.internal/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body: text }),
    });
    try {
      const response = await deps.deliver(context.env, request);
      const data = (await response.json()) as Record<string, unknown>;
      const payload = (data.data || {}) as Record<string, unknown>;
      return json({
        ok: data.code === 200,
        messageId: payload.messageId || null,
        raw: data,
      });
    } catch (error) {
      return json({ ok: false, message: errorMessage(error) }, 500);
    }
  });


  // ----------------------------------------------------------- accounts
  admin.get("/admin/api/accounts", async (context) => {
    const rows = await listAccounts(db(context));
    return json({
      ok: true,
      accounts: rows.map((row) => ({
        ...row,
        api_key: row.api_key ? "***" : null,
        has_key: Boolean(row.api_key),
      })),
    });
  });

  admin.post("/admin/api/accounts", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      name?: string;
      api_key?: string;
      recipient?: string;
    };
    const apiKey = String(body.api_key || "").trim();
    if (!apiKey) return json({ ok: false, message: "api_key 必填" }, 400);
    const row = await createAccount(
      db(context),
      String(body.name || "").trim(),
      apiKey,
      String(body.recipient || "").trim(),
    );
    const warning = await deps.configure(context.env, row.id);
    // 建完顺手连一次，避免面板里显示「未连接」让人误以为 Key 有问题
    const connectError = warning ? null : await deps.connect(context.env, row.id);
    await accountResult(
      db(context),
      row.id,
      !warning && !connectError,
      warning || connectError || "",
    );
    return json({
      ok: true,
      account: { ...row, api_key: "***", has_key: true },
      warning: warning || connectError || null,
    });
  });

  admin.post("/admin/api/accounts/:id", async (context) => {
    const id = context.req.param("id");
    const body = (await context.req.json().catch(() => ({}))) as {
      name?: string;
      api_key?: string;
      recipient?: string;
    };
    const existing = await getAccount(db(context), id);
    if (!existing) return json({ ok: false, message: "账号不存在" }, 404);
    const apiKey = String(body.api_key || "").trim();
    await updateAccount(
      db(context),
      id,
      String(body.name || existing.name).trim(),
      apiKey || null,
      String(body.recipient ?? existing.recipient ?? "").trim(),
    );
    const warning = await deps.configure(context.env, id);
    return json({ ok: true, warning: warning || null });
  });

  admin.post("/admin/api/accounts/:id/toggle", async (context) => {
    await toggleAccount(db(context), context.req.param("id"));
    return json({ ok: true });
  });

  admin.delete("/admin/api/accounts/:id", async (context) => {
    await deleteAccount(db(context), context.req.param("id"));
    return json({ ok: true });
  });

  admin.post("/admin/api/accounts/:id/test", async (context) => {
    const id = context.req.param("id");
    const account = await getAccount(db(context), id);
    if (!account) return json({ ok: false, message: "账号不存在" }, 404);
    const error = await deps.configure(context.env, id);
    if (error) {
      await accountResult(db(context), id, false, error);
      return json({ ok: false, message: error }, 400);
    }
    const connectError = await deps.connect(context.env, id);
    if (connectError) {
      await accountResult(db(context), id, false, connectError);
      return json({ ok: false, message: connectError }, 400);
    }
    const health = await deps.health(context.env, id);
    const ok = Boolean(health.connected && health.authenticated);
    const hasRecipient = Boolean(health.hasRecipient);
    await accountResult(
      db(context),
      id,
      ok,
      ok ? "" : String(health.error || "未连接"),
    );
    return json({
      ok,
      hasRecipient,
      hint: hasRecipient
        ? null
        : "连接正常，但还没有接收人：用该号码手机给「新消息」里的 ClawBot 发一条任意消息",
      health,
    });
  });

  // 令牌换账号
  admin.post("/admin/api/tokens/:id/account", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as {
      account_id?: string | null;
    };
    await updateTokenAccount(
      db(context),
      context.req.param("id"),
      body.account_id ? String(body.account_id) : null,
    );
    return json({ ok: true });
  });

  return admin;
}

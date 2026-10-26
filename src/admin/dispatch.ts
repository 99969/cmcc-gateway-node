// 通道分发：新消息 / 企微机器人 / 企微应用 / 通用 GET / 通用 POST
import type { Bindings } from "../env.js";
import { sendHttpGet, sendHttpPost } from "./httpch.js";
import type { HttpConfig, MessageContext } from "./httpch.js";
import { getAccount } from "./store.js";
import type { ChannelRow } from "./store.js";
import { sendWecomApp, sendWecomBot } from "./wecom.js";

export interface CmccChannelConfig {
  account_id?: string;
  recipient?: string;
}

async function sendCmcc(
  env: Bindings,
  config: CmccChannelConfig,
  ctx: MessageContext,
): Promise<void> {
  if (!env.DB) throw new Error("D1 未绑定");
  const accountId = String(config.account_id || "default");
  const account = await getAccount(env.DB, accountId);
  if (!account) throw new Error(`新消息账号不存在：${accountId}`);
  if (account.enabled !== 1) throw new Error(`账号已停用：${account.name}`);

  if (!env.registry) throw new Error("网关实例注册表未就绪");
  const gateway = await env.registry.get(accountId);
  const response = await gateway.fetch(
    new Request("https://cmcc.internal/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "",
        body: ctx.text,
        ...(config.recipient ? { to: config.recipient } : {}),
      }),
    }),
  );
  const data = (await response.json()) as {
    code?: number;
    message?: string;
  };
  if (data.code !== 200) {
    const raw = String(data.message || "");
    const hint = /RECIPIENT/i.test(raw)
      ? "｜该号码还没有接收人：用这个号码的手机给「新消息」里的 ClawBot 应用号发一条任意消息即可自动记录，或在通道里手填「接收人」"
      : "";
    throw new Error(`新消息(${account.name}) ${raw || "返回 " + data.code}${hint}`);
  }
}

/** 按通道类型分发。返回 null 表示成功，否则返回错误信息。 */
export async function dispatchChannel(
  env: Bindings,
  channel: ChannelRow,
  baseCtx: MessageContext,
): Promise<string | null> {
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(channel.config) as Record<string, unknown>;
  } catch {
    return "通道配置不是合法 JSON";
  }

  const ctx = baseCtx;

  try {
    if (channel.type === "cmcc") {
      await sendCmcc(env, config as CmccChannelConfig, ctx);
    } else if (channel.type === "wecom_bot") {
      await sendWecomBot(config as { webhook?: string }, ctx.text);
    } else if (channel.type === "wecom_app") {
      await sendWecomApp(
        config as {
          corp_id?: string;
          secret?: string;
          agent_id?: string | number;
          to_user?: string;
        },
        ctx.text,
      );
    } else if (channel.type === "http_get") {
      await sendHttpGet(config as HttpConfig, ctx);
    } else if (channel.type === "http_post") {
      await sendHttpPost(config as HttpConfig, ctx);
    } else {
      return `未知通道类型 ${channel.type}`;
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

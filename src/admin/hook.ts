// 推送请求的识别、日志记录与多通道 fanout
import type { Bindings } from "../env.js";
import {
  channelResult,
  getTokenChannels,
  insertLog,
  listChannels,
  touchToken,
} from "./store.js";
import { dispatchChannel } from "./dispatch.js";

export interface PushInfo {
  kind: "text" | "media";
  title: string;
  body: string;
}

const MEDIA_LABEL: Record<string, string> = {
  IMAGE: "图片",
  VIDEO: "视频",
  AUDIO: "语音",
  TEXT: "文本文件",
  FILE: "文件",
};

export function isPushPath(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" && (path === "/push" || path.startsWith("/push/"))) return true;
  if (m === "POST" && path === "/push") return true;
  if (m === "POST" && path === "/api/messages/send") return true;
  if (m === "POST" && path === "/api/media/send") return true;
  if (m === "POST" && path === "/api/media/upload-send") return true;
  return false;
}

function fromQuery(url: URL): PushInfo {
  const q = url.searchParams;
  return {
    kind: "text",
    title: (q.get("title") || "").trim(),
    body: (
      q.get("body") ||
      q.get("content") ||
      q.get("message") ||
      ""
    ).trim(),
  };
}

function fromPath(path: string): PushInfo {
  const parts = path
    .slice("/push/".length)
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part.replace(/\+/g, "%20"));
      } catch {
        return part;
      }
    })
    .filter((part) => part !== "");
  if (parts.length === 0) return { kind: "text", title: "", body: "" };
  if (parts.length === 1) return { kind: "text", title: "", body: parts[0] };
  return {
    kind: "text",
    title: parts[0],
    body: parts.slice(1).join("/"),
  };
}

/** 从请求里抽出标题/正文，用于记日志与转发到其他通道。失败一律返回空值，不抛错。 */
export async function extractPush(
  request: Request,
  path: string,
): Promise<PushInfo> {
  const url = new URL(request.url);

  if (request.method.toUpperCase() === "GET") {
    return path.startsWith("/push/") ? fromPath(path) : fromQuery(url);
  }

  if (path === "/api/media/upload-send") {
    try {
      const form = await request.formData();
      const mediaType = String(form.get("mediaType") || "FILE").toUpperCase();
      return {
        kind: "media",
        title: `【${MEDIA_LABEL[mediaType] || mediaType}】`,
        body: String(form.get("content") || ""),
      };
    } catch {
      return { kind: "media", title: "【媒体】", body: "" };
    }
  }

  try {
    const data = (await request.json()) as Record<string, unknown>;
    const mediaType = String(data.mediaType || "").toUpperCase();
    if (mediaType) {
      return {
        kind: "media",
        title: `【${MEDIA_LABEL[mediaType] || mediaType}】`,
        body: String(data.content || data.body || ""),
      };
    }
    return {
      kind: "text",
      title: String(data.title || "").trim(),
      body: String(data.body ?? data.content ?? data.message ?? "").trim(),
    };
  } catch {
    return { kind: "text", title: "", body: "" };
  }
}

export function composeText(info: PushInfo): string {
  if (info.title && info.body) return `${info.title}\n${info.body}`;
  return info.title || info.body;
}

export interface FanoutPlan {
  /** 该令牌允许的通道：null = 全部启用通道 */
  allowed: string[] | null;
  /** 需要跳过的通道（主链路已覆盖，避免同一账号重复收） */
  skip: string[];
}

interface DoResult {
  code?: number;
  message?: string;
  data?: { messageId?: string; status?: string };
}

/** 记录日志 + 并行 fanout 到目标通道。整体不抛错。 */
export async function recordAndFanout(
  env: Bindings,
  response: Response,
  info: PushInfo,
  tokenName: string,
  request: Request,
  tokenId: string,
  plan?: FanoutPlan,
): Promise<void> {
  const db = env.DB;
  if (!db) return;

  let detail: DoResult = {};
  try {
    detail = (await response.clone().json()) as DoResult;
  } catch {
    detail = { message: "响应不是 JSON" };
  }
  const primaryOk = detail.code === 200;

  const text = composeText(info);
  let summary = "";
  let channelOk = false;
  let tried = 0;

  // 无论主链路成功与否都要 fanout：
  // 令牌只绑了企微 / HTTP 通道时，主链路（新消息）没有接收人属于正常情况，
  // 不该把其他通道一起拖死。
  const blank = !info.title && !info.body;
  try {
    if (blank) throw new Error("skip");
    const channels = await listChannels(db);
    const allowed = plan
      ? plan.allowed
      : tokenId
        ? await getTokenChannels(db, tokenId)
        : null;
    const skip = plan ? plan.skip : [];
    const active = channels.filter(
      (channel) =>
        channel.enabled === 1 &&
        (allowed === null || allowed.includes(channel.id)) &&
        !skip.includes(channel.id),
    );
    tried = active.length;
    if (active.length > 0) {
      const ctx = { title: info.title, body: info.body, text };
      const results = await Promise.all(
        active.map(async (channel) => {
          const error = await dispatchChannel(env, channel, ctx);
          await channelResult(db, channel.id, error === null, error || "");
          if (error === null) channelOk = true;
          return error
            ? `${channel.name}:失败(${error.slice(0, 60)})`
            : `${channel.name}:ok`;
        }),
      );
      summary = results.join("; ");
    }
  } catch {
    // 通道分发异常不影响日志与响应
  }

  if (blank) {
    summary = "（空消息，未投递）";
  } else if (tried === 0 && !summary) {
    summary = primaryOk ? "" : "（没有匹配的通道）";
  }

  // 文本消息只要任一通道成功就算投递成功；媒体必须主链路成功
  const ok = !blank && (primaryOk || (info.kind === "text" && channelOk));
  const note = !primaryOk && channelOk ? "｜主链路失败，已由通道投递" : "";

  try {
    await insertLog(db, {
      ts: Date.now(),
      kind: info.kind,
      token_name: tokenName,
      title: info.title.slice(0, 200),
      body: info.body.slice(0, 2000),
      status: ok ? "ok" : "error",
      message_id: detail.data?.messageId || null,
      http_status: response.status,
      detail: `${detail.message || ""}${note}`.slice(0, 300),
      channels: summary.slice(0, 500),
      ip: request.headers.get("cf-connecting-ip") || "",
      ua: (request.headers.get("user-agent") || "").slice(0, 200),
    });
    if (tokenId) await touchToken(db, tokenId);
  } catch {
    // 日志写失败不影响主链路
  }
}

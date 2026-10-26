// 企业微信推送通道：群机器人（webhook）与应用消息（corp/secret/agentid）

const API = "https://qyapi.weixin.qq.com/cgi-bin/";
const TOKEN_CACHE = new Map<string, { token: string; exp: number }>();

export interface BotConfig {
  webhook?: string;
}

export interface AppConfig {
  corp_id?: string;
  secret?: string;
  agent_id?: string | number;
  to_user?: string;
}

interface QyResponse {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
}

async function getAccessToken(corpId: string, secret: string): Promise<string> {
  if (!corpId || !secret) throw new Error("缺少 corp_id 或 secret");
  const key = `${corpId}:${secret}`;
  const hit = TOKEN_CACHE.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const response = await fetch(
    `${API}gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`,
  );
  const data = (await response.json()) as QyResponse;
  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`gettoken 失败 ${data.errcode} ${data.errmsg || ""}`);
  }
  TOKEN_CACHE.set(key, {
    token: data.access_token,
    exp: Date.now() + (data.expires_in || 7200) * 1000,
  });
  return data.access_token;
}

async function postJson(url: string, payload: unknown): Promise<QyResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await response.json()) as QyResponse;
}

export async function sendWecomBot(
  config: BotConfig,
  text: string,
): Promise<void> {
  let url = String(config.webhook || "").trim();
  if (!url) throw new Error("缺少 webhook 地址");
  if (!/^https?:\/\//i.test(url)) {
    url = `${API}webhook/send?key=${encodeURIComponent(url)}`;
  }
  const data = await postJson(url, {
    msgtype: "text",
    text: { content: text.slice(0, 2000) },
  });
  if (data.errcode !== 0) {
    throw new Error(`机器人返回 ${data.errcode} ${data.errmsg || ""}`);
  }
}

export async function sendWecomApp(
  config: AppConfig,
  text: string,
): Promise<void> {
  const token = await getAccessToken(
    String(config.corp_id || ""),
    String(config.secret || ""),
  );
  const agentId = Number(config.agent_id || 0);
  if (!agentId) throw new Error("缺少 agent_id");
  const data = await postJson(`${API}message/send?access_token=${token}`, {
    touser: String(config.to_user || "@all"),
    msgtype: "text",
    agentid: agentId,
    text: { content: text.slice(0, 2000) },
  });
  if (data.errcode !== 0) {
    throw new Error(`应用消息返回 ${data.errcode} ${data.errmsg || ""}`);
  }
}

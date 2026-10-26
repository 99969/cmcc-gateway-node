// 通用 HTTP 通道：GET / POST，自定义地址、请求头、请求体模板
//
// 占位符：
//   {title} / {body} / {content}  → 自动转义（URL 里做 URL 编码，JSON 里做 JSON 转义）
//   {title_raw} / {body_raw}      → 原样插入
//   {time}                        → 本地时间字符串

export interface HttpConfig {
  url?: string;
  headers?: unknown;
  body_template?: string;
}

export interface MessageContext {
  title: string;
  body: string;
  text: string;
}

function parseHeaders(raw: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw) return result;

  if (typeof raw === "string") {
    for (const line of raw.split("\n")) {
      const index = line.indexOf(":");
      if (index <= 0) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key) result[key] = value;
    }
    return result;
  }

  if (typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (key) result[key] = String(value ?? "");
    }
  }
  return result;
}

function now(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function substUrl(template: string, ctx: MessageContext): string {
  const enc = encodeURIComponent;
  return template
    .replaceAll("{title}", enc(ctx.title))
    .replaceAll("{body}", enc(ctx.body))
    .replaceAll("{content}", enc(ctx.body))
    .replaceAll("{text}", enc(ctx.text))
    .replaceAll("{title_raw}", ctx.title)
    .replaceAll("{body_raw}", ctx.body)
    .replaceAll("{time}", enc(now()));
}

function jsonEscape(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "")
    .replaceAll("\t", " ");
}

function substBody(template: string, ctx: MessageContext): string {
  return template
    .replaceAll("{title}", jsonEscape(ctx.title))
    .replaceAll("{body}", jsonEscape(ctx.body))
    .replaceAll("{content}", jsonEscape(ctx.body))
    .replaceAll("{text}", jsonEscape(ctx.text))
    .replaceAll("{title_raw}", ctx.title)
    .replaceAll("{body_raw}", ctx.body)
    .replaceAll("{time}", now());
}

function hasPlaceholder(value: string): boolean {
  return value.includes("{title}") || value.includes("{body}") ||
    value.includes("{content}") || value.includes("{text}") ||
    value.includes("{title_raw}") || value.includes("{body_raw}");
}

async function ensureOk(response: Response, label: string): Promise<void> {
  if (response.ok) return;
  let snippet = "";
  try {
    snippet = (await response.text()).slice(0, 200);
  } catch {
    snippet = "";
  }
  throw new Error(`${label} HTTP ${response.status} ${snippet}`);
}

export async function sendHttpGet(
  config: HttpConfig,
  ctx: MessageContext,
): Promise<void> {
  const raw = String(config.url || "").trim();
  if (!raw) throw new Error("缺少 URL");

  let url = substUrl(raw, ctx);
  if (!hasPlaceholder(raw)) {
    const separator = url.includes("?") ? "&" : "?";
    const params = new URLSearchParams();
    if (ctx.title) params.set("title", ctx.title);
    if (ctx.body) params.set("body", ctx.body);
    const query = params.toString();
    if (query) url += separator + query;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: parseHeaders(config.headers),
  });
  await ensureOk(response, "GET");
}

export async function sendHttpPost(
  config: HttpConfig,
  ctx: MessageContext,
): Promise<void> {
  const raw = String(config.url || "").trim();
  if (!raw) throw new Error("缺少 URL");

  const url = substUrl(raw, ctx);
  const headers = parseHeaders(config.headers);
  const template =
    String(config.body_template || "").trim() ||
    '{"title":"{title}","body":"{body}"}';

  if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: substBody(template, ctx),
  });
  await ensureOk(response, "POST");
}

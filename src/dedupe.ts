/**
 * 推送幂等去重（带回放）。
 *
 * 背景：域名套 CDN 后，CDN 在源站响应慢时会重试同一个 GET，或 301/302 跟随
 * 导致同一请求回源两次。GET 在 HTTP 语义里幂等，但本服务的 GET 会真的发消息。
 *
 * 需要同时满足两点：
 *  1) 同一条消息只投递一次；
 *  2) 重复请求要返回**第一次的真实投递结果**（channel_only / messageId），
 *     而不是一个「已忽略」的模糊响应。否则 CDN 把重试那次的响应回给客户端时，
 *     调用方看到 duplicate 会误以为没发出去。
 *
 * 幂等键（永不为 null/undefined）：
 *  - 客户端显式传了 messageId → `${token}\0id\0${messageId}`
 *  - 否则内容指纹 → `${token}\0h\0${sha1(kind\0title\0body)}`
 *  always 带 token，避免不同令牌发相同内容被互相吞掉。
 *
 * 窗口默认 5000ms（覆盖 CDN 重试），DEDUP_WINDOW_MS 可配，0 关闭；
 * ?dedup=0 或 X-Dedup: 0 可单次绕过。
 */
import { createHash } from "node:crypto";

export interface CachedResult {
  status: number;
  body: string;
  contentType: string;
}

export type DedupDecision =
  /** 首次出现：正常投递，随后调用 finish() 记录结果 */
  | { duplicate: false; key: string }
  /** 重复：首次结果已知，直接重放 */
  | { duplicate: true; key: string; cached: CachedResult }
  /** 重复：首次仍在投递中，暂无结果 */
  | { duplicate: true; key: string; cached: null };

interface Entry {
  ts: number;
  result?: CachedResult;
}

export class PushDeduplicator {
  private readonly hits = new Map<string, Entry>();
  private readonly windowMs: number;
  private readonly enabled: boolean;
  private readonly maxEntries = 5000;
  private lastSweep = 0;

  constructor(windowMs: string | number | undefined = 5000) {
    const raw =
      windowMs === undefined || windowMs === "" ? 5000 : Number(windowMs);
    this.enabled = Number.isFinite(raw) && raw > 0;
    // 上限 60s：再长会把「正常的一分钟内重复通知」误判
    this.windowMs = this.enabled ? Math.min(60_000, Math.max(200, raw)) : 0;
  }

  /** 判断是否重复；首次出现时立即占位，避免并发双发同时放行 */
  begin(key: string, now = Date.now()): DedupDecision {
    if (!this.enabled) return { duplicate: false, key };
    const previous = this.hits.get(key);
    if (previous !== undefined && now - previous.ts < this.windowMs) {
      return { duplicate: true, key, cached: previous.result ?? null };
    }
    this.hits.set(key, { ts: now });
    this.sweep(now);
    return { duplicate: false, key };
  }

  /** 首次投递完成后记录真实结果，供后续重复请求重放 */
  finish(key: string, result: CachedResult, now = Date.now()): void {
    if (!this.enabled) return;
    const entry = this.hits.get(key);
    if (entry === undefined || now - entry.ts >= this.windowMs) {
      this.hits.set(key, { ts: now, result });
      return;
    }
    entry.result = result;
  }

  /** 读取窗口内已记录的结果（用于「等首次完成后重放」） */
  peek(key: string, now = Date.now()): CachedResult | null {
    if (!this.enabled) return null;
    const entry = this.hits.get(key);
    if (entry === undefined || now - entry.ts >= this.windowMs) return null;
    return entry.result ?? null;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, entry] of this.hits) {
      if (now - entry.ts >= this.windowMs) this.hits.delete(key);
    }
    if (this.hits.size > this.maxEntries) {
      let drop = this.hits.size - this.maxEntries;
      for (const key of this.hits.keys()) {
        if (drop-- <= 0) break;
        this.hits.delete(key);
      }
    }
  }

  /**
   * 生成幂等键。绝不为空：没有 messageId 时退化为内容指纹。
   */
  static key(
    tokenScope: string,
    kind: string,
    title: string,
    body: string,
    messageId?: string | null,
  ): string {
    const scope = tokenScope || "anon";
    const id = (messageId || "").trim();
    if (id) return `${scope}\u0000id\u0000${id}`;
    const fingerprint = createHash("sha1")
      .update(`${kind}\u0000${title}\u0000${body}`, "utf8")
      .digest("hex");
    return `${scope}\u0000h\u0000${fingerprint}`;
  }
}

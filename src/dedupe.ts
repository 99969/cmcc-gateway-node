/**
 * GET 推送幂等去重。
 *
 * 现象：域名套了 CDN（EdgeOne / 云 CDN）后，一次 GET 推送用户收到两条。
 * 原因：GET 在 HTTP 语义里是幂等的，CDN 会在源站响应慢（本服务要等主链路
 * WebSocket 返回，通常 1~3s）时重试同一个 GET；或 http→https / 裸域→www
 * 的 301/302 跟随导致同一请求回源两次。本服务的 GET 有副作用（真的发消息），
 * 因此必须在入口按「令牌 + 内容」做幂等。
 *
 * 策略：窗口内内容完全相同的 GET 只投递第一次，其余直接返回成功但不投递，
 * 让 CDN / 调用方停止重试。窗口用 DEDUP_WINDOW_MS 配置，默认 5000ms，
 * 设 0 关闭（不再去重）。需要连发两条一模一样的内容时，URL 加 ?dedup=0 绕过。
 */
export class PushDeduplicator {
  private readonly hits = new Map<string, number>();
  private readonly windowMs: number;
  private readonly enabled: boolean;
  private readonly maxEntries = 5000;
  private lastSweep = 0;

  constructor(windowMs: string | number | undefined = 5000) {
    const raw =
      windowMs === undefined || windowMs === "" ? 5000 : Number(windowMs);
    this.enabled = Number.isFinite(raw) && raw > 0;
    this.windowMs = this.enabled ? Math.min(60_000, Math.max(200, raw)) : 0;
  }

  /** 返回 true = 窗口内的重复请求，调用方应跳过投递 */
  isDuplicate(key: string, now = Date.now()): boolean {
    if (!this.enabled) return false;
    const previous = this.hits.get(key);
    if (previous !== undefined && now - previous < this.windowMs) {
      return true;
    }
    this.hits.set(key, now);
    this.sweep(now);
    return false;
  }

  /** 定期清理过期项，防止 Map 无限增长 */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, ts] of this.hits) {
      if (now - ts >= this.windowMs) this.hits.delete(key);
    }
    if (this.hits.size > this.maxEntries) {
      let drop = this.hits.size - this.maxEntries;
      for (const key of this.hits.keys()) {
        if (drop-- <= 0) break;
        this.hits.delete(key);
      }
    }
  }

  static key(
    tokenScope: string,
    kind: string,
    title: string,
    body: string,
  ): string {
    return `${tokenScope}\u0000${kind}\u0000${title}\u0000${body}`;
  }
}

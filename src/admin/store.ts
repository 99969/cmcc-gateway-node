// D1 数据访问层：tokens / channels / logs

export interface TokenRow {
  id: string;
  name: string;
  token: string;
  enabled: number;
  note: string | null;
  created_at: number;
  last_used_at: number | null;
  /** null/空 = 全部通道；"[]" = 不转发；JSON 数组 = 指定通道 */
  channels: string | null;
  /** 用哪个新消息账号发（null = default） */
  account_id: string | null;
}

export interface AccountRow {
  id: string;
  name: string;
  api_key: string | null;
  recipient: string | null;
  enabled: number;
  created_at: number;
  last_error: string | null;
  last_ok_at: number | null;
}

export interface TemplateRow {
  id: string;
  name: string;
  content: string;
  created_at: number;
}

export interface ChannelRow {
  id: string;
  name: string;
  type: string;
  config: string;
  enabled: number;
  created_at: number;
  last_error: string | null;
  last_ok_at: number | null;
  template_id: string | null;
}

export interface LogRow {
  id: number;
  ts: number;
  kind: string | null;
  token_name: string | null;
  title: string | null;
  body: string | null;
  status: string | null;
  message_id: string | null;
  http_status: number | null;
  detail: string | null;
  channels: string | null;
  ip: string | null;
  ua: string | null;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return (
    "gw_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// ------------------------------------------------------------------ tokens
export async function listTokens(db: D1Database): Promise<TokenRow[]> {
  const result = await db
    .prepare("SELECT * FROM tokens ORDER BY created_at DESC")
    .all<TokenRow>();
  return result.results || [];
}

export async function findToken(
  db: D1Database,
  token: string,
): Promise<TokenRow | null> {
  if (!token) return null;
  return await db
    .prepare("SELECT * FROM tokens WHERE token = ? AND enabled = 1")
    .bind(token)
    .first<TokenRow>();
}

export async function createToken(
  db: D1Database,
  name: string,
  note: string,
  channels: string[] | null = null,
  accountId: string | null = null,
): Promise<TokenRow> {
  const row: TokenRow = {
    id: newId("tk"),
    name: name || "未命名",
    token: newToken(),
    enabled: 1,
    note: note || null,
    created_at: Date.now(),
    last_used_at: null,
    channels: channels === null ? null : JSON.stringify(channels),
    account_id: accountId || null,
  };
  await db
    .prepare(
      "INSERT INTO tokens (id, name, token, enabled, note, created_at, channels, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      row.id,
      row.name,
      row.token,
      row.enabled,
      row.note,
      row.created_at,
      row.channels,
      row.account_id,
    )
    .run();
  return row;
}

export async function updateTokenAccount(
  db: D1Database,
  id: string,
  accountId: string | null,
): Promise<void> {
  await db
    .prepare("UPDATE tokens SET account_id = ? WHERE id = ?")
    .bind(accountId || null, id)
    .run();
}

export async function updateTokenChannels(
  db: D1Database,
  id: string,
  channels: string[] | null,
): Promise<void> {
  await db
    .prepare("UPDATE tokens SET channels = ? WHERE id = ?")
    .bind(channels === null ? null : JSON.stringify(channels), id)
    .run();
}

/** 返回 null 表示"全部通道"，数组表示只推这些。 */
export async function getTokenChannels(
  db: D1Database,
  id: string,
): Promise<string[] | null> {
  const row = await db
    .prepare("SELECT channels FROM tokens WHERE id = ?")
    .bind(id)
    .first<{ channels: string | null }>();
  if (!row || row.channels === null || row.channels === "") return null;
  try {
    const parsed = JSON.parse(row.channels) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

export async function deleteToken(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM tokens WHERE id = ?").bind(id).run();
}

export async function toggleToken(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE tokens SET enabled = 1 - enabled WHERE id = ?")
    .bind(id)
    .run();
}

export async function touchToken(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE tokens SET last_used_at = ? WHERE id = ?")
    .bind(Date.now(), id)
    .run();
}

// ---------------------------------------------------------------- channels
export async function listChannels(db: D1Database): Promise<ChannelRow[]> {
  const result = await db
    .prepare("SELECT * FROM channels ORDER BY created_at DESC")
    .all<ChannelRow>();
  return result.results || [];
}

export async function createChannel(
  db: D1Database,
  name: string,
  type: string,
  config: Record<string, unknown>,
  templateId: string | null = null,
): Promise<ChannelRow> {
  const row: ChannelRow = {
    id: newId("ch"),
    name: name || type,
    type,
    config: JSON.stringify(config),
    enabled: 1,
    created_at: Date.now(),
    last_error: null,
    last_ok_at: null,
    template_id: templateId || null,
  };
  await db
    .prepare(
      "INSERT INTO channels (id, name, type, config, enabled, created_at, template_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      row.id,
      row.name,
      row.type,
      row.config,
      row.enabled,
      row.created_at,
      row.template_id,
    )
    .run();
  return row;
}

export async function updateChannelTemplate(
  db: D1Database,
  id: string,
  templateId: string | null,
): Promise<void> {
  await db
    .prepare("UPDATE channels SET template_id = ? WHERE id = ?")
    .bind(templateId || null, id)
    .run();
}

export async function updateChannel(
  db: D1Database,
  id: string,
  name: string,
  config: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare("UPDATE channels SET name = ?, config = ? WHERE id = ?")
    .bind(name, JSON.stringify(config), id)
    .run();
}

export async function deleteChannel(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM channels WHERE id = ?").bind(id).run();
}

export async function toggleChannel(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE channels SET enabled = 1 - enabled WHERE id = ?")
    .bind(id)
    .run();
}

export async function channelResult(
  db: D1Database,
  id: string,
  ok: boolean,
  error: string,
): Promise<void> {
  if (ok) {
    await db
      .prepare("UPDATE channels SET last_ok_at = ?, last_error = NULL WHERE id = ?")
      .bind(Date.now(), id)
      .run();
  } else {
    await db
      .prepare("UPDATE channels SET last_error = ? WHERE id = ?")
      .bind(error.slice(0, 300), id)
      .run();
  }
}

// -------------------------------------------------------------------- logs
export async function insertLog(
  db: D1Database,
  row: Omit<LogRow, "id">,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO logs (ts, kind, token_name, title, body, status, message_id, http_status, detail, channels, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      row.ts,
      row.kind,
      row.token_name,
      row.title,
      row.body,
      row.status,
      row.message_id,
      row.http_status,
      row.detail,
      row.channels,
      row.ip,
      row.ua,
    )
    .run();
}

export async function listLogs(
  db: D1Database,
  limit: number,
  keyword: string,
): Promise<LogRow[]> {
  const size = Math.max(1, Math.min(limit || 100, 500));
  if (keyword) {
    const like = `%${keyword}%`;
    const result = await db
      .prepare(
        "SELECT * FROM logs WHERE body LIKE ? OR title LIKE ? OR token_name LIKE ? ORDER BY ts DESC LIMIT ?",
      )
      .bind(like, like, like, size)
      .all<LogRow>();
    return result.results || [];
  }
  const result = await db
    .prepare("SELECT * FROM logs ORDER BY ts DESC LIMIT ?")
    .bind(size)
    .all<LogRow>();
  return result.results || [];
}

export async function clearLogs(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM logs").run();
}

export interface Stats {
  total: number;
  today: number;
  failed: number;
  tokens: number;
  channels: number;
}

export async function stats(db: D1Database): Promise<Stats> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [total, today, failed, tokens, channels] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS c FROM logs").first<{ c: number }>(),
    db
      .prepare("SELECT COUNT(*) AS c FROM logs WHERE ts >= ?")
      .bind(dayStart.getTime())
      .first<{ c: number }>(),
    db
      .prepare("SELECT COUNT(*) AS c FROM logs WHERE status = 'error'")
      .first<{ c: number }>(),
    db.prepare("SELECT COUNT(*) AS c FROM tokens").first<{ c: number }>(),
    db.prepare("SELECT COUNT(*) AS c FROM channels").first<{ c: number }>(),
  ]);
  return {
    total: total?.c || 0,
    today: today?.c || 0,
    failed: failed?.c || 0,
    tokens: tokens?.c || 0,
    channels: channels?.c || 0,
  };
}

// ---------------------------------------------------------------- accounts
export async function listAccounts(db: D1Database): Promise<AccountRow[]> {
  const result = await db
    .prepare("SELECT * FROM accounts ORDER BY created_at ASC")
    .all<AccountRow>();
  return result.results || [];
}

export async function getAccount(
  db: D1Database,
  id: string,
): Promise<AccountRow | null> {
  return await db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .bind(id)
    .first<AccountRow>();
}

export async function createAccount(
  db: D1Database,
  name: string,
  apiKey: string,
  recipient: string,
): Promise<AccountRow> {
  const row: AccountRow = {
    id: newId("ac"),
    name: name || "新消息账号",
    api_key: apiKey || null,
    recipient: recipient || null,
    enabled: 1,
    created_at: Date.now(),
    last_error: null,
    last_ok_at: null,
  };
  await db
    .prepare(
      "INSERT INTO accounts (id, name, api_key, recipient, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      row.id,
      row.name,
      row.api_key,
      row.recipient,
      row.enabled,
      row.created_at,
    )
    .run();
  return row;
}

export async function updateAccount(
  db: D1Database,
  id: string,
  name: string,
  apiKey: string | null,
  recipient: string | null,
): Promise<void> {
  if (apiKey === null) {
    await db
      .prepare("UPDATE accounts SET name = ?, recipient = ? WHERE id = ?")
      .bind(name, recipient, id)
      .run();
  } else {
    await db
      .prepare("UPDATE accounts SET name = ?, api_key = ?, recipient = ? WHERE id = ?")
      .bind(name, apiKey, recipient, id)
      .run();
  }
}

export async function deleteAccount(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM accounts WHERE id = ?").bind(id).run();
}

export async function toggleAccount(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE accounts SET enabled = 1 - enabled WHERE id = ?")
    .bind(id)
    .run();
}

export async function accountResult(
  db: D1Database,
  id: string,
  ok: boolean,
  error: string,
): Promise<void> {
  if (ok) {
    await db
      .prepare("UPDATE accounts SET last_ok_at = ?, last_error = NULL WHERE id = ?")
      .bind(Date.now(), id)
      .run();
  } else {
    await db
      .prepare("UPDATE accounts SET last_error = ? WHERE id = ?")
      .bind(error.slice(0, 300), id)
      .run();
  }
}

// --------------------------------------------------------------- templates
export async function listTemplates(db: D1Database): Promise<TemplateRow[]> {
  const result = await db
    .prepare("SELECT * FROM templates ORDER BY created_at DESC")
    .all<TemplateRow>();
  return result.results || [];
}

export async function getTemplate(
  db: D1Database,
  id: string,
): Promise<TemplateRow | null> {
  return await db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .bind(id)
    .first<TemplateRow>();
}

export async function createTemplate(
  db: D1Database,
  name: string,
  content: string,
): Promise<TemplateRow> {
  const row: TemplateRow = {
    id: newId("tpl"),
    name: name || "模板",
    content,
    created_at: Date.now(),
  };
  await db
    .prepare(
      "INSERT INTO templates (id, name, content, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(row.id, row.name, row.content, row.created_at)
    .run();
  return row;
}

export async function updateTemplate(
  db: D1Database,
  id: string,
  name: string,
  content: string,
): Promise<void> {
  await db
    .prepare("UPDATE templates SET name = ?, content = ? WHERE id = ?")
    .bind(name, content, id)
    .run();
}

export async function deleteTemplate(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM templates WHERE id = ?").bind(id).run();
  await db
    .prepare("UPDATE channels SET template_id = NULL WHERE template_id = ?")
    .bind(id)
    .run();
}

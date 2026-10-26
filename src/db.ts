// SQLite 适配层：实现与 D1 相同的接口，业务代码零改动
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  return value;
}

class SqlitePrepared implements D1PreparedStatement {
  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqlitePrepared(this.db, this.sql, values.map(normalize));
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    if (colName) return (row[colName] ?? null) as T | null;
    return row as T;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const rows = this.db.prepare(this.sql).all(...this.params) as T[];
    return { results: rows, success: true };
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const info = this.db.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
      },
    };
  }

  async raw<T = unknown>(): Promise<T[]> {
    const stmt = this.db.prepare(this.sql);
    stmt.raw(true);
    return stmt.all(...this.params) as T[];
  }
}

export class SqliteD1 implements D1Database {
  constructor(readonly raw: Database.Database) {}

  prepare(query: string): D1PreparedStatement {
    return new SqlitePrepared(this.raw, query);
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const statement of statements) {
      results.push(await statement.run<T>());
    }
    return results;
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    const started = Date.now();
    this.raw.exec(query);
    return { count: 0, duration: Date.now() - started };
  }
}

export function openDatabase(file: string, schema: string): SqliteD1 {
  if (file !== ":memory:") {
    mkdirSync(dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(schema);
  return new SqliteD1(db);
}

import { serve } from "@hono/node-server";

import { listAccounts, updateAccount } from "./admin/store.js";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import type { Bindings } from "./env.js";
import { SCHEMA_SQL } from "./schema.js";
import { VERSION } from "./version.js";

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || "./data";
const KEEPALIVE_MS = 30_000;

function readBindings(): Bindings {
  return {
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || "",
    API_TOKEN: process.env.API_TOKEN || "",
    CMCC_API_KEY: process.env.CMCC_API_KEY || "",
    CMCC_SERVER_URL: process.env.CMCC_SERVER_URL || "",
    CMCC_UPLOAD_URL: process.env.CMCC_UPLOAD_URL || "",
    CMCC_VERSION: process.env.CMCC_VERSION || "",
    DEFAULT_RECIPIENT: process.env.DEFAULT_RECIPIENT || "",
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || "",
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || "",
    GITHUB_ADMIN_LOGINS: process.env.GITHUB_ADMIN_LOGINS || "",
    BASE_URL: process.env.BASE_URL || "",
  };
}

const bindings = readBindings();
const db = openDatabase(`${DATA_DIR}/gateway.db`, SCHEMA_SQL);
const { app, registry, env } = createApp(bindings, db);

/** 启动时把 DB 里的账号 Key / 接收人下发到各自实例，并立即建连 */
async function bootstrap(): Promise<void> {
  const rows = await listAccounts(db);
  for (const row of rows) {
    if (row.enabled !== 1) continue;
    const gateway = await registry.get(row.id);
    if (row.api_key) await gateway.setApiKey(row.api_key);
    if (row.recipient) {
      await gateway.state.storage.put("currentRecipient", {
        id: row.recipient,
        source: "config",
        updatedAt: Date.now(),
      });
    }
    gateway.keepAlive().catch((error: unknown) => {
      console.error(`[bootstrap] ${row.name} 连接失败：`, error);
    });
  }
  console.log(`[bootstrap] 已加载 ${rows.length} 个账号`);
}

const server = serve(
  { fetch: (request) => app.fetch(request, env), port: PORT },
  (info) => {
    console.log(
      `[gateway] v${VERSION} listening on :${info.port} (data: ${DATA_DIR})`,
    );
    void bootstrap();
  },
);

const timer = setInterval(() => {
  void (async (): Promise<void> => {
    try {
      const rows = await listAccounts(db);
      for (const row of rows) {
        if (row.enabled !== 1) continue;
        const gateway = await registry.get(row.id);

        // 把「手机发消息自动学到的接收人」回写到 DB，
        // 这样默认账号的选择才能优先命中真正能发的号码
        const stored = await gateway.state.storage.get<{ id?: string }>(
          "currentRecipient",
        );
        if (stored?.id && stored.id !== row.recipient) {
          await updateAccount(db, row.id, row.name, null, stored.id);
        }

        if (!gateway.isOpen() || !gateway.authenticated) {
          await gateway.keepAlive();
        }
      }
    } catch (error) {
      console.error("[keepalive]", error);
    }
  })();
}, KEEPALIVE_MS);

function shutdown(signal: string): void {
  console.log(`[gateway] ${signal} received, shutting down`);
  clearInterval(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Node 版连接层：用 ws 库直连中国移动 WebSocket（替代 Cloudflare 的 fetch Upgrade）
import WebSocket from "ws";

import type { CmccGateway } from "../cmcc-gateway.js";
import { WS_OPEN } from "../cmcc-gateway.js";
import { errorMessage } from "../http.js";
import { handleWebSocketMessage } from "./inbound.js";

const CONNECT_TIMEOUT_MS = 15_000;
const AUTH_TIMEOUT_MS = 10_000;

export async function ensureConnected(gateway: CmccGateway): Promise<void> {
  if (!gateway.cmccApiKey) {
    throw new Error("CMCC_API_KEY 未配置");
  }

  if (gateway.isOpen() && gateway.authenticated) {
    return;
  }

  if (gateway.connectPromise) {
    return gateway.connectPromise;
  }

  gateway.connectPromise = connectInternal(gateway);

  try {
    await gateway.connectPromise;
  } finally {
    gateway.connectPromise = null;
  }
}

async function connectInternal(gateway: CmccGateway): Promise<void> {
  cleanupSocket(gateway, true);
  gateway.lastError = null;

  const ws = new WebSocket(gateway.serverUrl, {
    headers: {
      "X-API-Key": gateway.cmccApiKey,
      "User-Agent": "cmcc-message-gateway-node/1.0",
    },
    handshakeTimeout: CONNECT_TIMEOUT_MS,
  });

  gateway.ws = ws;
  gateway.authenticated = false;
  gateway.lastConnectAt = Date.now();
  gateway.lastPongAt = Date.now();

  ws.on("message", (data: unknown) => {
    if (gateway.ws !== ws) return; // 旧连接的残留消息，丢弃
    gateway.state.waitUntil(handleWebSocketMessage(gateway, data));
  });

  ws.on("close", (code: number, reason: Buffer) => {
    // 关键：换 Key / 重连时旧连接会异步触发 close，
    // 如果此时新连接已建立，不能让它把新连接的状态清掉。
    if (gateway.ws !== ws) return;
    handleWebSocketClose(gateway, code, reason.toString());
  });

  ws.on("error", (error: Error) => {
    if (gateway.ws !== ws) return;
    gateway.lastError = errorMessage(error);
  });

  // 等握手完成
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("CMCC WebSocket 握手超时"));
    }, CONNECT_TIMEOUT_MS);

    const onOpen = (): void => {
      clearTimeout(timer);
      ws.off("error", onError);
      resolve();
    };
    const onError = (error: Error): void => {
      clearTimeout(timer);
      ws.off("open", onOpen);
      reject(new Error(`CMCC WebSocket 握手失败：${errorMessage(error)}`));
    };

    ws.once("open", onOpen);
    ws.once("error", onError);
  });

  if (ws.readyState !== WS_OPEN) {
    throw new Error("CMCC WebSocket 未就绪");
  }

  const authPromise = new Promise<void>((resolve, reject) => {
    gateway.authResolve = resolve;
    gateway.authReject = reject;

    gateway.authTimeout = setTimeout(() => {
      gateway.authTimeout = null;

      if (!gateway.authenticated) {
        const error = new Error("等待 CMCC auth_ok 超时");
        gateway.authReject?.(error);
        gateway.authReject = null;
        gateway.authResolve = null;

        try {
          gateway.ws?.close(4001, "auth timeout");
        } catch {
          // ignore
        }
      }
    }, AUTH_TIMEOUT_MS);
  });

  ws.send(
    JSON.stringify({
      type: "auth",
      apiKey: gateway.cmccApiKey,
      version: gateway.cmccVersion,
    }),
  );

  await authPromise;
  startHeartbeat(gateway);
}

function startHeartbeat(gateway: CmccGateway): void {
  stopHeartbeat(gateway);

  gateway.heartbeatTimer = setInterval(() => {
    try {
      if (!gateway.isOpen()) {
        stopHeartbeat(gateway);
        return;
      }

      if (gateway.lastPongAt && Date.now() - gateway.lastPongAt > 45_000) {
        gateway.lastError = "CMCC pong timeout";
        gateway.ws.close(4002, "pong timeout");
        return;
      }

      gateway.ws.send(JSON.stringify({ type: "ping" }));
    } catch (error) {
      gateway.lastError = errorMessage(error);
    }
  }, 15_000);
}

function stopHeartbeat(gateway: CmccGateway): void {
  if (gateway.heartbeatTimer !== null) {
    clearInterval(gateway.heartbeatTimer);
    gateway.heartbeatTimer = null;
  }
}

function cleanupSocket(gateway: CmccGateway, close = true): void {
  stopHeartbeat(gateway);

  if (gateway.authTimeout !== null) {
    clearTimeout(gateway.authTimeout);
    gateway.authTimeout = null;
  }

  if (close && gateway.ws) {
    try {
      gateway.ws.close(1000, "reconnect");
    } catch {
      // ignore
    }
  }

  gateway.ws = null;
  gateway.authenticated = false;
}

function handleWebSocketClose(
  gateway: CmccGateway,
  code: number,
  reason: string,
): void {
  stopHeartbeat(gateway);
  gateway.ws = null;
  gateway.authenticated = false;
  gateway.lastDisconnectAt = Date.now();

  if (code && code !== 1000) {
    gateway.lastError = `WebSocket closed: ${code} ${reason || ""}`.trim();
  }
}

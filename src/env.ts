// Node 版的环境绑定：与 Cloudflare 版字段一致，去掉平台专有的 Namespace
export interface Bindings {
  /** SQLite（D1 兼容层） */
  DB?: D1Database;
  /** 管理面板令牌 */
  ADMIN_TOKEN?: string;
  /** GitHub 一键登录 */
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_ADMIN_LOGINS?: string;
  CMCC_API_KEY?: string;
  API_TOKEN?: string;
  CMCC_SERVER_URL?: string;
  CMCC_UPLOAD_URL?: string;
  CMCC_VERSION?: string;
  DEFAULT_RECIPIENT?: string;
  INBOUND_WEBHOOK_URL?: string;
  INBOUND_WEBHOOK_TOKEN?: string;
  /** 对外访问地址（反代后必须设置，用于 GitHub OAuth 回调） */
  BASE_URL?: string;
  /** 运行时注入：账号 → 网关实例（替代 Cloudflare 的 DurableObjectNamespace） */
  registry?: {
    get(accountId: string): Promise<{
      fetch(request: Request): Promise<Response>;
    }>;
  };
}

export interface HonoEnv {
  Bindings: Bindings;
  Variables: {
    tokenName: string;
    tokenId: string;
    accountId: string;
  };
}

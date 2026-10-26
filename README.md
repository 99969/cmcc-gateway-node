# 新消息网关（cmcc-gateway-node）

把中国移动「新消息 / ClawBot」的 5G 消息能力接成 **HTTP 推送网关**，自带管理面板、多令牌、多通道分发。

单进程 Node 服务 + SQLite，用 Docker 一条命令跑起来，**国内机器实测推送 40~60ms**。

```
第三方 APP / 脚本 / 短信转发器
        │  GET /push?token=xxx&title=..&body=..
        ▼
   ┌──────────────────────────────────────┐
   │  cmcc-gateway (Node + Hono + SQLite) │
   │                                      │
   │  令牌鉴权 → 通道分发 ─┬─ 新消息 → 手机 │
   │  日志 / 面板         ├─ 企微机器人     │
   │                      ├─ 企微应用       │
   │                      ├─ 通用 GET       │
   │                      └─ 通用 POST      │
   └──────────────────────────────────────┘
        │ WebSocket 长连接
        ▼
   5gvas01.cmicmaap.com（移动服务端） → 手机「新消息」
```

---

## 目录

- [功能](#功能)
- [快速开始](#快速开始)
- [配置项](#配置项)
- [如何拿到 CMCC_API_KEY](#如何拿到-cmcc_api_key)
- [使用方法](#使用方法)
  - [管理面板](#管理面板)
  - [三种概念：通道 / 令牌 / 推送](#三种概念通道--令牌--推送)
  - [GET 推送](#get-推送)
  - [POST 推送](#post-推送)
  - [推送图片 / 语音 / 视频 / 文件](#推送图片--语音--视频--文件)
  - [读入站消息](#读入站消息)
  - [异步模式](#异步模式)
  - [接口总表](#接口总表)
- [反向代理](#反向代理)
- [GitHub 一键登录](#github-一键登录)
- [数据与备份](#数据与备份)
- [常见问题](#常见问题)
- [项目结构](#项目结构)
- [性能参考](#性能参考)
- [致谢与许可](#致谢与许可)

---

## 功能

| 能力 | 说明 |
|---|---|
| **多令牌** | 每个 APP / 脚本一把令牌，互不影响；停用即 401 |
| **令牌绑通道** | 令牌可指定只能推到哪些通道（全选 / 部分 / 都不推） |
| **五种通道** | 新消息（手机）、企微群机器人、企微应用、通用 GET、通用 POST |
| **同类型多实例** | 多个号码、多个群机器人、多个业务接口，各自独立启停 |
| **管理面板** | 单页 Web UI：概览、令牌、通道、日志、使用说明、项目介绍 |
| **推送日志** | 谁发的、走的哪些通道、成功失败原因，可搜索可清空 |
| **媒体推送** | 图片 / 语音 / 视频 / 任意文件，先上传再发 |
| **入站消息** | 手机发来的消息落库，可查询，也可转发到外部 Webhook |
| **GitHub 登录** | 可选，OAuth 一键登录面板，白名单控制 |
| **单文件存储** | 全部数据在一个 SQLite 文件里，备份就是 `cp` |

---

## 快速开始

### 前置条件

- 一台能访问 `5gvas01.cmicmaap.com` 的 Linux 服务器（国内机器最佳）
- Docker 20.10+ 与 Docker Compose v2
- 一个 `ak_...` 的移动「新消息」API Key（见[下一节](#如何拿到-cmcc_api_key)）

### 三步跑起来

```bash
# 1. 取代码
git clone https://github.com/99969/cmcc-gateway-node.git
cd cmcc-gateway-node

# 2. 准备配置（至少填 4 个值）
cp .env.example .env
vi .env
```

`.env` 里必须改的：

```ini
ADMIN_TOKEN=<自己生成，openssl rand -hex 32>
API_TOKEN=<自己生成，openssl rand -hex 32>
CMCC_API_KEY=ak_你的新消息key
BASE_URL=http://服务器IP:18090
```

```bash
# 3. 构建并启动
docker compose up -d --build
```

首次构建约 2~5 分钟（要源码编译 `better-sqlite3`）。完成后：

```bash
docker compose ps                                   # 应为 Up (healthy)
curl http://127.0.0.1:18090/health                  # {"ok":true,...}
```

打开 `http://服务器IP:18090/admin`，用 `ADMIN_TOKEN` 登录即可。

### 首次使用（三步）

1. **通道页 → 新增 → 类型「新消息」→ 填名称 + `ak_...` → 添加**
   系统会自动创建底层账号并建立 WebSocket 长连接。
2. **用这个号码的手机**打开「新消息」→ 进入 ClawBot 应用号 → **随便发一条消息**
   （网关会自动记住接收人；不发的话推送会报「尚无默认 RECIPIENT」）
3. **令牌页 → 新建令牌 → 勾上刚才的通道**，把生成的令牌填进第三方 APP。

验证：面板「概览」里点「发送」，手机上应立刻收到。

---

## 配置项

全部通过 `.env` 注入（`docker-compose.yml` 里 `env_file: .env`）。

| 变量 | 必填 | 说明 |
|---|---|---|
| `ADMIN_TOKEN` | ✅ | 管理面板登录令牌，也是 `/admin/api/*` 的 Bearer |
| `API_TOKEN` | 建议 | 内置推送令牌，永远有效、走全部通道；留空则只能用面板建的令牌 |
| `CMCC_API_KEY` | ✅ | 移动「新消息」的 `ak_...`，作为兜底账号 |
| `BASE_URL` | ✅ | 对外地址。反代后必须改成域名，否则 GitHub 登录回调错 |
| `GITHUB_CLIENT_ID` | ❌ | GitHub OAuth App 的 Client ID |
| `GITHUB_CLIENT_SECRET` | ❌ | GitHub OAuth App 的 Secret |
| `GITHUB_ADMIN_LOGINS` | ❌ | 允许登录的用户名，逗号分隔；留空 = 禁用 GitHub 登录 |
| `CMCC_SERVER_URL` | ❌ | 默认 `wss://5gvas01.cmicmaap.com/gtw-ai/openclaw/ws/msg` |
| `CMCC_UPLOAD_URL` | ❌ | 默认 `https://5gvas01.cmicmaap.com/gtw-ai/openclaw/api` |
| `CMCC_VERSION` | ❌ | 默认 `2.0` |
| `DEFAULT_RECIPIENT` | ❌ | 直接指定接收人 ID，省掉「手机先发一条」这一步 |
| `PORT` / `DATA_DIR` | ❌ | 容器内监听端口与数据目录，compose 已设好 |

> ⚠️ `.env` 已在 `.gitignore` 里。**不要把 `.env` 提交到任何仓库。**

### 国内构建加速

Dockerfile 支持两个 build arg，国内机器建议在 `.env` 里加：

```ini
NODE_IMAGE=registry.cn-hangzhou.aliyuncs.com/library/node:22-bookworm-slim
NPM_REGISTRY=https://registry.npmmirror.com
```

---

## 如何拿到 CMCC_API_KEY

`ak_...` 是运营商侧的「新消息」应用号凭证，**只能在手机上申领**：

1. 手机打开「新消息」，进入 ClawBot 应用号（10086「养龙虾」那个）
2. 底部菜单 →「绑定/解绑」→「立即授权」
3. 认证完成后页面给出专属 Key，形如 `ak_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
4. 复制它 → 面板「通道 → 新增 → 类型选新消息 → 填 API Key」→ 保存

要点：

- **每个号码一条 Key**，一个 Key 对应一个独立连接，可同时在线
- **重新做绑定 / 授权会换发新 Key，旧 Key 立即失效**
  失效后不用删通道，点该行「修改」贴上新的即可，接收人不会丢
- 同一个 Key **只能保持一条连接**，两套网关用同一个 Key 会互相踢

官方说明：<https://f.10086.cn/s/s/msgNotice/?infoId=oGaKNuZqtg6KbLn9OyRceA==>

---

## 使用方法

### 管理面板

`http://你的地址/admin`，用 `ADMIN_TOKEN` 登录（配了 GitHub 登录也可点按钮）。

| 页签 | 能做什么 |
|---|---|
| 概览 / 推送 | 连接状态、今日/累计/失败统计；选令牌发一条测试，或生成 GET 链接 |
| 令牌 | 新建（名称 + 勾通道）、复制、启停、删除 |
| 通道 | 新增五种通道；每行可**修改**（名称 + 全部配置项）、测试、启停、删除 |
| 日志 | 最近 200 条，按标题/正文/令牌名搜索；「通道」列显示分发结果 |
| 使用说明 | 面板内的快速上手 |
| 项目介绍 | 功能、架构、Key 获取方式 |

### 三种概念：通道 / 令牌 / 推送

```
通道 = 推到哪（一个手机号 / 一个群 / 一个接口）
令牌 = 谁在用，能推到哪些通道
推送 = 带令牌请求 /push
```

| 通道类型 | 配置项 |
|---|---|
| 新消息 `cmcc` | API Key（必填）+ 接收人（可选，留空自动学习） |
| 企业微信群机器人 `wecom_bot` | webhook 地址或 key |
| 企业微信应用 `wecom_app` | CorpID / Secret / AgentID / 接收人 |
| 通用 POST `http_post` | URL / 请求体模板 / 请求头 |
| 通用 GET `http_get` | URL 模板 / 请求头 |

**通用通道占位符**：`{title}` `{body}` `{content}` `{text}` `{time}`；
`{title_raw}` / `{body_raw}` 为不转义版本。GET 的 URL 不写占位符时自动拼 `?title=&body=`。
请求头每行一条 `Key: Value`。

**令牌勾选语义**：

| 勾选 | 行为 |
|---|---|
| 全选 | 全部通道 + 默认账号直发（指向默认账号的新消息通道会自动跳过，避免同号收两条） |
| 只勾部分 | **只投递这些通道**，不碰默认账号 |
| 都不勾 | 不投递任何地方（请求仍返回 200，日志记 ok） |

> 只要勾了具体通道，这条推送就完全由通道负责，不会因为某个号码没配好而整条失败。

### GET 推送

最常用的方式，一行 URL 就能推：

```
https://notify.example.com/push?token=你的令牌&title=标题&body=正文
```

**中文必须 URL 编码**，否则直接 400 且响应体为空。命令行用 `-G --data-urlencode` 最省事：

```bash
curl -sG 'https://notify.example.com/push' \
  --data-urlencode 'token=你的令牌' \
  --data-urlencode 'title=服务器通知' \
  --data-urlencode 'body=备份完成'
```

只推正文（`title` 和 `body` 不能同时为空）：

```bash
curl -sG 'https://notify.example.com/push' \
  --data-urlencode 'token=你的令牌' --data-urlencode 'body=任务完成'
```

Bark 风格路径（路径段同样要编码）：

```
https://notify.example.com/push/标题/正文?token=你的令牌
```

限制：URL 总长 ≤ 8KB，中文编码后膨胀 3 倍，正文建议 500 字以内；长文本用 POST。

**各客户端填法**：

| 客户端 | 填法 |
|---|---|
| 浏览器 / iOS 快捷指令 | 直接填上面那条 URL，变量替换 `title` / `body` |
| SmsForwarder（短信转发器） | 通道类型选 **Webhook**，方法 **POST**，URL 带 `?token=`，体用下面的 JSON |
| 青龙 / 各种 notify 脚本 | 用 GET，注意 `encodeURIComponent` |
| 通用 GET 推送工具 | URL 模板：`.../push?token=xxx&title={title}&body={content}` |

SmsForwarder 的 Web Params（**不要勾「自定义模板」**，否则 JSON 会被二次转义）：

```json
{"title":"短信 · [from]","body":"[org_content]\n接收时间: [receive_time]\n卡槽: [card_slot]"}
```

> 不要用 SmsForwarder 的 **Bark 通道**：它会在路径里插 device_key，拼成 `/push/{key}/{title}/{body}`，与本网关路由不匹配。

### POST 推送

```bash
curl -X POST 'https://notify.example.com/push' \
  -H 'Authorization: Bearer 你的令牌' \
  -H 'Content-Type: application/json' \
  -d '{"title":"服务器通知","body":"备份完成"}'
```

鉴权四种写法都认：

```
Authorization: Bearer <token>
X-API-Key: <token>
?token=<token>
?key=<token>
```

返回：

```json
{"ok":true,"code":200,"data":{"status":"ws_written","messageId":"..."}}
```

> `ws_written` 只代表已写进 WebSocket，不等于手机已收到/已读。

### 推送图片 / 语音 / 视频 / 文件

**A. 本地文件**（网关先上传到移动文件服务，再发消息）：

```bash
curl -X POST 'https://notify.example.com/api/media/upload-send' \
  -H 'Authorization: Bearer 你的令牌' \
  -F 'file=@./a.png' -F 'content=截图' -F 'mediaType=IMAGE'
```

**B. 已有公网 URL**（必须是移动服务端能拉到的地址）：

```bash
curl -X POST 'https://notify.example.com/api/media/send' \
  -H 'Authorization: Bearer 你的令牌' -H 'Content-Type: application/json' \
  -d '{"mediaType":"VIDEO","content":"说明","mediaUrl":"https://example.com/a.mp4",
       "thumbnailUrl":"https://example.com/a.jpg","mediaFileName":"a.mp4",
       "mediaSize":1234567,"mediaMimeType":"video/mp4"}'
```

`mediaType` 可选 `IMAGE` / `VIDEO` / `AUDIO` / `TEXT` / `FILE`，不填按 MIME 推断
（`image/*→IMAGE`、`video/*→VIDEO`、`audio/*→AUDIO`、`text/*→TEXT`，其余 `FILE`）。

> **语音必须是 mp3 或 amr**。实测 wav 会被服务端当普通文件，手机上退化成链接。
> 建议单文件 ≤ 20MB（Cloudflare 类反代默认 100MB，容器内解析还要吃内存）。

### 读入站消息

```bash
curl 'https://notify.example.com/api/inbox?limit=20' \
  -H 'Authorization: Bearer 你的令牌'
```

返回含发送方、内容、时间；媒体消息会带 `media.url` / `mimeType` / `size` / `thumbnailUrl`。

### 异步模式

URL 加 `?async=1` 或请求头 `X-Async: 1`，网关立即返回 **202**，投递丢到后台：

```bash
curl -X POST 'https://notify.example.com/push?async=1' \
  -H 'Authorization: Bearer 你的令牌' -H 'Content-Type: application/json' \
  -d '{"title":"备份完成","body":"nas 同步 ok"}'
# → {"ok":true,"code":202,"message":"已入队，后台投递（结果见面板日志）"}
```

代价：拿不到真实投递结果，202 只代表「已接收」，成功与否去面板日志看。
默认仍同步（返回 200 才代表真的写进 WebSocket）。

> 实测同步与异步耗时几乎无差别（延迟主要在网络 RTT）。
> 异步真正有用的场景是**连接异常需要重连时**：同步会卡到超时，异步立即返回。

### 接口总表

推送类接口用**推送令牌**，管理类接口用 **ADMIN_TOKEN**。

| 方法 | 路径 | 鉴权 | 用途 |
|---|---|---|---|
| GET | `/health` | 免 | 健康检查（`?account=` 查指定账号） |
| GET | `/connect` | 推送令牌 | 主动建立/验证连接 |
| GET/POST | `/push` | 推送令牌 | 推送文本 |
| GET | `/push/{title}/{body}` | 推送令牌 | Bark 风格推送 |
| POST | `/api/media/upload-send` | 推送令牌 | 上传并发送媒体 |
| POST | `/api/media/send` | 推送令牌 | 按公网 URL 发媒体 |
| GET | `/api/inbox` | 推送令牌 | 读入站消息 |
| GET | `/api/recipient` | 推送令牌 | 查当前接收人 |
| GET | `/admin` | 页面 | 管理面板 |
| GET | `/admin/api/overview` | ADMIN | 统计 + 连接状态 |
| GET/POST | `/admin/api/tokens` | ADMIN | 令牌列表 / 新建 |
| POST | `/admin/api/tokens/{id}/channels` | ADMIN | 改通道绑定（`null`=全部，`[]`=不转发） |
| POST | `/admin/api/tokens/{id}/toggle` | ADMIN | 启停令牌 |
| DELETE | `/admin/api/tokens/{id}` | ADMIN | 删除令牌 |
| GET/POST | `/admin/api/channels` | ADMIN | 通道列表 / 新建 |
| POST | `/admin/api/channels/{id}` | ADMIN | **修改通道**（名称 + 全部配置） |
| POST | `/admin/api/channels/{id}/test` | ADMIN | 发测试消息 |
| POST | `/admin/api/channels/{id}/toggle` | ADMIN | 启停通道 |
| DELETE | `/admin/api/channels/{id}` | ADMIN | 删除通道 |
| GET/POST | `/admin/api/accounts` | ADMIN | 账号列表 / 新增 |
| POST | `/admin/api/accounts/{id}` | ADMIN | 改名 / 改 Key / 改接收人 |
| POST | `/admin/api/accounts/{id}/test` | ADMIN | 测试连接（会主动建连） |
| GET/DELETE | `/admin/api/logs?limit=&q=` | ADMIN | 查询 / 清空日志 |
| POST | `/admin/api/push` | ADMIN | 面板内测试推送 |

示例：

```bash
B=https://notify.example.com
ADMIN=<ADMIN_TOKEN>
TOKEN=<推送令牌>

# 健康检查
curl "$B/health"

# 建令牌，只绑两个通道
curl -X POST "$B/admin/api/tokens" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"我的APP","channels":["ch_aaa","ch_bbb"]}'

# 改令牌的通道（null = 全选，[] = 不转发）
curl -X POST "$B/admin/api/tokens/tk_xxx/channels" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"channels":null}'

# 推送
curl -X POST "$B/push" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"title":"标题","body":"正文"}'
```

---

## 反向代理

容器只监听 `18090`，**不占用 80/443**。要让域名可用，前置一层 nginx：

```nginx
server {
    listen 443 ssl http2;
    server_name notify.example.com;

    ssl_certificate     /path/fullchain.pem;
    ssl_certificate_key /path/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:18090;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 100m;   # 媒体上传
    }
}
```

改完把 `.env` 的 `BASE_URL` 改成 `https://notify.example.com`，然后 `docker compose up -d` 重启。

> ⚠️ **不要把这个域名套 CDN**。国内 → Cloudflare / 海外 CDN → 回源国内，实测会让推送从 50ms 涨到 2~3 秒。
> 直接用国内反代机或直连 IP。

---

## GitHub 一键登录

可选功能，不配就只用 `ADMIN_TOKEN` 登录。

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App
2. 填：
   - Homepage URL：`https://notify.example.com`
   - **Authorization callback URL**：`https://notify.example.com/admin/oauth/callback`
3. 拿到 Client ID / Client Secret，写进 `.env`：

```ini
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=...
GITHUB_ADMIN_LOGINS=你的GitHub用户名
```

4. `docker compose up -d` 重启，登录页出现「使用 GitHub 登录」

白名单为空时 GitHub 登录会被禁用（只提示「未配置 GITHUB_ADMIN_LOGINS」），不会变成人人可登。
登录成功后发一个 30 天会话（存在 SQLite 的 `sessions` 表），`ADMIN_TOKEN` 始终有效作为兜底。

---

## 数据与备份

- 数据位置：宿主机 `./data/gateway.db`（容器内 `/data`）
- 表：`tokens` / `channels` / `accounts` / `logs` / `sessions` / `kv` / `oauth_states`
- WAL 模式，备份建议先停容器：

```bash
docker compose stop
cp data/gateway.db data/gateway.db.$(date +%F).bak
docker compose start
```

升级：

```bash
git pull
docker compose up -d --build
```

> **`data/` 目录不要删**，删了等于清空所有令牌 / 通道 / 日志 / 接收人。

日志表会随推送量线性增长（约 1KB/条），面板「日志」页可一键清空。
按每天 500 条估算，一年约 180MB，磁盘压力不大，但建议定期清理。

---

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 推送报「尚无默认 RECIPIENT」 | 该号码还没记录接收人。**用这个号码的手机**给 ClawBot 应用号发一条任意消息，或在通道里手填「接收人」 |
| 推送报「API Key无效」 | Key 已失效（常见于重新做绑定/授权）。到手机重新授权拿新 Key，通道行点「修改」换上，会自动重连 |
| 手机提示「龙虾暂未在线」 | 移动侧设备离线或正在重启。等 2~3 分钟；若同时网关报 Key 无效，先换 Key |
| `/health` 显示 `connected:false` | 实例重启后的懒连接，`/health` 本身不触发建连。点面板通道「测试」或等 30 秒保活；持续失败看 `docker logs` |
| GET 返回 400 且响应体为空 | URL 里有未编码的中文 / 空格 / 换行 |
| 长文本 GET 失败 / 414 | 超过 8KB，改用 POST |
| 语音变成链接 | 用了 wav。改 mp3 或 amr |
| 通道报 `HTTP 522` / 超时 | 通道 URL 填成了本网关自己的地址（回环超时），换成外部地址 |
| 通道报 `93000` / `60020` | 企微 webhook key 无效 / 服务器 IP 不在企微可信列表 |
| GitHub 登录报 `redirect_uri_mismatch` | `.env` 的 `BASE_URL` 与 OAuth App 里填的回调不一致 |
| 面板打不开 | 端口没放开：`firewall-cmd --add-port=18090/tcp` 或云安全组 |
| 两个网关抢同一个号 | 同一个 API Key 只能一条连接。另一个实例要换 Key 或停用 |
| `better-sqlite3` 编译失败 | Dockerfile 已装 `python3 make g++` 并强制源码编译；确认构建阶段 apt 能通 |
| 构建时 npm / apt 超时 | 用 `NODE_IMAGE` + `NPM_REGISTRY` build arg 换国内源 |

---

## 项目结构

```
cmcc-gateway-node/
├─ src/
│  ├─ index.ts            入口：HTTP 服务 + 30s 保活循环
│  ├─ app.ts              Hono 应用、鉴权、投递、通道 fanout
│  ├─ cmcc-gateway.ts     网关实例（长连接 + KV，替代 Durable Object）
│  ├─ db.ts               SQLite → D1 风格接口适配
│  ├─ schema.ts           建表 SQL
│  ├─ env.ts              配置类型
│  ├─ http.ts             响应与鉴权工具
│  ├─ message-format.ts   消息帧解析 / 媒体类型推断
│  ├─ constants.ts        常量
│  ├─ gateway/
│  │  ├─ connection.ts    WebSocket 建连 / 心跳 / 重连
│  │  ├─ outbound.ts      出站：文本与媒体
│  │  ├─ inbound.ts       入站：消息与回执
│  │  ├─ recipients.ts    接收人记录
│  │  └─ router.ts        网关内部路由
│  └─ admin/
│     ├─ panel.ts         单页面板（内联 HTML/CSS/JS）
│     ├─ routes.ts        管理接口 + GitHub OAuth
│     ├─ store.ts         数据访问
│     ├─ dispatch.ts      五种通道分发
│     ├─ wecom.ts         企微机器人 / 应用
│     ├─ httpch.ts        通用 GET / POST
│     └─ hook.ts          推送日志 + fanout
├─ Dockerfile
├─ docker-compose.yml
├─ .env.example
└─ package.json
```

运行机制要点：

- **长连接**：每个账号一个 WebSocket，进程内 `Map<accountId, gateway>` 管理
- **保活**：15s 心跳 ping，30s 全局巡检（断开则重连，并把自动学到的接收人回写数据库）
- **懒连接**：新账号第一次推送或点「测试」时才建连，属正常现象
- **重连竞态**：`message` / `close` / `error` 都校验 `gateway.ws === ws`，避免旧连接清掉新连接状态

---

## 性能参考

在一台 2 核 / 1.9G 的国内云服务器上实测（2 个账号常驻连接）：

| 指标 | 值 |
|---|---|
| 推送耗时（公网访问） | **40 ~ 60 ms** |
| 推送耗时（服务器本机） | 3 ~ 9 ms |
| 容器内存 | 25 ~ 40 MB（限制 256 MB） |
| 容器 CPU | 0.00 ~ 0.01% |
| 镜像体积 | 约 370 MB（含 Node 运行时） |
| `/health` 并发 5 × 20 次 | 0.17 s |

对比托管在 Cloudflare Workers + Durable Objects 上的版本：1.4 ~ 2.9 s。
差距来自跨境链路（国内 → CF 边缘 TCP 握手就 700ms+），国内机器到移动服务端只有 42ms。

---

## 致谢与许可

- 协议与内核基于 [x-dr/cmcc-message-gateway](https://github.com/x-dr/cmcc-message-gateway)（MIT）
- 本项目在其上重写为 Node + SQLite 单进程形态，并扩展了多令牌、多账号、多通道 fanout、日志与管理面板

MIT License，见 [LICENSE](LICENSE)。

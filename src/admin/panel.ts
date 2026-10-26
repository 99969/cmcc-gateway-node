// 管理面板：单页 HTML（零依赖，内联 CSS/JS）
// 模型三层：通道（推到哪）→ 令牌（谁在用、能推哪些通道）→ GET/POST 推送
import { BUILD, VERSION } from "../version.js";

export const PANEL_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>新消息网关 · 控制台</title>
<style>
*{box-sizing:border-box}
body{margin:0;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#f5f6f8;color:#1f2328}
a{color:#0b6bcb;text-decoration:none}
.hidden{display:none!important}
.login{min-height:100vh;display:flex;align-items:center;justify-content:center}
.login .box{background:#fff;padding:32px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.08);width:340px}
.login h1{font-size:18px;margin:0 0 4px}
.login p{color:#6b7280;margin:0 0 20px;font-size:13px}
header{background:#fff;border-bottom:1px solid #e5e7eb;padding:14px 24px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:9}
header h1{font-size:16px;margin:0;font-weight:600}
header .spacer{flex:1}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 10px;border-radius:99px;background:#eef2f6;color:#4b5563}
.pill .dot{width:7px;height:7px;border-radius:50%;background:#9ca3af}
.pill.ok{background:#e7f7ee;color:#0f7b45}.pill.ok .dot{background:#12b76a}
.pill.bad{background:#fdecec;color:#b42318}.pill.bad .dot{background:#f04438}
nav{display:flex;gap:4px;padding:0 24px;background:#fff;border-bottom:1px solid #e5e7eb;overflow-x:auto}
nav button{background:none;border:none;padding:12px 14px;font-size:14px;color:#57606a;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
nav button.active{color:#0b6bcb;border-bottom-color:#0b6bcb;font-weight:600}
main{padding:24px;max-width:1100px;margin:0 auto}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px}
.card h2{font-size:14px;margin:0 0 14px;font-weight:600}
.card h3{font-size:13px;margin:18px 0 8px;font-weight:600;color:#374151}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.stat{background:#fafbfc;border:1px solid #eef0f3;border-radius:10px;padding:14px}
.stat .k{font-size:12px;color:#6b7280}
.stat .v{font-size:22px;font-weight:600;margin-top:2px}
label{display:block;font-size:12px;color:#57606a;margin-bottom:4px}
input,select,textarea{width:100%;padding:8px 10px;border:1px solid #d0d7de;border-radius:8px;font:inherit;background:#fff;outline:none}
input[type=checkbox]{width:auto;margin:0;padding:0}
input:focus,select:focus,textarea:focus{border-color:#0b6bcb;box-shadow:0 0 0 3px rgba(11,107,203,.12)}
textarea{resize:vertical;min-height:70px;font-family:ui-monospace,Consolas,monospace;font-size:12px}
.row{display:flex;gap:10px;flex-wrap:wrap}
.row>div{flex:1;min-width:150px}
button.btn{background:#0b6bcb;color:#fff;border:none;padding:8px 16px;border-radius:8px;font:inherit;cursor:pointer}
button.btn:hover{background:#0a5cb0}
button.btn.ghost{background:#fff;color:#374151;border:1px solid #d0d7de}
button.btn.danger{background:#fff;color:#b42318;border:1px solid #f3c0bb}
button.btn.sm{padding:4px 10px;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #eef0f3;vertical-align:top}
th{color:#6b7280;font-weight:500;font-size:12px;white-space:nowrap}
tr:hover td{background:#fafbfc}
code,.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
pre{background:#f6f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:12px;overflow-x:auto;font-size:12px;font-family:ui-monospace,Consolas,monospace;line-height:1.7;margin:8px 0}
.tag{display:inline-block;padding:1px 7px;border-radius:6px;background:#eef2f6;color:#4b5563;font-size:11px}
.tag.ok{background:#e7f7ee;color:#0f7b45}
.tag.err{background:#fdecec;color:#b42318}
.tag.info{background:#e8f1fd;color:#0b5aa8}
.muted{color:#6b7280;font-size:12px}
.empty{color:#9ca3af;text-align:center;padding:22px;font-size:13px}
.checks{display:flex;flex-wrap:wrap;gap:8px 18px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafbfc}
.checks label{display:flex;align-items:center;gap:6px;margin:0;font-size:13px;color:#374151}
.toast{position:fixed;right:20px;bottom:20px;background:#1f2328;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;opacity:0;transition:.2s;pointer-events:none;max-width:420px}
.toast.show{opacity:1}
.copy{background:#f6f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:10px;word-break:break-all;font-size:12px;font-family:ui-monospace,Consolas,monospace;color:#374151}
.sub{background:#fafbfc}
.inline{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.doc h3{margin-top:22px}
.doc p,.doc li{font-size:13px;color:#374151}
.doc ul{padding-left:20px;margin:8px 0}
@media(max-width:640px){main{padding:14px}header{padding:12px 14px}nav{padding:0 10px}}
</style>
</head>
<body>

<div id="login" class="login">
  <div class="box">
    <h1>新消息网关 · 控制台</h1>
    <p>输入管理令牌（ADMIN_TOKEN）</p>
    <input id="adminToken" type="password" placeholder="admin token" autocomplete="current-password">
    <div style="height:12px"></div>
    <button class="btn" style="width:100%" onclick="doLogin()">进入</button>
    <div class="muted" style="text-align:center;margin:12px 0">或</div>
    <a class="btn ghost" style="width:100%;display:block;text-align:center;text-decoration:none" href="/admin/oauth/start">使用 GitHub 登录</a>
    <div id="loginErr" class="muted" style="color:#b42318;margin-top:10px"></div>
  </div>
</div>

<div id="app" class="hidden">
  <header>
    <h1>新消息网关</h1>
    <span id="connPill" class="pill"><span class="dot"></span><span id="connText">检测中</span></span>
    <span class="spacer"></span>
    <span class="tag info">v${VERSION} · ${BUILD}</span>
    <span class="muted mono" id="hostText"></span>
    <button class="btn ghost sm" onclick="logout()">退出</button>
  </header>
  <nav>
    <button class="active" data-tab="overview" onclick="switchTab('overview')">概览 / 推送</button>
    <button data-tab="tokens" onclick="switchTab('tokens')">令牌</button>
    <button data-tab="channels" onclick="switchTab('channels')">通道</button>
    <button data-tab="logs" onclick="switchTab('logs')">日志</button>
    <button data-tab="help" onclick="switchTab('help')">使用说明</button>
    <button data-tab="about" onclick="switchTab('about')">项目介绍</button>
  </nav>
  <main>
    <section id="tab-overview">
      <div class="card">
        <h2>运行状态</h2>
        <div class="grid" id="statGrid"></div>
      </div>
      <div class="card">
        <h2>发一条</h2>
        <div class="row">
          <div><label>标题（可选）</label><input id="sdTitle" placeholder="服务器通知"></div>
        </div>
        <div style="margin-top:10px"><label>正文</label><textarea id="sdBody" placeholder="任务已执行完成"></textarea></div>
        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <label style="margin:0">令牌</label>
          <select id="sdToken" style="max-width:280px"></select>
          <button class="btn" onclick="sendTest()">发送</button>
          <button class="btn ghost" onclick="buildGet()">生成 GET 链接</button>
        </div>
        <div class="muted" style="margin-top:6px">按所选令牌绑定的通道投递；不选令牌则无法发送。</div>
        <div id="getBox" style="margin-top:14px"></div>
      </div>
    </section>

    <section id="tab-tokens" class="hidden">
      <div class="card">
        <h2>新增令牌</h2>
        <div class="row">
          <div><label>名称（哪个 APP 在用）</label><input id="tkName" placeholder="如：青龙 / 短信转发器 / 监控脚本"></div>
          <div style="flex:0 0 auto;min-width:auto;display:flex;align-items:flex-end"><button class="btn" onclick="createToken()">生成</button></div>
        </div>
        <div style="margin-top:14px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
            <label style="margin:0">能推到哪些通道</label>
            <button class="btn ghost sm" onclick="checkAll('tkChannels',true)">全选</button>
            <button class="btn ghost sm" onclick="checkAll('tkChannels',false)">清空</button>
            <span class="muted">全选 = 跟随全部通道；只勾部分 = 只推这些；都不勾 = 不转发</span>
          </div>
          <div id="tkChannels" class="checks"><span class="muted">加载中…</span></div>
        </div>
      </div>
      <div class="card">
        <h2>令牌列表</h2>
        <div id="tokenList"></div>
      </div>
    </section>

    <section id="tab-channels" class="hidden">
      <div class="card">
        <h2>新增通道</h2>
        <div class="row">
          <div><label>名称</label><input id="chName" placeholder="如：备用号码 / 运维群"></div>
          <div><label>类型</label>
            <select id="chType" onchange="renderChannelFields()">
              <option value="cmcc">新消息（推到手机）</option>
              <option value="wecom_bot">企业微信群机器人</option>
              <option value="wecom_app">企业微信应用</option>
              <option value="http_post">通用 POST</option>
              <option value="http_get">通用 GET</option>
            </select>
          </div>
        </div>
        <div id="chFields" style="margin-top:10px"></div>
        <div style="margin-top:12px"><button class="btn" onclick="createChannel()">添加通道</button></div>
        <div class="muted" style="margin-top:8px">同一类型可以加任意多个，各自独立。</div>
      </div>
      <div class="card">
        <h2>通道列表</h2>
        <div id="channelList"></div>
      </div>
    </section>

    <section id="tab-logs" class="hidden">
      <div class="card">
        <h2>推送日志</h2>
        <div class="row" style="margin-bottom:12px">
          <div><label>关键词</label><input id="logQ" placeholder="标题 / 正文 / 令牌名" onkeydown="if(event.key==='Enter')loadLogs()"></div>
          <div style="flex:0 0 auto;min-width:auto;display:flex;align-items:flex-end;gap:8px">
            <button class="btn" onclick="loadLogs()">查询</button>
            <button class="btn danger" onclick="clearLogs()">清空</button>
          </div>
        </div>
        <div id="logList"></div>
      </div>
    </section>

    <section id="tab-help" class="hidden">
      <div class="card doc">
        <h2>使用说明</h2>
        <p>整个网关只有三层：<b>通道</b>（推到哪）→ <b>令牌</b>（谁在用、能推哪些通道）→ <b>GET/POST 推送</b>。</p>

        <h3>一、三步上手</h3>
        <ul>
          <li><b>通道</b>页：加你要推的地方（新消息 / 企微机器人 / 企微应用 / 通用 GET / 通用 POST）</li>
          <li><b>令牌</b>页：建一个令牌，勾上这个 APP 该推的通道</li>
          <li>把下面这条地址填进第三方 APP（短信转发器、青龙、脚本……）</li>
        </ul>

        <h3>二、GET 推送（最常用）</h3>
        <pre>https://notify.example.com/push?token=你的令牌&amp;title=标题&amp;body=正文</pre>
        <p><b>中文必须 URL 编码</b>，否则直接 400。命令行用 <code>-G --data-urlencode</code> 最省事：</p>
        <pre>curl -sG 'https://notify.example.com/push' \\
  --data-urlencode 'token=你的令牌' \\
  --data-urlencode 'title=服务器通知' \\
  --data-urlencode 'body=备份完成'</pre>
        <p>Bark 风格路径也支持：<code>/push/标题/正文?token=...</code>（路径段同样要编码）。
        URL 总长上限 8KB，中文编码后膨胀 3 倍，正文建议 500 字以内，长了用 POST。</p>

        <h3>三、POST 推送</h3>
        <pre>curl -X POST 'https://notify.example.com/push' \\
  -H 'Authorization: Bearer 你的令牌' \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"服务器通知","body":"备份完成"}'</pre>
        <p>鉴权四种写法都认：<code>Authorization: Bearer</code>、<code>X-API-Key</code>、<code>?token=</code>、<code>?key=</code>。</p>

        <h3>四、发图片 / 语音 / 视频 / 文件</h3>
        <pre>curl -X POST 'https://notify.example.com/api/media/upload-send' \\
  -H 'Authorization: Bearer 你的令牌' \\
  -F 'file=@./a.png' -F 'content=说明' -F 'mediaType=IMAGE'</pre>
        <p><code>mediaType</code> 可选 IMAGE / VIDEO / AUDIO / TEXT / FILE，不填按 MIME 推断。
        <b>语音必须是 mp3 或 amr</b>，wav 会变成链接。已有公网地址可用 <code>/api/media/send</code> 直接发 URL。</p>

        <h3>五、读入站消息</h3>
        <pre>curl 'https://notify.example.com/api/inbox?limit=20' -H 'Authorization: Bearer 你的令牌'</pre>

        <h3>六、令牌隔离怎么理解</h3>
        <ul>
          <li>一个令牌 = 一个 APP = 一组通道 + 一个账号</li>
          <li>勾「全选」= 跟随全部通道（以后新增的自动包含）；只勾部分 = 只推这些；都不勾 = 只发手机不转发</li>
          <li>停用或删除令牌，用它的 APP 立刻 401</li>
        </ul>

        <h3>七、常见错误</h3>
        <ul>
          <li><b>400 且响应体为空</b>：URL 里有未编码的中文 / 空格 / 换行</li>
          <li><b>403 + error code 1010</b>：被 Cloudflare 拦了默认 UA，请求里加个正常 <code>User-Agent</code></li>
          <li><b>401</b>：令牌错了或被停用</li>
          <li><b>400 消息内容不能为空</b>：title 和 body 都没传</li>
          <li><b>200 但手机没收到</b>：返回的 <code>ws_written</code> 只代表写进长连接，看「日志」页和 <code>/api/debug/last-frame</code></li>
          <li><b>通道报 HTTP 522</b>：通道 URL 填成了本网关自己的域名，换成外部地址</li>
        </ul>
      </div>
    </section>

    <section id="tab-about" class="hidden">
      <div class="card doc">
        <h2>项目介绍</h2>
        <p>把<b>中国移动「新消息」</b>接成 HTTP 推送接口，让任何能发 HTTP 请求的东西（短信转发器、脚本、监控、CI）都能往手机推消息；
        同时可以把同一条消息<b>并行转发</b>到企业微信、任意 Webhook 等其他通道。</p>

        <h3>它能做什么</h3>
        <ul>
          <li>一个 GET 地址就能推消息到手机「新消息」</li>
          <li>一条消息同时 fanout 到多个通道（企微群、企微应用、任意 GET/POST 接口）</li>
          <li>多令牌隔离：不同 APP 用不同令牌，各自只能推自己该推的通道</li>
          <li>多号码：一个号码一个账号，各自独立长连接</li>
          <li>文本、图片、语音、视频、文件都能推；入站消息可查询、可转发到 Webhook</li>
          <li>完整推送日志：谁发的、走了哪些通道、成功还是失败</li>
        </ul>

        <h3>架构</h3>
        <pre>第三方 APP ──GET/POST──▶ Cloudflare Worker
                          ├─ 令牌鉴权（D1）
                          ├─ 记录日志 + 并行 fanout
                          └─ Durable Object（每个账号一个）
                               └─ WebSocket 长连接 ──▶ 中国移动「新消息」服务端 ──▶ 手机</pre>
        <ul>
          <li><b>Cloudflare Workers</b>：HTTP 入口、鉴权、fanout</li>
          <li><b>Durable Objects</b>：每个新消息账号一个实例，维护 WebSocket 长连接，内置 5 分钟自检重连</li>
          <li><b>D1</b>：令牌、通道、账号、日志</li>
          <li><b>Hono</b>：路由</li>
        </ul>

        <h3>获取 CMCC_API_KEY</h3>
        <p>「新消息」是运营商侧的 5G 消息应用号能力，网关必须持有一条 <code>ak_...</code> 凭证才能连上它的 WebSocket。
        这条凭证只能在手机上申领：</p>
        <ol>
          <li>手机打开「新消息」，进入 ClawBot 应用号（10086「养龙虾」那个）</li>
          <li>底部菜单 →「绑定/解绑」→「立即授权」</li>
          <li>完成认证后页面会给出专属 API Key，形如 <code>ak_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</code></li>
          <li>复制它，到面板「通道 → 新增 → 类型选新消息 → 填 API Key」，保存即完成绑定</li>
        </ol>
        <p class="muted">每个号码一条 Key，一个 Key 对应一个独立实例，可同时在线。
        重新做一次绑定/授权会换发新 Key、旧 Key 立即失效；失效后不用删通道，点该行「修改」换上新 Key 即可，接收人不会丢。</p>
        <p>官方说明：<a href="https://f.10086.cn/s/s/msgNotice/?infoId=oGaKNuZqtg6KbLn9OyRceA==" target="_blank" rel="noreferrer">中国移动「新消息」应用号开通与授权说明</a></p>
        <p>协议细节与上游实现见
        <a href="https://github.com/x-dr/cmcc-message-gateway" target="_blank" rel="noreferrer">x-dr/cmcc-message-gateway</a>。</p>

        <h3>开源与来源</h3>
        <ul>
          <li>内核基于 <a href="https://github.com/x-dr/cmcc-message-gateway" target="_blank" rel="noreferrer">x-dr/cmcc-message-gateway</a>（MIT）</li>
          <li>本实例在其上扩展了：多令牌、多账号、多通道 fanout、日志与管理面板</li>
        </ul>

        <h3>地址</h3>
        <pre>推送入口   https://notify.example.com
管理面板   https://notify.example.com/admin
健康检查   https://notify.example.com/health</pre>
        <p class="muted">面板里可查看当前令牌，请勿外传。</p>
      </div>
    </section>
  </main>
</div>

<div id="toast" class="toast"></div>

<script>
var TOKEN_KEY = 'cmcc_admin_token';
var state = { tokens: [], channels: [], accounts: [], logs: [], stats: {}, health: {} };
var TYPE_LABEL = { cmcc:'新消息', wecom_bot:'企微机器人', wecom_app:'企微应用', http_get:'GET', http_post:'POST' };

function $(id){ return document.getElementById(id); }
function esc(s){
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg){
  var t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(window.__tt); window.__tt = setTimeout(function(){ t.classList.remove('show'); }, 2800);
}
function adminToken(){ return localStorage.getItem(TOKEN_KEY) || ''; }

function api(path, opts){
  opts = opts || {};
  opts.headers = Object.assign({
    'Authorization': 'Bearer ' + adminToken(),
    'Content-Type': 'application/json'
  }, opts.headers || {});
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  return fetch(path, opts).then(function(r){
    if (r.status === 401) { logout(); throw new Error('管理令牌无效'); }
    return r.json().then(function(d){
      if (!r.ok || d.ok === false) throw new Error(d.message || ('HTTP ' + r.status));
      return d;
    });
  });
}

function doLogin(){
  var v = $('adminToken').value.trim();
  if (!v) return;
  localStorage.setItem(TOKEN_KEY, v);
  api('/admin/api/overview').then(function(){ $('loginErr').textContent=''; boot(); })
    .catch(function(e){ localStorage.removeItem(TOKEN_KEY); $('loginErr').textContent = e.message || '登录失败'; });
}
function logout(){
  localStorage.removeItem(TOKEN_KEY);
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
}
function switchTab(name){
  ['overview','tokens','channels','logs','help','about'].forEach(function(t){
    $('tab-' + t).classList.toggle('hidden', t !== name);
  });
  Array.prototype.forEach.call(document.querySelectorAll('nav button'), function(b){
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
  if (name === 'logs') loadLogs();
  if (name === 'tokens') { loadTokens(); loadAccounts(); }
  if (name === 'channels') loadChannels();
  if (name === 'overview') loadOverview();
}

function boot(){
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('hostText').textContent = location.host;
  loadOverview();
  loadAccounts().then(loadChannels).then(function(){
    loadTokens();
    renderChannelFields();
  });
}

function loadOverview(){
  return api('/admin/api/overview').then(function(d){
    state.stats = d.stats || {}; state.health = d.health || {};
    var h = state.health, ok = h.connected && h.authenticated;
    $('connPill').className = 'pill ' + (ok ? 'ok' : 'bad');
    $('connText').textContent = ok ? '已连接' : (h.connected ? '已连接 · 未鉴权' : '未连接');
    $('statGrid').innerHTML =
      stat('今日', state.stats.today || 0) + stat('累计', state.stats.total || 0) +
      stat('失败', state.stats.failed || 0) + stat('令牌', state.stats.tokens || 0) +
      stat('通道', state.stats.channels || 0);
    return Promise.resolve();
  }).catch(function(e){ toast(e.message); });
}
function stat(k, v){ return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }

function loadAccounts(){
  return api('/admin/api/accounts').then(function(d){
    state.accounts = d.accounts || [];
  }).catch(function(e){ toast(e.message); });
}

/* --------------------------------------------------------------- 令牌 */
function checksHtml(selected){
  if (!state.channels.length) return '<span class="muted">还没有通道，先到「通道」页添加</span>';
  var html = '';
  state.channels.forEach(function(c){
    var checked = selected === null || selected.indexOf(c.id) >= 0;
    html += '<label><input type="checkbox" data-cid="' + c.id + '"' + (checked ? ' checked' : '') + '>' +
      esc(c.name) + ' <span class="muted">(' + esc(TYPE_LABEL[c.type] || c.type) + ')</span></label>';
  });
  return html;
}
function checkAll(containerId, value){
  var box = $(containerId);
  if (!box) return;
  Array.prototype.forEach.call(box.querySelectorAll('input[type=checkbox]'), function(el){ el.checked = value; });
}
function collectChannels(containerId){
  var box = $(containerId);
  if (!box) return null;
  var boxes = box.querySelectorAll('input[type=checkbox]');
  if (!boxes.length) return null;
  var ids = [];
  Array.prototype.forEach.call(boxes, function(el){ if (el.checked) ids.push(el.getAttribute('data-cid')); });
  if (ids.length === boxes.length) return null;
  return ids;
}
function channelNames(raw){
  if (raw === null || raw === undefined || raw === '') return '全部';
  var ids;
  try { ids = JSON.parse(raw); } catch (e) { return '全部'; }
  if (!Array.isArray(ids)) return '全部';
  if (!ids.length) return '不转发';
  return ids.map(function(id){
    var hit = state.channels.filter(function(c){ return c.id === id; })[0];
    return hit ? hit.name : id;
  }).join('、');
}
function parseIds(raw){
  if (raw === null || raw === undefined || raw === '') return null;
  try { var v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch (e) { return null; }
}
function renderTokenChannelPicker(){
  if ($('tkChannels')) $('tkChannels').innerHTML = checksHtml(null);
}
function renderSendTokens(){
  if (!$('sdToken')) return;
  var html = '', n = 0;
  state.tokens.forEach(function(t){
    if (!t.enabled) return;
    n++;
    html += '<option value="' + esc(t.token) + '">' + esc(t.name) + '</option>';
  });
  if (!n) html = '<option value="">（还没有令牌，请到「令牌」页新建）</option>';
  $('sdToken').innerHTML = html;
}
function loadTokens(){
  return api('/admin/api/tokens').then(function(d){
    state.tokens = d.tokens || [];
    renderSendTokens();
    if (!state.tokens.length) { $('tokenList').innerHTML = '<div class="empty">还没有令牌</div>'; return; }
    var html = '<table><tr><th>名称</th><th>令牌</th><th>通道</th><th>状态</th><th>操作</th></tr>';
    state.tokens.forEach(function(t){
      var shown = t.token.length > 14 ? t.token.slice(0,10) + '…' : t.token;
      html += '<tr><td>' + esc(t.name) + '<div class="muted">' + (t.last_used_at ? new Date(t.last_used_at).toLocaleString() : '未使用') + '</div></td>' +
        '<td class="mono">' + esc(shown) + ' <button class="btn ghost sm" onclick="copyText(\\'' + esc(t.token) + '\\')">复制</button></td>' +
        '<td>' + esc(channelNames(t.channels)) + '</td>' +
        '<td>' + (t.enabled ? '<span class="tag ok">启用</span>' : '<span class="tag">停用</span>') + '</td>' +
        '<td style="white-space:nowrap"><button class="btn ghost sm" onclick="toggleRow(\\'' + t.id + '\\')">设置</button> ' +
        '<button class="btn ghost sm" onclick="toggleToken(\\'' + t.id + '\\')">' + (t.enabled ? '停用' : '启用') + '</button> ' +
        '<button class="btn danger sm" onclick="deleteToken(\\'' + t.id + '\\')">删除</button></td></tr>' +
        '<tr id="row-' + t.id + '" class="hidden sub"><td colspan="5">' +
          '<div class="checks" id="box-' + t.id + '">' + checksHtml(parseIds(t.channels)) + '</div>' +
          '<div style="margin-top:10px;display:flex;gap:8px">' +
            '<button class="btn sm" onclick="saveTokenSettings(\\'' + t.id + '\\')">保存</button>' +
            '<button class="btn ghost sm" onclick="checkAll(\\'box-' + t.id + '\\',true)">全选</button>' +
            '<button class="btn ghost sm" onclick="checkAll(\\'box-' + t.id + '\\',false)">清空</button>' +
          '</div></td></tr>';
    });
    $('tokenList').innerHTML = html + '</table>';
  }).catch(function(e){ toast(e.message); });
}
function toggleRow(id){ $('row-' + id).classList.toggle('hidden'); }
function toggleSub(id){ var el = $(id); if (el) el.classList.toggle('hidden'); }
function saveTokenSettings(id){
  var channels = collectChannels('box-' + id);
  api('/admin/api/tokens/' + id + '/channels', { method:'POST', body:{ channels: channels } })
    .then(function(){ toast('已保存'); $('row-' + id).classList.add('hidden'); loadTokens(); })
    .catch(function(e){ toast(e.message); });
}
function copyText(t){
  navigator.clipboard.writeText(t).then(function(){ toast('已复制'); }, function(){ toast('复制失败，请手动选择'); });
}
function createToken(){
  var name = $('tkName').value.trim() || '未命名';
  api('/admin/api/tokens', { method:'POST', body:{
      name: name,
      channels: collectChannels('tkChannels')
    }}).then(function(d){
      $('tkName').value = '';
      loadTokens(); loadOverview();
      $('tokenList').insertAdjacentHTML('afterbegin',
        '<div class="copy">新令牌（只显示这一次）：' + esc(d.token.token) + '</div>');
      toast('已生成');
    }).catch(function(e){ toast(e.message); });
}
function toggleToken(id){ api('/admin/api/tokens/' + id + '/toggle', { method:'POST' }).then(loadTokens).catch(function(e){ toast(e.message); }); }
function deleteToken(id){
  if (!confirm('删除这个令牌？用它的 APP 会立刻 401。')) return;
  api('/admin/api/tokens/' + id, { method:'DELETE' }).then(function(){ loadTokens(); loadOverview(); }).catch(function(e){ toast(e.message); });
}

/* --------------------------------------------------------------- 通道 */
function renderChannelFields(){
  var type = $('chType').value;
  if (type === 'cmcc') {
    $('chFields').innerHTML =
      '<div class="row">' +
      '<div><label>API Key（ak_...）</label><input id="cfKey" type="password" placeholder="中国移动新消息 ClawBot 的 API Key"></div>' +
      '<div><label>接收人（可选）</label><input id="cfRecipient" placeholder="留空用手机发一条自动识别"></div>' +
      '</div>';
  } else if (type === 'wecom_bot') {
    $('chFields').innerHTML = '<label>Webhook 地址或 key</label><input id="cfWebhook" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx 或直接填 key">';
  } else if (type === 'wecom_app') {
    $('chFields').innerHTML = '<div class="row">' +
      '<div><label>CorpID</label><input id="cfCorp" placeholder="ww..."></div>' +
      '<div><label>Secret</label><input id="cfSecret" type="password"></div>' +
      '<div><label>AgentID</label><input id="cfAgent" placeholder="1000002"></div>' +
      '<div><label>接收人</label><input id="cfToUser" value="@all"></div></div>';
  } else if (type === 'http_get') {
    $('chFields').innerHTML =
      '<label>URL</label><input id="cfUrl" placeholder="https://example.com/push?title={title}&amp;body={body}">' +
      '<div class="muted" style="margin:6px 0 10px">不写占位符会自动拼 ?title=&amp;body=。可用：{title} {body} {content} {time}</div>' +
      '<label>请求头（可选，每行 Key: Value）</label><textarea id="cfHeaders" placeholder="Authorization: Bearer xxx"></textarea>';
  } else {
    $('chFields').innerHTML =
      '<label>URL</label><input id="cfUrl" placeholder="https://example.com/hook">' +
      '<div style="margin-top:10px"><label>请求体</label><textarea id="cfBody" style="min-height:80px">{"title":"{title}","body":"{body}"}</textarea></div>' +
      '<div class="muted" style="margin-top:6px">{title} {body} 自动 JSON 转义；{title_raw} / {body_raw} 原样插入。</div>' +
      '<div style="margin-top:10px"><label>请求头（可选，每行 Key: Value）</label><textarea id="cfHeaders" placeholder="Content-Type: application/json"></textarea></div>';
  }
}
function loadChannels(){
  return api('/admin/api/channels').then(function(d){
    state.channels = d.channels || [];
    renderTokenChannelPicker();
    if (!state.channels.length) { $('channelList').innerHTML = '<div class="empty">还没有通道</div>'; return; }
    var html = '<table><tr><th>名称</th><th>类型</th><th>状态</th><th>最近结果</th><th>操作</th></tr>';
    state.channels.forEach(function(c){
      var last = c.last_error ? '<span class="tag err">失败</span> <span class="muted">' + esc(c.last_error) + '</span>'
        : (c.last_ok_at ? '<span class="tag ok">正常</span> <span class="muted">' + new Date(c.last_ok_at).toLocaleString() + '</span>' : '<span class="muted">未测试</span>');
      var editBtn = '<button class="btn ghost sm" onclick="openEdit(\\'' + c.id + '\\')">修改</button> ';
      html += '<tr><td>' + esc(c.name) + '</td><td><span class="tag info">' + esc(TYPE_LABEL[c.type] || c.type) + '</span></td>' +
        '<td>' + (c.enabled ? '<span class="tag ok">启用</span>' : '<span class="tag">停用</span>') + '</td>' +
        '<td>' + last + '</td>' +
        '<td style="white-space:nowrap"><button class="btn ghost sm" onclick="testChannel(\\'' + c.id + '\\')">测试</button> ' +
        editBtn +
        '<button class="btn ghost sm" onclick="toggleChannel(\\'' + c.id + '\\')">' + (c.enabled ? '停用' : '启用') + '</button> ' +
        '<button class="btn danger sm" onclick="deleteChannel(\\'' + c.id + '\\')">删除</button></td></tr>' +
        '<tr id="chedit-' + c.id + '" class="hidden sub"><td colspan="5">' +
          '<div id="cheditbody-' + c.id + '"></div>' +
          '<div style="margin-top:10px;display:flex;gap:10px">' +
          '<button class="btn sm" onclick="saveChannel(\\'' + c.id + '\\')">保存</button>' +
          '<button class="btn ghost sm" onclick="hideRow(\\'chedit-' + c.id + '\\')">取消</button></div>' +
        '</td></tr>';
    });
    $('channelList').innerHTML = html + '</table>';
  }).catch(function(e){ toast(e.message); });
}
function createChannel(){
  var type = $('chType').value, config = {};
  if (type === 'cmcc') {
    config.api_key = $('cfKey') ? $('cfKey').value.trim() : '';
    if (!config.api_key) return toast('请填 API Key');
    var rc = $('cfRecipient').value.trim();
    if (rc) config.recipient = rc;
  } else if (type === 'wecom_bot') {
    config.webhook = $('cfWebhook').value.trim();
    if (!config.webhook) return toast('请填 webhook');
  } else if (type === 'wecom_app') {
    config.corp_id = $('cfCorp').value.trim();
    config.secret = $('cfSecret').value.trim();
    config.agent_id = $('cfAgent').value.trim();
    config.to_user = $('cfToUser').value.trim() || '@all';
    if (!config.corp_id || !config.secret || !config.agent_id) return toast('三项都要填');
  } else {
    config.url = $('cfUrl').value.trim();
    if (!config.url) return toast('请填 URL');
    var hd = $('cfHeaders') ? $('cfHeaders').value.trim() : '';
    if (hd) config.headers = hd;
    if (type === 'http_post') config.body_template = $('cfBody').value.trim();
  }
  return submitChannel(type, config);
}
function submitChannel(type, config){
  return api('/admin/api/channels', { method:'POST', body:{ name:$('chName').value.trim() || type, type:type, config:config } })
    .then(function(){ $('chName').value=''; loadChannels(); loadOverview(); toast('已添加'); });
}
function hideRow(id){ var el = $(id); if (el) el.classList.add('hidden'); }
function findChannel(id){
  for (var i = 0; i < state.channels.length; i++) {
    if (state.channels[i].id === id) return state.channels[i];
  }
  return null;
}
function channelConfig(c){
  try { return JSON.parse(c.config || '{}') || {}; } catch (e) { return {}; }
}
/* 编辑表单：按通道类型回填所有添加时填过的内容 */
function editFieldsHtml(c){
  var cf = channelConfig(c), sfx = '-' + c.id;
  var head = '<div class="inline" style="margin-bottom:12px"><label style="margin:0">名称</label>' +
    '<input id="edName' + sfx + '" value="' + esc(c.name) + '" style="max-width:280px">' +
    '<span class="tag info">' + esc(TYPE_LABEL[c.type] || c.type) + '</span></div>';
  if (c.type === 'cmcc') {
    return head + '<div class="row">' +
      '<div><label>API Key（留空表示不修改）</label><input id="edKey' + sfx + '" type="password" placeholder="' +
        (cf.account_id ? '已配置，留空不改；填新的会自动重连' : 'ak_...') + '"></div>' +
      '<div><label>接收人（可选）</label><input id="edRecipient' + sfx + '" value="' + esc(cf.recipient || '') +
        '" placeholder="留空用手机发一条自动识别"></div></div>';
  }
  if (c.type === 'wecom_bot') {
    return head + '<label>Webhook 地址或 key</label><input id="edWebhook' + sfx + '" value="' + esc(cf.webhook || '') + '">';
  }
  if (c.type === 'wecom_app') {
    return head + '<div class="row">' +
      '<div><label>CorpID</label><input id="edCorp' + sfx + '" value="' + esc(cf.corp_id || '') + '"></div>' +
      '<div><label>Secret（留空不修改）</label><input id="edSecret' + sfx + '" type="password" placeholder="' +
        (cf.secret ? '已配置，留空不改' : '') + '"></div>' +
      '<div><label>AgentID</label><input id="edAgent' + sfx + '" value="' + esc(cf.agent_id || '') + '"></div>' +
      '<div><label>接收人</label><input id="edToUser' + sfx + '" value="' + esc(cf.to_user || '@all') + '"></div></div>';
  }
  if (c.type === 'http_get') {
    return head + '<label>URL</label><input id="edUrl' + sfx + '" value="' + esc(cf.url || '') + '">' +
      '<div style="margin-top:10px"><label>请求头（可选，每行 Key: Value）</label>' +
      '<textarea id="edHeaders' + sfx + '" style="min-height:70px">' + esc(cf.headers || '') + '</textarea></div>';
  }
  return head + '<label>URL</label><input id="edUrl' + sfx + '" value="' + esc(cf.url || '') + '">' +
    '<div style="margin-top:10px"><label>请求体</label><textarea id="edBody' + sfx + '" style="min-height:80px">' +
      esc(cf.body_template || '') + '</textarea></div>' +
    '<div style="margin-top:10px"><label>请求头（可选，每行 Key: Value）</label>' +
    '<textarea id="edHeaders' + sfx + '" style="min-height:70px">' + esc(cf.headers || '') + '</textarea></div>';
}
function openEdit(id){
  var c = findChannel(id);
  if (!c) return;
  var row = $('chedit-' + id);
  if (!row) return;
  if (row.classList.contains('hidden')) {
    $('cheditbody-' + id).innerHTML = editFieldsHtml(c);
    row.classList.remove('hidden');
  } else {
    row.classList.add('hidden');
  }
}
function saveChannel(id){
  var c = findChannel(id);
  if (!c) return;
  var sfx = '-' + id;
  var name = ($('edName' + sfx) ? $('edName' + sfx).value.trim() : '') || c.name;
  var config = {};
  if (c.type === 'cmcc') {
    var key = $('edKey' + sfx) ? $('edKey' + sfx).value.trim() : '';
    if (key) config.api_key = key;
    config.recipient = $('edRecipient' + sfx) ? $('edRecipient' + sfx).value.trim() : '';
  } else if (c.type === 'wecom_bot') {
    config.webhook = $('edWebhook' + sfx).value.trim();
    if (!config.webhook) return toast('请填 Webhook');
  } else if (c.type === 'wecom_app') {
    config.corp_id = $('edCorp' + sfx).value.trim();
    config.secret = $('edSecret' + sfx).value.trim();
    config.agent_id = $('edAgent' + sfx).value.trim();
    config.to_user = $('edToUser' + sfx).value.trim() || '@all';
    if (!config.corp_id || !config.agent_id) return toast('CorpID 和 AgentID 都要填');
  } else {
    config.url = $('edUrl' + sfx).value.trim();
    if (!config.url) return toast('请填 URL');
    var hd = $('edHeaders' + sfx) ? $('edHeaders' + sfx).value.trim() : '';
    if (hd) config.headers = hd;
    if (c.type === 'http_post') config.body_template = $('edBody' + sfx).value.trim();
  }
  api('/admin/api/channels/' + id, { method:'POST', body:{ name:name, config:config } })
    .then(function(d){
      hideRow('chedit-' + id);
      loadChannels();
      loadOverview();
      toast(d.hint || '已保存');
    })
    .catch(function(e){ toast(e.message); loadChannels(); });
}
function testChannel(id){
  api('/admin/api/channels/' + id + '/test', { method:'POST' })
    .then(function(){ toast('测试已发送'); loadChannels(); })
    .catch(function(e){ toast(e.message); loadChannels(); });
}
function toggleChannel(id){ api('/admin/api/channels/' + id + '/toggle', { method:'POST' }).then(loadChannels).catch(function(e){ toast(e.message); }); }
function deleteChannel(id){
  if (!confirm('删除这个通道？')) return;
  api('/admin/api/channels/' + id, { method:'DELETE' }).then(function(){ loadChannels(); loadOverview(); }).catch(function(e){ toast(e.message); });
}

/* ----------------------------------------------------------- 概览/推送 */
function sendTest(){
  var title = $('sdTitle').value.trim(), body = $('sdBody').value.trim();
  if (!title && !body) return toast('标题和正文不能都为空');
  var tk = $('sdToken') ? $('sdToken').value : '';
  if (!tk) return toast('先选择一个令牌（到「令牌」页新建）');
  fetch('/push', {
    method:'POST',
    headers:{ 'Authorization':'Bearer ' + tk, 'Content-Type':'application/json' },
    body: JSON.stringify({ title:title, body:body })
  }).then(function(r){ return r.json(); }).then(function(d){
    toast(d.code === 200
      ? (d.message || ('已发送：' + ((d.data && d.data.messageId) || 'ok')))
      : ('失败：' + (d.message || d.code)));
    loadOverview();
  }).catch(function(e){ toast(e.message); });
}
function buildGet(){
  var tk = $('sdToken') ? $('sdToken').value : '';
  if (!tk) return toast('先选择一个令牌（到「令牌」页新建）');
  var title = $('sdTitle').value.trim(), body = $('sdBody').value.trim();
  var url = location.origin + '/push?token=' + encodeURIComponent(tk);
  if (title) url += '&title=' + encodeURIComponent(title);
  if (body) url += '&body=' + encodeURIComponent(body);
  $('getBox').innerHTML = '<div class="muted" style="margin-bottom:6px">GET 链接（可直接粘到浏览器 / 第三方 APP）</div>' +
    '<div class="copy">' + esc(url) + '</div>' +
    '<div style="margin-top:8px"><button class="btn ghost sm" onclick="copyText(\\'' + esc(url) + '\\')">复制</button></div>';
}

/* --------------------------------------------------------------- 日志 */
function loadLogs(){
  var q = $('logQ') ? $('logQ').value.trim() : '';
  return api('/admin/api/logs?limit=200&q=' + encodeURIComponent(q)).then(function(d){
    state.logs = d.logs || [];
    $('logList').innerHTML = logTable(state.logs, false);
  }).catch(function(e){ toast(e.message); });
}
function logTable(logs, compact){
  if (!logs.length) return '<div class="empty">暂无记录</div>';
  var html = '<table><tr><th>时间</th><th>令牌</th><th>内容</th><th>结果</th><th>通道</th></tr>';
  logs.forEach(function(l){
    var content = (l.title ? '<b>' + esc(l.title) + '</b><br>' : '') + esc((l.body || '').slice(0, compact ? 50 : 180));
    var res = l.status === 'ok' ? '<span class="tag ok">ok</span>'
      : '<span class="tag err">' + esc(l.detail || 'error') + '</span>';
    html += '<tr><td class="muted" style="white-space:nowrap">' + new Date(l.ts).toLocaleString() + '</td>' +
      '<td class="muted">' + esc(l.token_name || '—') + '</td>' +
      '<td>' + content + '</td><td>' + res + '</td>' +
      '<td class="muted">' + esc(l.channels || '—') + '</td></tr>';
  });
  return html + '</table>';
}
function clearLogs(){
  if (!confirm('清空全部日志？')) return;
  api('/admin/api/logs', { method:'DELETE' }).then(function(){ loadLogs(); loadOverview(); toast('已清空'); }).catch(function(e){ toast(e.message); });
}

(function(){
  var h = location.hash || '';
  if (h.indexOf('#session=') === 0) {
    localStorage.setItem(TOKEN_KEY, decodeURIComponent(h.slice(9)));
    history.replaceState(null, '', location.pathname);
  }
  if (h.indexOf('#loginerror=') === 0) {
    var el = $('loginErr');
    if (el) el.textContent = decodeURIComponent(h.slice(12));
    history.replaceState(null, '', location.pathname);
  }
})();

if (adminToken()) {
  api('/admin/api/overview').then(boot).catch(function(){ logout(); });
} else {
  $('adminToken').focus();
}
</script>
</body>
</html>`;

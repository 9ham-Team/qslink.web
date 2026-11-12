# QSLink API 契约 v1

> 本文件记录当前前后端接口行为；修改接口时应同步更新。若与文档不符，以 `server/lib/api/` 等现行实现为核实依据。
> 服务默认地址：`http://127.0.0.1:8787`。所有接口前缀 `/api`，JSON in / JSON out（UTF-8）。

### 上传图片的响应式版本

卡片 API 的 `frontImage` / `backImage` 返回保存后的图片路径；新上传统一为 WebP，旧图片路径保持兼容。`GET` / `HEAD /uploads/<filename>?w=<像素宽度>` 可请求 PNG/JPEG/WebP 的 WebP 缩放版本，质量 82，保留宽高比及透明度、自动纠正 EXIF 方向、不放大小图。`w` 须为 1–3840 的整数，向上归入 `160/320/480/640/960/1280/1600/1920/2560/3840` 档；不合法返回 `400 INVALID_IMAGE_WIDTH`，文件不存在返回 404。历史 SVG 保持矢量原文件和沙箱响应头。不带 `w` 获取保存后的图片（新上传为最大尺寸 WebP，历史图片为原文件）。

前端按图片所在位置的实际 CSS 布局宽度和设备 DPR，通过 `srcset` / `sizes` 选择档位；列表尺寸变化由 `ResizeObserver` 同步，3D 卡片采用旋转前的布局宽度，旋转不触发重复换图。已有上传图片无需重新上传。

首次请求按需生成，缓存到 `QSL_DATA_DIR/image-cache/`，同一进程的同图同档并发请求合并；最多同时处理 2 张、等待 64 项，满载返回 `503 IMAGE_BUSY`。成功响应带一年不可变缓存。源文件变更会更换磁盘缓存键；不设置输入像素数量上限（上传体积和处理并发限制仍保留）。无法缩放或缓存写入失败时退回原文件并禁用长缓存，避免旧卡片损坏。生成端使用 Sharp，需要 Node.js ≥20.9，生产镜像和 CI 使用 Node 24。

## 0. 通用约定

### 认证
- 登录/注册成功后返回 `token`。之后所有需要登录的请求携带：`Authorization: Bearer <token>`。
- Token 有效期 7 天；服务端 `sessions` 表保存。被禁用（`status: "banned"`）的用户立即失效。
- 未登录访问受保护接口 → `401`；已登录但非管理员访问管理接口 → `403`。

### 用户对象
公开字段 `UserPublic`：
```json
{
  "id": "u_xxx",
  "uid": "012345678",
  "username": "bg7mom",
  "displayName": "小刻",
  "callSign": "BG7MOM",
  "bio": "在 20 米波段等你的信号。",
  "avatarColor": "#0eaf8f",
  "role": "user",
  "joinedAt": "2026-10-01T12:00:00.000Z",
  "stats": { "cards": 2, "likesReceived": 34, "exchanges": 5 }
}
```
`UserSelf` 额外包含：`email`、`status`、`address`、`createdAt`、`updatedAt`、`stats.pendingExchanges`（待处理收到的申请数）。
`AvatarColor` 为 `#RRGGBB`，前端用于生成渐变头像。

`uid` 是注册时服务端随机分配且不可通过资料编辑修改的唯一九位字符串，范围 `000000001`–`999999999`，保留前导零。已有用户、离线初始化的管理员和导入用户也会分配 UID。卡片 `owner` 摘要同时包含 `uid`。

### 公开构建信息

`GET /api/config` 无需登录，返回 `{ demo, demoAccounts, build }`。`build` 为 `null` 或 `{ "revision": "完整40位小写十六进制SHA", "created": "2026-10-27T18:35:00Z" }`。时间必须是有效 UTC 秒精度 ISO 时间。服务端启动时只读取源码根目录（镜像中 `/app`）的 `build-info.json`，只公开上述两个字段；文件缺失、格式或日期无效均返回 `null`。不从请求、运行时环境变量、启动时间或文件 mtime 推断版本。本地源码运行默认 `build: null`。

Dockerfile 使用构建参数 `QSL_BUILD_REVISION` / `QSL_BUILD_CREATED` 同时写入该文件及 OCI `org.opencontainers.image.revision` / `org.opencontainers.image.created`，两者必须一致；未传参数的镜像为开发版。页脚显示前七位 SHA 与香港时间，完整 SHA 保留在 API 中。

### 公开个人主页

`GET /api/public/spaces/:uid?sort=latest&page=1&limit=12` 无需登录。`sort` 支持 `latest`（默认，最新）及 `popular`（最热）；无效值回退 `latest`。UID 格式错误、用户不存在或被禁用返回 `404 NOT_FOUND`。返回：

```json
{
  "user": {
    "uid": "012345678", "displayName": "小刻", "callSign": "BG7MOM",
    "bio": "在电波中相遇", "avatarColor": "#0eaf8f", "joinedAt": "2026-10-01T12:00:00.000Z",
    "stats": { "cards": 2, "likesReceived": 34 }
  },
  "cards": { "items": [], "total": 2, "page": 1, "limit": 12, "pages": 1 },
  "url": "https://qsl.9ham.net/space/012345678"
}
```

`cards.items` 为 `CardPublic[]`。`latest` 按发布时间倒序，`popular` 按点赞数倒序；同赞数按发布时间倒序，同时间再按卡片 ID 倒序稳定分页。仅包含审核通过的卡片；本人和管理员访问也遵守此筛选。公开统计只计算这些卡片及其点赞。主页资料不含邮箱、地址、认证或审核数据；`liked` 随访问者登录状态变化。分页沿用公共接口约定。`url` 使用 `QSL_PUBLIC_ORIGIN`，未配置时为 `null`，前端使用当前 origin 构建链接。分享无需创建 token 或更改可见性，任何人都能直接访问 `/space/:uid`。

地址对象 `Address`：
```json
{
  "name": "张小刻",          // 收件人姓名，必填，1-30
  "phone": "13800000000",    // 选填，≤30
  "line1": "海淀区中关村大街 1 号 5 单元 602", // 必填，1-100
  "city": "北京市",           // 必填，1-50
  "province": "北京市",       // 选填，≤50
  "postalCode": "100080",    // 选填，≤20
  "country": "中国"           // 选填，≤50，默认 "中国"
}
```

### 卡片对象
`CardPublic`（列表/详情通用）：
```json
{
  "id": "c_xxx",
  "title": "雪线之上的守候",
  "callSign": "BA1AA",
  "band": "",
  "mode": "",
  "notes": "海拔 4500 米的通联纪念。",
  "stock": null,
  "ratio": { "w": 3, "h": 2 },
  "frontImage": "/uploads/xxx.webp",
  "backImage": "/uploads/xxx.webp",
  "likeCount": 18,
  "liked": false,
  "status": "approved",
  "exchangeCount": 3,
  "createdAt": "2026-10-01T12:00:00.000Z",
  "owner": { "id": "u_x", "username": "ba1aa", "displayName": "老北京", "callSign": "BA1AA", "avatarColor": "#38bdf8" }
}
```
- `ratio.w/h` 为整数 1-1000，表示卡片宽高比；前端按 `w/h` 渲染 3D 卡片尺寸。
- `liked` 仅在带 token 请求时有意义（未登录恒为 false）。
- 列表接口返回的卡片均为 `approved`（"我的卡片"和"管理后台"例外）。被禁用用户（owner.status=banned）的卡片不出现在公共列表。
- 详情 `CardDetail` = `CardPublic` + `{ "canApply": true, "isOwner": false, "shareToken": "...", "myExchange": null | {id,status} }`。

### 换卡申请对象
`ExchangeItem`：
```json
{
  "id": "e_xxx",
  "status": "pending",              // pending | approved | rejected | completed | cancelled
  "message": "希望交换卡片，73！",
  "rejectReason": null,
  "contactName": "张小刻",
  "createdAt": "...", "updatedAt": "...", "decidedAt": null,
  "direction": "incoming",          // 当前请求者视角：incoming=我收到 | outgoing=我发出
  "card": { "id": "c_x", "title": "...", "callSign": "BG7MOM", "ratio": {"w":104,"h":154}, "frontImage": "...", "backImage": "...", "shareToken": "..." },
  "fromUser": { "id": "...", "username": "...", "displayName": "...", "callSign": "...", "avatarColor": "..." },
  "toUser":   { "id": "...", "username": "...", "displayName": "...", "callSign": "...", "avatarColor": "..." },
  "fromAddress": null,              // 仅当 status ∈ {approved, completed} 且请求者为参与者/管理员时返回
  "toAddress": null                 // 同上
}
```
地址可见性规则：申请 `pending` / `rejected` / `cancelled` 时双方地址均不返回（`null`）；`approved` / `completed` 后，参与双方都能看到 `fromAddress` 与 `toAddress`（admin 全部可见）。

换卡通联附件：创建申请可传 `contactLogIds: string[]`（选填，默认空，最多 100 条、不重复）。服务端仅校验记录存在且属于申请人，按提交顺序保存标准化字段快照；不按任何一方呼号、日期、波段、模式自动筛选或判断，不接受客户端直接提交快照代替 ID。任一记录无权访问或不存在时整批返回 400（fields.contactLogIds），不创建申请。`ExchangeItem.selectedContactLogs` 仅对参与双方返回所选记录快照（id 及标准化通联详情，旧申请/未选为 []），旁观管理员省略；第三方仍无权查看申请。后续个人资料变化或日志更新/删除不改变快照，不展示未勾选记录，不修改寄送地址权限。邮件只提示申请人附上的记录数量及自行核对，不发送通联明细。取消旧 hasContactLog 自动匹配字段。

### 错误格式
```json
{ "error": { "message": "用户名已被占用", "code": "USERNAME_TAKEN", "fields": { "username": "..." } } }
```
`fields` 可选。常见 code：`VALIDATION`、`INVALID_CREDENTIALS`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`PAYLOAD_TOO_LARGE`、`BANNED`。验证码相关错误另见 §2；限流响应的 `Retry-After` 单位为秒。

### 分页
查询参数 `page`（默认 1）、`limit`（默认 12，最大 48）。列表响应：
```json
{ "items": [], "total": 42, "page": 1, "limit": 12, "pages": 4 }
```

### 图片上传
上传接口在 JSON body 中提交 data URL：
`"frontImage": "data:image/webp;base64,...."`（支持 png / jpeg / webp / svg+xml；单张解码后 ≤ 8MB）。
服务端在上传请求完成前检查实际图片格式，并解码校验。实际为静态 WebP、最长边 ≤3840 像素且无需纠正 EXIF 方向（方向缺失或为 1）时，完整解码确认有效后直接保存上传字节，避免重复有损编码；不会仅信任客户端 MIME 声明。其余图片转为 WebP（质量 82），自动纠正 EXIF 方向、保留透明度，按比例限制最长边至 3840 像素，不放大小图；动画沿用原有首帧转换行为，SVG 新上传也栅格化为 WebP。仅保存最终 WebP 并返回 `/uploads/<uuid>.webp`，转换时不另存上传原图。不设置输入像素数量上限；无法解码或转换失败返回 `400 VALIDATION`（含对应图片字段）；校验与转换均与响应式派生共用最多 2 项处理、64 项等待的队列，满载返回 `503 IMAGE_BUSY`。单张 8MB 限制在转换前检查。也可直接提交已保存的 `/uploads/...` URL（编辑时沿用旧图，不重新编码）；不批量转换或删除历史文件。

---

## 1. 健康检查与运行配置

`GET /api/health` → `{ "ok": true, "name": "QSLink", "version": "1.0.0", "uptime": 12.3, "time": "...", "storage": "postgresql" }`。健康检查会验证数据库连接。

### GET /api/stats

公开首页统计，无需登录，返回 `{ "userCount": 42 }`。`userCount` 为全库 `status=active` 的注册用户数量（包含管理员、未填写呼号和未上传卡片的用户，不计禁用用户），不受卡片审核、卡片列表分页或筛选影响。只公开聚合数量，不返回个人资料。

### GET /api/config

公开运行配置，响应不缓存。默认及生产返回 `{ "demo": false, "demoAccounts": [] }`。仅开发/测试显式启用 `QSL_SEED_DEMO=true` 时返回演示账号供登录页填入；前端不内置演示密码。生产模式禁止此开关。前端仅在 `demo: true` 时接受 `devToken` URL 参数，其余情况下忽略并清除该参数。

生产对登录、注册实施 15 分钟固定窗口限流：同一 IP 两接口合计最多 100 次，注册另限同一 IP 10 次，登录另限同一规范化 identifier 15 次；超限返回 `429 RATE_LIMITED` 与 `Retry-After`。此限制不代替验证码端点的独立限流（见 §2）。生产携带非本站 Origin 的写请求返回 `403 ORIGIN_DENIED`。PostgreSQL 暂时不可用时返回 `503 STORAGE_UNAVAILABLE`，连接恢复后请求可重试。生产分享 URL 使用配置的 HTTPS 公开地址。

## 2. 认证

### POST /api/auth/email-code

注册邮箱验证码发送端点，无需登录。body：`{ "email": "you@example.com" }`。
- 邮箱去除首尾空白并转小写；须为合法邮箱且长度 ≤120，否则 `400 VALIDATION`（`fields.email`）。
- 200 → `{ "ok": true, "expiresIn": 1800, "retryAfter": 60 }`。验证码为 **6 位数字字符串**（可能以 0 开头），从本次请求建立验证码记录起 **30 分钟**内有效，仅可消费一次；接口不会返回验证码明文，需查收邮件。
- 同一规范化邮箱两次发送至少间隔 60 秒；未到时间返回 `429 MAIL_COOLDOWN`。另按从各自首个计数请求开始的 1 小时固定窗口，限制同一邮箱最多 5 次、同一 IP 最多 20 次；超限返回 `429 MAIL_RATE_LIMITED`。两种 429 均带剩余等待秒数的 `Retry-After`。IP 默认取连接地址，仅 `QSL_TRUST_PROXY=true` 且 `X-Real-IP` 为有效 IP 时采用该头。
- `409 EMAIL_TAKEN`（`fields.email`）：邮箱已注册。发送前先校验邮箱并检查邮件服务是否配置；未配置邮件服务时会先返回下述 503。
- `503 MAIL_UNAVAILABLE`：邮件服务未配置、投递调用失败，或发送后未能激活对应验证码。不会伪报发送成功，也不会向客户端暴露邮件 SDK 错误或凭据。
- 通过邮箱冲突及限流检查后，先占用配额并建立 `pending` 记录，再投递邮件；只有投递调用成功且记录仍匹配本次请求才变为 `ready`。新记录覆盖该邮箱旧码（旧码立即失效）；投递失败会变为 `failed`，**不退还配额或 60 秒冷却**。尚在发送中的码、失败码都不能注册。未配置邮件服务时不占用配额。

### POST /api/auth/register

body：`{ username, email, emailCode, password, displayName?, callSign?, acceptTerms: true, termsVersion: "2026-10-25" }`。
- username 3-20 位字母/数字/下划线且唯一（大小写不敏感）；email 合法、≤120、唯一，去除首尾空白并转小写；password 8-200 个字符且包含字母与数字。
- displayName 默认 username，1-30 个字符；callSign 选填，去除首尾空白、≤20 个字符，默认空字符串。服务端不强制呼号格式或大写；注册页会将输入转大写。
- `emailCode` 必须为该邮箱最近一次可用验证码的 6 位数字**字符串**；数字类型、缺失、格式错误、错码、过期、发送未完成、投递失败、已消费或尝试次数用尽均返回 `400 EMAIL_CODE_INVALID`：
  ```json
  { "error": { "code": "EMAIL_CODE_INVALID", "message": "邮箱验证码无效、已过期或尝试次数已用尽", "fields": { "emailCode": "请重新获取或检查验证码" } } }
  ```
- 每个 `ready` 且未过期的码最多校验 5 次（正确的一次也计数）；成功即消费并清除验证码哈希，第 5 次错误后失效。注册信息校验、法律同意及用户名/邮箱冲突检查均先于验码；这些前置检查失败不消耗验码次数。验证码错误以正常的 400 结果返回，使尝试次数更新可以提交。
- 法律同意仍为必需：主动提交 `acceptTerms: true` 和 `termsVersion: "2026-10-25"`，表示同意用户条款并确认阅读隐私说明。缺失、非布尔 true 或版本不符返回 `400 VALIDATION`，字段为 `legalConsent`。服务器记录版本和确认时间，不从客户端接受确认时间。
- 201 → `{ token, user: UserSelf }`；创建账号并建立登录会话。
- 409 `USERNAME_TAKEN` / `EMAIL_TAKEN`；400 `VALIDATION`（fields 标注字段）；生产还受 §1 的注册限流约束。

前端通过 `QSL.api.auth.sendEmailCode(email)` 发送，通过 `QSL.api.auth.register(payload)` 提交验证码和法律同意。邮箱格式正确只表示本地格式校验通过，不代表已验证邮箱；验证码仍由服务端校验。当前注册页发送成功或收到 429 后显示 60 秒倒计时，不读取响应头中可能更长的 `Retry-After`，实际可重试时间以服务端限制为准。

### POST /api/auth/login
body: `{ identifier, password }`（identifier = 用户名或邮箱，大小写不敏感）
- 200 → `{ token, user: UserSelf }`
- 401 `INVALID_CREDENTIALS`；403 `BANNED`（被禁用）；生产限流见 §1。

### POST /api/auth/logout  🔒
删除当前 token。→ `{ ok: true }`

### GET /api/auth/me  🔒
→ `{ user: UserSelf }`；401 表示 token 无效/过期。

## 3. 当前用户
### GET /api/me/overview  🔒
后台欢迎页数据：
```json
{
  "user": UserSelf,
  "canJudgeContest": false,
  "stats": { "cards": 3, "approvedCards": 2, "pendingCards": 1, "likesReceived": 24, "incomingPending": 2, "outgoingPending": 1, "completedExchanges": 4 },
  "recentIncoming": [ExchangeItem × ≤3],
  "recentCards": [CardPublic × ≤3]
}
```
`canJudgeContest` 仅对当前赛事指定且正常可用的普通用户评委为 true，用于显示个人中心入口；不代替评审接口的实时鉴权。

### PUT /api/me/profile  🔒
body: `{ displayName?, callSign?, bio?, avatarColor?, address? }`（address 整体替换；字段校验同 Address）
→ `{ user: UserSelf }`
### PUT /api/me/password  🔒
body: `{ currentPassword, newPassword }` → `{ ok: true }`；错误 400 `VALIDATION` / 401 `INVALID_CREDENTIALS`。
### GET /api/me/cards  🔒
→ `{ items: CardPublic[] }`（含 pending/rejected，按更新时间倒序；带 `shareToken`、`rejectReason`）
### GET /api/me/exchanges  🔒
可选 `?box=incoming|outgoing|all`（默认 all）、`?status=pending` 等。
→ `{ items: ExchangeItem[], counts: { incomingPending: 2, outgoingPending: 1, total: 5 } }`（按创建时间倒序，地址可见性同上）

## 4. 卡片
### GET /api/cards
公共卡片广场。query：`callSign`（**v3 起推荐**，也接受 `callsign` 别名：按呼号搜索，大小写不敏感 contains，匹配卡片 callSign 或持有者 callSign）、`sort`（`latest` 默认 / `popular` / `oldest`）、`page`、`limit`。前端只使用 `callSign` 搜索，不再填写或筛选波段/模式。
兼容参数仍实际生效：`q` 对标题、卡片呼号、持有者昵称/用户名进行大小写不敏感 contains；`band`、`mode` 按大小写不敏感的完整值筛选。多个筛选条件同时提供时需全部满足。
→ 分页列表（CardPublic，只含 approved 且 owner 未被禁用）。
### GET /api/cards/:id
→ `{ card: CardDetail, owner: UserPublic }`。
- 未登录可看 approved 卡片；pending/rejected 仅 owner/admin 可看（否则 404）。
### GET /api/public/cards/:shareToken
分享页专用（无需登录）。→ `{ card: CardDetail, owner: UserPublic }`（卡片必须 approved；否则 404）。
### POST /api/cards  🔒

另须提交 `acceptTerms: true`、`termsVersion: "2026-10-25"`、`acceptContentLicense: true`，确认本次卡片内容授权。服务器保存版本、时间及确认账号；缺失或不匹配返回 `400 VALIDATION`（`legalConsent`），且不写入图片。
body: `{ title, callSign?, band?, mode?, notes?, stock?, ratio: {w,h}, frontImage, backImage? }`
- `stock` 为公开的剩余库存：0–2147483647 的 JSON 整数或 null，省略创建时默认 null（未设置，不限制换卡）。字符串、负数、小数等返回 400 `VALIDATION`，错误字段为 `stock`。`CardPublic` / `CardDetail` 均返回此字段。库存 0 的卡片仍公开展示、可点赞和分享，但详情 `canApply: false`。
- `callSign` 选填，去除首尾空白、≤20 个字符；服务端不强制格式或大写。
- `band` / `mode` 为兼容字段，v3 起可省略或传空字符串；仍接受、保存并返回 ≤20 个字符的值，但前端不再填写或展示为筛选项。
- 正面图片必需；背面可省略或为空，返回空字符串，由前端显示占位背面。
- 创建后 `status: "pending"`（等待人工审核），同时生成 `shareToken`。
- 若配置 `QSL_REVIEW_WEBHOOK_URL`，事务提交后向指定 HTTP(S) 接收项目发送一次待审核文本提醒，兼容企业微信 Webhook；包含标题、呼号、提交者昵称和卡片 ID，以及基于 `QSL_PUBLIC_ORIGIN` 的管理员审核入口（配置站点地址时）。不含邮箱、地址、图片、备注或分享 token；发送不占用数据库写事务，最多等待 5 秒，失败不撤销提交，当前无持久化重试。未配置时不发送；URL 和密钥不通过 API 返回。
- 201 → `{ card: CardPublic }`（含 status= pending、shareToken）
- 发送 JSON `{"msgtype":"text","text":{"content":"审核消息"}}`，无 @ 列表；接收项目管理 @ 人员并负责转发。接收成功必须在 5 秒内返回 HTTP 2xx 和 JSON `{"errcode":0}`。QSLink 不再读取 `QSL_REVIEW_WEBHOOK_AT_LIST`，用户输入中的 `<@userid>` 不作为 @ 语法发送。
### PUT /api/cards/:id  🔒

所有者编辑时须再次提交上述三个确认字段，服务器更新该卡片的授权记录。管理员编辑他人的卡片不替代所有者授权，不修改已有确认记录。旧账号和卡片无确认记录时保持 NULL，不推定已经授权；授权记录不包含在公开 API 响应中。
owner 或 admin。body 同上（字段可选）。普通 owner 修改后 `status` 重置为 `pending`（admin 修改不重置，除非显式传 status）。

普通用户每次成功编辑后重新发送待审核提醒（即使原状态已是 pending）；管理员仅在非 pending → pending 时发送。与创建卡片使用同一 Webhook 配置及失败语义；审核通过、拒绝、删除、请求失败或事务回滚不发送待审核提醒。`PUT /api/admin/cards/:id` 同样遵守管理员触发规则。

管理员将非 approved 卡片更新为 approved 时，事务提交后向卡片主人注册邮箱发送“卡片审核已通过”邮件；`PUT /api/admin/cards/:id` 同样适用。邮件含标题和 `${QSL_PUBLIC_ORIGIN}/card/:id`，不含备注、地址或拒绝原因。复用现有 Direct Mail 配置，未配置邮件/站点地址、主人缺少邮箱或被禁用时跳过；发送不占用写事务，失败不影响审核结果，当前无持久化重试。重复设置 approved、编辑已 approved 卡片、拒绝、未授权请求及事务回滚不发送；重新送审后再次通过可以再次发送。
→ `{ card: CardPublic }`
### PUT /api/cards/:id/stock 🔒 (仅卡片 owner)
body：`{ stock: number | null }`，必传；校验同创建。独立设置新的剩余库存（绝对值），无需再次确认内容授权，不改变审核状态、拒绝原因及内容授权记录，不触发审核通知。返回 `{ card: CardPublic }`（含 shareToken、rejectReason）。管理员不能通过此接口修改他人库存；原有卡片编辑接口仍按 owner/admin 权限处理 stock，普通 owner 使用内容编辑接口依旧需要授权确认并重新审核。仅修改内容时应省略 stock，避免用过期库存覆盖自动扣减。

### DELETE /api/cards/:id  🔒
owner 或 admin。级联删除其点赞与换卡申请。→ `{ ok: true }`
### POST /api/cards/:id/like  🔒
切换点赞。→ `{ liked: true, likeCount: 19 }`
### GET /api/cards/:id/share  🔒 (owner/admin)
→ `{ shareToken, url: "https://qsl.example.com/s/AbCdEf" }`。`shareToken` 为六位大小写敏感的英文字母，由密码学安全、无偏随机数生成并碰撞重试。所有新响应中的 `shareToken` 使用新短 token；数据库原 `cards.shareToken` 保留历史映射，新增 `shortToken`，历史 `/share/:token` 和公开数据接口仍解析原卡。两类 token 不允许跨卡冲突。公开分享数据仅对审核通过且持有者未封禁的卡片开放，删除后返回 404。
优先以 `QSL_PUBLIC_ORIGIN` 为 URL 的站点地址；生产必须配置该值且使用 HTTPS。不配置时（仅非生产）以请求协议与 Host 拼接：协议优先取 `X-Forwarded-Proto` 的首项，否则根据连接是否加密选择 https/http。取得分享链接不代表卡片已公开；未通过审核时分享页数据接口仍返回 404。

## 5. 换卡申请
### POST /api/cards/:cardId/exchanges  🔒
body: `{ message?, contactName, address: Address, contactLogIds?: string[] }`
- 不能申请自己的卡片；卡片须 approved 且 owner 未被禁用。
- 库存为 0 时返回 409 `OUT_OF_STOCK`；申请 pending 时不预占或扣减库存。
- 同一用户对同一卡片存在 `pending`/`approved` 的活动申请时 → 409 `CONFLICT`（message："你已申请过这张卡片，请等待对方处理"）。
- 201 → `{ exchange: ExchangeItem }`（允许被拒绝/取消后重新申请）
- 新申请事务提交后，使用现有阿里云 Direct Mail 服务向卡片主人的注册邮箱发送一次提醒；等待本次投递调用完成后返回 201，网络发送不占用数据库事务锁。邮件含申请人昵称/呼号、卡片标题及 `${QSL_PUBLIC_ORIGIN}/dashboard/exchanges?box=incoming&status=pending`，用户需登录后查看；不含联系姓名、寄送地址或申请留言。
- 仅创建成功才触发；未登录、申请自己/未审核卡片、主人禁用、重复活动申请或事务失败均不发送。取消/拒绝后重新创建成功属于新申请，可再次提醒。
- 未配置邮件服务、卡片主人无邮箱或未配置 `QSL_PUBLIC_ORIGIN` 时跳过提醒，不从请求 Host 构造邮件链接。邮件服务失败仍返回原来的 201 并保留申请，仅记录无收件人/凭据的通用失败日志；不自动重试、不向申请人泄露主人邮箱或邮件服务错误。提醒为提交后尽力发送一次，无持久化投递队列；进程中断可能漏发，邮件服务接受投递不代表已进入收件箱。接口响应结构不变。
### GET /api/exchanges/:id  🔒
参与者或 admin → `{ exchange: ExchangeItem }`（地址可见性同上）
### GET /api/exchanges/:id/applicant-cards 🔒 (仅该待处理申请的接收人)
query：`page`、`limit`。返回分页列表 `{ items: CardPublic[], total, page, limit, pages, hasUploadedCards }`，按创建时间倒序、ID 倒序稳定排列；仅含申请者已审核公开且账号未被禁用的卡片。`hasUploadedCards` 表示当前是否存在任何上传卡片，包含待审核及被拒绝卡片。

`ExchangeItem` 增加 `preferredCardId`、`preferredCardTitle`、`preferredCard`（卡片简要信息）。无偏好时均为 null；已选择卡片删除后 ID 为 null，标题快照保留；卡片变为非公开或账号被禁用后 `preferredCard` 为 null。选择仅记录希望收到的卡片，不自动创建反向申请。
### POST /api/exchanges/:id/approve  🔒 (仅卡片 owner)
- body：`{ preferredCardId?: string | null, confirmNoCards?: boolean }`。省略或 null 表示“无所谓”；指定卡片必须属于申请人、已审核公开且用户未被禁用，否则 400 `VALIDATION`（`fields.preferredCardId`）。
- 申请人当前没有任何上传卡片时，须明确传 `confirmNoCards: true`，否则 409 `APPLICANT_HAS_NO_CARDS`，提示“该申请者没有上传卡片哦，请确认是否进行交换”。有上传但暂无公开卡片时可选择“无所谓”。
- 仅 pending 可操作；每笔申请独立审批，同意后不改变同一卡片的其他申请。同一卡片可同时与多个不同用户处于 `approved` 状态，也允许其他用户继续提交申请。
- 同意时若目标卡片库存已设置，原子扣减 1 张；库存为 0 返回 409 `OUT_OF_STOCK`，申请保持 pending。扣减、申请状态和手动库存调整使用同一数据库写事务锁，防止并发超卖或重复审批扣减。null 库存不扣减。完成、拒绝、撤回不再扣减；既有 approved/completed 申请不追溯扣减。“希望收到的卡片”只是偏好，不扣减申请人库存。
- 同一用户对同一卡片仍只能有一笔 `pending`/`approved` 活动申请；各笔交换独立完成，地址仅对该笔交换的双方及管理员可见。
- → `{ exchange: ExchangeItem }`（包含双方地址）
- 成功将 `pending` 更新为 `approved` 并提交后，向申请人的注册邮箱发送“换卡申请已被同意”提醒，链接为 `${QSL_PUBLIC_ORIGIN}/dashboard/exchanges?box=outgoing&status=approved`，登录后查看寄送信息；邮件不含地址。
### POST /api/exchanges/:id/reject  🔒 (仅卡片 owner)
body: `{ reason? }` → `{ exchange }`
- 成功将 `pending` 更新为 `rejected` 并提交后，向申请人的注册邮箱发送“换卡申请已被拒绝”提醒，链接为 `${QSL_PUBLIC_ORIGIN}/dashboard/exchanges?box=outgoing&status=rejected`；拒绝原因仅在站内查看，不放入邮件。
- 两种处理结果的邮件均包含卡片主人昵称/呼号与卡片标题，不包含申请留言、联系姓名或地址。仅成功的状态变更触发一次；未登录、无权处理、校验失败、重复/并发审批的失败请求、事务回滚均不触发。申请人已禁用或缺少邮箱时跳过。邮件配置、可信链接来源、提交后发送、不自动重试及投递失败不撤销状态的规则同创建申请；失败仍返回 200，不泄露申请人的邮箱或邮件服务细节。
### POST /api/exchanges/:id/cancel  🔒 (仅申请人)
仅 pending → `{ exchange }`（status=cancelled）
### POST /api/exchanges/:id/complete  🔒 (参与者双方)
仅 approved → status=completed → `{ exchange }`

## 6. 管理后台 🔒👑
### GET /api/admin/stats
```json
{
  "users": { "total": 9, "active": 8, "banned": 1, "newThisWeek": 5 },
  "cards": { "total": 12, "pending": 2, "approved": 9, "rejected": 1 },
  "exchanges": { "total": 7, "pending": 3, "approved": 2, "completed": 1, "rejected": 1 },
  "likes": 88,
  "recentUsers": [UserPublic × 5],
  "pendingCards": [CardPublic × 10] ,
  "recentExchanges": [ExchangeItem × 5]
}
```
### GET /api/admin/users
query：`q`、`status`（active/banned）、`role`、`page`、`limit`。
→ 分页列表（UserPublic + email/status/createdAt/cardCount/exchangeCount）
### PUT /api/admin/users/:id
body 可选：`{ displayName, callSign, bio, email, role, status, avatarColor, address, newPassword }`
- 不能修改自己的 role/status；不能把最后一个 admin 降级/禁用；404 不存在。
→ `{ user: UserAdmin }`
### DELETE /api/admin/users/:id
- 不能删除自己、不能删除最后一个 admin。级联删除其卡片、申请、点赞、session。→ `{ ok: true }`
### GET /api/admin/cards
query：`status`（all/pending/approved/rejected）、`q`、`page`、`limit`。→ 分页列表（CardPublic + `owner.status`、`shareToken`、`rejectReason`）
### PUT /api/admin/cards/:id
body 可选：`{ title, callSign, band, mode, notes, ratio, frontImage, backImage, status, rejectReason }`（band/mode 兼容字段，可省略）
- `status` 可为 approved/rejected/pending；设为 approved 时清空 rejectReason。
- 非 approved → approved 时提交后向卡片主人发送通过邮件，触发及失败语义同 `PUT /api/cards/:id`。
→ `{ card }`
### DELETE /api/admin/cards/:id → `{ ok: true }`
### GET /api/admin/exchanges
query：`status`、`page`、`limit`。→ 分页列表（ExchangeItem，含双方地址与卡片、用户信息，`direction` 固定为 `admin`）

## 公告

公告对象 `Announcement` 包含 `id`、`eventKey`、`title`、`body`、`status`、`displaySeconds`、`publishedAt`、`createdAt`、`updatedAt`。`eventKey: null` 为全站公告，`qsl-design-2026-11` 为本届比赛动态，创建后不可改变所属范围。`displaySeconds` 为浮层停留秒数，整数 1–3600，默认 30。标题和正文均为纯文本；去除首尾空白后分别为 1–120 和 1–10000 个 Unicode 字符，不允许 NUL。状态仅为 `draft`（草稿 / 已撤下）或 `published`（已发布）。时间由服务端生成，为 UTC ISO 字符串，未发布过的草稿 `publishedAt: null`。客户端提交的 ID、时间及其它未知字段不参与写入。

### GET /api/announcements

无需登录，仅返回 `published` 公告；即使提供 `status=all/draft` 也不能读取草稿。支持通用 `page` / `limit` 分页，返回 `{ items: Announcement[], total, page, limit, pages }`，按 `publishedAt` 倒序、同时间按 ID 倒序。`reminder=1` 时，仅对当前登录用户过滤已选择“不再提醒”的公告，再分页；游客仍返回全部已发布公告。普通列表不受该偏好影响。

### GET /api/admin/announcements

仅管理员；未登录为 `401 UNAUTHORIZED`，普通用户为 `403 FORBIDDEN`（以下写接口相同）。支持通用分页及 `status=all|draft|published`，默认及无效值回退 `all`。返回同上，按 `updatedAt` 倒序、同时间按 ID 倒序。

### POST /api/admin/announcements

仅管理员。body：`{ title, body, status?, displaySeconds? }`，状态缺省为 `draft`；直接创建 `published` 时设置发布时间。成功 `201 → { announcement: Announcement }`。非法请求体、空白 / 超长文本或非法状态返回 `400 VALIDATION`，字段错误包含 `fields`。

### PUT /api/admin/announcements/:id

仅管理员。body：`{ title?, body?, status?, displaySeconds? }`，未提交的字段保持原值，成功 `200 → { announcement: Announcement }`；不存在为 `404 NOT_FOUND`，校验错误同创建接口。每次更新刷新 `updatedAt`，`createdAt` 不变。从 `draft` 切换为 `published` 时设置新的 `publishedAt`；编辑已发布内容或再次提交 `published` 不改变发布时间。撤下即设为 `draft`，立即从公共列表排除但保留历史发布时间；再次发布重设发布时间并按新时间排序。不提供删除、定时发布或独立的公告详情端点。

### POST /api/announcements/:id/dismiss

需要登录。以服务端当前用户身份保存此公告的“不再提醒”偏好；无需请求体，忽略客户端传入的用户 ID。成功 `200 → { dismissed: true }`，重复提交幂等；游客 `401`，禁用用户 `403`，不存在或未发布公告 `404`。偏好保存在数据库，跨设备、重新登录以及此公告编辑 / 撤下再发布后仍生效；新建公告使用新 ID，独立提醒。不会从公告板隐藏公告，也不返回其他用户的偏好。

## 第一届QSLink杯QSL卡片设计大赛

本届 `eventKey` 固定为 `qsl-design-2026-11`，其他赛事键返回 404。公开页面为 `/events/qsl-design-2026-11`（另有 `/events/qsl-design-2026-11/alternate` 展示版本），独立作品详情路由为 `/events/qsl-design-2026-11/works/:id`（`:id` 为作品 ID，不是卡片 ID 或展示编号）。本轮提供赛事动态、逐作品报名、报名审核、公开参赛作品、投票及独立人工评审。人工评分使用本届 5 位普通账号评委的独立权限，截止后仅管理员可查看汇总或导出，详见下文。AI 仍由举办方手动调用，后台仅导出固定版本的图文材料与空白模板；不提供 AI 调用或结果导入、投票折分、最终总分／排名、获奖计算、永久铭牌管理或证照上传接口。奖品及前三名永久铭牌权益仍仅作展示说明。作品列表只读展示票数，不提供快捷投票；投票在作品详情发起。已公布的报名截止日期为 2026-12-20，颁奖日期为 2026-12-25；其他未明确的赛程和领奖安排仍标注待公布。

页面公布的总分为 **100 分 = 机器 30 分 + 人工 50 分 + 投票 20 分**：

- 机器评分：3 个 AI 各打 0–10 分，允许 0.5 分档，三者相加，满分 30 分。
- 人工评分：5 位评委各打 0–10 分，去掉一个最高分和一个最低分，余下 3 位评委的评分取平均再乘 5，满分 50 分。
- 投票评分：作品前 5 张有效票每票 2 分，最多 10 分；再按有效得票排名平均划为 10 段，从高到低分别得 10、9、8、7、6、5、4、3、2、1 分，同票同段同分；两部分合计最多 20 分。这是规则说明，不改变原有投票资格、限额、计票接口或作品列表排序。
- 同总分先比较人工评分；人工评分仍相同，由举办方决定。页面算例 `25.5 + 35 + 14 = 74.5` 仅为规则演示，不代表真实作品评分或排名。

实物奖品共十名，冠军起步奖为森海克斯 8650；当前审核通过报名人数达到 100 时升级为拓竹 A1 mini / 威诺 VR-N76 二选一，不叠加起步奖。页面展示其余奖品的具体型号、奖状和前三名永久铭牌权益；这些展示不表示已有发奖或铭牌功能。前五名领奖时人工核验操作证号、执照号与呼号一致，报名阶段不收集这些材料。

投票按账号而非呼号计限额：正常可用（active）账号即可投票，无需拥有广场卡片或报名参赛；每账号全赛期累计最多 5 票，可投给五个不同作品，无每日限制，每作品最多投 1 票，投出不可撤回，允许自投。另以随机浏览器标识限制跨账号合计五票，限制来源 IP 高频请求。时间窗口与账号、资格、目标作品状态及票数限制均由服务端校验，不能仅依赖前端禁用按钮。票数不直接代表最终得分或获奖结果。

迁移 `014_qsl_design_contest.sql` 新增报名表与公告范围字段，原有公告保留为全站公告。迁移 `015_contest_entry_cards.sql` 将单卡引用 `cardId` 改为最多 3 张卡片的 `cardIds` 数组（升级时把原引用转换为单元素数组并删除旧列）；旧版程序无法读取升级后的报名表，回滚须另行评估数据兼容性，不能以镜像回退代替数据库恢复。

迁移 `016_contest_works.sql` 新增独立 `contestWorks`，按旧报名 `createdAt`、ID、原选卡顺序分配编号，将总说明复制到每张作品，首次时间沿用报名创建时间（无法恢复历史逐卡加选时间）。删除报名级 `cardIds/description` 列，以作品为唯一来源。新编号在现有写事务锁内按含停用与墓碑的最大编号加一分配，赛事内编号与卡片关联均有唯一约束；SQL 删除与应用删除均清除关联说明并留墓碑。发布前须备份数据库，恢复旧镜像不构成数据回滚。

迁移 `018_contest_voting_limits.sql` 将投票槽位扩大为 1–5，移除每日唯一约束，保留同账号同作品唯一约束及全部历史票、审计日期和 HMAC 密钥；历史票继续计入总额度。升级后不能直接运行旧版程序，恢复旧镜像不等于回滚数据库。

### GET /api/contests/:eventKey

匿名可读取赛事定义及实时统计，返回 `{ contest: { key, title, approvedRegistrationCount }, voting }`。`approvedRegistrationCount` 为本赛事 `status === 'approved'` 的报名人数，初始为 `0`；每赛事每用户仅一份报名，多张参赛卡片仍计为一人。`pending`、`rejected` 不计入，通过后幂等保存不增加计数；修改或删卡使报名回到待审核时立即扣减，删除用户清理报名后也不再计入。公开赛事对象不返回用户信息、参赛者名单、联系邮箱或审核备注。`voting` 按当前请求身份返回，不包含其他投票人的信息。

#### 公共投票状态 `voting`

`GET /api/contests/:eventKey`、作品详情及投票成功响应使用同一结构：

```js
{
  startsAt, endsAt, // 含时区的 ISO 时间；未配置时为 null
  isOpen,          // 服务端当前时间满足 startsAt <= now < endsAt
  eligible,        // 当前账号正常可用（active），不要求拥有广场卡片
  votesUsed,       // 当前账号在本赛事已投票数，0–5
  votedWorkIds     // 当前账号在本赛事已投过的作品 ID 数组
}
```

游客的 `eligible` 为 `false`，`votesUsed` 为 `0`，`votedWorkIds` 为 `[]`；仍可读取投票时段和开放状态。`eligible` 不代表时段已开放或仍有剩余票数，客户端需结合各字段展示状态。无每日投票限制，不返回 `votedToday`。

### GET /api/contests/:eventKey/entry 🔒

仅读取当前用户自己的报名，返回 `{ entry }`，未报名为 `{ entry: null }`。报名包含 `id`、`eventKey`、`userId`、`cardIds`、`cards`、`works`、`contactEmail`、`status`、`reviewReason`、`reviewedBy`、`reviewedAt`、`revision`、`createdAt`、`updatedAt`；`cardIds` 为当前关联的卡片 ID 数组（新提交最多 2 件，历史记录可能超过 2 件），`cards` 为对应的卡片展示信息（卡片被删除后从数组中移除）。`works` 为 `[{ id, cardId, number, description, submittedAt, card }]`，按首次提交时间、编号正序；`cardIds/cards` 从当前作品派生，总 `description` 不再返回，审核相关字段保持不变。每届每卡编号固定，移除后重加恢复原编号及 `submittedAt`；`number` 为整数，客户端可补零显示。联系邮箱仅本人及管理员可见，不修改账号邮箱，不在报名时收集领奖证照。

### PUT /api/contests/:eventKey/entry 🔒

body：`{ works: [{ cardId, description }], contactEmail, expectedRevision? }`，`works` 必须包含 1–2 张不重复的卡片，每张作品的 `description` 必填，去除首尾空白后为 1–2000 个 Unicode 字符，禁止 NUL。不再接收报名总说明或以 `cardIds` 选择作品。首次可省略 `expectedRevision`，更新已有报名必须携带当前版本。服务端逐张检查所选卡片属于当前用户且已通过广场审核，客户端不能指定报名用户、审核状态或审核人。

- 每账号本届仅保留一份报名，数据库唯一约束保护并发请求；待审核、驳回、通过后修改均更新原记录。历史超额作品不自动删除，读取仍完整返回；再次提交须由用户明确调整至最多 2 件，不能由客户端静默截断。
- 有效修改递增 `revision`、转为 `pending` 并清空旧审核信息；没有实际变化的重复保存不撤销审核结果。
- 旧版本更新返回 `409`，需重新读取再提交；非法字段为 `400`，未登录为 `401`。
- 修改作品选择、逐作品说明或联系邮箱，整份报名重新待审核；任一当前作品卡片内容变化或失去广场通过状态时同样重新待审核，仅库存变化不影响赛事审核。删卡清除作品的卡片/报名关联及说明并保留编号墓碑，报名保留；删除用户清理报名及所有作品个人内容，编号不回收。
- 成功返回 `{ entry }`，首次创建为 `201`，更新为 `200`。作品说明为 1–2000 个字符，联系邮箱为有效邮箱且最多 120 个字符。报名提交后，广场审核通过且账号正常的当前作品图片立即可公开和接受投票；作品说明待审核或被驳回时均不公开。说明修改重新待审核，但图片与既有票数保留。投票仍受赛期和既有限额约束。

### GET /api/contests/:eventKey/works

匿名可读取，支持 `q`、`page`、`limit`（通用分页规则），返回 `{ items: [{ id, number, description, submittedAt, card, voteCount }], page, pages, total, limit }`。`id` 为独立作品 ID，供作品详情与投票使用；`voteCount` 为该作品已获票数（非负整数，无票为 0）。`card` 使用现有 `CardPublic` 序列化，含作者公开摘要、双面图片及比例等展示字段，兼容卡片网格。只公开当前参与、卡片 approved 且卡片仍属于报名人、报名人账号 active 的作品；报名说明的 pending／rejected 不阻止图片展示和投票。`description` 仅在整份报名 approved 时返回审核通过的原文，其他状态返回空字符串，未审核原文不通过列表、详情或投票响应公开；不返回报名对象、联系邮箱、审核原因、审核人或投票人。按 `submittedAt`、`number` 正序，先筛选再分页，不按票数排序。`q` 去除首尾空白后按卡片呼号大小写不敏感包含匹配；纯数字还精确匹配作品编号（`001` 与 `1` 均匹配编号 1），与呼号匹配取并集。

### GET /api/contests/:eventKey/works/:id

匿名可读取，返回 `{ work: { id, number, description, submittedAt, card, voteCount }, voting }`，作品结构与列表项一致。按作品 ID 查询并执行与公开列表相同的可见性规则，已移除、卡片不可公开、所有权不符或账号不可用的作品返回 404，不通过详情泄露隐藏内容。

### POST /api/contests/:eventKey/works/:id/vote 🔒

body：`{ fingerprint }`，`fingerprint` 为浏览器本地持久化的随机投票标识字符串（非空，最多 8192 字符），服务端仅存 HMAC 摘要；成功 `200 → { work, voting }`，返回最新作品票数与当前账号投票状态。此端点只追加一票，不提供撤回或改投。允许投给自己的作品，但仍须满足相同资格和限额。

未登录为 `401`，账号不可用为 `403`；作品不存在或不可公开为 `404`；请求字段无效为 `400`。不在投票时段、同一作品已投或赛事 5 票已用完为 `409`，分别使用 `VOTING_CLOSED`、`WORK_ALREADY_VOTED`、`TOTAL_VOTE_LIMIT`。服务端在事务内校验并以数据库约束保护并发，不因重复请求多记票。公开响应不返回标识摘要或其他投票人信息；同一浏览器标识跨账号本赛事合计最多五票，超出返回 `409 BROWSER_VOTE_LIMIT`；空标识返回 `400`。按来源 IP 每 15 分钟最多 30 次投票请求，超出返回 `429 RATE_LIMITED` 和 `Retry-After`（进程内限流，多实例不共享请求频率；浏览器额度由数据库写事务串行保证）。来源 IP 沿用受信代理解析。规则及详情页展示反刷票说明，隐私政策说明随机标识用途与保留。浏览器额度是基础防护，清除存储、更换浏览器或伪造标识可绕过，不等于唯一自然人验证。

### GET /api/admin/contests/:eventKey/entries 🔒👑

支持 `status=all|pending|approved|rejected`、`page`、`limit`，返回通用分页结构 `{ items, total, page, limit, pages }`。列表包含作品说明审核所需字段及参赛者简要信息，不通过公开接口暴露。

### GET /api/admin/contests/:eventKey/entries/:id 🔒👑

返回 `{ entry }`，供管理员核对当前卡片双面图片、作品说明、联系邮箱及版本。

### PUT /api/admin/contests/:eventKey/entries/:id/review 🔒👑

body：`{ status: "approved" | "rejected", reviewReason?, expectedRevision }`。驳回必须填写 1–200 个字符的原因；旧版本返回 `409 REVISION_CONFLICT`。实质审核变化递增 `revision`，相同结果与原因的重复审核保持幂等。通过时再次检查所有关联卡片存在、属于报名人、广场状态为 approved，且报名用户可用；没有可用卡片不能通过。审核只控制作品说明的公开以及完整评审材料的准入，不代替或改变广场图片审核。pending／rejected 时图片仍可展示与投票，description 为空；approved 后公开说明并允许完整材料进入人工评审。已获得的票数不因说明状态变化而清除。返回 `{ entry }`。

### GET /api/admin/contests/:eventKey/voting 🔒👑

仅管理员，返回 `{ voting }`。包含投票起止时间和公共投票状态字段，并包含当前配置 `revision`，用于后续更新的并发校验；未配置时起止时间为 `null`、`revision` 为 `0`。

### PUT /api/admin/contests/:eventKey/voting 🔒👑

仅管理员，body：`{ startsAt, endsAt, expectedRevision }`。起止时间须为含时区的 ISO 时间，结束须晚于开始；后台以北京时间输入展示，提交前转换为带明确时区的时间，不把浏览器当地时间直接当北京时间。`expectedRevision` 必须为最近读取的配置版本（首次配置为 `0`）；版本过期返回 `409 REVISION_CONFLICT`，非法字段返回 `400`。成功返回 `{ voting }`（含最新 `revision`），不得以旧页面静默覆盖其他管理员更新。未登录为 `401`，非管理员为 `403`；公开读取或投票接口不能修改投票时段。

### GET /api/admin/contests/:eventKey/votes.xlsx 🔒👑

仅管理员，返回真实 XLSX 工作簿二进制，不以 CSV/HTML 改后缀冒充；`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`，`Content-Disposition` 为附件。包含两个工作表：**作品汇总**（作品 ID、固定编号、当前公开/隐藏及报名状态、作者公开资料、提交时间、累计票数）及 **逐票明细**（票 ID、作品 ID/编号、投票账号资料或注销脱敏标记、投票日期与时间，以及仍在保留期内的诊断摘要）。北京时间投票日期与 UTC 时间分别标明时区，保留期已到的摘要不得导出；不导出原始诊断材料。隐藏或删除作品的历史票据仍供计票核对，注销不清空累计票数，相关账号资料须脱敏。未登录为 `401`，非管理员为 `403`，不能仅靠隐藏导出按钮保护。管理操作应记录操作者、赛事及时间的审计信息，不记录原始诊断材料。

### 独立人工评审接口 🔒

本届人工评审不依赖全局新角色。管理员指定恰好 5 个不同的 active 普通账号（`role=user`），评委使用本人会话；管理员不因角色获得评委权限。配置、开始、保存、提交均有版本校验，截止使用服务端实际时间，前端以北京时间显示。开始后可按版本调整名单和未来截止时间；截止前读取评委工作台、管理员评审配置或材料包时，自动补入新审核通过且满足公开条件的参赛作品，已有材料和评分保留。

所有评审 JSON、图片和导出文件均为私有、`no-store`，图片路径不包含 token。无会话 401，无权限 403，未知材料／赛事 404；版本冲突、未开始写入、已截止写入分别返回 409 `REVISION_CONFLICT`／`JUDGING_NOT_STARTED`／`JUDGING_CLOSED`；完成标记不限制截止前继续修改。客户端不能通过 `userId`、`judgeId` 或作品参数读取／修改另一评委的评分。

#### GET /api/admin/contests/:eventKey/judging 👑

返回 `{ judging }`：`revision`、`deadline`、`frozenAt`、`materialVersion`、`totalWorks`、`judges` 和 `canViewResults`。`totalWorks` 是当前已冻结作品数量，准备期为 0。开始后截止前读取本接口会补入新增可参赛作品。名单项目包括 `slot`（1–5）、`userId`、`username`、`uid`、`displayName`、`scoredCount`、`submittedAt`。截止前只返回进度，不包含分数、评语、人工项或隐藏结果。名单中的账号信息不通过公开接口或其他评委接口返回。

#### PUT /api/admin/contests/:eventKey/judging 👑

body：`{ expectedRevision, deadline, judgeUserIds: [五个用户ID] }`，截止为含时区的 ISO 时间且在未来。开始前后均可配置；校验账号角色、正常状态与重复项。开始后保持材料版本及留任评委的槽位、评分和完成标记，被替换评委立即失去权限，新评委不继承旧评分。旧配置、名单与评分写入私有审计表 `contestJudgingChanges`，不通过公开或评委接口暴露。延长已截止评审将重新开放评分并暂时禁止结果与成绩导出，已下载的结果无法撤回。返回最新 `{ judging }`，版本过期拒绝覆盖。

#### POST /api/admin/contests/:eventKey/judging/start 👑

body：`{ expectedRevision }`。恰有 5 位可用评委、未来截止时间及可评审作品后才能开始。开始时只选取当前满足公开条件的审核通过作品，并固定作品编号、标题、说明、站内正反面图片和材料版本。图片处理在事务外准备，最终短写事务重新核对配置和作品快照，防止处理中改稿混入另一版；失败不发布半份材料。单次最多冻结 1000 件作品、派生图片合计最多 256 MiB，单图最多 10 MiB，输出最长边不超过 1920；超限拒绝而不静默截断。之后原卡修改或删除不自动改变冻结内容。截止前读取评委工作台、管理员评审配置或材料包会补入尚未冻结且满足相同公开条件的作品（已有部署中漏入的作品也会补入）。补入更新整体材料版本和配置 revision，保留已冻结作品、编号和各项评分，清除所有评委完成标记并递增其整表 revision。图片在独立批次目录准备，短写事务重新校验配置、作品和实际截止时间；并发刷新只发布一份，失败清理自身未发布批次。总作品和图片大小限制对累计材料生效。截止后不再补入；延长截止后重新按此规则补入。

#### GET /api/contests/:eventKey/judging

仅本届评委，截止前先检查并补入新增合格作品，再返回 `{ judging, items }`。前端每 30 秒刷新，也可手动刷新。`judging` 包含 `deadline`、`frozenAt`、`materialVersion`、`totalWorks`、`submittedAt`、`isOpen`、`slot` 及本人整表 `revision`；`items` 为 `{ id, number, title, description, frontUrl, backUrl, score }` 数组，`score` 为 `null` 或 `{ value, comment, revision }`，只含本人评分。未开始且已获授权时返回 `isOpen:false`、空 `items`；截止或提交后仍能读取本人内容。不返回其他评委名单／评分、票数、AI 分数或人工汇总。

#### PUT /api/contests/:eventKey/judging/materials/:id/score

body：`{ expectedRevision, score, comment }`。`score` 必须为 JSON 数字 0–10，最多一位小数；评语最多 1000 字。初次该项版本为 0，后续使用最新该项版本。身份只取会话；不得替别人保存。开始后且未截止即可写入，包括已标记完成之后；成功会清除本人的 `submittedAt` 完成标记。返回 `{ score: { value, comment, revision }, judging }`，个人整表 `revision` 也递增，供完成标记并发校验。

#### POST /api/contests/:eventKey/judging/submit

body：`{ expectedRevision }`，版本为本人最新整表 `judging.revision`。此接口仅设置可选的完成标记，不提前锁定评分。全部冻结作品均已保存且未截止时可确认或再次确认，更新 `submittedAt` 与整表版本，成功返回 `{ judging }`。之后仍可随时修改，保存改分会清除完成标记；仅到截止时间才统一停止写入。截止后按各项最新已保存分数汇总，未标记完成不影响有效性，缺分保持为空、不补为 0。

#### GET /api/contests/:eventKey/judging/materials/:id/front 或 /back

仅本届评委或管理员鉴权读取冻结图片；没有背面的材料返回 404。返回受保护图片二进制，不返回磁盘路径或任意原图地址。前端使用 Authorization Bearer 获取 Blob，离页回收对象 URL。

#### GET /api/admin/contests/:eventKey/judging/materials.zip 👑

管理员可在开始后下载，query `from`／`to` 按固定作品编号选择闭区间，单包最多 20 件作品，单图最多 10 MiB、材料包受 64 MiB 总量限制。按编号目录包含正面、可选背面与作品说明，附材料版本、SHA-256 清单、规则和空白 AI 评分模板；不存在的背面不伪造图片。没有评委分、评语、联系邮箱、寄送资料或投票明细，也不自动调用或发送到 AI。作品卡面可能自带个人信息，外发前需自行检查授权范围。本导出不受成绩截止限制，因为不含成绩。

#### GET /api/admin/contests/:eventKey/judging/results 👑

评审截止前返回 403（包括所有评委已提前提交时），不提前解锁。截止后返回 `{ materialVersion, deadline, judges, items }`；作品含 `id`、`number`、`title`、`scores: [{slot,score,comment,submittedAt}]`、`humanScore` 与 `complete`。该作品缺任一评委已保存评分时，人工项为 `null`／未完成；五位均有已保存评分即可去掉一个最高、一个最低，余三均分乘 5，四舍五入两位小数，不要求设置完成标记。原始评分保留，不产生最终总分、总排名或获奖名单。

#### GET /api/admin/contests/:eventKey/judging/scores.xlsx 👑

仅管理员、截止后，提前返回 403。返回真实 XLSX，包含作品汇总、五评委逐项评分／评语、提交状态及材料版本、截止与人工项计算说明。未完成项为空并明确标记，不以 0 冒充；不导出账号密码、会话或投票明细。下载携带 Bearer，不把令牌写入 URL。管理写入和导出记录操作者、赛事、动作和时间，审计日志不记录分数、评语、令牌或图片字节。

已开始且未截止期间，管理员不能通过用户管理重置固定评委密码，返回 `409 JUDGING_ACCOUNT_LOCKED`，避免经管理接口接管评委账号绕过成绩隔离；评委本人修改密码仍沿用既有流程。举办方仍须核实评委身份、避免共用账号，不能保证抵抗账号主动共享、串通或已有凭据泄露。

应用层保密不阻止数据库／服务器运维读取。冻结材料是独立留存，不随公开卡片删除自动销毁；运营方应按内容授权和撤回请求处理留存，部署备份需同时涵盖数据库与冻结文件。

### 赛事动态与全站公告隔离

上述公告列表接口默认仅返回 `eventKey: null` 的全站公告；显式传 `?eventKey=qsl-design-2026-11` 只返回比赛动态，按范围和发布状态过滤后分页。公开端不返回草稿。管理员创建公告可附加 `eventKey`，普通更新不可改变范围。

赛事动态不参加全站自动提醒，`reminder=1` 不可与赛事筛选组合（400）；对赛事动态调用 dismiss 返回404。赛事动态正文为纯文本，`displaySeconds` 不影响比赛页面中的展示时长。

## 7. 静态资源
- `/uploads/*`：上传的卡片图片，长缓存头。
- 其余 GET 非 `/api` 路径：优先返回 `public/` 下静态文件；未命中且带扩展名的 404；未命中且无扩展名的路径返回 `public/index.html`（SPA history 路由回退）。
- `/share/:token`、`/card/:id`、`/dashboard/*`、`/admin` 均回退到 index.html，由前端路由处理。

## 通联日志（登录后私有）

- `GET /api/me/logbook?page=1&q=JA1`：仅当前用户，呼号包含搜索（不区分大小写），UTC 时间倒序，每页 25 条。返回 `{items,total,page,limit,pages,stats:{total,confirmed}}`；stats 为本人全部日志统计，confirmed 为记录标记的 LoTW 确认数。
- `POST /api/me/logbook/import`：JSON 必须且只能提交一种：`{adif: "UTF-8 ADI / ADIF 文本"}` 或 `{tq8: "TQ8 二进制的标准 Base64"}`。支持未签名 `.adi/.adif` 和 TQSL 签名生成的 gzip `.tq8`，不支持 ADX XML；改扩展名的 ADI 文本不能通过 TQ8 校验。ADI / ADIF 最多 5MB，TQ8 压缩最多 5MB、解压最多 20MB；每次最多 10000 条通联，每账号最多 50000 条。格式解析使用 GABBI 声明的字节长度，支持带点号的签名字段和 `:6` 数据类型。TQ8 先完成整批校验，再写入；结构错误、未知签名版本、任一签名或记录无效均返回 400 且整批不写入。ADI / ADIF 沿用字段长度解析，结构错误整批拒绝；缺少 CALL、QSO_DATE、TIME_ON、BAND、MODE 或值无效的记录跳过，全部无效返回 400。大小超限返回 413。同时提交两种格式或均未提交时返回 400、fields.file。
- `POST /api/me/logbook/lotw`：JSON `{username,password}`，使用 LoTW 网站登录密码；服务端仅向固定的 `https://lotw.arrl.org/lotwuser/lotwreport.adi` 发起 HTTPS 请求，不跟随重定向，30 秒超时，最多下载 5MB，检查 APP_LoTW_EOF，失败不写入。凭据不保存、不返回、不记录外部错误详情。每用户每进程一分钟一次，超频 429；上游失败/密码错误/截断返回 502，不触发本站 401 会话失效。下载在写事务外进行，保存前重新检查本站登录态与禁用状态。使用 qso_query=1、qso_qsl=no、qso_qsorxsince=1900-01-01、qso_withown=yes、qso_mydetail=yes、qso_qsldetail=yes，每次全量请求。接口依据 [ARRL 官方查询说明](https://lotw.arrl.org/lotw-help/developer-query-qsos-qsls/)。

两个导入接口返回 `{added,updated,duplicates,skipped,total,issues:[{record,message}]}`，issues 最多前 10 条。去重范围为当前账号，键为本站呼号、对方呼号、UTC 日期时间（HHMM 补秒 00）、波段、模式、子模式、传播方式及卫星名。不同秒、模式/子模式视为不同记录。重复记录补充非空元数据、保留已有确认状态，来源优先级为 LoTW > TQ8 > ADIF。TQ8 仅代表文件签名已校验，不代表 LoTW 已接受或确认通联；文件中的未签名 NAME、LOTW_QSL_RCVD 等额外字段不导入。ADI / ADIF 中 LOTW_QSL_RCVD=Y 可作为文件自报确认标记，普通 QSL_RCVD 不作 LoTW 确认；直接从 LoTW 下载时使用 QSL_RCVD。已有确认不会被后续导入撤销。ADIF 自报标记不代表本站验证了 LoTW 确认。记录输出包含 id、callSign、stationCallSign、qsoAt、band、mode、submode、frequency（MHz）、rstSent、rstReceived、name、country、grid、propagation、satellite、lotwConfirmed、source，不保存原始 TQ8、用户证书或账号密码；source 可为 adif / tq8 / lotw。

导入限制：账号必须在个人资料设置非空呼号。ADI / ADIF 每条记录的本站呼号一律由服务端设置为当前登录账号的资料呼号（去除首尾空白并大写），逐条检查文件中的 STATION_CALLSIGN：字段存在时必须与账号呼号一致（忽略大小写及首尾空白，保留 /P 等后缀），空值也拒绝；字段缺失时由账号呼号补齐。任一记录的该字段不一致或为空时返回 400（fields.adif），整批不新增也不更新，即使该记录本身无效或重复也不跳过本站呼号校验。OPERATOR 及请求体中的呼号不会覆盖账号设置；对方 CALL 保持原语义，不改为本站呼号。TQ8 按 CERT_UID / STATION_UID 关联证书、台站和通联，从证书主题的 ARRL AROcallsign OID（1.3.6.1.4.1.12348.1.1）读取本站呼号，忽略大小写及首尾空白后必须与账号完全一致，不去除 /P 等后缀。文件不需要另外包含 STATION_CALLSIGN；不能通过 CALL、OPERATOR、请求体参数或台站文本冒充证书呼号。缺少账号呼号时 fields.callSign 提示先设置，其它 TQ8 校验错误使用 fields.tq8。LoTW 下载继续要求每条记录 STATION_CALLSIGN 与保存时账号最新呼号一致。

TQ8 签名：支持 LOTW V1.0 / V2.0。按官方配置及 TrustedQSL 生成顺序重建台站和通联的规范化签名文本，必须同时匹配 SIGNDATA 并通过 RSA / SHA-1 签名验证；仅验证 SIGNDATA 本身而不核对记录内容是不足的。证书必须为 RSA 非 CA 呼号证书，当前处于有效期内，并链接到应用内固定的 ARRL Production CA / Root CA。公共 CA 来源、指纹与更新说明见 [server/certs/README.md](../server/certs/README.md)；不接受上传者提供的信任根。过期证书、未知或过期 CA 会拒绝导入，应使用有效证书重新签名或更新经核实的 CA。校验不联网查询证书吊销状态，不认证签名实际发生时间或核对证书自定义 QSO 授权日期范围；持有 TQ8 文件也不等于持有签名私钥，不能将导入当作实时身份认证。

TQ8 日期时间兼容：QSO_DATE 为 YYYY-MM-DD，QSO_TIME 接受 HH:MM:SS 及带 UTC 标记的 HH:MM:SSZ。按文件原文重建并验证签名，不在校验前删除 Z；验签通过后才去除冒号和末尾 Z，转为内部 UTC 时间。真实日期及时间范围仍由通联校验检查。

日志手动筛选：`GET /api/me/logbook?callSign=JA1ABC&page=1` 使用当前账号私有日志，callSign 参数按去首尾空白、忽略大小写精确匹配对方呼号，不匹配前缀、包含关系或省略 /P 后缀；传空 callSign 返回空集。可与原 q 包含筛选同时使用，分页仍为 25 条，按 UTC 通联时间及 ID 倒序。接口不依据请求体或查询参数切换账号，不向公共卡片接口添加日志字段。

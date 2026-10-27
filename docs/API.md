# QSLink API 契约 v1

> 本文件记录当前前后端接口行为；修改接口时应同步更新。若与文档不符，以 `server/lib/api/` 等现行实现为核实依据。
> 服务默认地址：`http://127.0.0.1:8787`。所有接口前缀 `/api`，JSON in / JSON out（UTF-8）。

### 上传图片的响应式版本

卡片 API 的 `frontImage` / `backImage` 仍返回原图路径。`GET` / `HEAD /uploads/<filename>?w=<像素宽度>` 可请求 PNG/JPEG/WebP 的 WebP 缩放版本，质量 82，保留宽高比及透明度、自动纠正 EXIF 方向、不放大小图。`w` 须为 1–2560 的整数，向上归入 `160/320/480/640/960/1280/1600/1920/2560` 档；不合法返回 `400 INVALID_IMAGE_WIDTH`，文件不存在返回 404。SVG 保持矢量原文件和沙箱响应头。不带 `w` 始终获取原图，编辑和原图查看不受影响。

前端按图片所在位置的实际 CSS 布局宽度和设备 DPR，通过 `srcset` / `sizes` 选择档位；列表尺寸变化由 `ResizeObserver` 同步，3D 卡片采用旋转前的布局宽度，旋转不触发重复换图。已有上传图片无需重新上传。

首次请求按需生成，缓存到 `QSL_DATA_DIR/image-cache/`，同一进程的同图同档并发请求合并；最多同时处理 2 张、等待 64 项，满载返回 `503 IMAGE_BUSY`。成功响应带一年不可变缓存。源文件变更会更换磁盘缓存键；缩放解码上限 4000 万像素。无法缩放或缓存写入失败时退回原文件并禁用长缓存，避免旧卡片损坏。生成端使用 Sharp，需要 Node.js ≥20.9，生产镜像和 CI 使用 Node 24。

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
服务端保存为文件并返回 `/uploads/<uuid>.<ext>` 形式的 URL。也可直接提交已保存的 `/uploads/...` URL（编辑时沿用旧图）。

---

## 1. 健康检查与运行配置

`GET /api/health` → `{ "ok": true, "name": "QSLink", "version": "1.0.0", "uptime": 12.3, "time": "...", "storage": "postgresql" }`。健康检查会验证数据库连接。

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
  "stats": { "cards": 3, "approvedCards": 2, "pendingCards": 1, "likesReceived": 24, "incomingPending": 2, "outgoingPending": 1, "completedExchanges": 4 },
  "recentIncoming": [ExchangeItem × ≤3],
  "recentCards": [CardPublic × ≤3]
}
```
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
body: `{ title, callSign?, band?, mode?, notes?, ratio: {w,h}, frontImage, backImage? }`
- `callSign` 选填，去除首尾空白、≤20 个字符；服务端不强制格式或大写。
- `band` / `mode` 为兼容字段，v3 起可省略或传空字符串；仍接受、保存并返回 ≤20 个字符的值，但前端不再填写或展示为筛选项。
- 正面图片必需；背面可省略或为空，返回空字符串，由前端显示占位背面。
- 创建后 `status: "pending"`（等待人工审核），同时生成 `shareToken`。
- 201 → `{ card: CardPublic }`（含 status= pending、shareToken）
### PUT /api/cards/:id  🔒

所有者编辑时须再次提交上述三个确认字段，服务器更新该卡片的授权记录。管理员编辑他人的卡片不替代所有者授权，不修改已有确认记录。旧账号和卡片无确认记录时保持 NULL，不推定已经授权；授权记录不包含在公开 API 响应中。
owner 或 admin。body 同上（字段可选）。普通 owner 修改后 `status` 重置为 `pending`（admin 修改不重置，除非显式传 status）。
→ `{ card: CardPublic }`
### DELETE /api/cards/:id  🔒
owner 或 admin。级联删除其点赞与换卡申请。→ `{ ok: true }`
### POST /api/cards/:id/like  🔒
切换点赞。→ `{ liked: true, likeCount: 19 }`
### GET /api/cards/:id/share  🔒 (owner/admin)
→ `{ shareToken, url: "https://qsl.example.com/s/AbCdEf" }`。`shareToken` 为六位大小写敏感的英文字母，由密码学安全、无偏随机数生成并碰撞重试。所有新响应中的 `shareToken` 使用新短 token；数据库原 `cards.shareToken` 保留历史映射，新增 `shortToken`，历史 `/share/:token` 和公开数据接口仍解析原卡。两类 token 不允许跨卡冲突。公开分享数据仅对审核通过且持有者未封禁的卡片开放，删除后返回 404。
优先以 `QSL_PUBLIC_ORIGIN` 为 URL 的站点地址；生产必须配置该值且使用 HTTPS。不配置时（仅非生产）以请求协议与 Host 拼接：协议优先取 `X-Forwarded-Proto` 的首项，否则根据连接是否加密选择 https/http。取得分享链接不代表卡片已公开；未通过审核时分享页数据接口仍返回 404。

## 5. 换卡申请
### POST /api/cards/:cardId/exchanges  🔒
body: `{ message?, contactName, address: Address }`
- 不能申请自己的卡片；卡片须 approved 且 owner 未被禁用。
- 同一用户对同一卡片存在 `pending`/`approved` 的活动申请时 → 409 `CONFLICT`（message："你已申请过这张卡片，请等待对方处理"）。
- 201 → `{ exchange: ExchangeItem }`（允许被拒绝/取消后重新申请）
### GET /api/exchanges/:id  🔒
参与者或 admin → `{ exchange: ExchangeItem }`（地址可见性同上）
### POST /api/exchanges/:id/approve  🔒 (仅卡片 owner)
- 仅 pending 可操作；每笔申请独立审批，同意后不改变同一卡片的其他申请。同一卡片可同时与多个不同用户处于 `approved` 状态，也允许其他用户继续提交申请。
- 同一用户对同一卡片仍只能有一笔 `pending`/`approved` 活动申请；各笔交换独立完成，地址仅对该笔交换的双方及管理员可见。
- → `{ exchange: ExchangeItem }`（包含双方地址）
### POST /api/exchanges/:id/reject  🔒 (仅卡片 owner)
body: `{ reason? }` → `{ exchange }`
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
→ `{ card }`
### DELETE /api/admin/cards/:id → `{ ok: true }`
### GET /api/admin/exchanges
query：`status`、`page`、`limit`。→ 分页列表（ExchangeItem，含双方地址与卡片、用户信息，`direction` 固定为 `admin`）

## 公告

公告对象 `Announcement` 包含 `id`、`title`、`body`、`status`、`publishedAt`、`createdAt`、`updatedAt`。标题和正文均为纯文本；去除首尾空白后分别为 1–120 和 1–10000 个 Unicode 字符，不允许 NUL。状态仅为 `draft`（草稿 / 已撤下）或 `published`（已发布）。时间由服务端生成，为 UTC ISO 字符串，未发布过的草稿 `publishedAt: null`。客户端提交的 ID、时间及其它未知字段不参与写入。

### GET /api/announcements

无需登录，仅返回 `published` 公告；即使提供 `status=all/draft` 也不能读取草稿。支持通用 `page` / `limit` 分页，返回 `{ items: Announcement[], total, page, limit, pages }`，按 `publishedAt` 倒序、同时间按 ID 倒序。

### GET /api/admin/announcements

仅管理员；未登录为 `401 UNAUTHORIZED`，普通用户为 `403 FORBIDDEN`（以下写接口相同）。支持通用分页及 `status=all|draft|published`，默认及无效值回退 `all`。返回同上，按 `updatedAt` 倒序、同时间按 ID 倒序。

### POST /api/admin/announcements

仅管理员。body：`{ title, body, status? }`，状态缺省为 `draft`；直接创建 `published` 时设置发布时间。成功 `201 → { announcement: Announcement }`。非法请求体、空白 / 超长文本或非法状态返回 `400 VALIDATION`，字段错误包含 `fields`。

### PUT /api/admin/announcements/:id

仅管理员。body：`{ title?, body?, status? }`，未提交的字段保持原值，成功 `200 → { announcement: Announcement }`；不存在为 `404 NOT_FOUND`，校验错误同创建接口。每次更新刷新 `updatedAt`，`createdAt` 不变。从 `draft` 切换为 `published` 时设置新的 `publishedAt`；编辑已发布内容或再次提交 `published` 不改变发布时间。撤下即设为 `draft`，立即从公共列表排除但保留历史发布时间；再次发布重设发布时间并按新时间排序。不提供删除、定时发布或独立的公告详情端点。

## 7. 静态资源
- `/uploads/*`：上传的卡片图片，长缓存头。
- 其余 GET 非 `/api` 路径：优先返回 `public/` 下静态文件；未命中且带扩展名的 404；未命中且无扩展名的路径返回 `public/index.html`（SPA history 路由回退）。
- `/share/:token`、`/card/:id`、`/dashboard/*`、`/admin` 均回退到 index.html，由前端路由处理。

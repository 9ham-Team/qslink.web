# QSLink API 契约 v1

> 本文件是前端与后端的唯一事实来源（single source of truth）。后端实现必须逐条满足；前端只依赖本文件描述的行为。
> 服务默认地址：`http://127.0.0.1:8787`。所有接口前缀 `/api`，JSON in / JSON out（UTF-8）。

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
`fields` 可选。常见 code：`VALIDATION`、`INVALID_CREDENTIALS`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`PAYLOAD_TOO_LARGE`、`BANNED`。

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

## 1. 健康检查
`GET /api/health` → `{ "ok": true, "name": "QSLink", "version": "1.0.0", "uptime": 12.3, "time": "..." }`

## 2. 认证
### POST /api/auth/register
body: `{ username, email, password, displayName?, callSign? }`
- username 3-20 位字母/数字/下划线且唯一；email 合法且唯一；password ≥ 8 位且包含字母与数字；displayName 默认 username；callSign 默认空字符串。
- 201 → `{ token, user: UserSelf }`
- 409 `USERNAME_TAKEN` / `EMAIL_TAKEN`；400 `VALIDATION`（fields 标注字段）。

### POST /api/auth/login
body: `{ identifier, password }`（identifier = 用户名或邮箱，大小写不敏感）
- 200 → `{ token, user: UserSelf }`
- 401 `INVALID_CREDENTIALS`；403 `BANNED`（被禁用）

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
公共卡片广场。query：`callSign`（**v3 起推荐**：按呼号搜索，大小写不敏感 contains，匹配卡片 callSign 或持有者 callSign）、`sort`（`latest` 默认 / `popular` / `oldest`）、`page`、`limit`；`q`、`band`、`mode` 为兼容参数保留（v3 起卡片不再填写波段/模式，前端只使用 `callSign` 搜索）。
→ 分页列表（CardPublic，只含 approved 且 owner 未被禁用）。
### GET /api/cards/:id
→ `{ card: CardDetail, owner: UserPublic }`。
- 未登录可看 approved 卡片；pending/rejected 仅 owner/admin 可看（否则 404）。
### GET /api/public/cards/:shareToken
分享页专用（无需登录）。→ `{ card: CardDetail, owner: UserPublic }`（卡片必须 approved；否则 404）。
### POST /api/cards  🔒
body: `{ title, callSign?, band?, mode?, notes?, ratio: {w,h}, frontImage, backImage }`
- `band` / `mode` 为兼容字段，v3 起可省略或传空字符串（不再作为卡片内容，前端不再填写）。
- 创建后 `status: "pending"`（等待人工审核），同时生成 `shareToken`。
- 201 → `{ card: CardPublic }`（含 status= pending、shareToken）
### PUT /api/cards/:id  🔒
owner 或 admin。body 同上（字段可选）。owner 修改后 `status` 重置为 `pending`（admin 修改不重置，除非显式传 status）。
→ `{ card: CardPublic }`
### DELETE /api/cards/:id  🔒
owner 或 admin。级联删除其点赞与换卡申请。→ `{ ok: true }`
### POST /api/cards/:id/like  🔒
切换点赞。→ `{ liked: true, likeCount: 19 }`
### GET /api/cards/:id/share  🔒 (owner/admin)
→ `{ shareToken, url: "http://127.0.0.1:8787/share/aBcD1234" }`（url 基于请求 Host 生成）

## 5. 换卡申请
### POST /api/cards/:cardId/exchanges  🔒
body: `{ message?, contactName, address: Address }`
- 不能申请自己的卡片；卡片须 approved 且 owner 未被禁用。
- 同一用户对同一卡片存在 `pending`/`approved` 的活动申请时 → 409 `CONFLICT`（message："你已申请过这张卡片，请等待对方处理"）。
- 201 → `{ exchange: ExchangeItem }`（允许被拒绝/取消后重新申请）
### GET /api/exchanges/:id  🔒
参与者或 admin → `{ exchange: ExchangeItem }`（地址可见性同上）
### POST /api/exchanges/:id/approve  🔒 (仅卡片 owner)
- 仅 pending 可操作；批准同时把该卡片其它 pending 申请自动置为 `rejected`（rejectReason: "该卡片已与其它申请者达成交换"）。
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

## 7. 静态资源
- `/uploads/*`：上传的卡片图片，长缓存头。
- 其余 GET 非 `/api` 路径：优先返回 `public/` 下静态文件；未命中且带扩展名的 404；未命中且无扩展名的路径返回 `public/index.html`（SPA history 路由回退）。
- `/share/:token`、`/card/:id`、`/dashboard/*`、`/admin` 均回退到 index.html，由前端路由处理。

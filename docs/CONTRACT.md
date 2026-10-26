# QSLink 前端契约 v1（所有队友必读）

> 前端无构建步骤、无第三方运行时依赖、无 CDN。纯原生 HTML/CSS/JS（ES2020，普通 `<script>` 全局命名空间）；允许且需要请求本站 `/api` 和 `/uploads`，不依赖外部字体、图片或脚本资源。此约束不表示后端无依赖或不访问外部服务：后端使用 PostgreSQL，注册验证码邮件由服务端调用邮件服务发送。
> 中文界面（zh-CN）。风格：清新、明亮、通透、优雅；多种细腻动效。
> **API 行为见 `docs/API.md`；与文档不符时核实现行前后端实现，并同步维护文档。**

## 1. 目录与历史分工

下表保留初始多人协作时的职责划分，便于定位模块，**不是当前文件写权限或修改范围限制**。现阶段按具体任务授权修改；共享接口变更应同步调用方与契约，不需要受原 owner 或 Lead 的排他约束。

| 区域 | 历史负责人 | 文件 |
|---|---|---|
| 外壳与共享层 | Lead | `public/index.html`、`public/js/core.js`、`public/js/api.js`、`public/js/ui.js`、`public/js/app.js`、`public/css/base.css`、`public/css/components.css`、`package.json`、`README.md`、`docs/**`、`tools/**` |
| 后端 | backend-dev | `server/**`（server.js、lib/**、seed.js 等）；`data/**` 运行时生成 |
| 卡片广场/3D/详情/分享 | cards-ui | `public/js/card3d.js`、`public/js/pages/home.js`、`explore.js`、`card-detail.js`、`share.js`、`public/css/gallery.css` |
| 注册登录/个人中心/我的卡片/上传编辑/换卡申请页 | flows-ui | `public/js/pages/login.js`、`register.js`、`dashboard.js`、`my-cards.js`、`card-editor.js`、`exchanges.js`、`profile.js`、`public/css/flows.css` |
| 管理后台 | admin-ui | `public/js/pages/admin.js`、`public/css/admin.css` |
| 动效与视觉资产 | motion-ui | `public/js/effects.js`、`public/css/animations.css`、`public/assets/**`（logo、装饰插画、空状态插画） |
| 测试/验收 | qa | `tests/**`、`qa-shots/**`、`qa-report.md` |

- 共享层（index.html、core.js、api.js、ui.js、base.css、components.css）变更应核实相关调用方，避免破坏已有接口。
- 页面补充样式优先写入相应模块的 CSS 文件（加载顺序：base → components → gallery → flows → admin → animations）。
- 类名必须加模块前缀，避免冲突：gallery → `.g-*` / `.card3d-*`；flows → `.f-*`；admin → `.a-*`；动效 → `.fx-*`。共享组件类（`.btn/.input/.badge/.qsl-tile/...`）避免在页面样式中重定义。
- 页面局部 HTML ID 只在自身 render 输出内使用；全局 ID 仅：`site-header`、`app`、`site-footer`、`toast-root`、`modal-root`、`fx-layer`。

## 2. index.html 脚本加载顺序

```
css/base.css → components.css → gallery.css → flows.css → admin.css → animations.css
js/core.js → api.js → ui.js → effects.js → card3d.js
→ pages/home.js → explore.js → card-detail.js → share.js → login.js → register.js
→ dashboard.js → my-cards.js → card-editor.js → exchanges.js → profile.js → admin.js
→ app.js
```
每个 page 文件加载时调用 `QSL.registerPage(name, { title, render })` 注册自己；`app.js` 最后启动路由。
未注册的页面路由显示"页面准备中"，不会报错。

## 3. 路由表

| 路径 | page 名称 | 守卫 |
|---|---|---|
| `/` | `home` | 公开 |
| `/explore` | `explore` | 公开 |
| `/space/:uid` | `space` | 公开，九位 UID |
| `/card/:id` | `card-detail` | 公开（申请按钮需登录） |
| `/share/:token` | `share` | 公开（卡片须通过审核） |
| `/login` | `login` | 游客页（已登录访问会跳回首页/next） |
| `/register` | `register` | 游客页 |
| `/dashboard` | `dashboard` | 登录 |
| `/dashboard/cards` | `my-cards` | 登录 |
| `/dashboard/cards/new` | `card-editor` | 登录 |
| `/dashboard/cards/:id/edit` | `card-editor` | 登录 |
| `/dashboard/exchanges` | `exchanges` | 登录 |
| `/dashboard/profile` | `profile` | 登录 |
| `/admin` | `admin` | 登录 + 管理员 |
| 其它 | `not-found`（共享路由内置） | — |

路由传参：`render(container, ctx)`，`ctx = { path, params: {id?, token?}, query: URLSearchParams }`。
`render` 可返回 cleanup 函数（如 3D 动画销毁）。导航后容器自动清空。

个人资料的寄送地址支持本地解析粘贴文本（姓名、手机号、省市区、街道和邮编），支持常见分隔符及“地址 / 所在地区 / 详细地址”标签。解析只补充空字段，保留已有内容，用户核对后手动保存；保存城市时避免重复追加已有区县。解析使用规则识别，特殊地址仍需手动核对。

公开主页模块 `pages/space.js` 在 `explore.js` 后显式加载，展示公开资料、已审核卡片和分页，提供可手动复制的分享链接。个人中心 `/dashboard` 增加自己的公开主页入口；卡片详情上传者头像及姓名可进入 `/space/:uid`。主页离开时忽略未完成请求并关闭分享弹窗。
`/legal/terms.html`、`/legal/privacy.html` 为独立静态法律页面，不由 SPA 页面模块渲染。

`/dashboard/cards?status=pending` 可直接进入“我的卡片”的“审核中”筛选；`status` 也支持 `approved`、`rejected`，无效或缺省时显示全部。切换筛选会同步更新查询参数。

## 4. 全局命名空间 `window.QSL`

### 4.1 core.js（共享层）
```js
QSL.state = { user: UserSelf|null, ready: Promise, booted: false }
QSL.registerPage(name, { title, render })     // title 用于 document.title
QSL.navigate(path, { replace=false })         // pushState 跳转
QSL.refreshUser()                             // 重新 GET /api/auth/me，返回 Promise
QSL.requireAuth(nextPath?)                    // 未登录则跳 /login?next=...，返回 bool
QSL.on(event, fn) / QSL.off(event, fn) / QSL.emit(event, payload)
QSL.escapeHtml(str)
QSL.escapeAttr(str)
QSL.formatDate(iso)        // "2026年10月19日"
QSL.formatDateTime(iso)    // "2026-10-19 18:30"
QSL.timeAgo(iso)           // "3 小时前"
QSL.formatNumber(n)        // 1.2k
QSL.debounce(fn, ms)
QSL.ratioCss(ratio)        // {"w":3,"h":2} → "3 / 2"
QSL.qs(name)               // 当前 URL 查询参数值
QSL.setQuery(params)       // 静默 replaceState 更新 query
```
事件：`auth`（用户变化）、`route`（路由变化）、`route:rendered`（新页面 DOM 就绪）。

### 4.2 api.js（共享层）
```js
QSL.api.request(method, path, body?, opts?)  // 返回解析后的 JSON；失败抛 ApiError
// ApiError: { status, code, message, fields, isNetwork }
QSL.api.get(path) / post(path, body) / put(path, body) / del(path)
QSL.api.token() / QSL.api.setToken(token|null)
QSL.api.health() / QSL.api.config()
QSL.api.auth.sendEmailCode(email)           // POST /api/auth/email-code，body: { email }
QSL.api.auth.register/login/logout/me
QSL.api.me.overview/updateProfile/updatePassword
QSL.api.cards.list(params)/get(id)/create/update/remove/like/mine/share/publicGet(token)
QSL.api.exchanges.mine(params)/detail(id)/create(cardId, payload)/approve(id)/reject(id,payload)/complete(id)/cancel(id)
QSL.api.admin.stats/users/updateUser/deleteUser/cards/updateCard/deleteCard/exchanges
```
- token 存 `localStorage["qsl_token"]`。
- 401（且本地有 token 时）会自动清 token、触发 `auth` 事件并 toast "登录已过期，请重新登录"（登录/注册接口及显式 `skipAuthClear` 的请求除外）。
- `QSL.api.cards.list({callSign, sort, page, limit})` 自动拼 query。当前广场按呼号搜索：大小写不敏感的包含匹配，匹配卡片或持有者呼号。`q/band/mode` 仅为仍生效的后端兼容参数；新界面不再提供波段/模式字段或筛选。
- 注册需先收取 **6 位数字、30 分钟有效**的邮箱验证码，再提交 `emailCode` 字符串。格式校验通过不等于邮箱验证成功。发送成功或 429 后页面倒计时 60 秒；服务器另有邮箱/IP 小时配额与 `Retry-After`，不能仅靠前端倒计时判断允许重试。
- 注册必须显式勾选法律同意，提交 `acceptTerms: true`、`termsVersion: "2026-10-25"`。创建/所有者编辑卡片另需 `acceptContentLicense: true`。验证码、失败语义及法律记录规则详见 `docs/API.md` §2/§4。
- 呼号为选填文本，服务端去除首尾空白并限制 ≤20 个字符，不强制格式或大写；注册页会自动大写输入。`band/mode` 兼容值不是当前卡片表单的必填内容。

### 4.3 ui.js（共享层）— 共享组件
```js
QSL.toast(message, type='success'|'error'|'info', ms?)      // 右上角滑入
QSL.modal({ title, content, size='md'|'lg'|'sm', actions:[{label, type:'primary'|'ghost'|'danger', onClick, closeOnClick=true}], onClose }) -> { close(), el, body }
QSL.confirm({ title, message, confirmText='确认', cancelText='取消', danger=false }) -> Promise<boolean>
QSL.loading(container, text?)                 // 骨架/加载态
QSL.emptyState({ icon='cards', title, desc, actionLabel, onAction })  // 空状态卡片
QSL.icon(name, size=20)                       // 返回内联 <svg> 字符串；见图标清单
QSL.avatar(user, size=36)                     // 返回 HTML：渐变圆 + 首字母/呼号缩写
QSL.badge(text, tone='mint'|'sky'|'amber'|'rose'|'slate')
QSL.statusBadge(status)                       // pending→"审核中" approved→"已通过" rejected→"已拒绝"
QSL.exchangeBadge(status)                     // pending 待处理 approved 已同意 rejected 已拒绝 completed 已完成 cancelled 已取消
QSL.cardTile(card, { onLike, href, showStatus, compact })  // 返回 HTMLElement，.qsl-tile 结构（含 3D 倾斜悬停、点赞按钮、状态角标、owner、标签）
QSL.pageHeader({ eyebrow, title, desc, actions })          // 返回 HTML：页面标题区
QSL.sectionHead({ title, desc, actionLabel, onAction })
QSL.button({ label, variant, size, icon, onClick, loading }) -> HTMLButtonElement
QSL.skeletonCard() / QSL.skeletonRows(n)
QSL.copyText(text) -> Promise<boolean>       // 复制并 toast "链接已复制"
QSL.shareCard(card) -> Promise               // 分享链接规则见下文
QSL.formGroup({ label, input, hint, required }) -> HTML 字符串/元素
QSL.ratioLabel(ratio)                         // "3 : 2"
QSL.bandTone(band) / QSL.modeTone(mode)       // 历史兼容辅助方法，不代表当前 UI 提供波段/模式筛选
QSL.ownerLine(user) -> HTML
QSL.cardThumb(card, {height}) -> HTML
```
分享规则：已有 `shareToken` 时直接复制当前 `location.origin + '/share/' + token`；无 token、有卡片 id 且 `canShare !== false` 时尝试 `GET /api/cards/:id/share`（仅 owner/admin），优先复制响应的完整 URL；失败后回退当前站点的 `/share/<token>` 或 `/card/<id>`。服务端分享 URL 优先使用 `QSL_PUBLIC_ORIGIN`（生产必需 HTTPS），仅非生产未配置时从请求协议与 Host 拼接。分享 token 存在不代表已经审核通过。

图标清单（`QSL.icon` 支持）：`heart, share, cards, upload, camera, check, x, close, plus, edit, trash, arrow-right, arrow-left, chevron-down, search, filter, sort, user, users, shield, clock, map-pin, mail, lock, eye, logout, menu, sparkles, flame, globe, radio, antenna, wave, copy, external, refresh, image, info, alert, star, settings, inbox, send, sun, moon, layout, list, grid, download, 3d, flip`（不存在的 name 返回空字符串，不抛错）。

### 4.4 effects.js（动效层）
```js
QSL.fx = {
  init(),                       // app.js 启动后调用；挂载背景光斑/粒子层 #fx-layer
  enhance(scope=document),      // 每次路由渲染后调用：初始化 [data-reveal]、[data-tilt]、[data-count]、[data-magnetic]、[data-ripple] 等
  confetti(x?, y?),             // 点赞/审批成功的小型彩纸庆祝
  heartbeat(el),                // 点赞按钮脉冲
  pageTransition(el)            // 页面进入过渡
}
```
页面渲染完成后 router 会 emit `route:rendered`；`effects.js` 自己监听并调用 `enhance()`（页面作者无需手动调用）。
页面可用装饰属性：`data-reveal`（滚动进入淡入上移，可加 `data-reveal-delay="120"`）、`data-tilt`（3D 倾斜）、`data-count="18"`（数字滚动）、`data-magnetic`（按钮磁吸）、`data-ripple`（点击水波纹）、`data-stagger`（子元素依次进入）。
**动效必须优雅克制：600ms 内完成、避免布局抖动、尊重 `prefers-reduced-motion`。**

### 4.5 card3d.js（卡片展示层）
```js
const viewer = QSL.card3d.create(container, {
  front, back,                 // 图片 URL（back 可为空 → 背面显示优雅占位）
  ratio: { w, h },             // 卡片宽高比
  width: 520,                  // 卡片宽（px），高度按比例自适应；null=自适应容器宽
  autoRotate: true,            // 空闲时缓慢自转
  interactive: true,           // 拖拽旋转 / 双击翻转
  showControls: false,         // 内置控制条（翻转 / 自动旋转 / 重置）
  initialSide: 'front',
  ambient: true                // 底部光晕/浮动阴影
})
viewer = { el, flip(), showFront(), showBack(), reset(), setImages(front, back), setRatio(ratio), setAutoRotate(bool), destroy() }
```
要求：CSS 3D（preserve-3d），正反面贴图、卡片厚度（多层边缘）、光泽随指针移动、拖拽惯性、触摸支持、DPR 清晰；容器尺寸变化时自动适配（ResizeObserver）；`destroy()` 必须停止 RAF 与监听。

## 5. 设计系统 tokens（base.css 已定义，直接用）

```css
--bg, --bg-grad; --surface, --surface-2, --surface-solid, --line, --line-strong
--ink, --ink-2, --muted, --brand, --brand-2, --brand-deep, --brand-soft
--accent (珊瑚粉), --warn, --danger, --success
--grad-brand, --grad-mint, --grad-sky, --grad-sunset
--r-xs 8px, --r-sm 12px, --r-md 18px, --r-lg 26px, --r-xl 36px, --r-pill 999px
--shadow-xs, --shadow-sm, --shadow-md, --shadow-lg, --shadow-brand
--font-sans（雅黑/苹方/system）, --font-display（衬线：Georgia/Songti）, --font-mono（呼号用）
--nav-h 76px, --container 1240px, --ease（cubic-bezier(.22,.61,.36,1)）
```
布局工具类：`.container`、`.stack`、`.row`、`.between`、`.center`、`.wrap`、`.grow`、`.muted`、`.eyebrow`、`.display`、`.glass`、`.surface`、`.hide-mobile`、`.hide-sm`。
共享组件类：`.btn`（`.btn-primary/.btn-ghost/.btn-soft/.btn-danger/.btn-icon/.btn-sm/.btn-lg`）、`.input/.textarea/.select/.field/.label/.hint/.form-grid/.form-row`、`.chip/.chip.active`、`.badge`、`.qsl-tile*`、`.avatar`、`.modal*`、`.toast*`、`.tabs/.tab`、`.table-wrap/.table`、`.stat-card`、`.empty-state`、`.skeleton`、`.section`、`.page-head`、`.divider`、`.switch`、`.tag`、`.dropdown`、`.segmented`。
> 具体结构以 base.css / components.css 源码为准。页面样式必须能被 375px 手机宽度正常使用（响应式断点 1080 / 860 / 620）。

## 6. 开发与自测流程

1. 默认开发地址：`http://127.0.0.1:8787`（`npm start`）。先确认是否已有服务，不要重复占用端口。启动必须配置 PostgreSQL `DATABASE_URL`；独立实例应使用不同 `QSL_PORT`、隔离的数据库/schema（`QSL_DB_SCHEMA`）及 `QSL_DATA_DIR`，仅换数据目录不能隔离数据库。
2. 前端无构建：改完文件刷新页面即可（服务端对 html/js/css 发 `Cache-Control: no-cache`）；后端修改后需重启服务。
3. 需要视觉验收且任务允许时可截图：
   `node tools/shot.mjs http://127.0.0.1:8787/ qa-shots/home.png 1440 1000`
   登录态优先正常登录；仅显式启用演示模式时，可用本人有效 token 的 `?devToken=<token>` 辅助截图。前端 boot 会清除该 URL 参数，非演示模式不会写入 token；生产禁止演示模式。
4. 默认不开启演示账号，不应依赖固定用户名/密码。仅本地开发/测试显式设置 `QSL_SEED_DEMO=true`；登录页从 `/api/config` 获取演示账号，不在前端内置密码。生产使用独立干净数据并通过 `npm run admin:init` 初始化管理员。
5. 前端不引入外部 CDN、字体或图片依赖；使用本站资源或内联 SVG。本站 API 请求是正常功能组成部分。新增依赖按具体任务评估，历史分工不构成全项目禁止安装依赖的要求。
6. 完成任务后说明实际改动、核实/验证方式与已知问题；是否运行测试、截图等以当前任务要求为准。

## 7. 质量红线

- 每个页面必须有：加载骨架、空状态、错误 toast、移动端适配。
- 所有文本插值必须走 `QSL.escapeHtml` 或 `textContent`（XSS）。
- 点赞/申请/审批等按钮必须有 loading/禁用态，防重复提交。
- 3D 卡片在 Ratio 非 3:2（纵向 2:3、4:5 等）时不得变形、不得溢出容器。
- 表单校验错误显示在字段旁（`ApiError.fields`）。
- 不写 `console.log` 调试残留（错误可用 `console.error`）。
- 页面首次渲染目标 < 150ms（本地），无长时间空白。

## 8. 数据与页面可见性

- 公共广场只显示 `approved` 且持有者未被禁用的卡片；登录用户在“我的卡片”查看自己的全部状态卡片。空库应正常展示空状态，不要求某个个人账号或固定卡片存在。
- 首页调用 `QSL.api.cards.list({sort:'popular', limit:48})`，优先取返回列表中第一张有正面图的卡片作为 Hero；无卡片时使用品牌占位。**不要求使用任何真实个人卡图**，也不按特定账号或标题挑选。
- 首页卡片数取 `/api/cards` 返回的 `total`；独立呼号数与点赞数由本次返回的最多 48 张卡片计算，不是全库统计，也不是固定种子数据。
- 演示数据只用于显式启用的开发/测试环境，当前 seed 的卡图为程序生成 SVG；不要求默认展示演示账号、固定数量的申请或待审核卡片。生产禁止演示开关，并检查演示数据及默认管理员密码。

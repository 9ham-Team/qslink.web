# QSLink 前端契约 v1（所有队友必读）

> 无构建步骤、无第三方依赖、无 CDN、无网络请求。纯原生 HTML/CSS/JS（ES2020，普通 `<script>` 全局命名空间）。
> 中文界面（zh-CN）。风格：清新、明亮、通透、优雅；多种细腻动效。
> **API 契约见 `docs/API.md`（唯一事实来源）。**

## 1. 目录与文件所有权（严禁越界写别人的文件）

| 区域 | 所有者 | 文件 |
|---|---|---|
| 外壳与共享层 | Lead | `public/index.html`、`public/js/core.js`、`public/js/api.js`、`public/js/ui.js`、`public/js/app.js`、`public/css/base.css`、`public/css/components.css`、`package.json`、`README.md`、`docs/**`、`tools/**` |
| 后端 | backend-dev | `server/**`（server.js、lib/**、seed.js、seed-assets/** 除 bg7mom 图外可新增）；`data/**` 运行时生成 |
| 卡片广场/3D/详情/分享 | cards-ui | `public/js/card3d.js`、`public/js/pages/home.js`、`explore.js`、`card-detail.js`、`share.js`、`public/css/gallery.css` |
| 注册登录/个人中心/我的卡片/上传编辑/换卡申请页 | flows-ui | `public/js/pages/login.js`、`register.js`、`dashboard.js`、`my-cards.js`、`card-editor.js`、`exchanges.js`、`profile.js`、`public/css/flows.css` |
| 管理后台 | admin-ui | `public/js/pages/admin.js`、`public/css/admin.css` |
| 动效与视觉资产 | motion-ui | `public/js/effects.js`、`public/css/animations.css`、`public/assets/**`（logo、装饰插画、空状态插画） |
| 测试/验收 | qa | `tests/**`、`qa-shots/**`、`qa-report.md` |

- **共享契约文件**（index.html、core.js、api.js、ui.js、base.css、components.css）若发现需要新增能力：不要直接改，发消息给 Lead，说明需求与期望签名。
- 需要在自己页面里补充样式 → 写进自己拥有的 CSS 文件（加载顺序：base → components → gallery → flows → admin → animations）。
- 类名必须加模块前缀，避免冲突：gallery → `.g-*` / `.card3d-*`；flows → `.f-*`；admin → `.a-*`；动效 → `.fx-*`。共享组件类（`.btn/.input/.badge/.qsl-tile/...`）只用、不重定义。
- 引用的 HTML ID 只在 owner 自己的 render 输出内使用；全局 ID 仅：`site-header`、`app`、`site-footer`、`toast-root`、`modal-root`、`fx-layer`。

## 2. index.html 脚本加载顺序（Lead 维护，不要改）

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
| `/card/:id` | `card-detail` | 公开（申请按钮需登录） |
| `/share/:token` | `share` | 公开 |
| `/login` | `login` | 游客页（已登录访问会跳回首页/next） |
| `/register` | `register` | 游客页 |
| `/dashboard` | `dashboard` | 登录 |
| `/dashboard/cards` | `my-cards` | 登录 |
| `/dashboard/cards/new` | `card-editor` | 登录 |
| `/dashboard/cards/:id/edit` | `card-editor` | 登录 |
| `/dashboard/exchanges` | `exchanges` | 登录 |
| `/dashboard/profile` | `profile` | 登录 |
| `/admin` | `admin` | 登录 + 管理员 |
| 其它 | `not-found`（Lead 内置） | — |

路由传参：`render(container, ctx)`，`ctx = { path, params: {id?}, query: URLSearchParams }`。
`render` 可返回 cleanup 函数（如 3D 动画销毁）。导航后容器自动清空。

## 4. 全局命名空间 `window.QSL`

### 4.1 core.js（Lead）
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

### 4.2 api.js（Lead）
```js
QSL.api.request(method, path, body?, opts?)  // 返回解析后的 JSON；失败抛 ApiError
// ApiError: { status, code, message, fields, isNetwork }
QSL.api.get(path) / post(path, body) / put(path, body) / del(path)
QSL.api.token() / QSL.api.setToken(token|null)
QSL.api.auth.register/login/logout/me
QSL.api.me.overview/updateProfile/updatePassword
QSL.api.cards.list(params)/get(id)/create/update/remove/like/mine/share/publicGet(token)
QSL.api.exchanges.mine(params)/detail(id)/create(cardId, payload)/approve(id)/reject(id,payload)/complete(id)/cancel(id)
QSL.api.admin.stats/users/updateUser/deleteUser/cards/updateCard/deleteCard/exchanges
```
- token 存 `localStorage["qsl_token"]`。
- 401（且本地有 token 时）会自动清 token、触发 `auth` 事件并 toast "登录已过期"（登录/注册接口的 401 除外）。
- `QSL.api.cards.list({q, band, mode, sort, page, limit})` 自动拼 query。

### 4.3 ui.js（Lead）— 共享组件
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
QSL.shareCard(card) -> Promise               // GET share 接口后复制链接（owner/admin），否则复制 /share/<token> 或卡片详情链接
QSL.formGroup({ label, input, hint, required }) -> HTML 字符串/元素
QSL.ratioLabel(ratio)                         // "3 : 2"
QSL.bandTone(band) / QSL.modeTone(mode)       // 返回 badge tone
QSL.ownerLine(user) -> HTML
QSL.cardThumb(card, {height}) -> HTML
```
图标清单（`QSL.icon` 支持）：`heart, share, cards, upload, camera, check, x, close, plus, edit, trash, arrow-right, arrow-left, chevron-down, search, filter, sort, user, users, shield, clock, map-pin, mail, lock, eye, logout, menu, sparkles, flame, globe, radio, antenna, wave, copy, external, refresh, image, info, alert, star, settings, inbox, send, sun, moon, layout, list, grid, download, 3d, flip`（不存在的 name 返回空字符串，不抛错）。

### 4.4 effects.js（motion-ui）
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

### 4.5 card3d.js（cards-ui）
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
> 具体结构请阅读 base.css / components.css 源码（Lead 编写后即为准）。页面样式必须能被 375px 手机宽度正常使用（响应式断点 1080 / 860 / 620）。

## 6. 开发与自测流程

1. 开发服务器由 Lead 启动：`http://127.0.0.1:8787`（`npm start`；后端代码更新后由 Lead 重启或使用 `--watch`）。不要自己长期占用 8787 端口；需要独立实例时用 `QSL_PORT=<其它端口> QSL_DATA_DIR=<临时目录> node server/server.js`。
2. 前端无构建：改完文件刷新页面即可（服务端对 html/js/css 发 `Cache-Control: no-cache`）。
3. 截图验证（视觉类任务必须做）：
   `node tools/shot.mjs http://127.0.0.1:8787/ qa-shots/home.png 1440 1000`
   登录态截图：先脚本登录拿 token，再用 `http://127.0.0.1:8787/...?devToken=<token>`（前端 boot 时读取该参数存入 localStorage 并清除 URL，仅用于测试）。
4. 测试账号（种子数据）：`bg7mom / Demo@123456`（普通用户，含真实 QSL 卡片 BG7MOM）、`admin / Admin@123456`（管理员）。其他种子用户见后端 seed。
5. 不允许引入 npm 依赖 / CDN / 外部字体图片。所有图片使用本地资源或 SVG 内联。
6. 完成任务后：在共享任务里 `complete`，并给 Lead 发一条简短交付说明（文件清单 + 如何自测 + 已知问题）。

## 7. 质量红线

- 每个页面必须有：加载骨架、空状态、错误 toast、移动端适配。
- 所有文本插值必须走 `QSL.escapeHtml` 或 `textContent`（XSS）。
- 点赞/申请/审批等按钮必须有 loading/禁用态，防重复提交。
- 3D 卡片在 Ratio 非 3:2（纵向 2:3、4:5 等）时不得变形、不得溢出容器。
- 表单校验错误显示在字段旁（`ApiError.fields`）。
- 不写 `console.log` 调试残留（错误可用 `console.error`）。
- 页面首次渲染目标 < 150ms（本地），无长时间空白。

## 8. 种子数据（后端）与页面可见性

- 广场只显示 `approved` 卡片；`bg7mom` 登录后可在"我的卡片"看到自己的全部卡片。
- 首页 Hero 3D 展示 `bg7mom` 的真实卡片（seed 数据中 title 含 "BG7MOM" 的卡片；前端可通过 `QSL.api.cards.list({sort:'popular', limit:1})` 或直接取列表第一张 featured）。
- 首页统计数字使用 `/api/cards` 的 `total` 与页面内展示的种子数据；不额外造接口。
- 演示数据：`bg7mom` 应有 1 条收到的 pending 申请 + 1 条我发出的 pending 申请 + 1 条被拒绝申请，便于演示审批流程；管理员后台有 2 张 pending 卡片待审核。

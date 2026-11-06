# QSLink 前端契约 v1（所有队友必读）

> 前端无构建步骤、无第三方运行时依赖、无 CDN。纯原生 HTML/CSS/JS（ES2020，普通 `<script>` 全局命名空间）；允许且需要请求本站 `/api` 和 `/uploads`，不依赖外部字体、图片或脚本资源。此约束不表示后端无依赖或不访问外部服务：后端使用 PostgreSQL，注册验证码邮件由服务端调用邮件服务发送。
> 中英文界面（zh-CN / en），首次访问按浏览器语言选择，无法匹配时默认中文。风格：清新、明亮、通透、优雅；多种细腻动效。
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
| `/events/qsl-design-2026-11` | `qsl-design-contest` | 公开，比赛信息、赛事动态、奖品进度及参赛须知 |
| `/events/qsl-design-2026-11/registration` | `qsl-design-registration` | 公开入口，报名需登录；每账号 1–3 张本人审核通过卡片，各自必填 1–2000 字作品说明 |
| `/events/qsl-design-2026-11/works` | `qsl-design-works` | 公开参赛作品，按首次参赛时间/固定编号升序；`q` 搜索呼号或数字编号 |
| `/space/:uid` | `space` | 公开，九位 UID |
| `/card/:id` | `card-detail` | 公开（申请按钮需登录） |
| `/share/:token` | `share` | 历史兼容，公开（卡片须通过审核且持有者未封禁） |
| `/s/:token` | `share` | 新分享入口，六位大小写敏感字母，公开规则同上 |
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

赛事顶栏按钮控制三项子导航平滑展开与内部容器增宽；首次展开进入比赛信息，深链保持对应选中项，支持 Escape、点击外侧关闭及 reduced-motion。手机菜单纵向展开。

报名提交 `works: [{ cardId, description }]`，每张已选作品旁提供作品说明弹窗；保存弹窗仅修改页面草稿，最终提交报名才持久化。移除再加保留本页草稿，离页清理。每赛事卡片固定数字编号（显示为 001 起），按首次参赛时间升序；移除或删除不回收编号。公开作品仅限报名及卡片审核通过且账号正常的记录，不包含联系邮箱或审核备注。

路由传参：`render(container, ctx)`，`ctx = { path, params: {id?, token?}, query: URLSearchParams }`。
`render` 可返回 cleanup 函数（如 3D 动画销毁）。导航后容器自动清空。

个人资料的寄送地址支持本地解析粘贴文本（姓名、手机号、省市区、街道和邮编），支持常见分隔符及“地址 / 所在地区 / 详细地址”标签。解析只补充空字段，保留已有内容，用户核对后手动保存；保存城市时避免重复追加已有区县。解析使用规则识别，特殊地址仍需手动核对。

公开主页模块 `pages/space.js` 在 `explore.js` 后显式加载，顶部以紧凑名片展示名字、呼号和简介，长简介可展开；下方紧接已审核卡片和分页，图片完整显示。分享按钮、UID 和加入时间位于卡片列表下方。个人中心 `/dashboard` 增加自己的公开主页入口；卡片详情上传者头像及姓名可进入 `/space/:uid`。主页离开时忽略未完成请求并关闭分享弹窗。提供“紧凑 / 大图”切换，`localStorage.qsl_space_view` 仅记忆 `grid` / `large`，存储不可用时仍可切换。紧凑模式桌面三列、≤900px 两列（手机保持两列），大图模式桌面两列、≤620px 一列。两种模式图片均 `object-fit: contain` 完整显示，文字紧凑，样式限定 `.g-space` 子模块。最新/最热排序发送服务端 `sort=latest/popular`，切换时保留旧列表并给网格标记 `aria-busy`（半透明、禁用交互与排序框），成功后从第一页整体替换；递增请求序号使过期响应不覆盖新排序，失败保留旧列表，点击“加载更多”重试会以新排序整体替换而非追加。返回主页重新使用最新排序，显示模式沿用本地偏好。

公共页脚口号下由 `QSL.footerBuildText(config.build)` 显示版本：有效元数据为“版本 ”+前七位 SHA 加 `Asia/Hong_Kong` 的 `yyyy-MM-dd HH:mm HKT`；缺少、格式或日期无效显示“开发版 · 镜像构建时间未知”。不使用浏览器当地时区或访问时间假冒构建时间。配置来源、完整 40 位 SHA、UTC 秒精度构建时间及与 OCI 标签一致的要求见 API 的公开构建信息契约。
`/legal/terms.html`、`/legal/privacy.html` 为独立静态法律页面，不由 SPA 页面模块渲染。

`/dashboard/cards?status=pending` 可直接进入“我的卡片”的“审核中”筛选；`status` 也支持 `approved`、`rejected`，无效或缺省时显示全部。切换筛选会同步更新查询参数。

### 公告展示与管理

首页 `home.js` 使用 `QSL.api.get('/api/announcements?page=1&limit=1&reminder=1')` 请求最新已发布公告，展示可关闭的公告浮层。公告与 toast 共用 `.qsl-notification` 的半透明卡片、圆角、阴影、图标、顶部光带及右侧滑入 / 淡出动效（280ms）；桌面右侧距导航栏 16px，手机与 toast 一样位于导航栏下方 10px、左右留 12px。普通 toast 出现时公告平滑暂隐，toast 移除后恢复。公告默认显示 30 秒，以剩余读条和秒数提示，到时自动关闭；使用公告的 `displaySeconds` 配置（1–3600 秒）。鼠标悬停、焦点位于浮层内、普通 toast 遮挡、页面隐藏或保存偏好期间暂停倒计时；长正文可滚动，减少动态效果模式禁用过渡。浮层挂载到 body，离页取消入场帧和关闭计时器并立即移除；关闭过渡期间禁用交互。浮层以 `aria-labelledby` 关联标题，可按 Esc 关闭（存在其他弹窗时不响应），关闭时若焦点在浮层内则移回公告入口。关闭及倒计时结束仅影响本次页面实例；点击“不再提醒”调用 `POST /api/announcements/:id/dismiss`，保存成功才关闭，失败提示并允许重试。游客显示“登录后不再提醒”，进入登录流程。偏好按账号和公告 ID 保存在数据库，后续首页过滤该公告，公告板仍可查看。离页清理倒计时间隔与可见性监听。Hero 下方始终保留“公告板 · 查看全部”入口，打开弹窗按每页 8 条加载；有加载、空状态和失败提示，可关闭后重试；翻页时保留当前列表并标记 `aria-busy`、禁用分页按钮，成功后回到弹窗顶部，失败保留当前页并恢复按钮。标题、正文及时间均转义，正文以纯文本保留换行，不解释 HTML / Markdown。显示的是服务端 `publishedAt`，不以更新时间冒充发布时间。

管理员 `/admin` 的“公告管理”页签通过通用 `QSL.api.get/post/put` 调用 `/api/admin/announcements` 及 `/:id`，不新增专用 API 包装。每页 8 条，支持新建、编辑、发布及撤下；编辑表单提供“弹窗停留时长（秒）”，默认 30，限制 1–3600 的整数，提交时转换为 JSON 数值，列表显示停留时长；撤下前需确认，从未发布的公告发布时间显示“未发布”，标题/正文按服务端规则（去除首尾空白后的字符数）实时显示 `n / 120`、`n / 10000`，超限标红但仍由服务端校验。保存按钮和状态切换按钮在请求中禁用，表单错误显示在弹窗及对应字段旁。草稿与撤下共用 `draft`，公开接口仅显示 `published`；编辑已发布公告保留发布时间，撤下保留历史发布时间，再发布由服务端重设。权限必须由服务端验证，前端守卫不是权限边界。

首页离开时设置取消标志、中止公告事件监听、关闭弹窗并移除浮层和入口；关闭弹窗或分页时递增请求序号，忽略过期响应，不要求中止已发出的网络请求。管理页利用页面实例、页签、请求序号及 DOM 存活检查防止过期响应覆盖；切换页签或离开页面关闭公告编辑弹窗，关闭后未完成保存的响应不得更新旧 UI。弹窗关闭时清理键盘监听。公告样式分别限定在 `.g-announcement-*` 和 `.a-announcement-*`，移动端仍须可阅读及操作。

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
QSL.cardShareUrl(card) -> Promise<string>    // 解析同一规则的分享 URL，不操作剪贴板
QSL.cardShare.bind(button, card) -> cleanup  // 详情页桌面菜单 / 触屏分享弹窗；离页调用 cleanup
QSL.qr.canvas(url, scale=5, maxPixels?) -> HTMLCanvasElement // 本地二维码，按 UTF-8 字节长度自动选择 1–6-L，最多 134 字节；maxPixels 指定整数模块适配的边长上限
QSL.formGroup({ label, input, hint, required }) -> HTML 字符串/元素
QSL.ratioLabel(ratio)                         // "3 : 2"
QSL.bandTone(band) / QSL.modeTone(mode)       // 历史兼容辅助方法，不代表当前 UI 提供波段/模式筛选
QSL.ownerLine(user) -> HTML
QSL.cardThumb(card, {height}) -> HTML
```
分享规则：API 输出的 `shareToken` 为新六位短 token，已有 `shareToken` 时直接复制当前 `location.origin + '/s/' + token`；无 token、有卡片 id 且 `canShare !== false` 时尝试 `GET /api/cards/:id/share`（仅 owner/admin），优先复制响应的完整 URL；失败后回退当前站点的 `/s/<token>` 或 `/card/<id>`。服务端分享 URL 优先使用 `QSL_PUBLIC_ORIGIN`（生产必需 HTTPS），仅非生产未配置时从请求协议与 Host 拼接。分享 token 存在不代表已经审核通过。

详情页分享按钮：精细指针且支持悬浮时，点击直接复制；悬浮或按方向下键展开菜单，Escape 关闭。触屏点击打开选择弹窗。菜单和弹窗提供生成分享图、复制链接、二维码及 QQ / 微信 / X / Threads 入口；可用时显示系统分享。微信快捷打开后需用户粘贴链接，QQ 使用网页分享入口，浏览器可能限制唤起客户端。分享图由本地 Canvas 绘制卡片正面、标题、呼号与相同分享 URL 的二维码，可下载 PNG、长按保存，可用时通过系统发送图片。图片仅从本站加载，不调用第三方图片 / 二维码服务；生成失败会提示，超长 URL 保留复制功能。审核状态与公开访问权限继续由服务端控制。退出详情页关闭弹窗、移除监听并释放图片 Object URL。`qr.js` 与 `card-share.js` 显式加载于 `ui.js` 之后、页面脚本之前。

图标清单（`QSL.icon` 支持）：`heart, share, cards, upload, camera, check, x, close, plus, edit, trash, arrow-right, arrow-left, chevron-down, search, filter, sort, user, users, shield, clock, map-pin, mail, lock, eye, logout, menu, sparkles, flame, globe, radio, antenna, wave, copy, external, refresh, image, info, alert, star, settings, inbox, send, sun, moon, layout, list, grid, download, 3d, flip`（不存在的 name 返回空字符串，不抛错）。

桌面分享菜单悬浮停留 100ms 后展开，鼠标仍停留在分享按钮或菜单上时，点击分享按钮复制链接不会收起菜单（包括复制回退导致临时焦点移出时）；鼠标离开后缓冲 220ms 再收起，即使分享按钮因点击仍保留焦点也会收起；展开和收起均使用 180ms 的透明度 / 轻微位移动画，减少动态效果模式取消动画。键盘方向下键即时展开，离页清理全部等待计时器。分享图采用信笺布局：顶部品牌与邮戳装饰、圆角白边正面图片、独立标题/呼号、底部二维码信息栏和页脚。卡片完整等比显示，不裁切内容；二维码保留完整静区。卡片右下角不叠加徽章，标题下方仅保留“双面 3D 卡片”标注，不放“无需登录”提示或品牌标语；顶部与页脚右下角使用本站 `/assets/logo-mark.svg` 图标。

分享图配色由 `poster-palette.js` 在本地从卡片正面抽样生成，加载于 `qr.js` 后、`card-share.js` 前。采用 Monet 风格流程：64×64 抽样、5-bit RGB 量化、邻近色相占比与感知色度评分，弱化黑白区域与极少量彩色噪声；以 OKLCH 生成同源低饱和背景、容器底色、文字、强调色和分隔线，越界色度压缩至 sRGB。此实现使用 OKLCH，不是 Google CAM16/HCT 的原版实现。所有文字色在渐变两端及容器底色上的 WCAG 对比度均检查为至少 4.5:1，按钮白色箭头也满足该阈值。灰度卡片使用中性色，无图/完全透明/取色不可用时回退站点配色；二维码保持原有深色与白色静区，网站图标及原卡片不改色。不请求外部取色服务，不重复加载卡片图片。

分享图的图片外框随图片实际宽高比调整，在 858×572 的图片区中完整等比居中，使用固定窄边距，不保留横版外框的侧边填充。没有图片时按卡片比例展示占位框。二维码按实际链接选择最小可用版本（1–6，L 级纠错），比较全部八种掩模的连续块、重复定位形状和深浅比例惩罚分；不删减标准纠错、填充位或四模块静区。典型短链接由原先 41×41 降至 25×25 或 29×29 个模块。导出二维码在 245px 上限内使用整数像素模块并居中，避免非整数缩放模糊。

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
- 首页卡片数取 `/api/cards` 返回的 `total`；用户数独立请求 `/api/stats`，统计全库正常状态用户（包括管理员、无呼号和无卡片用户，不计禁用用户），请求失败显示“—”，离页忽略迟到响应。点赞数仍由本次返回的最多 48 张卡片计算，不是全库统计，也不是固定种子数据。
- 演示数据只用于显式启用的开发/测试环境，当前 seed 的卡图为程序生成 SVG；不要求默认展示演示账号、固定数量的申请或待审核卡片。生产禁止演示开关，并检查演示数据及默认管理员密码。

### 收到的换卡申请：同意选卡

点击同意先打开申请者的卡片展柜，仅列出已审核公开卡片，分页全部加载后允许确认。首项“无所谓”默认选中；其余项使用原生单选交互、响应式图片和适应手机的两列布局。选择作为“希望收到的卡片”保存在申请记录中供双方查看，不创建反向申请。发出的申请中，“对方希望收到的卡片”名称链接到 `/card/:id`，与“我的卡片”的“查看”入口一致；无偏好或卡片已不可用时不生成链接。若没有上传任何卡片，仅展示“无所谓”，底部确认再打开三级确认框：“该申请者没有上传卡片哦，请确认是否进行交换”。有上传但暂无公开卡片时单独说明。加载失败可重试，提交时禁止重复操作，服务端复核卡片可用性与无卡确认。嵌套弹窗 Escape 仅关闭顶层，关闭或路由离开清理弹窗和监听并忽略迟到的加载结果；遵循减少动态效果偏好。

## 通联日志

登录后桌面主导航、用户菜单及手机菜单显示“通联日志”，路由 `/dashboard/logbook` 注册为 `logbook` 并使用登录守卫；脚本 `pages/logbook.js` 在 app.js 前显式引入。页面提供 ADI / ADIF 文本及 TQ8 签名文件选择、LoTW 用户名/网站密码一次性导入、导入结果与前 10 条问题、本人日志统计、呼号搜索与 25 条分页。日志时间均为 UTC。普通 HTTP 非 localhost 禁用 LoTW 凭据输入并提示使用 HTTPS；密码提交后及离页清空，不使用本地存储。离页清理事件监听并忽略迟到响应；文件读取后离页不再提交。页面样式限定 `.f-logbook`，手机导入表单单列，表格可横向滚动。空、加载、失败重试状态完整；API 权限由服务端校验。

导入区显示当前账号呼号、TQ8 证书呼号一致的要求和 LoTW 本站呼号要求；未设置呼号时，导航入口正常可用，直接访问日志 URL 也可进入页面；仅页面内“导入文件”和“从 LoTW 导入”按钮使用原生 disabled 禁用，并叠加灰暗滤镜与遮罩，按钮旁通过 QSL.icon('lock') 显示网站统一的 SVG 锁图标，不使用 emoji。页面提供个人资料设置呼号的链接；设置后重新进入恢复按钮。列表、搜索及分页仍可使用。提交处理额外检查呼号，脚本触发表单也不会发起导入请求。服务端限制 ADI / ADIF / TQ8 / LoTW 导入，TQ8 从签名证书提取呼号并验证整批签名，LoTW 从下载记录核对本站呼号；无账号呼号均拒绝；ADI / ADIF 有 STATION_CALLSIGN 字段时须与账号呼号一致（忽略大小写、首尾空白，保留后缀），字段为空或冲突时整批拒绝；缺少字段时以账号呼号补齐。TQ8 和 LoTW 仍在文件呼号不一致时拒绝整批，前端展示错误原因。

文件选择接受 `.adi,.adif,.tq8`，客户端检查后缀及 5MB 上限；ADI / ADIF 以 UTF-8 文本读取并发送 `{adif}`，TQ8 分块字节转 Base64 发送 `{tq8}`，不将二进制按 UTF-8 文本读取。页面说明普通日志以账号设置为本站呼号，TQ8 通过 TQSL“签名并保存供以后上传”生成。来源显示 ADIF / TQ8 / LoTW。页面错误区与文件字段展示 fields.file / adif / tq8，TQ8 签名不显示为 LoTW 已确认。

## 卡片库存

3D 查看器的上传图片选图最低候选宽度为 1280px（回退 src 同样为 `?w=1280`），更大尺寸仍按布局宽度与 DPR 选择，最高 3840px；不改变卡片 CSS 显示尺寸，不放大源图片，也不改变列表缩略图的选图下限。

创建卡片可填写非负整数 stock（上限 2147483647），留空为 null（未设置）。我的卡片增加“库存”操作，独立调用 `QSL.api.cards.updateStock(id, stock)` 保存绝对剩余数量，不改变审核状态；保存时禁用按钮，字段旁显示失败信息，关闭/离页清理弹窗并忽略迟到响应。编辑页的库存框为原生按钮，加载完成后可点击或通过键盘打开与我的卡片相同的 `QSL.openCardStock(card, { isActive, onSaved, onClose })` 弹窗，单独保存库存，无需内容授权确认或重新审核。保存后更新库存框，保留未提交的标题、图片等内容和未保存提示；取消不改库存，失败可在弹窗中重试，离页关闭弹窗并忽略迟到响应，关闭后恢复入口焦点。编辑内容提交始终省略 stock，避免覆盖换卡自动扣减后的数量。首次上传保持直接输入库存并随创建提交。共享卡片缩略图、详情和分享页展示库存；0 库存阻止新申请，已有申请状态继续正常展示。同意申请自动扣减目标卡片 1 张，库存不足由服务端拒绝且保留 pending，申请/完成/拒绝/撤回不扣减。申请者的偏好卡片不扣减。

## 换卡时自主分享通联记录

取消卡片详情的呼号自动匹配、通联提醒弹窗、今日不提醒偏好及自动通联类别；换卡接收方也不再查询自己的日志进行自动判断。通联日志页及 ADI/ADIF/TQ8/LoTW 导入保持可用。

“申请换卡”弹窗提供选填的“附上通联记录”，默认不勾选。完整列出申请人本人日志，可由用户主动按呼号搜索、分页、多选（最多 100 条），跨页和搜索保留勾选，已选区允许取消。每条展示本站/对方呼号、UTC 时间、波段、模式、频率、信号报告、姓名/国家/网格、传播/卫星、来源及 LoTW 确认（有字段才展示）；提示用户这些信息会随申请分享，由双方自行核对。列表不按目标卡片或用户呼号预筛，不自动选中记录。日志为空或加载失败仍可不附日志申请；搜索按钮可重试，离开路由/关闭/切换账号清理监听并忽略迟到响应。

发送 `{ contactLogIds: [...] }`，服务端保存所选记录快照。“收到的申请”“我发出的申请”及同意确认弹窗使用原生 details 展示该申请所附的具体记录；个人中心收到的申请复用 `QSL.exchangeRequest.recordsHtml(exchange)` 展示同一内容。无附件不显示提示，不使用“系统判定有通联”的措辞。正文转义，样式限定 `.f-xreq-log*` / `.f-ex-log*` / `.f-ex-submitted-logs`。不自动审批，不改变地址权限。

选择或拖入图片后，编辑器立即在本地转为长边最多 3840 像素的 WebP，不放大小图；上传区、3D 预览和降级预览，以及最终提交均使用转换结果，分辨率和文件大小仍显示原文件参数。`image-upload.js` 在页面脚本之前显式加载，按 PNG/JPEG/WebP 文件头读取尺寸（JPEG/WebP 的 EXIF 方向参与宽高计算），通过带 resize 参数的 createImageBitmap 解码及 Canvas 编码。支持 Worker / OffscreenCanvas 时使用本站独立 worker，正反面串行处理；不支持时在页面异步转换。转换期间显示处理中并禁用所有提交按钮，失败保留之前已就绪图片并允许重选；离页终止 worker、取消排队任务并忽略迟到响应，释放 bitmap/canvas。转换结果为 WebP 且不超过 8MB 才可使用，不回退上传原图。服务端继续统一转为 WebP，只保存转换结果且不设置输入像素数量上限，保留上传体积和处理并发限制。响应式图片按 CSS 布局宽度和 DPR 选择档位，最高候选宽度为 3840 像素。

后台卡片审核、概览及换卡记录中的正反面缩略图与微缩图统一调用 `QSL.images.attributes`，由实际布局宽度和 DPR 选取 WebP 派生图；3D 弹窗继续通过 `QSL.card3d` 的响应式选图，不在后台拼接原图缩略图。历史图片迁移是显式维护命令，不在应用启动时自动执行。

## 中英文切换

导航栏的 EN / 中文按钮在桌面与手机均可见。`locales/en.js` → `i18n.js` → `core.js` 按此顺序加载，`QSL.t(中文源文案)` 查询 GPT-6-Luna 翻译的英文词典，缺项回退原文。仅对代码中的界面文案调用，不翻译用户内容、公告正文、API枚举值或地址解析规则；HTML 上下文仍需转义。日期和相对时间随语言显示。

未保存手动语言选择时，按 `navigator.languages` 的顺序选择首个支持的中文（`zh` 及其地区/文字变体）或英文（`en` 及其地区变体），并以 `navigator.language` 补充；均不匹配或浏览器未提供语言时回退中文。有效的已保存手动选择（包括中文）优先于自动判断。自动判断及法律页自动跳转不写入偏好存储；显式 `lang` 参数仍可选择并保存新语言。

切换使用当前 URL 的 `lang=en|zh-CN` 参数重新载入（保留路径、其他查询参数和 hash），成功加载后才保存 `qsl_language` 并移除语言参数；取消离页不会保存新偏好。存储被禁用时保留语言参数，当前页面内仍可切换和路由跳转。表单发生编辑后，语言切换先显示确认框；卡片编辑器原有未保存守卫继续生效。

法律页提供 `.html` 中文与 `.en.html` 英文静态版本，`legal/language.js` 根据同一偏好选择版本并提供切换按钮。修订法律文案时必须同步更新两个版本，翻译不改变授权、隐私或审核条件。新增 UI 文案须同步添加 `public/js/locales/en.js`。

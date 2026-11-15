# Vue3 迁移进度 — vue3

> 当前命名规则（2026-11-15）：用户已取消非文档文件/目录/命令的 Vue3 后缀，并将 Vue3 设为默认构建和运行版本。下文早期记录描述当时阶段；当前入口以 [命名标准化](命名标准化-vue3.md) 和 [README](README-vue3.md) 为准。

开始日期：2026-11-13；首轮验证于 2026-11-14 完成。长期分支：`dev-vue3`；分叉基线：`f3289231bb3fd50941980eb146b5e5667095b034`（已执行 fetch 核对）。首轮交付时未提交/发布；2026-11-14 用户进一步授权提交、推送本线并部署测试服 `44381`，初始数据复制自 `44380`。

## 本轮交付 — vue3

| 内容 | 状态 |
| --- | --- |
| 与 `dev` 平级的本地长期分支，迁移指引和后缀约定 | 已建立；不跟踪原 `upstream/dev` |
| 原框架选型报告 | 已从上轮未提交的 `docs/FRONTEND-FRAMEWORK-MIGRATION.md` 移入本目录，修正相对链接；其历史评估基线保留 |
| Vue3 + Vite + TypeScript 构建及锁定依赖 | 已落地，根包 CommonJS 不变 |
| Vue 公开主页 `/space/:uid` | 已迁移：资料/简介、卡片、排序、分页、显示偏好、分享、本人入口、点赞和加载/错误/空状态 |
| 单路由桥接、API/会话适配、请求取消和过期处理 | 已落地；旧外壳继续运行，不启动 Vue Router |
| 头像/卡片组件、响应式图片生命周期 | 已落地，图片选图继续调用原实现 |
| 3D 包装原型 | 已实现并通过模拟引擎生命周期测试；尚未接管详情页面，尚未完成真机对照 |
| 独立多阶段镜像、Compose override、Vue3 CI | 配置已写入；本机 Docker 不可用，未构建/运行容器，远端 CI 未运行 |
| 原生入口 | `npm start` 保留；Vue3 使用 `npm run start` |

首轮构建测得桥接入口约 2.91 KB（gzip 1.51 KB），主页/框架动态块约 77.35 KB（gzip 30.88 KB）。这些只是构建输出，不是端到端加载性能结论；访问其他路由不应加载主页 Vue 块。

## 修改固定入口的登记 — vue3

| 既有文件 | Vue3 改动理由 |
| --- | --- |
| `AGENTS.md` | 优先说明长期分支、后缀和迁移契约入口，避免新 agent 误用临时分支/原生限制 |
| `package.json` / `package-lock.json` | 新增锁定的构建/测试依赖和 `:vue3` 命令，保留既有命令 |
| `.gitignore` | 忽略生成前端、浏览器结果；既有他人 `/.zcode/` 修改原样保留 |
| `.dockerignore` | 将 Vue3 builder 源码和构建脚本列入 Docker 白名单 |
| `server/lib/config.js` | 通过 `QSL_PUBLIC_DIR` 显式选择构建静态根；保留原默认，并禁止数据目录位于任一静态根 |
| `public/js/effects.js` | 旧全局指针/水波纹不写入 Vue 组件子树；旧页面行为保持 |
| `deployment/deploy-dev.sh` | 默认 dev 行为不变；Vue3 包装器复用锁、备份、失败恢复，固定 SHA 与独立资源，支持受控首次部署 |

## 验证记录 — vue3

- 类型检查：`npm run check` 通过。
- 构建：`npm run build` 通过；保留既有 CSS/JS、图片、Worker 与法律页；只改写生成入口。
- 组件/适配：`npm run test:unit`，9 项通过。
- 浏览器：本机 Edge，1440×1000 桌面及 375×812 手机视口，共 6 项通过；覆盖排序、分享关闭、旧详情往返、偏好记忆、迟到响应、不存在主页、旧页面不下载 Vue 页面块、登录态点赞、切换账号及英文页面。首个测试检查无控制台/未捕获异常、无横向溢出并生成截图；已查看桌面/手机截图。
- API 冒烟：`npm test`，138 项通过，0 失败。
- 生产隔离及相关回归：`npm run test:production`，92 项通过，0 失败。
- `git diff --check` 与迁移目录全部相对链接检查通过。
- 独立 CI/Compose YAML 语法解析通过；后续提交/PR 的 `vue3` 后缀检查脚本已接入 CI（分叉基线后 first-parent 历史，不改写导入的原 dev 提交）。
- Docker/Alpine 与 GitHub CI：未运行；本机没有 Docker 命令。手机真机、3D 闪烁、全站首屏对照、P0 未保存表单原型：未完成。

Windows 沙箱中的 PostgreSQL initdb 无法创建所需令牌，本轮改为获准的本机隔离子进程执行；临时目录放在工作区已忽略的 `artifacts/` 中，避免带空格用户临时路径的 initdb 参数问题。测试后停止子进程并清理各次临时实例。

工具依赖核对：Vue Test Utils 锁定 2.4.11，并将其格式化器局部 override 为 `js-beautify@1.14.8`，避免引入新版格式化器的 glob/minimatch 公告依赖链；组件 HTML 格式化及全部测试复验。安装后的 audit 仅剩原有 `exceljs → uuid` 两项 moderate 报告，不在本次框架迁移中强制降级既有 Excel 导出依赖。

## 后续顺序 — vue3

1. 完成真实设备基线与未保存表单原型；记录 3D 包装对照，校准预算。
2. 在已授权的提交/推送后确认本线 CI 和 Linux/Alpine 容器；不要用本机成功替代远端 CI。
3. `/explore` 已完成本地迁移与共享分页/请求逻辑抽取（见下方本轮记录）；通过本轮验收后，进入 P3 首页/公告、详情、分享和账户流程。
4. 新增适配/状态时持续确认只有一个 token、一个路由器和一个 DOM 写入方；尚不需要安装 Pinia/Vue Router。

仍需团队确认的项目：维护者 Vue 熟练度、可投入时间、手机/内置浏览器支持清单、何时启动后续页面阶段及独立 Vue3 测试环境。本轮没有为这些事项创建自动化或远程资源。

## 2026-11-14 发布准备 — vue3

后续鼠标悬浮回归修复：首次迁移隔离了旧 effects 对 Vue 子树的写入，却遗漏 Vue 卡片自身的 `data-tilt` 和指针逻辑，导致主页卡片不再跟随鼠标倾斜。现由 `use-pointer-tilt.ts` 在组件内维护 CSS 角度，按 rAF 合并事件，缓存悬浮时的几何范围；移出、滚动、缩放、失焦和卸载均复位并清理。精确指针与减少动态效果通过媒体查询控制，不向 Vue 响应式状态逐帧写入，也不参与图片选图。已通过类型检查、构建、13 项组件/适配测试及完整浏览器回归（7 项通过，手机项目的鼠标专项跳过）；用户随后明确授权提交并推送到 dev-vue3、更新 44381；实际提交 SHA、CI、镜像与公网验收结果以本次发布记录为准，不复用首次发布的证据。

按后续明确授权新增 GHCR 发布 job、Vue3 部署包装器及一次性数据复制脚本。服务器已只读核实：`44381` 空闲，现有 `44380` 应用与数据库独立运行，源测试服为 development 且 demo=false。新环境采用独立 PostgreSQL 容器/网络/数据卷，保持复制的测试账号与内容，不开启演示账号，不继承邮件和 Webhook 凭据。

部署脚本本地 `bash -n`、类型检查、9 项组件测试及生产构建已重新通过。远端 CI、镜像和实际部署结果必须在本次提交产生后查询，不能使用上述首轮本地验证替代。实际 SHA、CI URL、镜像 digest 和数据快照路径以发布时输出及服务器发布记录为准。

## 2026-11-14 P2 广场本地迁移 — vue3

本轮在用户验收鼠标倾斜修复并要求“进行下一步”后执行。验收基线为已发布的 `57d67ff`；以下验证属于本轮工作区，不表示远端 CI 或测试服已更新。

- 新增 `Explore.vue` 和路由入口，保留呼号搜索（320ms 防抖/输入法组合处理）、最新/最热/最早排序、URL 查询与 hash、分页、加载/空/失败、游客上传跳转和账号相关点赞状态。
- 复用已验收的卡片与鼠标倾斜，补齐原生广场的点赞心跳/彩纸；心跳计时器在卸载或切换账号时清理。公共 CSS 和卡片图片规则保持，图标为本站代码 SVG。
- 抽出 `use-card-collection.ts` 与 `LoadMore.vue`，用于广场和主页。请求带 AbortSignal、实例代次及过期保护；成功后才推进页码；追加失败重试原页；排序/搜索失败保留旧列表，重试第一页并替换；切换账号清空带访问者状态的旧卡片。
- 桥接实现通用化，构建产物不再执行原 `explore.js` 注册；两个页面各自按需加载并共享框架块，`npm start` 的原生对照入口保留。
- 本地类型检查、生产构建、29 项组件/适配测试通过。曾有一次原配置测试在 jsdom 环境超时，已将不依赖 DOM 的配置与服务适配测试标注为 Node 环境后全量复验通过，未放宽超时标准。
- Edge 桌面 1440×1000 与手机视口 375×812：17 项浏览器回归通过，1 项手机鼠标专项按设计跳过。覆盖 25 张合成卡片连续三页无重复、分页失败同页重试、快速搜索与迟到响应、离页防抖清理、查询/hash/历史恢复、新旧详情与主页往返、点赞心跳/彩纸、账号切换和英文控件。已查看两种视口截图，无横向溢出。
- 产物约为：入口 3.48 KB、主页页块 5.97 KB、广场页块 7.55 KB、框架及共享服务块 76.51 KB；均为源码构建后的未压缩大小，不代表实际首屏性能。未改 API、后端或数据库，本轮未重跑后端两套测试，也未做新镜像/真机验收。

以上为本地交付时的验证记录。用户随后明确授权本次提交、推送到 dev-vue3 并部署 44381；发布前基线为已验收的 57d67ff。实际目标 SHA、对应 CI、镜像 digest 和公网验收以本次发布记录为准，不沿用旧运行结果；原有 .gitignore 修改继续保留。

## 2026-11-14 广场滚动续载与返回记忆 — vue3

根据用户提供的广场截图，本轮仅优化 `/explore`；个人主页仍保留原分页操作。

- 正常浏览通过 IntersectionObserver 在接近列表底部时自动加载下一页，不再要求点击“加载更多”；每次追加后重新检查位置，避免一次触发拉完全部页。失败后暂停自动重试，显示可手动操作的重试入口；不支持观察器的浏览器保留可键盘操作的加载按钮。去除自动追加时的逐页 toast，新增提示同步英文词典。
- 从卡片详情经浏览器返回/前进或面包屑返回，可恢复已加载列表、呼号、排序及卡片锚点对应的滚动位置。新访问从顶部开始，不与历史访问串用；用户滚动、触摸或键盘操作会停止尚未完成的自动定位。
- 记忆仅为当前标签页的短时内存快照，history.state 只写访问 ID，最多四次访问、十分钟；不把卡片快照、账号信息或令牌写入浏览器持久存储。账号变化清空全部快照。缓存只保留允许的公开展示字段，并在返回后复核已加载各页，移除已撤下的卡片、更新点赞等访问者状态；复核失败时旧卡片保持不可交互，可手动重试。
- 固定文件变更：`public/js/core.js` 仅向页面上下文新增可选 `navigation` / `fromPath` 信息，仍由原路由管理历史；`public/js/locales/en.js` 补充滚动提示翻译。未改 API、权限、数据库或部署配置。
- 本地类型检查、构建与 41 项组件/适配测试通过。Edge 桌面 1440×1000、手机视口 375×812 的完整回归为 23 项通过、1 项手机鼠标专项按设计跳过；覆盖多页续载、失败不自动重试、深位置返回/前进、详情面包屑恢复、独立新访问、已撤卡片复核、账号失效、搜索排序与原有主页功能。已查看恢复到第二页深位置的桌面/手机截图。
- 观察器、窗口监听、rAF 和请求均随页面卸载清理；本轮未做 Android/iOS 真机或新镜像验证。

上述为本地交付时的验证记录。用户随后明确授权本次提交、推送到 dev-vue3 并更新 44381；发布前基线为 f63a1b2。本次发布必须重新核对完整 SHA 的 CI、镜像和公网返回位置恢复，具体结果以本次发布记录为准。原有 .gitignore 修改保留，不混入提交。

## 2026-11-14 赛事子系统本地迁移 — vue3

按用户选择完成赛事介绍及备用布局、报名、作品列表、作品详情/投票和评委工作台的 Vue 页面，保留原 API、角色/所有权、审核与评分规则。未迁管理后台配置/审核/导出，也未切换全站路由器。范围、权限边界和详细证据见 [赛事迁移验收](赛事迁移验收-vue3.md)。

本轮本地类型检查和构建通过；56 项组件/适配测试通过；完整浏览器回归 29 项通过、1 项按设计跳过；原 API 冒烟 138 项、生产隔离及相关回归 92 项通过。已验证真实报名、审核、不可撤回投票、受保护图片、零分保存、完成后改分及撤权清空；既有广场和主页回归保持通过。

现有路径变更登记：`client/src/entry.ts` 注册按需赛事页面；`contracts.ts` 仅扩展客户端类型；`Card3DViewer.vue` 接入原引擎并尊重减少动态效果；`tools/build.mjs` 替换生成入口中的对应旧页面脚本并更新路由清单。`public/` 原脚本、共享后台评审辅助及后端均保留；原生 `npm start` 对照入口可用。

以上为本地交付时的证据。用户随后明确授权提交、推送本次赛事迁移并部署 44381，发布前版本为 76939a7。应以本次完整 SHA 的 CI、镜像和实际公网验收记录为准；原有 .gitignore 修改不纳入提交，真机验收仍独立记录。

## 2026-11-14 P3 首页及用户端公告本地迁移 — vue3

基于 `199e568` 完成首页 `/` 及用户端公告（浮层提醒 + “公告板 · 查看全部”弹窗）的 Vue3 迁移；未迁移管理后台公告编辑，未改动赛事动态、全站导航/页脚、路由器、鉴权或数据库。原生 `public/js/pages/home.js` 保留用于 `npm start` 对照。

- 新增 `Home.vue`、`HomeAnnouncements.vue` 及按需入口 `home-entry.ts`：复用原 3D 引擎（低频参数更新不重建查看器）、`CardTile.vue`、`Dialog.vue` 与 `Icon.vue`；保留 `/api/cards?sort=popular&limit=48`、`/api/stats` 独立用户数（失败显示“—”）、最多 48 卡点赞统计、Hero 首张有正图卡片与自有比例（空库使用品牌占位）、精选与加入区选图、FAQ 动效及 `prefers-reduced-motion`、登录态 CTA、直接及跨页锚点定位。
- 用户端公告浮层与公告板完整保留 `displaySeconds`（1–3600，默认 30 秒）、悬停/焦点/页面隐藏/toast 遮挡/保存期间暂停且不扣减暂停时长、toast 暂隐与恢复、长正文滚动、弹窗开启时不抢占 Escape、关闭焦点回退、`POST /api/announcements/:id/dismiss` 防重与失败重试、游客跳转登录、账号切换中止旧请求、公告板 8 条分页与失败保留、纯文本转义及 `publishedAt` 展示；全部请求带 `AbortSignal` 及代次保护，离页清理定时器、观察器与监听。
- 固定文件变更：`public/js/locales/en.js` 补充 `首页加载失败` 英文词条；`tools/build.mjs` 移除生成入口中的 `home.js` 并在 `migration.json` 登记 `/`；`client/src/bridge.ts`、`entry.ts`、`contracts.ts`、`services.ts`、`Icon.vue` 接入首页按需加载与服务适配；`client/e2e/space.spec.mjs` 调整原“原生首页不加载 Vue”用例为验证 `/` 仅加载首页块、未迁原生路由（`/login`）不加载 Vue 页面块。
- 本地验证：`npm run check`、`npm run test:unit`（16 个文件共 64 项，含新增首页 4 项与公告 4 项）、`npm run build` 通过；Edge 桌面 1440×1000 与手机 375×812 浏览器回归共 36 项（35 项通过，1 项手机鼠标悬浮按设计跳过），含新增 `home.spec.mjs` 6 项，并已查看桌面/手机全页截图。未运行后端 `npm test` / `npm run test:production`（未改后端）、Docker 构建、真机测试或远端 CI。
- 后续补充恢复首页动效（保持 `[data-vue3="home"]` 隔离、不由原生 `effects.js` 改写 Vue DOM）：新增 `use-scroll-reveal.ts`（`[data-vue-reveal]` / `[data-vue-reveal-delay]`、IntersectionObserver + rAF + 1100ms 视口兜底、无 IO 或 `prefers-reduced-motion` 自动解除隐藏）、`use-count-up.ts`（900ms 三次缓出递增、未知值保持“—”不动画成 0、同值不重播、减少动态效果直接落地）、`use-magnetic.ts`（仅精细指针与非减少动态效果下写入 `style.translate`，不覆盖 `transform`，触屏/离开/滚动/缩放/失焦/卸载复位）；同步更新 `Home.vue` 与 `home.test.ts`、`home-animations.test.ts`、`home.spec.mjs`。
- 补充验证：`npm run check`、`npm run test:unit`（17 个文件共 70 项，含新增 `home-animations.test.ts` 6 项）、`npm run build` 通过；本机 Edge 完整 `npm run test:e2e` 共 38 项（37 项通过，1 项手机鼠标倾斜专项按设计跳过，`test-results/.last-run.json` 为 `passed`），覆盖桌面与 375px 手机视口、统计落地与未知保持“—”、滚动入场、磁吸悬停与触屏降级、`prefers-reduced-motion`、控制台零错误及无横向溢出。
- 当前处于本地未提交、未推送、未部署状态，原有 `.gitignore` 未提交修改继续保留。

## 2026-11-14 P3 普通卡片详情及公开分享页本地迁移 — vue3

基于工作区既有首页/公告未提交修改，完成 `/card/:id`（`card-detail`）与 `/s/:token`、`/share/:token`（`share`）的 Vue3 迁移；未修改后端 API/权限，未迁移换卡管理、上传编辑器、登录注册或后台。原生 `public/js/pages/card-detail.js` 与 `share.js` 保留用于 `npm start` 对照。

- 新增 `CardDetail.vue` / `card-detail-entry.ts`、`Share.vue` / `share-entry.ts`、`CardShareButton.vue`（原生 DOM 岛承载 `QSL.cardShare.bind`，仅随分享相关字段变化重绑，点赞与无关重渲染不触发重绑）及 `use-exchange-request.ts`（统一处理延迟重试取消与卸载/切号/失权弹窗关闭）。
- 详情页保留面包屑、资料、3D 查看器（`width: 430`，点赞/状态更新不重建查看器）、本人/pending/approved/不可申请/rejected/cancelled 状态、点赞防重与迟到保护、最多 4 张去重推荐（失败独立且可中止）及防离页迟到改写 `document.title`。
- 公开分享页保留大小写敏感 `/api/public/cards/:token` 请求（不以普通详情或缓存绕过 404）、3D 查看器（`width: 480`）、手机端紧贴查看器的游客 CTA、本人复制/编辑入口、pending/approved 与零库存/`canApply=false` 非可执行状态提示。
- 固定文件变更：`public/js/pages/exchanges.js` 最小兼容增强 `QSL.exchangeRequest.open(card)` 防止重复弹窗并返回 `{ close() }` 句柄（旧调用方兼容）；`public/js/locales/en.js` 补充加载与不可申请英文词条；`tools/build.mjs` 移除生成入口中的 `card-detail.js` / `share.js` 并更新 `migration.json`；`client/src/bridge.ts`、`entry.ts`、`contracts.ts`、`services.ts`、`Icon.vue`、`contest/contracts.ts`、`contest/services.ts`、`contest/mount.ts` 接入按需加载与类型适配；`client/e2e/space.spec.mjs` 补充检查未迁页面不加载 `card-detail-entry` / `share-entry`。
- 本地验证：`npm run check`、`npm run test:unit`（19 个文件共 78 项，含新增 `card-detail.test.ts` 5 项、`share.test.ts` 2 项及 `services.test.ts` 1 项）、`npm run build` 通过；本机 Edge 完整 `npm run test:e2e` 共 44 项（43 项通过，1 项手机鼠标悬浮按设计跳过，`test-results/.last-run.json` 为 `passed`），含新增 `card-detail-share.spec.mjs`（桌面与 375px 手机视口、3D 翻面选图稳定与点赞不重建、推荐去重、游客跳转、分享岛清理、大小写敏感 token、404、`prefers-reduced-motion`、英文界面、零未捕获异常与无横向溢出）。
- 未验证项：未运行后端 `npm test` / `npm run test:production`（未改后端接口与权限）、Docker 构建、真机测试及远端 CI；保持本地未提交、未推送、未部署，原有 `.gitignore` 与首页修改均已保留。

## 2026-11-14 P3 登录与注册页本地迁移 — vue3

基于工作区既有首页/公告、卡片详情/分享页与 `.gitignore` 未提交修改，完成 `/login`（`login`）与 `/register`（`register`）的 Vue3 迁移；未修改后端认证、验证码、限流、法律同意规则或数据库，未引入 Vue Router/Pinia 或第二套 token 存储。原生 `public/js/pages/login.js` 与 `register.js` 保留用于 `npm start` 对照。

- 新增 `Login.vue` / `login-entry.ts`、`Register.vue` / `register-entry.ts`、`AuthBrandVisual.vue`（共享品牌视觉区）与 `use-auth-session.ts`（统一处理认证请求 `AbortSignal`、防重、离页中止、外部会话变更隔离、缺少 `user` 时通过 `/api/auth/me` 补取及回滚保护，避免将自身 `setUser` 误判为外部切换）。
- 长度边界与实际服务端校验对齐（`server/lib/validate.js`）：`displayName` 上限由原前端 40 调整为服务端硬边界 30 字符（`Array.from` 计数）；`password` 上限由原前端 128 调整为服务端硬边界 200 字符（`Array.from` 计数）；移除登录密码、注册密码、确认密码与昵称上与服务端 Unicode 码点计数不一致的原生 `maxlength` 属性，避免含 emoji 等多字节字符时静默截断；邮箱输入防抖保留原 `register.js` 实测实现（100ms）。条款版本核对为 `2026-10-25`，法律同意默认不勾选，确认密码仅作客户端校验不提交。
- 固定文件变更：`public/js/core.js` 加固 `safeNext`（拒绝反斜杠、`/\`、`/%5c` 及异常目标，保留合法站内查询参数与锚点）；`public/js/locales/en.js` 补充 `昵称不能超过 30 个字符`、`密码不能超过 200 位`、`获取用户信息失败，请稍后重试` 及按需加载/错误英文词条；`tools/build.mjs` 移除生成入口中的 `login.js` / `register.js` 并在 `migration.json` 登记 `/login` 与 `/register`；`client/src/bridge.ts`、`entry.ts`、`contracts.ts`、`services.ts`、`Icon.vue`、`contest/contracts.ts` 接入认证按需加载、图标与服务适配；`client/e2e/space.spec.mjs` 将原“未迁移路由不加载 Vue 页面块”断言改用 `/dashboard`（先登录满足守卫）并补充验证 `/login` 仅加载 `login-entry-vue3`。
- 本地验证：`npm run check`、`npm run test:unit`（21 个文件共 88 项，含新增 `login.test.ts` 6 项、`register.test.ts` 3 项，覆盖 `/api/auth/me` 补取失败回滚临时 token 与跨会话隔离）、`npm run build`、`git diff --check` 通过；本机 Edge 完整 `npm run test:e2e` 共 50 项（49 项通过，1 项手机鼠标倾斜按设计跳过，`test-results/.last-run.json` 为 `passed`），含新增 `auth.spec.mjs`（登录校验/错误/限流/网络失败/重试/演示账号填入/键盘提交、安全 `next` 校验与互跳、游客守卫、邮箱验证码展开/前导零/60 秒冷却/切邮箱迟到保护/503 失败处理、注册离页中止、含 emoji 长密码与 30 字符昵称真实输入不被截断、补取 `/api/auth/me` 失败回滚 token、英文界面、`prefers-reduced-motion`、桌面与 375px 手机布局、零控制台异常与无横向溢出；浏览器验证码流程使用 API mock）。
- 未验证项：未运行后端 `npm test` / `npm run test:production`（未改后端接口与权限）、真实邮件投递、Docker 构建、真机测试及远端 CI；保持本地未提交、未推送、未部署，工作区全部既有修改均已保留。

## 2026-11-14 P3 个人中心与个人资料本地迁移 — vue3

基于工作区既有首页/公告、卡片详情/分享、登录/注册及 `.gitignore` 未提交修改，完成 `/dashboard`（`dashboard`）与 `/dashboard/profile`（`profile`）的 Vue3 迁移；未迁移我的卡片、上传编辑器、换卡中心、通联日志或管理后台，未修改后端接口、权限或数据库。原生 `public/js/pages/dashboard.js` 与 `profile.js` 保留用于 `npm start` 对照。

- 新增 `Dashboard.vue` / `dashboard-entry.ts`、`Profile.vue` / `profile-entry.ts`、`profile-utils.ts`（纯函数地址解析 `parseShippingAddressVue3`、区县合并 `addressCityVue3`、Unicode 码点校验及嵌套错误映射）。
- 个人中心 `/dashboard`：保留登录守卫、问候/日期/头像/加入时间、`/api/me/overview` 真实统计字段（`useCountUpVue3`）、仅 `pending` 过滤的最多 3 条待处理申请、最近卡片状态徽章（`CardTile.vue` 可选 `showStatus` 参数，公共页默认关闭）、评委入口（仅 `canJudgeContest === true && role === 'user'`）与管理员入口权限隔离，以及与当前换卡中心契约对齐的同意审批弹窗（分页拉取申请者卡片、无卡片二次确认、`APPLICANT_HAS_NO_CARDS`/`OUT_OF_STOCK` 处理、防重与非乐观更新）和拒绝理由弹窗（Unicode 200 字符计数）。
- 个人资料 `/dashboard/profile`：保留三个独立表单（基本资料、寄送地址、修改密码），对齐 `server/lib/validate.js` Unicode 码点边界并移除提前截断 emoji 的 `maxlength`；地址解析仅本机运行、只填空字段且避免重复拼接区县；`/api/me/profile` 写入串行队列与 `writeEpoch` 防止跨表单或迟到 `overview` 回退全局用户状态；保存期间继续编辑不丢失草稿，同账号 `auth` 刷新不覆盖草稿，登出/切号立即中止请求并清空所有私有状态；`updatePassword` 传 `skipAuthClear: true`，避免当前密码错误（401 `INVALID_CREDENTIALS`）误触发前端登出。
- 固定文件变更：`client/src/components/Icon.vue` 补充个人中心与资料所需图标；`client/src/components/CardTile.vue` 新增可选 `showStatus` 参数；`client/src/contracts.ts`、`services.ts`、`bridge.ts`、`entry.ts` 接入按需加载与服务适配；`public/js/locales/en.js` 补充加载与校验英文词条；`tools/build.mjs` 移除生成入口中的 `dashboard.js` / `profile.js` 并登记 `/dashboard` 与 `/dashboard/profile`；`client/e2e/space.spec.mjs` 改用 `/dashboard/cards` 作为未迁移路由懒加载断言。
- 本地验证：`npm run check`、`npm run test:unit`（24 个文件共 103 项，含新增 `profile-utils.test.ts` 4 项、`dashboard.test.ts` 4 项、`profile.test.ts` 6 项及 `services.test.ts` 1 项）、`npm run build`、`git diff --check`、`node --check public/js/locales/en.js` 通过；本机 Edge 完整 `npm run test:e2e` 共 54 项（53 项通过，1 项手机鼠标倾斜按设计跳过，`test-results/.last-run.json` 为 `passed`），含新增 `dashboard-profile.spec.mjs` 桌面与 375px 手机用例（其中 `OUT_OF_STOCK` 与 `reject` 流程使用 API mock，基本资料保存、emoji 输入、错误密码与登出清理走隔离临时库真实后端链路）。
- 未验证项：未运行后端 `npm test` / `npm run test:production`（未改后端接口与权限）、Docker 构建、真机测试及远端 CI；保持本地未提交、未推送、未部署，工作区既有修改均已保留。

## 2026-11-14 P3 我的卡片、库存管理与上传编辑器本地迁移 — vue3

基于工作区既有迁移未提交修改与 `.gitignore` 修改，完成 `/dashboard/cards`（`my-cards`）、`/dashboard/cards/new` 与 `/dashboard/cards/:id/edit`（`card-editor`）及共用库存弹窗的 Vue3 迁移；未迁移换卡中心、通联日志或管理后台，未修改后端接口、审核、库存、授权或参赛规则。原生 `public/js/pages/my-cards.js` 与 `card-editor.js` 保留用于 `npm start` 对照。

- 新增 `MyCards.vue` / `my-cards-entry.ts`、`CardEditor.vue` / `card-editor-entry.ts`、`CardStockDialog.vue` 与 `card-manage-utils.ts`（Unicode 码点计数、库存整数校验、图片类型与 8MB 校验、比例整数校验）。
- 我的卡片 `/dashboard/cards`：保留登录守卫、`GET /api/me/cards`、`status` 查询参数与四态筛选计数、加载/空状态/失败重试、拒绝原因与待审核提示、分享调用、危险删除确认（取消/失败保留/成功后更新计数），以及与账号切换、离页一致的 AbortSignal 和代次隔离；不将本人未公开卡片写入公共缓存。
- 独立库存管理 `CardStockDialog.vue`：我的卡片与编辑器共用，`PUT /api/cards/:id/stock` 仅发送 `number | null`（留空为 `null`，`0` 保留为无库存），校验 0–2147483647 整数，保存成功不更改审核状态、拒绝原因或内容授权；在编辑器中仅更新库存状态，不覆盖表单草稿、不清除内容 `dirty` 状态，且编辑保存 `PUT /api/cards/:id` 始终省略 `stock`。
- 上传与编辑器：对齐 `server/lib/validate.js` Unicode 码点硬边界（标题 60、呼号 20、简介 300、参赛说明 1–2000），移除提前截断 emoji 的 `maxlength`；通过服务适配复用 `QSL.imageUpload.createProcessor()`（Worker/OffscreenCanvas 与降级路径、串行队列、每面版本与实例/账号隔离、失败保留已就绪图片、离页 `destroy()`）；复用 `Card3DViewer.vue` 仅在图片/比例变化时更新；每次提交均需主动确认条款（`termsVersion: "2026-10-25"`）与内容授权；接入 `GET /api/contests/qsl-design-2026-11/entry` 名额检查、2 件上限与参赛说明草稿弹窗；编辑模式校验 `isOwner` / `owner.id` 并提供 404/权限/网络失败明确提示与返回入口。
- 固定文件变更：`public/js/core.js` 新增轻量 `QSL.router.setLeaveGuard` 支持 `QSL.navigate` 与浏览器前进/后退 `popstate` 未保存确认并同步 `currentFullUrl`（在 `history.state` 上维护内部 `_qslIdx` 索引并以受控 `history.go` 恢复/跳转，保留原历史条目、`history.state` 与前进栈）；`public/js/locales/en.js` 补充 60/20/300 字符上限及加载/图片处理英文词条；`client/src/components/Icon.vue` 补充 `trophy`/`trash`/`arrow-left`/`external`/`image`；`client/src/components/Card3DViewer.vue` 支持可空 `front`/`back` 与引擎降级插槽；`client/src/contracts.ts`、`services.ts`、`bridge.ts`、`entry.ts` 接入服务适配与按需入口；`tools/build.mjs` 移除生成入口中的 `my-cards.js` / `card-editor.js` 并在 `migration.json` 登记三条路由；`client/e2e/space.spec.mjs` 改用 `/dashboard/exchanges` 作为未迁移路由懒加载断言。
- 本地验证：`npm run check`、`npm run test:unit`（27 个文件共 117 项，含新增 `card-manage-utils.test.ts` 4 项、`my-cards.test.ts` 5 项、`card-editor.test.ts` 5 项）、`npm run build`、`git diff --check`、`node --check public/js/core.js` 与 `node --check public/js/locales/en.js` 通过；本机 Edge 完整 `npm run test:e2e` 共 60 项（59 项通过，1 项手机鼠标倾斜按设计跳过，`test-results/.last-run.json` 为 `passed`），含新增 `my-cards-editor.spec.mjs` 3 项（桌面与 375px 手机视口、真实登录/创建/WebP 转换/库存独立保存/编辑省略 `stock`/非本人禁止编辑/404/删除/浏览器后退未保存守卫/干净页面后退再前进与取消离开、确认离开、多步 `history.go(-2)` 及 `history.state` 保留/自动参赛说明/英文与 `reduced-motion`）。
- 未验证项：未运行后端 `npm test` / `npm run test:production`（未改后端接口与权限）、Docker 构建、真机测试及远端 CI；保持本地未提交、未推送、未部署，工作区既有修改均已保留。

## 2026-11-14 P3 换卡申请、交换管理与通联日志本地迁移 — vue3

- **迁移范围**：
  - 跨页面换卡申请弹窗与兼容桥接（`QSL.exchangeRequest.open(card)` 同步返回 `{ close() } | null` 且支持取消未完成的懒加载与挂载、`QSL.exchangeRequest.recordsHtml(ex)` 兼容原生后台）。
  - `/dashboard/exchanges`（页面名 `exchanges`）：收到/发出切换与 ResizeObserver 滑块、状态筛选与查询参数同步、审批/拒绝共享弹窗（同步复用至 `Dashboard.vue`）、撤回与双方标记完成、严格按服务端结果控制地址可见性与复制、`preferredCard` 链接与不可用快照容错、`selectedContactLogs` 展示。
  - `/dashboard/logbook`（页面名 `logbook`）：呼号锁定与同账号资料更新即时解锁、UTC 时间列表与统计、呼号搜索/分页（仅成功后提交页码）与错误重试、UTF-8 `.adi/.adif` 解码、二进制分块 Base64 `.tq8` 编码、LoTW 仅 HTTPS/本机回环限制与凭据清理、文件与 LoTW 共享提交锁。
  - 构建入口 `tools/build.mjs` 移除旧 `exchanges` / `logbook` 页面脚本并标记 `/dashboard/exchanges`、`/dashboard/logbook` 为已迁移路由；`/admin` 仍保留原生实现。
- **新增 / 修改文件**：
  - 新增：`client/src/exchange-utils.ts`、`client/src/components/ExchangeContactLogs.vue`、`client/src/components/ExchangeApproveDialog.vue`、`client/src/components/ExchangeRejectDialog.vue`、`client/src/components/ExchangeRequestModal.vue`、`client/src/exchange-request-entry.ts`、`client/src/exchange-request-bridge.ts`、`client/src/pages/Exchanges.vue`、`client/src/exchanges-entry.ts`、`client/src/pages/Logbook.vue`、`client/src/logbook-entry.ts`；新增单测 `client/tests/exchange-request.test.ts`、`client/tests/exchanges.test.ts`、`client/tests/logbook.test.ts`；新增 E2E `client/e2e/exchanges-logbook.spec.mjs`。
  - 固定/既有文件修改：`client/src/contracts.ts`、`client/src/services.ts`、`client/src/pages/Dashboard.vue`、`client/src/bridge.ts`、`client/src/entry.ts`、`tools/build.mjs`、`public/js/locales/en.js`、`client/e2e/space.spec.mjs`（将懒加载校验切换至未迁移路由 `/admin`）。
- **本地验证**：
  - `npm run check` 通过（0 errors）。
  - `npm run test:unit` 通过（30 个测试文件、130 项单元测试全部通过，含新增 `services.test.ts` 静默地址保存迟到 401/会话切换取消与 `logbook.test.ts` 失败搜索/翻页重试校验）。
  - `npm run build` 通过（生成 `dist-public/build/` 产物）。
  - `$env:QSL_BROWSER_CHANNEL = 'msedge'; npm run test:e2e`（两项补丁修复前完整运行 61 项通过、1 项移动端悬停倾斜按设计跳过、`test-results/.last-run.json` 为 `passed`；补丁修复后复跑 `exchanges-logbook.spec.mjs` 时 `tools/serve-test.mjs` 临时库/服务启动超时未能进入浏览器用例）。
  - `git diff --check` 与 `node --check public/js/locales/en.js` 通过。
- **未验证项**：未运行后端 `npm test` / `npm run test:production`（未改动服务端代码与权限规则）、真实签名 `.tq8` 文件端到端上传、真实 ARRL LoTW 凭据联调、Docker 构建、真机测试及远端 CI；保持本地未提交、未推送、未部署，工作区既有修改均已保留。

## 2026-11-14 公共外壳、Toast/弹窗兼容桥接与背景引擎 Vue3 迁移 — vue3

- **迁移范围**：
  - 全站启动与外壳接管（`client/src/shell-entry.ts`、`AppShell.vue`）：替代动态加载 `/js/app.js`，挂载独立 `data-vue3="shell-root"` 宿主，保留 `QSL.boot`、`QSL.router.start()`（增加幂等保护）及原生 `#app` 与 `/admin` 路由。
  - 导航与页脚（`SiteHeader.vue`、`SiteFooter.vue`）：桌面导航、用户下拉菜单（头像、昵称/呼号、待处理角标 `>99` 显示 `99+`、严格 `role === 'admin'` 才展示后台入口）、手机导航、赛事三项子导航与深链保留、防竞态退出（`POST /api/auth/logout` 带 `{ skipAuthClear: true }` 并校验 token/user 未被新会话替换）、`QSL.footerBuildText(config.build)` 构建元数据与法律链接、复用 `QSL.i18n.switchLanguage()`。
  - Toast 与通用弹窗兼容（`toast-store.ts`、`ToastHost.vue`、`modal-stack.ts`、`modal-bridge.ts`、`ModalDialog.vue`）：同步返回 `QSL.toast` 关闭函数（纯文本转义、幂等 `close`、#toast-root `.toast` 兼容 `HomeAnnouncements.vue` 暂停/恢复）；同步返回 `QSL.modal(options)` 的 `{ el, body, close }`（`.modal-body` DOM 岛隔离、异步动作锁、抛错/`false`/`closeOnClick: false` 保留开启、幂等 `close`/`onClose`）；`QSL.confirm` 返回 `Promise<boolean>`；与 `Dialog.vue` 共享 `modal-stack.ts` 统一顶层 `z-index`、Escape、Tab 焦点循环及 `body.modal-open`。
  - 背景与全局动效（`FxBackground.vue`、`public/js/effects.js`）：`#fx-layer` 由 Vue 组件接管生命周期（Canvas 粒子、DPR、`visibilitychange`、`prefers-reduced-motion`、移动端 3D 静态降级 `.is-static-card-scene`）；`effects.js` 通过 `externalBackground: true` 跳过重复背景引擎并忽略 `[data-vue3]` 子树，保留 `enhance`/`confetti`/`heartbeat`/`pageTransition` 供原生 `/admin` 使用。
- **DOM 所有权与启动顺序**：
  - `#site-header`、`#site-footer`、`#toast-root`、`#modal-root`、`#fx-layer` 由 Vue 外壳通过 Teleport / `render()` 管理；`#app` 仍完全由 `QSL.router` 与各页面桥接/原生 `/admin` 管理，Vue 外壳不替换或清空 `#app`。
  - 启动顺序：`entry.ts` 注册按需页面并调用 `bootShellVue3(window.QSL)` -> 注入 `QSL.toast`/`modal`/`confirm`、以 `{ externalBackground: true }` 初始化 `QSL.fx`、挂载 `AppShell-vue3` -> 异步执行 `QSL.boot()` -> `QSL.emit('auth', ...)` -> `QSL.router.start()`（仅首次生效）。
- **新增 / 修改文件**：
  - 新增：`client/src/shell-entry.ts`、`client/src/components/AppShell.vue`、`client/src/components/SiteHeader.vue`、`client/src/components/SiteFooter.vue`、`client/src/components/FxBackground.vue`、`client/src/toast-store.ts`、`client/src/components/ToastHost.vue`、`client/src/modal-stack.ts`、`client/src/modal-bridge.ts`、`client/src/components/ModalDialog.vue`；新增单测 `client/tests/shell.test.ts`、`client/tests/toast-modal.test.ts`；新增 E2E `client/e2e/shell.spec.mjs`。
  - 固定/既有文件修改：`public/js/core.js`（`refreshUser` token 校验与 `router.start` 幂等守卫）、`public/js/effects.js`（`externalBackground` 开关与 `[data-vue3]` 跳过）、`client/src/contracts.ts`、`client/src/entry.ts`、`client/src/components/Icon.vue`、`client/src/components/Avatar.vue`、`client/src/components/Dialog.vue`（接入 `modal-stack.ts` 及卸载后 `syncBodyModalOpenVue3`）、`tools/build.mjs`（登记 `shell: 'vue3'`）、`client/e2e/space.spec.mjs`（校验未加载 `/js/app.js` 及 `/admin` 仅加载外壳/运行时块而不提前加载业务页面块）。
- **本地验证**：
  - `npm run check` 通过（0 errors）。
  - `npm run test:unit`（`vitest run --config client/vitest.config.mjs`）通过：32 个测试文件、141 项单元测试全部通过（含新增 `shell.test.ts` 5 项与 `toast-modal.test.ts` 6 项，覆盖按需 `.card3d` 挂载触发手机静态背景降级，以及首帧前关闭 `openModalVue3`/`confirmModalVue3` 取消入场帧不重现）。
  - `npm run build` 通过（138 modules transformed，生成 `dist-public/build/`）。
  - `$env:QSL_BROWSER_CHANNEL = 'msedge'; npm run test:e2e` 通过：66 项测试中 65 项通过、1 项按设计跳过（移动端 `space.spec.mjs` 鼠标悬停倾斜），含新增 `shell.spec.mjs` 桌面与手机视口全部通过。
  - `git diff --check`、`node --check public/js/core.js`、`node --check public/js/effects.js` 通过。
- **未验证项**：未运行后端 `npm test` / `npm run test:production`（未修改服务端接口与权限）、未执行真机触控与远端 CI；保持本地未提交、未推送、未部署，工作区既有修改均已保留。

## 2026-11-14 全站 Vue Router 4、Pinia 与 QSL 兼容层收口 — vue3

- **依赖与唯一所有权**：
  - 精确锁定 `vue-router@4.6.5` 与 `pinia@3.0.4`，均放在 devDependencies，与 Vue/Vite 的构建期归属一致；未升级其他依赖，optional 包保留。
  - Vue 构建环境只创建一个 `createWebHistory()` Router 和一个 Pinia。Router 迁移完整 SPA 路由表并负责真实页面挂载、浏览器历史、守卫、滚动与标题；`#app` 由 RouterView 独占。
  - Pinia 是 `user`、`config`、`booted/ready`、`loading/error` 的唯一数据源。`QSL.state` 改为 getter/setter 兼容视图，不复制状态；`QSL.setUser`、session boot/refresh 与原生直接赋值最终进入同一组 store action。
  - token 仍只由 `QSL.api` 的闭包和 `qsl_token` 存储维护，Pinia 不保存 token，也未新增持久化键。`QSL.api.setToken` 仅通知 store 记录 token/session 版本。
  - 用户身份版本 `accountVersion` 驱动受保护页在切号时重挂；`userRevision` 和会话快照隔离旧 refresh 结果。单纯的临时 token 写入不会重挂登录页，避免 `/auth/me` 失败时丢失错误提示。同账号资料更新不重建草稿页面。
- **启动、路由与事件顺序**：
  - `entry.ts` 只注册申请弹窗桥接和账号缓存清理；`bootShellVue3()` 依次创建 Pinia、状态桥、Router 运行时和会话运行时，然后挂载单一 AppShell。初始导航等待 session ready；完成后调用幂等 `QSL.router.start()` 并发出一次 `router:ready`。
  - Router 迁移首页、广场、公开主页、详情、两种分享 token、登录注册、个人中心/资料/卡片/编辑器、换卡、通联日志、全部赛事路径、`/admin` 和 404；独立法律 `.html` 继续静态访问。
  - 已迁移路由直接按需加载真实 Vue 页面组件。`/admin` 路由只授权给管理员后挂载 `LegacyPageHost`，调用注册的 `render()` 并在离路由时执行 cleanup；原生后台业务未迁移。
  - 守卫顺序为：等待会话初始化 -> 对离页导航先执行统一 leave guard -> auth/guest 判定 -> 接受导航并发出 `route:before`。取消确认时不卸载页面、不执行成功离页事件；接受后在 Router `afterEach` 发出 `route`，真实页面挂载后再发出 `route:rendered` / `route:after`。
  - `QSL.navigate` 返回 honest async 结果，支持 replace/keepScroll；`goBack`、`currentPath`、`setQuery`、`scrollToHash`、`router.current/render/start/setLeaveGuard` 都转发到同一 Router。同 URL 的显式导航通过运行时版本重挂页面，query 导航只更新参数，hash-only 不重建表单。
- **历史、滚动与浏览器行为**：
  - 停用 Vue 构建中的旧 popstate、链接拦截、`_qslIdx` 与 suppress 逻辑；旧 `core.js` 的索引只在原生 `router.start()` 时初始化，Vue 启动阶段不再写旧历史字段。
  - Vue Router 保留自己的 `back/current/forward/position/replaced/scroll` 字段；广场访问 ID 继续通过保留字段的 `replaceState` 写入。E2E 同时验证业务 marker、访问 ID 与 Router 字段共存。
  - pop/forward、多步 history、取消确认和页面恢复使用 Router 正式能力。广场继续自行恢复筛选、已加载页、锚点与滚动，并使用复核缓存；新访问从顶部开始。
  - hash 定位等待目标真实出现，使用布局坐标和 sticky offset；用户滚动、触摸、指针或键盘操作会取消迟到定位，`prefers-reduced-motion` 使用即时定位。
- **固定/既有文件与兼容修正**：
  - 新增 `client/src/router.ts`、`session.ts`、`state.ts`、`components/RoutePage.vue`、`LegacyPageHost.vue`、`AdminRoute.vue`、`NotFound.vue`；新增 `tests/state-session.test.ts` 并扩充 `tests/shell.test.ts`。
  - 更新 `package.json` / `package-lock.json`、`entry.ts`、`shell-entry.ts`、`AppShell.vue`、`contracts.ts`、`tools/build.mjs`、`migration.json` 登记，以及赛事备用布局和 Explore 首屏/query 去重。
  - `public/js/api.js` 以请求开始时的 token 判断 401，旧请求不能清除新会话；401 通过 `QSL.setUser(null)` 发出一次 auth。`public/js/core.js` 推迟旧路由索引初始化。原生 `npm start` 仍使用原路由，不加载 Vue Router/Pinia。
  - `tools/serve-test.mjs` 为 Windows 临时 PostgreSQL 关闭增加 `pg_ctl`、超时和临时进程兜底，避免 fixture 关闭挂起或遗留进程；未放宽浏览器断言。
- **本轮验证**：
  - `npm run check` 通过（0 errors）。
  - `npm run test:unit` 通过：33 个测试文件，148 项全部通过；覆盖隔离 Pinia、`QSL.state` 直写/setUser、唯一 token、boot 幂等、账号切换与旧 refresh 竞态、路由 404/守卫/事件顺序/取消/cleanup。
  - `npm run build` 通过：155 modules，入口约 191.88 KB（gzip 68.79 KB）；生成清单明确 `router.owner = vue-router`、`state.owner = pinia`，`/admin` 为 legacy page host。
  - 本机 Edge 完整 `npm run test:e2e`：66 项中 65 项通过、1 项按设计跳过（手机视口不执行鼠标倾斜），`test-results/.last-run.json` 为 `passed`。覆盖桌面 1440×1000、手机 375×812、英文、reduced-motion、深链/404/守卫/Back/Forward/多步 history、编辑器草稿、换卡弹窗、广场恢复与原生 `/admin` 往返。
  - 已查看最终桌面/手机首页、广场及手机恢复位置截图；无横向溢出，控制台/未捕获异常断言通过。
  - `node --check public/js/core.js`、`node --check public/js/api.js`、`git diff --check` 通过。
- **未验证项**：本轮未修改服务端接口、数据库或权限规则，故未重跑后端 `npm test` / `npm run test:production`；未执行 Docker/Alpine 构建、远端 CI、真实手机触控与 3D 闪烁复测。保持本地未提交、未推送、未部署；`.gitignore` 等全部既有工作区修改继续保留。

## 2026-11-15 Router/Pinia review 修复 — vue3

- **启动会话竞态**：`session.ts` 在 `/auth/me` 返回后、任何用户写入和 auth 事件前重新核对启动快照。若期间发生切号、退出或同账号资料保存，迟到的成功/失败结果只完成 `loading=false`、`booted=true` 和 `ready`，不再执行 `setUser`、清 token、写入旧错误或发出错误的 `auth(null)`。当前会话自身的 401 仍会清 token 并写回 null；相同快照的网络失败仍保留既有 boot error 行为。
- **同路径 query 同步**：AppShell 继续只按 path、运行时刷新版本和账号版本复用页面，不把所有 `fullPath` 变化强制重挂。`MyCards.vue` 监听 `ctx.query` 同步 `status`；`Exchanges.vue` 同步 `box/status`。控件自身调用 `setQuery` 时 watcher 识别为同值，不重复请求或重复导航；hash-only、表单草稿和已加载数据均保留。
- **正式回归**：
  - `state-session.test.ts` 新增迟到 boot 成功与失败矩阵，覆盖切号、退出、同账号资料保存，断言用户/token/auth 事件不被旧结果覆盖，同时 boot 仍可靠结束。
  - `my-cards.test.ts`、`exchanges.test.ts` 新增 query-only props 更新、清除查询、hash-only 和 rapid navigation；`shell.test.ts` 新增真实 Router + AppShell 集成，验证页面实例不重建且列表请求各只发生一次。
  - `my-cards-editor.spec.mjs` 和 `exchanges-logbook.spec.mjs` 增加桌面/手机 Edge 回归，覆盖同路径深链、清除 query、Back/Forward query 切换和 rapid navigation。
- **验证结果**：
  - `npm run check` 通过（0 errors）。
  - `npm run test:unit` 通过：33 个测试文件、153 项全部通过。
  - `npm run build` 通过：155 modules，入口约 191.91 KB（gzip 68.81 KB）。
  - 新增 4 个目标 Edge 用例通过；完整 `npm run test:e2e` 为 68 项中 67 通过、1 项手机鼠标倾斜按设计跳过，`test-results/.last-run.json` 为 `passed`，临时服务端口已结束。
  - `node --check public/js/core.js`、`node --check public/js/api.js`、`git diff --check` 通过。
- **未验证项**：未改后端接口、数据库或服务端权限，未重跑 `npm test` / `npm run test:production`；未执行 Docker/Alpine、远端 CI 或真机复测。保持本地未提交、未推送、未部署，全部既有工作区修改和 `.gitignore` 继续保留。

## 2026-11-15 常规命名与默认入口标准化 — vue3

用户明确 Vue3 将作为本线长期默认版本，要求非文档文件使用正常名称，并进一步选择同步切换默认构建/运行入口。本轮保留全部既有未提交工作，未改动或重写历史提交。

- 将 150 个源码、测试、配置与脚本规范命名：`client/`、`client/src/contest/`、`client/e2e/`；文件使用 `Home.vue`、`router.ts`、`home.test.ts`、`home.spec.mjs` 等。同步修正 imports、构建和测试配置、请求块断言、截图路径及文档引用。迁移文档和本目录保留 Vue3 名称。
- npm 命令统一为 `build`、`check`、`test:unit`、`test:e2e`、`start`、`dev`、`demo`；默认构建 `dist-public/build/entry.js`，生成块及 `migration.json` 不含迁移后缀。`start.cmd` 先构建再运行；`tools/start.mjs` 正常模式在同一进程调用后端 start，便于服务/fixture 清理；`start:legacy`、`dev:legacy` 显式保留原生对照。Node 工具链下限更新为 24.15.0。
- 默认 `Dockerfile` 使用已有多阶段 Vue 构建，`compose.yaml` 直接使用默认 Dockerfile。将前端/浏览器检查合入单一 `.github/workflows/ci.yml`，保留后端、生产隔离、Compose、镜像/构建元数据验证及 main/dev/tag 发布规则；dev-vue3 继续发布隔离分支标签和兼容固定 SHA 标签。删除重复 Dockerfile、Compose 覆盖、CI、部署包装器和已废止的标题后缀检查脚本。
- `deployment/deploy-dev.sh` 默认选 Vue3 profile，首次初始化脚本为 `deployment/bootstrap-dev.sh`。**44381、既有容器/卷/网络、私有 env 文件、镜像标签和部署锁继续保留原有隔离身份**。没有 SSH、容器、卷、数据库或远端 Git 操作。
- 静态根使用通用 `QSL_PUBLIC_DIR`，兼容旧 `QSL_PUBLIC_DIR_VUE3`；浏览器配置为 `QSL_BROWSER_CHANNEL`。`.gitignore` 保留既有 `/.zcode/`，忽略新产物以及此前的本地历史产物。API、权限、审核/库存/参赛规则不变。
- 更新 AGENTS、根 README、协作/前端契约/部署/GHCR 文档、当前迁移指引和发布说明；新增 [命名标准化说明](命名标准化-vue3.md)。批量变更前的本地文本快照在 ignored `artifacts/name-normalization-20261115.zip`，路径映射在 `artifacts/name-normalization-map.json`，不提交。

本轮实际验证：

- `npm run check`、`npm run build` 通过；155 modules，生成资源均不含 `-vue3` 文件后缀。
- `npm run test:unit -- --pool=threads`：33 个文件、153 项通过；类型/API/会话和既有行为断言保留。
- 本机 Edge 完整 `npm run test:e2e`：68 项中 67 通过、1 项手机鼠标倾斜专项按设计跳过。使用 `tools/start.mjs` 默认启动器、隔离临时 PostgreSQL 与合成数据，桌面和 375px 手机视口均覆盖；`test-results/.last-run.json` 为 passed，failedTests 为空。
- `npm test`：138 项 API 冒烟通过。
- `npm run test:production`：首次发现旧页脚 VM 夹具缺少浏览器 history 对象；补齐最小 history 夹具，保持原有构建元数据/HKT/生产隔离断言，完整重跑 92/92 通过。
- `git diff --check`、新/修改 JS/MJS 语法、两份部署脚本的 Git Bash `bash -n` 检查通过。命名审计确认 150 个目标文件均存在、版本文件无非文档后缀遗漏、依赖版本变化为 0，既有 `/.zcode/` 保留。

未验证：本机没有 Docker，未执行 Docker/Alpine 镜像构建与容器验收；未运行远端 CI、推送镜像或部署，未做真机 3D 闪烁复测。所有改动仍为本地未暂存/未提交状态，分支保持 dev-vue3，HEAD 保持 199e568。

## 2026-11-15 赛事子导航光学对齐 — vue3

按用户截图反馈，在 `client/src/components/SiteHeader.vue` 的横向子导航锚点计算中整体左移 8px，再执行原有边缘约束；三项间距、胶囊尺寸和手机纵向菜单保持。`npm run build`、`npm run check`、差异检查通过。本地静态预览（API mock，仅布局验收）在 Edge 1440px / 1200px 下测得中心偏移 -8px、间距仍 6px，375px 菜单仍纵向且无横向溢出；对比截图位于 ignored `artifacts/contest-alignment/`。原隔离数据库 fixture 本次启动超时，未将该次尝试报告为浏览器回归通过。未提交、未推送、未部署，44381 仍为 8245961。

## 2026-11-15 赛事子导航向右微调 3px — vue3

按用户确认的本地浏览器预览效果，将横向子导航的光学偏移从左移 8px 调整为左移 5px，即相对上一版向右 3px；仍在偏移后执行边缘约束。`npm run check`、`npm run build` 和本地 Edge 静态布局预览通过：1440px / 1200px 实测中心偏移 -5px、间距仍为 6px，375px 菜单仍纵向且无横向溢出；预览使用 API mock，仅核验布局。用户已授权本次提交、推送及更新独立 44381；完整 SHA 的 CI、镜像、备份和公网实测结果以本次发布记录为准。

## 2026-11-15 管理后台业务 Vue3 迁移 — vue3

- `/admin` 改为通过 `AdminRoute` / `RoutePage` 按需加载 `client/src/pages/Admin.vue`，不再调用原生后台 render。`client/src/admin/` 承载概览、用户、卡片、换卡记录、公告与比赛六分区，以及比赛投票、报名说明审核、人工评审配置/进度/结果与导出。
- 默认生成入口移除 `admin.js` / `admin-contest-judging.js`，保留 public 原生脚本仅供 legacy 对照；migration.json 的 legacyPageHost 改为 null。未添加依赖，未改变服务端路由、权限、库存、审核或数据库规则。
- 管理请求使用组件级 AbortSignal 与 token/用户/角色检查，列表带请求代次及失败目标重试；切号、离页清理请求、定时器、监听、3D 与 Blob URL。自我账号限制、Unicode 校验、自动参赛确认、expectedRevision 冲突后刷新、北京时间及评审结果公开边界保持。
- 后台筛选与分页保存在本次后台访问的内存中；公开/个人页面不共享管理数据。新表单、列表和弹窗均以 Vue 模板安全插值，不采用原生后台 DOM 岛。
- 实测修复了文本框原生 select 冒泡被误识别为切换后台分区的问题，内部改用 open-tab 并新增回归；375px 概览长换卡标题设置正确的网格收缩约束。用户与换卡表格沿用原有最小宽度和局部横向滚动。
- 同步架构文档与英文词典。首页磁吸浏览器测试改为 Playwright hover，等待滚动/稳定/命中检测后发送真实指针，保留原有动效断言；赛事测试在异步已有报名加载完成后再判断是否进入编辑，不改变报名或投票断言。

实际验证：

- `npm run check`、`npm run build`：通过，189 modules；默认入口不加载原生后台脚本。
- `npm run test:unit -- --pool=threads --maxWorkers=1`：34 个文件、169 项通过；新增后台 16 项，包含迟到请求、删除页码回退、原生选择事件、Unicode/颜色、配置冲突、私有结果清理与下载 URL 生命周期。
- 后台专项 Edge `npm run test:e2e -- admin.spec.mjs`：桌面与 375px 手机共 8 项全部通过，使用隔离临时 PostgreSQL。真实链路覆盖权限、卡片审核与编辑、保留库存、用户自我限制、公告发布/撤下、报名说明审核、五评委选择/保存、开始评审、ZIP 与投票 XLSX 下载；409 场景采用明确 API mock。
- 完整 Edge `npm run test:e2e`：76 项中 75 项通过、1 项手机鼠标倾斜专项按设计跳过，0 失败；test-results/.last-run.json 为 passed 且 failedTests 为空。已查看桌面和手机概览、用户及比赛管理截图。
- git diff --check 与 JS/MJS 语法检查通过；默认生成入口未包含旧后台脚本。

未执行后端 npm test / test:production（无服务端改动）、Docker、远端 CI、真实手机及截止后的真实人工评分 XLSX 导出。后台结果显示与隐私变化已通过组件 mock 覆盖。当前停留 dev-vue3，本轮未暂存、未提交、未推送、未部署；既有 .gitignore 的 /.zcode/ 修改保留。详见 [管理后台迁移](管理后台迁移-vue3.md)。

## 2026-11-15 双线路 CDN 缓存与静态资源版本化 — vue3

针对国内 DOOKICDN 日本节点→德国 Netcup、海外 Cloudflare→德国 Netcup 的部署方式，补齐静态资源版本化；未修改域名、线路、CDN 控制台或运行中的容器。

- 默认入口为 client/index.html / runtime.ts，共享 JS/CSS 纳入 Vite；主入口、页面块、CSS、module Worker、站点图片与法律页依赖全部使用内容哈希 URL。保留原生算法与 QSL 契约，不再依赖固定脚本 URL。
- 生成 asset-manifest.json / SHA-256 校验和；启动器与 CI 从清单识别主入口，Docker builder 包含资源插件。HTML、深链、API、清单与错误响应 no-store，哈希资源一年 immutable，并发送两类 CDN 专用缓存头。
- 服务端在持久数据目录 static-assets 中校验并保留资源；拒绝路径遍历、符号链接、校验错误和同名不同内容覆盖。部署脚本在停止旧容器前保留旧哈希分块，沿用既有锁、SHA 校验、环境继承、健康与失败恢复保护；Docker 探测错误不能静默跳过归档。

实际验证：

- npm run check / build 通过：211 modules，65 个版本资源；相同源码重复构建的入口 URL 与全部校验和一致。
- 前端组件：34 文件、169 项通过；npm test：138 项通过；npm run test:production：98 项通过，包含真实 HTTP A→B 发布后旧分块可读、HTML/API/404 禁止缓存及资源校验安全。
- 完整 Edge E2E：80 项中 79 通过、1 项手机鼠标倾斜按设计跳过。新增缓存专项桌面/手机共 4 项通过；补充静态 405 禁止缓存断言后，专项 4 项再次通过。
- 浏览器验证实际哈希资源及校验和、默认页面无固定 /js /css /assets 请求、法律页依赖、真实哈希 module Worker 执行及 WebP 转换。既有后台、赛事、鉴权、资料、编辑、换卡、分享、广场和外壳均完成回归。
- 独立资源缓存 Node 测试 5 项通过；JS/MJS 语法、部署脚本 bash -n 与最终差异检查通过。

未验证：本机没有 Docker CLI，未实际构建/运行本轮镜像或执行容器资源归档；未运行远端 CI、真实双 CDN 边缘命中与真机验收。Cloudflare / DOOKICDN 规则及首次清缓存步骤见 [CDN 缓存指引](CDN缓存与资源版本化-vue3.md)，尚未在控制台应用。本轮未提交、未推送、未部署；dev-vue3 已提交 HEAD 仍为 e337834，既有 .gitignore 的 /.zcode/ 保留。

## 2026-11-15 Vue3 正式接管 dev — vue3

用户明确授权主线切换：远端原 dev 通过 GitHub rename 改为 dev-outdate，原 dev-vue3 改为 dev；默认分支确认 dev。旧线 SHA f3289231bb3fd50941980eb146b5e5667095b034、Vue 切换基线 790373d7381fc3d35c60158816e6cfb456d13eca 均原样保留；未合并或改写历史。

dev-outdate 已设置 lock_branch=true、enforce_admins=true，禁止强推/删除；新 dev 保持原开发线的权限设置，未额外增加审核门槛。切换前没有开放 PR，main 的 Protect main 规则保持。本机两条长期分支及 upstream 跟踪已同步，其他功能分支/个人 origin 不批量修改。

配套 CI 改为 dev/main，dev 生成主镜像 dev / sha-<完整SHA>，旧 Vue 镜像标签仅兼容。默认脚本主参数改为 QSL_EXPECTED_REVISION，旧 profile/参数仍映射同一 44381 隔离环境，参数冲突、无效 SHA、归档 profile 在执行部署命令前拒绝。现有容器/卷/网络/锁/私有目录不改名，原 44380 和 main/生产不操作。

本地部署参数回归 4 项通过，两个 Bash 脚本语法、前端类型检查与构建通过。首个新 dev 配套提交的完整 CI、镜像发布及 44381 验收结果以本轮发布记录为准。既有 .gitignore 的 /.zcode/ 不纳入提交。详见 [正式 dev 指引](正式dev主线切换-vue3.md)。

## 默认应用移除 QSL 全局兼容层 — vue3

按用户选中的方案在 codex/remove-qsl-runtime 实施，基线为正式 dev 的 b5c466e。默认应用以显式 application 服务、实际 Pinia、单一 Vue Router 启动；不再注册 window.QSL/self.QSL，不存在 state/router 别名镜像、registerPage 或 LegacyPageHost。

- 保留成熟算法，将 API、3D、响应式图片、WebP 转换/Worker、QR、取色、海报和动效提为独立模块。API 工厂直接通知 Pinia 会话版本并保留旧 token/401 隔离规则；没有通过包装旧 API 重建兼容桥。
- 分享按钮、桌面 Teleport 菜单、手机弹窗、二维码和海报预览改为真实 Vue 组件；移除原生替换按钮、字符串 HTML、分享/通用弹窗 DOM 岛。保留关闭、焦点、嵌套 Escape、生成取消、Blob 回收与点赞不重置分享链接行为。
- 删除旧页面注册/mount entry、状态桥、modal-bridge 与兼容 HTML 通联记录输出。更新所有默认调用方和契约；法律页仍是静态文本，但语言脚本也是无全局对象的模块。
- 继续使用内容哈希构建与持久旧资源缓存；清单增加 application 模块地址，metadata 明确 es-modules / globalNamespace=false。浏览器测试只在测试夹具中显式导入模块并保存 __appTest，默认应用不创建该变量。

本轮实际验证记录在 [模块化指引](移除QSL兼容层-vue3.md) 中收尾。后端/数据库/API 权限未改，未提交/推送/部署；远端 dev 与 44381 仍为 b5c466e。public 原生对照独立保留，默认构建不导入其运行时 JS；既有 /.zcode/ 修改保留。

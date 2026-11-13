# AGENTS.md — QSLink agent 接手指南

## Vue3 长期开发线约定 — vue3

当任务位于 `dev-vue3` 或以 `-vue3` 结尾的迁移功能分支时，先读 [Vue3 迁移指引](Vue3迁移指引-vue3/README-vue3.md)。`dev-vue3` 是与原 `dev` 平级的长期集成分支，本轮创建基线为团队 `dev` 的 `f3289231bb3fd50941980eb146b5e5667095b034`；不得按临时分支自动删除、改名、回合原 `dev` 或部署到原测试服。此开发线已获用户授权引入 Vue3 与构建链，替代下文的原生前端默认约束。

所有此开发线新增的任务文件基名、迁移专用目录、npm 命令、功能分支及后续提交/PR 标题均以 `vue3` 标识结尾（扩展名前为 `-vue3`，命令为 `:vue3`，提交/PR 标题以 ` — vue3` 结尾）。例如 `Space-vue3.vue`、`build:vue3`、`codex/space-sort-vue3`、`feat: migrate public space — vue3`。固定入口 `AGENTS.md`、`package.json`、`package-lock.json`、`.gitignore`、`.dockerignore` 及既有业务文件维持原路径；其 Vue3 修改必须在迁移进度中登记。标准 `dev`/`main` 不自动接收此开发线变更；提交、推送和部署仍分别遵循授权边界。

适用于整个仓库。目标：让没有历史会话的新 agent 能定位实现、安全修改、验证并按授权交付。本文是导航与执行约定，不替代具体契约；平台指令及用户当前明确要求优先。遇到文档与实现冲突，先核对并说明，不猜测。

## 1. 先了解项目

QSLink 是中文 QSL 卡片交换社区，核心功能为双面图片上传、CSS 3D 展示、审核、公开分享、点赞、换卡申请和管理后台。

- **前端**：原生 HTML/CSS/JavaScript，普通 script + `window.QSL`，无前端构建步骤，无前端框架、CDN 或第三方运行时依赖。
- **后端**：Node.js 原生 HTTP 服务，CommonJS，PostgreSQL 17（`pg`），Sharp 图片缩放，服务端邮件验证码。
- **运行环境**：Node.js ≥20.9；CI 和生产镜像使用 Node.js 24。安装锁定依赖，不随意升级。
- **数据**：业务数据在 PostgreSQL；上传原图和派生图片位于配置的数据目录。`data/` 是运行时目录，不提交。
- **许可**：软件 AGPL-3.0-only；用户卡片、照片、个人信息和品牌素材不自动属于软件许可范围。

### 按任务阅读，而不是通读所有文件

| 任务 | 先读 |
| --- | --- |
| 协作、分支、提交、发布 | [CONTRIBUTING.md](CONTRIBUTING.md) |
| 启动、配置、功能概览 | [README.md](README.md)、[package.json](package.json) |
| API、权限、响应字段与错误 | [docs/API.md](docs/API.md)及对应服务端路由 |
| 前端路由、组件、样式与生命周期 | [docs/CONTRACT.md](docs/CONTRACT.md)、[public/index.html](public/index.html) |
| 数据库、导入 | [docs/POSTGRESQL.md](docs/POSTGRESQL.md)、`server/migrations/` |
| 生产部署、备份 | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)、[docs/GHCR.md](docs/GHCR.md) |
| 测试服 dev 发布 | [部署 Skill](.skill/qslink-deploy-dev/SKILL.md)、[deployment/deploy-dev.sh](deployment/deploy-dev.sh) |
| 内容授权、法律页面 | [CONTENT-LICENSE.md](CONTENT-LICENSE.md)、[docs/LEGAL-DEPLOYMENT.md](docs/LEGAL-DEPLOYMENT.md) |

Skill 如不在上述位置，检查当前工作区及工具技能列表（旧路径为 `.trae/skills/qslink-deploy-dev/`），不要擅自移动或复制。文档中的历史验收结果不是本次验证证据。

## 2. 新任务的第一步

在仓库根目录确认实际状态：

```powershell
git status --short
git branch -vv
git remote -v
git log --oneline -5
```

1. 明确用户要求的范围：排查、修改、提交、推送、创建 PR、部署分别是什么。
2. 保留所有既有未提交修改，包括删除、未跟踪文件和文件迁移；不替用户还原、清空或一并提交。
3. 先阅读相关实现和调用方，再改代码。多步骤任务简要列计划，优先做最小可验证改动。
4. 团队仓库预期为 `https://github.com/9ham-Team/qslink.web.git`，通常名为 `upstream`；`origin` 是开发者个人独立仓库，实际地址必须核对，不能假定有效 fork。
5. 日常默认从最新 `upstream/dev` 创建功能分支（agent 默认 `codex/<主题>`），经团队内部 PR 合入 `dev`。切换分支前确认工作区安全；用户要求留在当前分支时遵循要求。
6. 不把过去一次直接推送 `dev` 或部署的授权当成永久授权。用户明确要求直接推送团队 `dev` 时，核对分支、远端和快进关系后按授权执行。

## 3. 实现地图与修改约束

### 前端

| 文件 | 职责 |
| --- | --- |
| `public/index.html` | CSS/script 加载顺序；新增普通脚本需显式引入 |
| `public/js/core.js` | QSL 全局、路由、状态、事件与通用工具 |
| `public/js/api.js` | API 封装、token、错误及会话失效处理 |
| `public/js/ui.js` | toast、modal、表单、卡片缩略图等共享 UI |
| `public/js/images.js` | `QSL.images`、srcset/sizes、按实际布局宽度选图 |
| `public/js/card3d.js` | 双面 3D 卡片、拖拽、惯性、图片和观察器生命周期 |
| `public/js/effects.js` | 公共背景、进场与交互动效 |
| `public/js/pages/` | 页面 render 与清理；`app.js` 最后启动应用 |
| `public/css/` | base → components → gallery → flows → admin → animations |

- 保持原生架构及既有 `QSL` API，不为小改动引入框架或构建链。
- 页面通过 `QSL.registerPage(name, { title, render })` 注册；`render(container, ctx)` 可返回 cleanup。离开页面必须释放动画、监听、定时器和观察器。
- 样式沿用 tokens 和模块前缀：`.g-*` / `.card3d-*`、`.f-*`、`.a-*`、`.fx-*`。不要用页面规则随意覆盖共享组件。
- 用户内容插值必须转义；优先用现有 `QSL.escapeHtml/escapeAttr`，不能直接拼入可信 HTML。
- 修改公共层时检查首页、详情、分享、编辑器等调用方；桌面和移动端都要考虑，并尊重 `prefers-reduced-motion`。
- 图片沿用响应式图片接口。3D 旋转后的 `getBoundingClientRect()` 不是稳定布局宽度，不能据此每帧重新选图、写 src 或触发缩图请求。

### 后端与数据

- `server/server.js`：HTTP 入口、静态资源、上传/图片派生与 SPA 回退。
- `server/lib/api/{auth,cards,exchanges,me,admin}.js`：领域路由。
- `server/lib/{auth,validate,serialize,uploads,image-variants}.js`：鉴权、边界校验、输出和图片处理。
- `server/lib/db.js` 当前转发到 `postgres.js`；不要误以为业务数据仍存储在 JSON 文件。
- `server/migrations/`：数据库版本变更；`server/import-json.js` 为显式旧数据导入，不是常规启动流程。

保持服务端所有权/角色检查，不能只靠前端隐藏按钮。不要绕过卡片审核、地址可见性、注册验证码或内容授权。改动接口需同时核对调用方、测试和 API 文档。涉及迁移时说明旧版本兼容性和回滚限制，不能承诺恢复旧镜像等于恢复数据。

## 4. 本地启动与验证

```powershell
npm ci --include=optional
# 按 docs/POSTGRESQL.md 配置独立开发数据库 DATABASE_URL
npm start
# 开发时可改用 npm run dev；显式本地演示用 npm run demo
```

- 默认监听 `127.0.0.1:8787`，正常启动不生成演示账号。
- Sharp 依赖平台可选包：**不要用 `--omit=optional` 安装运行或 CI 依赖**。跨 Windows/Linux/Alpine 时必须核验目标平台安装与镜像启动，不复制本机 node_modules。
- `npm run db:local` 可管理本地 PostgreSQL，具体参数先读指南/脚本；不把测试或演示指向生产数据库。
- 生产禁止 `QSL_SEED_DEMO=true`；管理员通过 `npm run admin:init` 离线初始化，不植入默认密码。

### 按改动选择检查

```powershell
git diff --check
node --check public/js/card3d.js
npm test
npm run test:production
```

- `node --check` 替换成实际修改的 JS 文件。
- 后端、权限、图片派生和数据行为变更：运行两个测试套件。
- 测试入口为 `tools/run-tests.mjs`：默认启用临时 PostgreSQL；设置 `QSL_TEST_DATABASE_URL` 时必须是独立测试库，套件使用隔离 schema。不要为方便改成真实业务库。
- 前端交互：验证目标操作、控制台、移动布局及路由往返后的资源清理。单纯语法通过不等于交互正确。
- 纯文档：核对路径、命令、内容一致性和差异，不必声称运行了代码测试。
- 平台、依赖或凭据阻塞时准确记录，区分未运行、失败和通过。

### 3D 闪烁/卡顿排查准则

曾有手机在正反面快速交替时闪烁的反馈；不要将已有优化当成根因已证实或问题已解决。

1. 先确认浏览器、设备、页面版本、复现手势，必要时用获准的 ADB/CDP 自动拖动。
2. 检查公共背景/顶栏/页脚、混合与模糊、背面隐藏及 3D 层级、图片切换和真实绘制/合成数据；每次只改变一个变量做对照。
3. 静置 rAF 接近 60fps、图片请求成功或接口健康，不能证明拖动无闪烁；Android tile 日志需关联当前时间及进程，不能跨浏览器归因。
4. 临时实验结束恢复手机页面；未实测时只报告候选原因与证据，不把显存不足等推测写成确定注释。

## 5. Git、CI 与测试服发布

### 授权边界

- 修改不代表获准 commit；commit 不代表 push；push 不代表部署。已有明确覆盖整个流程的授权无需重复询问。
- 默认 PR 流程见 CONTRIBUTING；不强推，不擅自 rebase/合并、修改 Git 配置、移动标签或操作生产。
- 提交前检查暂存及未暂存差异，明确文件列表暂存，不用 `git add .` / `git add -A` 混入无关改动。不得提交令牌、私钥、数据库、上传文件或临时产物。
- 提交说明沿用 `feat:` / `fix:` / `docs:` 等现有风格；提交后报告哈希和剩余改动。

### CI 验收

实际定义以 [.github/workflows/ci.yml](.github/workflows/ci.yml) 为准：

- PR 到 dev/main、push dev/main、v* 标签及手动触发运行 CI。
- `API smoke tests` 包含测试、生产隔离、Compose 验证、镜像构建和容器启动检查。
- 适用的非 PR 引用在测试通过后运行 `Publish image to GHCR`；PR 不发布镜像。
- **必须查询目标完整 SHA 的运行**，测试和镜像发布均成功后才进入部署；不能用另一次绿色记录或“已入队”替代。
- CI 失败先说明并停止部署；不擅自扩大修复、提交或发布范围。

### 测试服标准流程

有部署授权时先读部署 Skill 和最新脚本；以下只是核对清单，不取代脚本保护。

| 项目 | 预期值（执行前再次核对） |
| --- | --- |
| 测试入口 | `http://43.142.58.20:44380` |
| 镜像 | `ghcr.io/9ham-team/qslink.web:dev` |
| 应用容器 | `qslink-test-app` |
| 网络 / 上传卷 | `qslink-test-net` / `qslink-test-uploads` |
| 端口 / 挂载 | `44380:8787` / `/var/lib/qslink` |
| 更新脚本 | `deployment/deploy-dev.sh` |

1. 核对团队远端 dev、目标 SHA、对应 CI 和镜像；dev 标签是浮动的，部署前后均验证 OCI revision。
2. 使用已有且经核实的 SSH 身份和主机信任；不得硬编码本地私钥、代理、密码或禁用主机密钥检查。
3. 记录旧容器镜像、健康、端口、网络和挂载，只查询必要字段，不打印全部环境变量。生产容器可能与测试容器同机，绝不能按通配符操作。
4. 将当前脚本传到已确认的位置执行；它锁定部署、继承环境、保留停止的旧容器、复用数据卷并在失败时尝试恢复。不要另造命令绕过这些保护。
5. 检查实际运行镜像修订、running/healthy、入口和 `/api/config`，再验证本次涉及的页面/功能。记录真实备份名，不能复用历史记录。
6. 不删除数据库/上传卷，不执行 `down --volumes` 或全局 prune。容器备份不等于数据备份，成功部署后的主动回滚也需授权。

生产是独立流程：团队 `dev → main` 发布 PR、merge commit、唯一版本标签、验证及数据备份后手动部署，再通过 `main → dev` PR 回同步。不得把测试服发布请求扩展成生产操作。

### 合入 main 后的回同步提醒

- 每次 `dev → main` PR 合并后，都应检查是否需要创建团队内部同步 PR：**base 为 `dev`，compare 为 `main`**；不必等待生产部署才提醒用户。
- GitHub 的 “main had recent pushes” 可能只是合并提交导致，不代表新增业务代码。先比较双方提交历史和文件差异；即使文件内容相同，仍可能需要同步合并历史。
- 创建前检查是否已有同方向的开放 PR，避免重复。PR 说明应记录提交差异、文件差异以及是否仅同步历史。
- 创建和合并 PR 分别需要授权；获准合并时检查最新 CI，并使用 **merge commit**，不使用 squash、rebase、reset 或强推来对齐长期分支。
- 仅同步历史且文件内容未变时，无需因此重新部署测试服；测试服继续使用 `dev` 镜像，不改为部署 `main`。生产部署仍需独立授权。

## 6. 完成任务的交付格式

简洁说明：

- 改了什么、主要文件与行为；
- 实际执行的验证及结果，哪些仍未验证；
- 是否提交（哈希）、推送（仓库/分支）、CI（对应 SHA/链接）或部署；
- 如部署：运行版本、健康状态、回退备份及测试地址；
- 剩余工作区修改或风险。

明确区分“代码已修改”“CI 通过”“部署健康”“手机视觉问题实测修复”。没有工具证据不报告成功；历史会话摘要和旧发布记录只用于定位，不代替本次检查。

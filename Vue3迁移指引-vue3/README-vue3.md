# QSLink Vue3 迁移指引 — vue3

本目录是 Vue3 开发线的协作入口。先读本页，再读 [实施方案](实施方案-vue3.md)、[当前进度](迁移进度-vue3.md)；选型依据及完整风险分析保存在 [框架评估报告](框架评估报告-vue3.md)。

## 长期分支与命名规则 — vue3

- `dev-vue3` 是与原 `dev` 平级的长期开发/集成分支，首次从最新团队 `dev` 的 `f3289231bb3fd50941980eb146b5e5667095b034` 创建。它不是 `codex/*` 临时功能分支，不在合并后自动删除，不跟踪 `upstream/dev`，不自动合回 `dev` 或 `main`。
- 首次推送使用 `git push -u upstream dev-vue3`，核对目标为团队仓库 `https://github.com/9ham-Team/qslink.web.git`，跟踪同名长期分支。本地命名不表示远端已创建；每次推送仍需对应授权。
- 本线功能分支示例为 `codex/space-sort-vue3`，PR 的 base 为 `dev-vue3`。所有提交和 PR 标题以 ` — vue3` 结尾，例如 `feat: migrate public space — vue3`；合并提交标题也必须保留后缀。任务、检查和产物名同样以 `vue3` 结尾。
- 新增迁移专用目录以 `-vue3` 结尾，新源码/测试/文档文件在扩展名前加 `-vue3`，如 `Space-vue3.vue`、`build-vue3.mjs`。目录内部的通用结构名 `src`、`components`、`pages`、`tests` 可保持常规命名。
- 不能为后缀重命名固定入口或原业务模块：`AGENTS.md`、`package.json`、`package-lock.json`、`.gitignore`、`.dockerignore`、`server/lib/config.js`、`public/js/effects.js` 等继续使用原路径，修改理由登记在 [迁移进度](迁移进度-vue3.md)。npm 新命令以 `:vue3` 结尾；已有命令保持旧行为。
- 原 `dev` 的修复可在明确授权后合并到本线并解决冲突；不能用 rebase、reset 或强推重写长期历史。涉及合并也遵守 commit 授权，合并说明保留 `vue3` 后缀。
- `tools/check-history-vue3.mjs` 和本线 CI 检查分叉基线后 first-parent 提交标题及 PR 标题的 `vue3` 后缀。导入的原 `dev` 历史不改写，导入产生的合并提交须带后缀。
- 修改、commit、push、创建/合并 PR、发布镜像和部署分开授权。不要把本次“开始迁移”解释为已获提交、推送或部署授权。

## 本地使用 — vue3

Vue3 工具链使用 **Node.js 24.15 或更高的 Node 24 版本**，锁定依赖安装，保留 optional 包。根包仍是 CommonJS；原生服务端的既有 Node 下限未被本次更改。

```powershell
npm ci --include=optional
npm run check:vue3
npm run test:vue3
npm run build:vue3
# 按原 PostgreSQL 指南设置隔离的 DATABASE_URL / QSL_DATA_DIR
npm run start:vue3
```

`start:vue3` 从生成的 `dist-public-vue3/` 提供页面，默认仍为 `127.0.0.1:8787`。当前源码中的 `/space/:uid` 与 `/explore` 是 Vue 页面，其余页面保留原实现。工作区源码不代表测试站已更新，实际发布版本见进度及发布记录。`npm start` 仍提供 `public/` 中的原生版本，便于对照；两个实例须使用不同端口和独立数据环境。

`npm run dev:vue3` 先构建，再监听后端修改；**当前没有前端 HMR**，修改 Vue 源码后重新执行 `npm run build:vue3` 并刷新。生成目录不提交，不直接修改产物。公共 API 和上传图片始终同源。

浏览器回归使用专用临时数据库及合成演示数据，不使用 `DATABASE_URL` 或已有站点。首次需安装测试浏览器：

```powershell
npx playwright install chromium
npm run test:e2e:vue3
# Windows 也可选择本机 Edge，无需另外下载 Chromium
$env:QSL_BROWSER_CHANNEL_VUE3 = 'msedge'
npm run test:e2e:vue3
```

浏览器回归绑定 `127.0.0.1:18787`，拒绝复用既有服务；测试产物位于 `test-results-vue3/`。不要把测试命令指向线上数据库或真实账号。

## 独立构建与持续集成 — vue3

- [Dockerfile-vue3](../Dockerfile-vue3) 使用 builder 安装工具依赖、构建前端，再将静态产物复制进生产运行阶段；默认 [Dockerfile](../Dockerfile) 仍保留原入口。
- [compose-vue3.yaml](../compose-vue3.yaml) 只覆盖构建入口。需要容器验证时使用独立项目名和独立配置，例如 `docker compose -p qslink-vue3 -f compose.yaml -f compose-vue3.yaml build app`；运行环境、数据卷及域名必须另外隔离。
- [ci-vue3.yml](../.github/workflows/ci-vue3.yml) 针对 `dev-vue3` 的 push/PR 运行类型、组件、浏览器、原有业务、生产隔离和镜像启动检查。
- 本线测试成功后发布 `:dev-vue3` 与 `:sha-<完整SHA>-vue3` 镜像；远程部署使用固定 SHA 并核对 OCI revision。不能借用 `:dev` 镜像、原测试服容器、数据卷或端口。原 `dev` CI/发布规则保留。
- 本线之后若配置发布，镜像标签、CI 任务名、部署资源应有 `vue3` 后缀，且必须核对完整 SHA。目录内的规划不是部署授权。
- 首次测试服部署与后续更新见 [44381 发布指引](测试服发布-vue3.md)。用户本次授权推送到 `dev-vue3` 并部署 `44381`，同时选择复制 `44380` 测试数据；这不构成今后自动发布的永久授权。

## 每次继续工作的顺序 — vue3

1. 核对分支、Git 状态和最新授权，保留他人修改；查看进度表，确认本次路由归属。
2. 阅读目标页面、调用方、[API](../docs/API.md) 和 [原前端契约](../docs/CONTRACT.md)。原契约的无框架/无构建限制在此线由本指引替代，业务和安全契约继续适用。
3. 最小范围迁移，不同时改审核/库存/地址/投票规则。保持单一路由器、会话来源和 DOM 所有权；清理所有请求、监听、观察器和 Worker。
4. 执行相关检查，在进度文件记录真实结果及未验证项；新源码、提交和 PR 按后缀规则命名。
5. 获相应授权后才提交、推送或发布；无需把原生分支操作扩展到 Vue3 分支，反之亦然。

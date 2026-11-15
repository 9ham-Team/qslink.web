# QSLink Vue3 迁移指引 — vue3

本目录保存选型、迁移历史与验收记录。当前架构见 [实施方案](实施方案-vue3.md)，历史交付见 [迁移进度](迁移进度-vue3.md)，本次标准化见 [命名与默认入口](命名标准化-vue3.md)。

## 长期分支与命名 — vue3

- `dev-vue3` 是与原 `dev` 平级的长期集成分支，基线 `f3289231bb3fd50941980eb146b5e5667095b034`。不得当临时分支删除，不自动合入 dev/main。
- 用户于 2026-11-15 明确：Vue3 将作为长期默认实现。源码、目录、测试、配置、脚本、生成文件及 npm 命令使用正常名称，不再附加 `-vue3` 或 `:vue3`。提交与 PR 使用常规说明，不再强制后缀；历史提交不改写。
- 本目录和迁移文档保留 Vue3 标识；MD 文件不因本次标准化重命名。
- 分支、GHCR 标签和服务器资源属于部署身份，继续保留 `dev-vue3` / `-vue3`，防止与原 44380 混用。
- 变更、commit、push、创建/合并 PR、发布镜像和部署分别授权。本轮只是本地标准化。

## 默认开发入口 — vue3

工具链要求 Node.js ≥24.15.0，CI/镜像使用 Node 24；锁定依赖并保留 optional 包。

```powershell
npm ci --include=optional
npm run check
npm run test:unit
npm run build
# 按 docs/POSTGRESQL.md 设置独立 DATABASE_URL / QSL_DATA_DIR
npm start
```

- `client/`：Vue/TypeScript 源码、组件测试和 `e2e/`。
- `tools/build.mjs`：构建 `dist-public/`，静态入口 `/build/entry.js`，所有产物文件名均不含 vue3 后缀。
- `tools/start.mjs`：默认在同一进程启动后端并提供生成静态根，默认 127.0.0.1:8787；缺少构建时明确报错。
- `npm run dev`：先构建，再监听服务端；修改前端后重新 build，当前未增加前端 HMR。
- `npm run demo`：先构建，再在独立开发库显式启动演示；生产仍拒绝演示模式。
- `npm run start:legacy` / `dev:legacy`：仅用于 public 原生对照。
- `QSL_PUBLIC_DIR` 为静态根配置，旧 `QSL_PUBLIC_DIR_VUE3` 仅作为兼容别名。

当前 Vue Router / Pinia 独占全站 SPA 路由和用户/配置/启动状态，token 仍由同一 API 服务持有；`/admin` 已迁入按需 Vue 组件，默认入口不再执行原生后台脚本，详见 [管理后台迁移](管理后台迁移-vue3.md)。不要复制路由器、会话或 DOM 所有权。

## 验证 — vue3

```powershell
$env:QSL_BROWSER_CHANNEL = 'msedge' # Windows 可使用本机 Edge
npm run test:e2e
npm test
npm run test:production
git diff --check
```

浏览器使用 tools/serve-test.mjs、专用临时库及合成数据，绑定 127.0.0.1:18787，拒绝复用既有服务；产物为 `test-results/`。默认启动器也由该套件覆盖。对照服务、测试和业务数据库必须隔离。真实手机/3D 闪烁仍需独立验收。

## 默认 Docker、CI 与独立发布 — vue3

- [Dockerfile](../Dockerfile) 使用多阶段 Vue 构建，运行阶段只安装生产依赖并保留 Sharp 可选包；[compose.yaml](../compose.yaml) 直接使用它，不再需要单独前端覆盖文件。
- [.github/workflows/ci.yml](../.github/workflows/ci.yml) 集中执行前后端、浏览器、Compose、镜像启动及构建元数据验证；不再维护平行的 Vue3 CI 文件。
- dev-vue3 的镜像仍带 `:dev-vue3` 和 `:sha-<完整SHA>-vue3` 标签，既有部署身份保持。CI 配置修改不代表本次已经执行远端 CI 或发布镜像。
- `deployment/deploy-dev.sh` 默认 Vue3 profile，要求 `QSL_EXPECTED_REVISION_VUE3`，保持 44381、既有容器/网络/数据卷、锁与回退保护。原 44380 与生产不会因文件重命名被操作。
- 首次初始化脚本为 `deployment/bootstrap-dev.sh`，不能对已有 Vue3 环境重跑。发布仍先读 [测试服发布指引](测试服发布-vue3.md)，核对目标完整 SHA 的 CI/镜像并取得单独授权。

每次继续工作都先核对 Git 状态、最新授权、相关 API/组件调用方，保留既有未提交修改；在进度中记录真实验证，不用旧记录替代本轮检查。

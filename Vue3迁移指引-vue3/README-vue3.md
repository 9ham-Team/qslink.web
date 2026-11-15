# QSLink Vue3 迁移指引 — vue3

本目录保存选型、迁移历史和当前开发/发布约定。2026-11-15 用户授权 Vue3 正式接管 dev，旧实现归档为 dev-outdate；完整步骤见 [正式 dev 切换](正式dev主线切换-vue3.md)。

## 当前主线与命名

- 团队默认分支、新功能基线和 PR base：dev（Vue3）。dev-outdate 是原实现的只读归档，不自动合入或部署；main 是独立生产线。
- 切换基线：原 dev=f3289231bb3fd50941980eb146b5e5667095b034，原 dev-vue3=790373d7381fc3d35c60158816e6cfb456d13eca。历史提交与标签不改写。
- 源码、测试、配置、脚本与 npm 命令使用正常名称，不新增 vue3 后缀。本目录和迁移文档继续保留 vue3 标识。
- 44381 及历史带 vue3 名称的容器/卷/网络/私有目录/锁保持，防止误操作 44380。默认镜像 dev / sha-<完整SHA>；旧 Vue 镜像标签和参数只保留兼容。
- 提交、推送、PR、合并、部署仍按每次授权执行。当前分支名变化不构成操作 main/生产或清理旧环境的授权。

## 默认入口

Node.js ≥24.15.0，锁定依赖且保留 optional 包。
```powershell
npm ci --include=optional
npm run check
npm run test:unit
npm run build
# 配置独立 DATABASE_URL / QSL_DATA_DIR 后运行
npm start
```

- client/ 为 Vue 源码与测试；client/index.html / runtime.ts 为默认入口；tools/build.mjs 生成 dist-public。
- HTML 引用 /build/index-<hash>.js，脚本/CSS/Worker/图片均版本化。缓存策略见 [CDN 指引](CDN缓存与资源版本化-vue3.md)。
- npm run dev 先构建后监听服务端；未增加前端 HMR。npm run start:legacy / dev:legacy 仅作原生对照。
- QSL_PUBLIC_DIR 为静态根配置，QSL_PUBLIC_DIR_VUE3 仅为旧别名；Vue Router/Pinia 独占 SPA 路由及全局状态，token 仍由同一 API 管理。全部业务页面（含后台）已迁入 Vue。

## 验证与发布

npm run test:e2e 使用 tools/serve-test.mjs 的隔离 PostgreSQL 与合成数据；Windows 可设置 QSL_BROWSER_CHANNEL=msedge。后端为 npm test / npm run test:production。历史绿色记录不能替代本轮证据。

Dockerfile / compose.yaml 使用 Vue 默认构建，.github/workflows/ci.yml 只对 dev/main PR 或 push、版本标签和手动触发运行；dev-outdate 不参与常规发布。

测试服使用 deployment/deploy-dev.sh，主参数 QSL_EXPECTED_REVISION，固定 SHA 镜像；只有该完整 SHA 的测试及镜像发布成功后才能部署。旧 vue3 profile / QSL_EXPECTED_REVISION_VUE3 为兼容别名，不能指向原 44380。首次初始化脚本不能在既有环境重跑。

详见 [测试服发布](测试服发布-vue3.md)、[实施方案](实施方案-vue3.md)、[迁移进度](迁移进度-vue3.md)、[命名标准化历史](命名标准化-vue3.md)。真实手机 3D、实际 CDN 边缘和生产验收仍按各自范围执行。

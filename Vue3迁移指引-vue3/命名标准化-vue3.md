# 命名与默认入口标准化 — vue3

日期：2026-11-15。用户明确 Vue3 将作为本线长期默认实现，取消非文档文件/目录/npm 命令的 vue3 后缀，并选择同步切换默认构建和运行入口。本次不提交、不推送、不部署。

## 当前名称 — vue3

| 旧名称 | 当前名称 |
| --- | --- |
| client-vue3/、contest-vue3/、e2e-vue3/ | client/、contest/、e2e/ |
| Home-vue3.vue、router-vue3.ts 等 | Home.vue、router.ts 等 |
| xxx-vue3.test.ts / xxx-vue3.spec.mjs | xxx.test.ts / xxx.spec.mjs |
| tools/build-vue3.mjs、start-vue3.mjs | tools/build.mjs、start.mjs |
| dist-public-vue3/build-vue3/entry-vue3.js | dist-public/build/entry.js |
| build:vue3 / check:vue3 / test:vue3 / test:e2e:vue3 | build / check / test:unit / test:e2e |
| start:vue3 / dev:vue3 | 默认 start / dev |
| Dockerfile-vue3 | 默认 Dockerfile |
| ci-vue3.yml 与旧 ci.yml | 单一 .github/workflows/ci.yml |
| compose-vue3.yaml | 已并入默认 Dockerfile，不再需要额外覆盖 |
| deploy-dev-vue3.sh 包装器 | deployment/deploy-dev.sh 默认 Vue3 profile |
| bootstrap-dev-vue3.sh | deployment/bootstrap-dev.sh |

MD 文件及本迁移目录保留名称。现有公共 DOM 隔离标识 data-vue3、类型/函数标识 Vue3 仍表达框架归属，不是文件后缀；本轮不为风格重写业务标识。历史提交不改写，后续不再强制提交/PR 标题后缀。

## 默认行为与边界 — vue3

- npm run build 构建，npm start / dev / demo 使用 Vue3；start.cmd 先构建再启动。浏览器 fixture 也直接测试 tools/start.mjs 默认入口。
- npm test 和 test:production 仍为后端套件；test:unit 为前端组件测试，test:e2e 为隔离浏览器测试。
- public 原生脚本和后台保持，只有 start:legacy / dev:legacy 显式提供原生对照。
- QSL_PUBLIC_DIR 为静态根配置；旧 QSL_PUBLIC_DIR_VUE3 保留为兼容别名。QSL_BROWSER_CHANNEL 为本机浏览器配置。
- dev-vue3 分支、44381、服务器容器/卷/网络、私有 env 文件、镜像兼容标签和部署锁保持隔离身份；文件名统一不构成任何远端操作。
- 部署脚本仅允许 Vue3 profile，初始化脚本也强制该 profile；仍核对完整 SHA、镜像修订、数据卷/端口、备份与回退。原测试服使用原分支脚本，不能被本线入口更新。
- 批量整理前已保存本地文本快照与路径映射至 ignored artifacts，保留全部既有未提交工作和 .gitignore 的 /.zcode/。

验证结果见 [迁移进度](迁移进度-vue3.md) 中本次标准化记录；本机验证不替代 Docker/Alpine、远端 CI 或真实设备验收。

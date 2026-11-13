# 44381 测试服发布指引 — vue3

本指引仅适用于独立 Vue3 测试站点，不操作原 `44380` 应用或生产。每次提交/推送/部署都须有对应授权，目录中的示例命令不代表永久授权。

| 项目 | 固定身份 |
| --- | --- |
| 团队分支 | `9ham-Team/qslink.web` 的 `dev-vue3` |
| CI | `.github/workflows/ci-vue3.yml`，测试成功后才发布镜像 |
| 镜像标签 | `ghcr.io/9ham-team/qslink.web:dev-vue3`、`:sha-<完整SHA>-vue3` |
| 测试入口 | `http://43.142.58.20:44381` |
| 应用 / PostgreSQL | `qslink-test-app-vue3` / `qslink-test-db-vue3` |
| 网络 | `qslink-test-net-vue3` |
| 上传卷 / 数据库卷 | `qslink-test-uploads-vue3` / `qslink-test-dbdata-vue3` |
| 主机端口 → 容器 | `44381:8787`，数据库不发布端口 |
| 服务器私有目录 | `/root/qslink-vue3`，root:700 |

## 首次部署 — vue3

首次部署已由用户明确选择复制原 `44380` 的测试数据。使用 [bootstrap-dev-vue3.sh](../deployment/bootstrap-dev-vue3.sh)，同时上传同目录的 [deploy-dev-vue3.sh](../deployment/deploy-dev-vue3.sh) 与 [deploy-dev.sh](../deployment/deploy-dev.sh)。文件上传前核实远端目录，核对传输校验和并执行 `bash -n`。

初始化脚本检查新资源不存在和端口空闲，核对源测试应用确实连接 `qslink-test-db/qslink/public`，读取源库 pg_dump 与只读上传卷快照。快照保存在 `/root/qslink-vue3/backups/bootstrap-<UTC>-<短SHA>-vue3/`。随后创建独立数据库、凭据及上传卷并恢复数据；失败保留数据与配置供排查，不自动删除卷，也不覆盖既有 Vue3 数据。

凭据由服务器生成并仅写入 root:600 的 `app-vue3.env` / `database-vue3.env`，禁止打印或提交。新应用显式使用 `development`（HTTP 测试入口）、`demo=false`、独立数据库 URL 与 `QSL_PUBLIC_ORIGIN=http://43.142.58.20:44381`；邮件、云邮件访问凭据和审核 Webhook 均为空，避免复制数据后误发通知。保持测试站原账户和内容，不能把它称为无数据空环境。

只有目标完整 SHA 的测试与 GHCR 发布均成功后，才执行：

```bash
QSL_EXPECTED_REVISION_VUE3=<已核验完整SHA> bash /root/qslink-vue3/bootstrap-dev-vue3.sh
```

`pg_dump` 提供数据库一致快照，上传文件在其后单独归档；二者并非跨存储原子快照。复制完成后核验卡片、用户、图片与页面，原测试服在复制期间持续运行，不停止原应用或数据库。若检测到复制期间删除造成的缺图，应重新制定补齐方案，不向原环境写回。

## 后续更新 — vue3

使用包装器复用原部署脚本的锁定、环境继承、旧容器保留、健康等待与失败恢复。必须指定完整 SHA，脚本拉取 `sha-<SHA>-vue3` 固定标签并验证 OCI revision，不能把浮动 `dev-vue3` 标签当作已核验版本。

```bash
QSL_EXPECTED_REVISION_VUE3=<已核验完整SHA> bash /root/qslink-vue3/deploy-dev-vue3.sh
```

更新前记录当前镜像、状态、挂载、网络和必要数据备份。成功后保存脚本输出的旧容器名；首次部署没有旧 Vue3 容器可回退。数据库/上传快照与旧容器不是同一种备份，恢复旧程序不撤销用户之后的业务写入。

## 验收与记录 — vue3

核对 running/healthy、`44381` 端口、独立卷/网络、实际 OCI revision、镜像 digest 和 `/api/config` 的完整 SHA；检查首页、深链接、生成的 Vue3 入口与动态块。使用公开主页验证 Vue 挂载、排序与旧页面往返，桌面/移动视口均检查。确认原 `44380` 容器 ID、启动时间和健康未改变，数据库仍运行。

每次发布记录目标提交、对应 CI 链接、镜像 digest、运行版本、时间、备份路径、健康检查及尚未验证的项目，不公开密码、完整容器环境或用户数据。手机模拟与接口健康不能代表真机 3D 闪烁已解决。

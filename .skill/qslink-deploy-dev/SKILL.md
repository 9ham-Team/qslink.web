---
name: qslink-deploy-dev
description: Publish QSLink Vue development changes through team dev, verify exact SHA CI/GHCR, and deploy only to isolated 44381.
---

# QSLink dev 发布与测试服部署

2026-11-15 用户授权 Vue3 正式接管 dev；原实现归档为 dev-outdate。先读 [主线切换指引](../../Vue3迁移指引-vue3/正式dev主线切换-vue3.md) 和 [发布指引](../../Vue3迁移指引-vue3/测试服发布-vue3.md)。

## 授权

- 修改、commit、push、PR 创建、合并、部署与回滚分别核对用户授权；完整流程已获授权时不重复确认。普通任务不推断永久授权。
- 默认从 upstream/dev 建功能分支，经团队内部 PR 合入 dev；获准完整 PR 发布流程时提交、推送、创建、核验后 merge commit 合并及部署无需逐步再确认。当前用户明确要求在长期分支提交/推送/部署时，核对当前范围与快进关系后执行。
- 仅要求部署时不自动提交本地修改；不提交 /.zcode/ 等既有无关改动。显式列出暂存文件，不使用 git add . / -A。
- 不操作 main/生产，不强推、清数据卷或全局 prune；dev-outdate 是只读归档，维护需要单独授权。本指南不用于原 44380。

## 固定身份

| 项目 | 目标 |
| --- | --- |
| 仓库 / 分支 | https://github.com/9ham-Team/qslink.web.git / upstream/dev |
| 测试入口 | http://43.142.58.20:44381 |
| 镜像 | ghcr.io/9ham-team/qslink.web:sha-<完整SHA> |
| 应用 / DB | qslink-test-app-vue3 / qslink-test-db-vue3 |
| 网络 / 上传卷 | qslink-test-net-vue3 / qslink-test-uploads-vue3 |
| 端口 / 挂载 | 44381:8787 / /var/lib/qslink |
| 脚本 / 私有目录 | deployment/deploy-dev.sh / /root/qslink-vue3 |

容器、卷和私有目录中的 vue3 是隔离身份，不随分支改名。主参数 QSL_EXPECTED_REVISION 必须为完整 SHA；旧 QSL_EXPECTED_REVISION_VUE3 / vue3 profile 仅保留兼容，新旧值冲突立即停止。

## 流程

1. 核对 status、暂存/未暂存差异、当前分支、upstream URL、目标完整 SHA 和授权。保留所有其他任务改动，读最新部署脚本和 CI。
2. 按授权提交。PR 流程复用同 head/base=dev 的现有 PR，团队仓库内部提交，PR 用 merge commit；创建/继续处理的 PR 必须 attach_artifact。获准直推时只做快进；分叉时停止，不自行 rebase/强推。
3. 查询目标完整 SHA 的 .github/workflows/ci.yml push 运行。API smoke tests 与 Publish image to GHCR 必须均 success，PR 的绿色或被跳过的发布不能替代。失败、取消、head 变化时说明并停止，不擅自扩大修复范围。
4. 核对远端 dev 仍指向目标 SHA，镜像使用固定 SHA 标签，记录 digest 和 OCI revision，不用浮动 dev 标签部署。
5. 用已有经核实的 SSH 身份和主机信任连接服务器，BatchMode / StrictHostKeyChecking 开启；不猜凭据、关闭主机校验或输出全部容器环境。
6. 核对应用、DB、原 44380 的 ID、启动时间、健康、端口、网络与卷，记录旧镜像和必要数据快照；数据库与上传归档不是跨存储原子快照。
7. 上传本仓库最新脚本至已确认的常规文件路径，检查校验和与 bash -n。执行 QSL_EXPECTED_REVISION=<完整SHA> bash /root/qslink-vue3/deploy-dev.sh。不得绕开脚本的锁、旧哈希资源保留、环境继承、旧容器保留、健康等待和失败恢复。
8. 部署后再次验证实际 OCI revision、running/healthy、固定端口与卷、DB 和原 44380 未替换，检查入口与 /api/config 及本次功能。缓存改动检查新旧资源和缓存头；直接 IP 验收不能声称 CDN 面板已配置。
9. 记录真实回退容器、数据快照、CI URL、镜像 digest 和验证范围。容器回退不撤销之后的数据写入；成功部署后的主动回滚另行授权。

首次初始化只在资源不存在且另获授权时使用 bootstrap-dev.sh，不能对已部署环境重跑。CDN 控制台、域名/线路、生产发布均不因 dev 测试服发布而自动获授权。

# Vue3 正式接管 dev — vue3

2026-11-15 用户明确授权执行：原 dev → dev-outdate，dev-vue3 → dev。此决定替代此前不得重命名 dev-vue3 的限制。保留全部提交历史，不合并、不 rebase、不强推，不修改 main/生产。

## 切换前基线

- 原 dev：f3289231bb3fd50941980eb146b5e5667095b034。
- Vue3 dev-vue3：790373d7381fc3d35c60158816e6cfb456d13eca，已验收部署到 44381。
- GitHub 默认分支原为 dev，无开放 PR；两条开发分支均未启用保护。main 的既有 Protect main 规则保持。

## 正式约定

- 团队默认开发分支与新功能 PR 的 base 均为 dev，默认实现是 Vue3。dev-outdate 只读归档，不参与常规开发或镜像发布。
- CI 的 push/PR 目标为 dev / main；dev 发布 dev、sha-<完整SHA>。同时保留 dev-vue3 / sha-<完整SHA>-vue3 镜像标签兼容旧发布工具；标签中的 vue3 不再代表存在同名分支。
- deployment/deploy-dev.sh 默认 dev profile，主参数为 QSL_EXPECTED_REVISION；QSL_DEPLOY_PROFILE=vue3 和 QSL_EXPECTED_REVISION_VUE3 仅为旧工具别名。新旧 SHA 同时存在且不同会拒绝部署。
- 44381、qslink-test-app-vue3、qslink-test-db-vue3、现有网络/卷、/root/qslink-vue3 和部署锁均保持。新 dev 绝不因同名而更新旧 44380。
- 原 dev-outdate/44380 如需维护，必须显式授权并使用归档分支自己的发布脚本；不能使用当前 dev 的默认脚本。
- main 继续是生产线，生产发布另行授权。后续 Vue3 合入 main 必须审查真实代码差异；本轮不自动创建生产 PR。

## 其他开发者本地同步

先保存或确认未提交修改归属，核对本地分支 SHA 与以上基线，禁止直接 reset。以下适用于还保留旧 dev / dev-vue3 两个名字的本地仓库；如果名字已调整，不重复执行。
```powershell
git branch -m dev dev-outdate
git branch -m dev-vue3 dev
git fetch upstream
git branch --set-upstream-to=upstream/dev-outdate dev-outdate
git branch --set-upstream-to=upstream/dev dev
```

GitHub 网页重命名不会自动修改其他机器、个人 origin 仓库或旧聊天内的文字。检查正在进行的功能分支基线；新功能从 upstream/dev 创建。历史功能分支如仍以原实现为基线，可显式把其跟踪目标改成 upstream/dev-outdate；不要直接 pull 造成非预期整合。本轮只调整本机两条长期分支，不批量改其他任务的功能分支。

## 验证与发布记录

重命名应通过 GitHub rename API 保留分支关系；先改旧 dev，再改 Vue3 分支，最后确认默认分支为新 dev。dev-outdate 应锁定写入，禁止强推与删除；若平台不支持保护，应如实记录，不能只靠文档声称锁定。

配套配置提交推送到新 dev 后，等待该完整 SHA 的测试与 GHCR 发布都成功，再按标准脚本验收 44381。分支、规则、CI、运行镜像及回退记录保存在本次发布记录中。既有 /.zcode/ 的 .gitignore 修改不纳入提交。

## 原 44380 的镜像固定要求

现场只读核验：旧 44380 运行的 OCI revision 为 0134fa4c90be76f2cf4e73def08acbea0fd914cb，固定镜像为 ghcr.io/9ham-team/qslink.web@sha256:445ea667f145a7a224bc32be1071771a41361667baffc634d5fdfc74feeea677。它与归档分支最新提交 f328923 不同，不能把分支改名当作已经部署归档最新代码。

dev 镜像标签从本轮起指 Vue3。dev-outdate 中的历史发布脚本若仍硬编码 :dev，不能原样运行；以后维护旧 44380 必须另获授权，先把维护副本的镜像固定为经核验的旧 SHA/digest，再检查其锁、容器、端口与回退流程。原容器已经按镜像 ID 固定，本轮不改旧容器或旧服务器脚本。

本次未发现匹配的 root cron / /etc/cron.d 自动部署任务或容器镜像自动更新器；systemd 中匹配到的是备份定时器。GitHub 无仓库 webhook。这里只记录核验范围，不替代其他机器、外部 CI 或人工脚本的同步。

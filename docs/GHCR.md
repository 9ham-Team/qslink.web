# GitHub Actions 自动发布到 GHCR

工作流位于 `.github/workflows/ci.yml`：先完成现有 CI，再构建生产 Docker 镜像并推送 GitHub Container Registry。只发布网站应用镜像；PostgreSQL 17 和 Caddy 继续使用官方镜像。

## 触发与验证

| 操作 | 验证 | 发布镜像 |
| --- | --- | --- |
| 向 `main`、`dev` 提交 PR | 执行 CI | 不发布 |
| push / 合并到 `main` | 执行 CI | 成功后发布 `main`、`latest`、`sha-<完整提交SHA>` |
| push / 合并到 `dev` | 执行 CI | 成功后发布 `dev`、`sha-<完整提交SHA>` |
| 推送 `v1.2.3` 等版本标签 | 执行 CI | 成功后发布 `1.2.3`、`1.2`、`sha-<完整提交SHA>` |
| 在 Actions 手动运行 | 执行 CI | 仅所选 ref 为 `main`、`dev` 或 `v*` 标签时发布 |

版本标签不会更新 `latest`；`latest` 始终跟随通过 CI 的 `main`。SemVer 标签使用 `v1.2.3` 等规范格式；不符合 SemVer 的 `v*` 标签仍有 SHA 标签，但不会生成版本号标签。

`publish` job 依赖 `test` job 成功。验证包括 API 冒烟、生产隔离、Compose 配置、Docker 构建、容器启动和 Caddy 配置。测试失败或运行被取消时，不会进入发布 job。PR 包括 fork PR 均不执行 GHCR 登录和发布。

工作流会构建 **Linux AMD64** 应用镜像，生成 OCI 标签、构建来源信息和 SBOM，并使用 GitHub Actions 构建缓存。

## 镜像地址

根据运行工作流的仓库自动生成，并转为小写：

```text
ghcr.io/<仓库所有者>/<仓库名>:main
ghcr.io/<仓库所有者>/<仓库名>:dev
ghcr.io/<仓库所有者>/<仓库名>:latest
ghcr.io/<仓库所有者>/<仓库名>:sha-<完整提交SHA>
ghcr.io/<仓库所有者>/<仓库名>:1.2.3
```

团队仓库运行时发布到团队名下；个人 fork 运行时发布到个人名下。仓库重命名后，新运行会使用新仓库名，不自动搬迁已有 package。

成功后在该次 Actions 运行的 Summary 查看精确镜像地址、所有标签和 digest。生产部署建议固定 SHA 标签或 `@sha256:...` digest，以便明确版本及回退。

## GitHub 配置

1. 将此工作流提交并推送到相应仓库。只有本地文件时不会触发云端发布；仅推送功能分支也不会发布。
2. 在仓库 **Settings → Actions** 允许运行 GitHub Actions 及工作流使用的 Docker 官方 Actions。组织策略也需要允许。
3. 发布 job 显式请求 `contents: read`、`packages: write`，使用 GitHub 自动提供的 `GITHUB_TOKEN` 登录 GHCR，通常不需要另建 PAT 或手工配置发布密钥。
4. 如果同名 GHCR package 已经存在，检查 package 的 **Manage Actions access**，确保当前仓库具有写权限。组织策略限制 package 创建或写权限时，由管理员授予实际所需权限。
5. 首次发布后，在 GitHub 的 **Packages** 页面确认可见性。新 package 通常为私有；公开源码不代表镜像自动公开。是否公开由维护者自行决定。

工作流不把真实 `.env`、数据库或上传文件打进镜像，使用现有 Dockerfile 和 `.dockerignore`。数据库、应用配置和文件仍由服务器上的持久化卷及环境变量管理。

## 服务器通过 Compose 使用 GHCR 镜像

在已有部署的 `.env` 中增加镜像地址，将下面占位符替换为 Actions Summary 中的实际值：

```dotenv
QSL_APP_IMAGE=ghcr.io/<owner>/<repository>:sha-<full-commit-sha>
```

也可以使用精确 digest：

```dotenv
QSL_APP_IMAGE=ghcr.io/<owner>/<repository>@sha256:<digest>
```

保留已有的 `QSL_DOMAIN`、数据库密码和邮件配置。

私有镜像需要先登录。在服务器交互执行 `docker login ghcr.io -u YOUR_GITHUB_USERNAME`，在密码提示中输入具备 `read:packages` 且能读取目标 package 的 PAT（classic）；涉及组织 SSO 时还需按组织要求授权。不要把令牌写进命令参数或提交到 Git。公开镜像通常可以匿名拉取。

在仓库部署目录执行：

```bash
docker compose -f compose.yaml -f compose.ghcr.yaml config --quiet
docker compose -f compose.yaml -f compose.ghcr.yaml pull app
docker compose -f compose.yaml -f compose.ghcr.yaml up -d --no-build --wait
docker compose -f compose.yaml -f compose.ghcr.yaml ps
```

`compose.ghcr.yaml` 为 app 指定镜像和拉取策略，`--no-build` 确保不会使用基础 Compose 中的本地构建配置。需要拉取指定镜像的网络访问能力。

已有 IP HTTPS 部署时保留 IP 覆盖文件，命令中的 Compose 文件顺序为：

```bash
docker compose -f compose.yaml -f compose.ip.yaml -f compose.ghcr.yaml up -d --no-build --wait
```

首次上线仍需初始化管理员，迁移旧站仍需先恢复数据库和上传文件；详见 [部署指南](DEPLOYMENT.md) 和 [迁移流程](SERVER-MIGRATION.md)。不要在已有真实数据的数据库上重新初始化管理员。

上面的 GHCR 覆盖文件用于仓库的 `compose.yaml`，不用于离线包中带 `pull_policy: never` 的交付版本。离线包继续按它自己的 README 加载镜像。

## 发布和部署的边界

本流程在 CI 成功后自动把镜像推送到 GHCR，不连接生产服务器、不更改端口、不修改 DNS，也不自动执行生产部署。服务器更新由维护者选择明确镜像版本后执行；更新前保留备份和上一个镜像引用。

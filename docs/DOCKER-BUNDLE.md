# Docker 离线镜像一键打包

生成 Linux AMD64 的完整离线包，包含 app、PostgreSQL 17、Caddy 三个镜像，可在新服务器直接 `docker load`，无需再次构建或拉取。真实数据库、上传文件、`.env` 和证书私钥单独备份，不进入镜像包。

## 脚本

| 脚本 | 职责 |
| --- | --- |
| `tools/package-migration.sh` | 一键执行完整构建、验证和打包流程 |
| `tools/package-migration.ps1` | Windows 入口，调用指定 WSL 发行版中的 Linux 脚本 |
| `tools/build-migration-images.sh` | 拉取 Node/PostgreSQL/Caddy AMD64 基础镜像，构建 app，标记三个交付镜像 |
| `tools/prepare-migration.mjs` | 生成无需构建的 Compose、初始化/数据恢复脚本和部署说明 |
| `tools/verify-migration.sh` | 在两个隔离的临时 Compose 项目中验证启动、HTTPS、登录与数据恢复 |
| `tools/export-migration-images.sh` | `docker save`、记录镜像 ID、生成校验和及 `.tar.gz` |
| `tools/migration-common.sh` | 版本、Docker 引擎和镜像架构检查的共享函数 |

## Linux 一键打包

要求 Git、Linux Docker Engine、Docker Compose **v2.24.4+**、`sh`、`tar`、`sha256sum` 和常见系统工具。Compose 版本要求来自测试覆盖配置中的 `!reset` 语法；只有构建和导出镜像时无需该测试功能。

执行用户需要有 Docker 权限，并能在仓库的 `artifacts/` 目录中写入文件。默认拉取官方镜像，需要能访问 Docker Hub 和 npm registry。

```bash
cd <your_repo_dir>
sh tools/package-migration.sh
```

不要求本机安装 Node.js：没有 Node.js 时，脚本会使用刚构建的 app 镜像运行迁移文件生成器。若本机已有 Node.js，则要求 Node.js 18+。

默认依次执行：

1. 检查工作区、Docker 引擎、Compose、镜像架构和已有输出。
2. 拉取 `node:24-alpine`、`postgres:17-alpine`、`caddy:2-alpine` 的 Linux AMD64 镜像。
3. 使用仓库 `Dockerfile` 构建 `qslink/app:<revision>`，设置源码版本标签。
4. 生成 Compose、配置模板、初始化/恢复脚本及部署说明。
5. 校验域名/IP 两种 Compose、Shell 脚本和 Caddy 配置。
6. 创建临时测试项目，验证三个容器启动、HTTPS、HTTP 跳转、数据库及上传文件恢复、原账号登录和拒绝覆盖已有数据库。测试不发布本机端口，完成后仅清理本次测试资源。
7. 使用 `docker image save` 导出三个镜像到 `images.tar`。
8. 生成镜像 ID、验证记录、文件级 SHA256 校验和，压缩并检查最终 `.tar.gz`，再生成压缩包 SHA256。

## Windows / WSL 一键打包

Windows 需要 WSL；Docker 引擎、Git、Compose 和打包工具应在所选 WSL 发行版中可用。可在仓库根目录使用 PowerShell：

```powershell
.\tools\package-migration.ps1
```

默认 WSL 发行版为 `Ubuntu-24.04`。指定发行版或以 WSL root 访问 Docker：

```powershell
.\tools\package-migration.ps1 -Distro Ubuntu-24.04 -WslRoot
```

脚本只对本次 Git 命令信任当前工作区，避免 Windows/WSL 文件所有权差异造成失败，不修改全局 Git 设置。

## 可选参数

### 使用已经下载的官方基础镜像

当三个基础镜像已存在于本地、无需刷新时：

```bash
sh tools/package-migration.sh --skip-pull
```

```powershell
.\tools\package-migration.ps1 -WslRoot -SkipPull
```

此参数仅跳过基础镜像拉取。Dockerfile 的 npm 安装仍可能需要网络，除非相关构建层已缓存；镜像缺失或架构不符会失败。

### 包含尚未提交的开发改动

默认要求工作区干净。开发期间可明确允许未提交改动：

```bash
sh tools/package-migration.sh --allow-dirty
```

```powershell
.\tools\package-migration.ps1 -WslRoot -AllowDirty
```

输出版本会带有 `-dirty-<UTC时间>`，避免把未提交内容误认为正式提交版本。打包期间不要编辑仓库文件；正式分发应先提交代码，再从干净工作区打包。

### 跳过容器运行与恢复演练

```bash
sh tools/package-migration.sh --no-verify
```

```powershell
.\tools\package-migration.ps1 -NoVerify
```

仍会检查 Compose、脚本语法和 Caddy 配置；包内 `VALIDATION.txt` 会明确标注容器运行和数据恢复检查未执行。正常交付建议保持默认验证。

### 构建网络与代理

Docker 引擎拉取镜像需要自行具备仓库网络访问能力；构建脚本不会修改 Docker 守护进程的代理或镜像仓库配置。

构建时可使用当前环境中的标准 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 及其小写变量，通过 Docker 预定义构建参数传入。如果代理只在 Linux 宿主机回环地址监听，可按环境需要设置构建网络：

```bash
QSL_BUILD_NETWORK=host sh tools/package-migration.sh --skip-pull
```

不要把代理账号或其他密钥写进 Dockerfile、仓库或文档。

## 输出

```text
artifacts/
  qslink-<revision>-linux-amd64/
    images.tar
    compose.yaml
    compose.ip.yaml
    deploy/
    setup.sh
    export-data.sh
    restore-data.sh
    README.md
    VERSION
    IMAGES.txt
    VALIDATION.txt
    SHA256SUMS
  qslink-<revision>-linux-amd64.tar.gz
  qslink-<revision>-linux-amd64.tar.gz.sha256
```

`artifacts/` 已被 Git 忽略。脚本使用固定文件清单导出压缩包，额外放入目录的真实备份或凭据不会被递归打包。

同版本的输出目录或归档已存在时，脚本拒绝覆盖。请保留已有交付物；如果上次构建失败，先检查残留输出和日志，再决定移走或删除哪些本次产物。并行构建同一版本会被锁目录阻止。

## 单独构建或导出

只构建并标记镜像：

```bash
sh tools/build-migration-images.sh
```

已有准备好的目录、Compose 和 `VALIDATION.txt`，尚未执行 `docker save` 时，可单独导出和压缩：

```bash
sh tools/export-migration-images.sh '<your_repo_dir>/artifacts/qslink-<revision>-linux-amd64'
```

它使用目录中的 `VERSION` 选择 app 镜像，不使用后续变化的 Git HEAD，且会拒绝覆盖已有镜像归档或压缩包。一般使用一键入口即可。

## 新服务器运行

将最终 `.tar.gz` 和 `.sha256` 上传到新服务器，校验、解压后按包内 `README.md` 初始化。已有网站的数据迁移详见 [新服务器部署与备份恢复流程](SERVER-MIGRATION.md)。

打包脚本不会连接生产服务器、备份真实数据、修改 DNS、发布镜像仓库或自动推送 Git 分支。

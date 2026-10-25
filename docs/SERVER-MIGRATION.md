# QSLink 新服务器部署与备份恢复流程

适用：Linux x86_64 / AMD64，新服务器沿用原域名，允许公网 HTTP/HTTPS。本文只提供操作流程，不代表已部署到新服务器。

## 1. 准备文件和新服务器

本次使用两个压缩包：

| 文件 | 用途 |
| --- | --- |
| `qslink-be57db257036-linux-amd64.tar.gz` | 约 195 MiB，包含网站、PostgreSQL 17、Caddy 三个镜像和 Compose |
| `migration-20261025T034857Z.tar.gz` | 约 13.3 MiB，包含旧服务器数据库、上传文件、配置和证书 |

本地文件位置示例：将 `<your_dir>` 替换成你保存这些文件的目录，各文件也可以分别使用自己的实际目录。

```text
<your_dir>/qslink-be57db257036-linux-amd64.tar.gz
<your_dir>/qslink-be57db257036-linux-amd64.tar.gz.sha256
<your_dir>/migration-20261025T034857Z.tar.gz
<your_dir>/migration-20261025T034857Z.tar.gz.sha256
```

备份时间为 **2026-10-25 11:48:57（香港时间）**。该备份已通过校验，并在隔离 PostgreSQL 中实际恢复成功。如果旧站此后有新增或修改数据，应在最终切换前停止写入并重新备份，替换下面的备份文件名。

新服务器要求：

- Linux AMD64，建议至少 2 GB 内存，预留数 GB 磁盘空间及后续数据增长空间。
- 已安装 Docker Engine 和 Docker Compose v2；安装说明见 [Docker 官方文档](https://docs.docker.com/engine/install/)。
- SSH 可用；云安全组和系统防火墙允许 TCP 80、443。仅开放所需入口，不公开应用端口 8787 和数据库端口 5432。
- 80、443 未被其他 Nginx、Apache、Caddy 或容器占用。
- 新服务器能出站访问证书签发服务及邮件服务。镜像加载和数据库恢复不需要访问镜像仓库。

以下示例使用 root；其他用户需具备 Docker 操作权限。在新服务器检查：

```bash
uname -m
docker version
docker compose version
docker ps
ss -lntp | grep -E ':(80|443)\b' || true
```

`uname -m` 应为 `x86_64`。下面使用的 Compose 项目名为 `qslink`；如果新服务器已有同名项目，先核对，避免操作其他服务。

## 2. 从本机上传四个文件

在本机终端中执行，将 `<your_dir>` 替换成文件所在目录，将 `NEW_SERVER_IP` 替换成新服务器 IP：

```powershell
ssh root@NEW_SERVER_IP "install -d -m 700 /root/qslink-migration"

scp '<your_dir>/qslink-be57db257036-linux-amd64.tar.gz' root@NEW_SERVER_IP:/root/qslink-migration/
scp '<your_dir>/qslink-be57db257036-linux-amd64.tar.gz.sha256' root@NEW_SERVER_IP:/root/qslink-migration/
scp '<your_dir>/migration-20261025T034857Z.tar.gz' root@NEW_SERVER_IP:/root/qslink-migration/
scp '<your_dir>/migration-20261025T034857Z.tar.gz.sha256' root@NEW_SERVER_IP:/root/qslink-migration/

ssh root@NEW_SERVER_IP
```

后续命令均在新服务器上执行。备份内有用户数据、密码和私钥，不要放进网站静态目录或上传到公开仓库。

## 3. 校验并解压

```bash
set -e
umask 077
cd /root/qslink-migration

sha256sum -c qslink-be57db257036-linux-amd64.tar.gz.sha256
sha256sum -c migration-20261025T034857Z.tar.gz.sha256

install -d -m 700 /opt/qslink-migration
tar -xzf qslink-be57db257036-linux-amd64.tar.gz -C /opt/qslink-migration
tar -xzf migration-20261025T034857Z.tar.gz

cd /root/qslink-migration/migration-20261025T034857Z
sha256sum -c SHA256SUMS
```

所有项目应显示 `OK`；任一失败时先重新传输，不继续恢复。

## 4. 加载镜像并配置原域名

把 `your.original.domain` 换成原域名，不带 `https://`、端口和路径：

```bash
cd /opt/qslink-migration/qslink-be57db257036-linux-amd64
sh setup.sh your.original.domain
```

该脚本加载三个镜像、创建带随机数据库密码的 `.env` 并验证 Compose，不启动网站。若 `.env` 已存在，脚本会拒绝覆盖；不要为了重跑而删除已有正式配置。

### 恢复邮件配置

先在私有目录解开旧配置：

```bash
cd /root/qslink-migration/migration-20261025T034857Z
tar -xzf config.tar.gz
chmod 700 config
chmod 600 config/.env
```

用编辑器查看旧 `config/.env`，把下面这些实际存在的邮件配置复制到新部署目录的 `.env`：

```dotenv
ALIBABA_CLOUD_ACCESS_KEY_ID=旧配置中的值
ALIBABA_CLOUD_ACCESS_KEY_SECRET=旧配置中的值
QSL_MAIL_REGION=旧配置中的值
QSL_MAIL_ENDPOINT=旧配置中的值
QSL_MAIL_FROM=旧配置中的值
QSL_MAIL_FROM_NAME=旧配置中的值
```

可选项在旧配置中没有设置时，继续留空或使用原默认值。保留 setup.sh 新生成的 `POSTGRES_PASSWORD` 和 `QSL_DB_PASSWORD`，并确认 `QSL_DOMAIN` 是原域名。不要把整个旧 `.env` 覆盖到新 `.env` 上。

```bash
cd /opt/qslink-migration/qslink-be57db257036-linux-amd64
chmod 600 .env
docker compose config --quiet
```

## 5. 恢复数据库和上传文件

目标数据库和上传目录必须为空。此时不要创建管理员，不要先启动 app 或完整网站。

```bash
cd /opt/qslink-migration/qslink-be57db257036-linux-amd64

sh restore-data.sh /root/qslink-migration/migration-20261025T034857Z
```

脚本会启动数据库、校验备份、检查目标为空，然后恢复 `database.dump` 和 `uploads.tar.gz`。成功时会显示 `Restored`。

原账号、管理员、卡片和换卡记录随数据库恢复，图片随上传文件恢复。**不再运行 `server/init-admin.js`。**

如果提示数据库不为空，先检查是否曾误启动或初始化过新站；脚本会拒绝覆盖。不要直接执行 `docker compose down --volumes`。如果恢复中途失败，保留原始备份和错误日志，确认如何处理目标卷后再重试。

## 6. 先验证应用，再切换域名

```bash
cd /opt/qslink-migration/qslink-be57db257036-linux-amd64

docker compose up -d --wait app

docker compose exec -T app node -e "fetch('http://127.0.0.1:8787/api/health').then(async r=>{console.log(await r.text());if(!r.ok)process.exit(1)})"

docker compose exec -T app node -e "fetch('http://127.0.0.1:8787/api/config').then(async r=>{const c=await r.json();console.log(c);if(!r.ok||c.demo||c.demoAccounts.length)process.exit(1)})"
```

预期：健康接口返回 `ok: true`、`storage: "postgresql"`，配置返回 `demo: false`、`demoAccounts: []`。

接下来在域名 DNS 控制台：

1. 将原域名的 A 记录指向新服务器 IPv4。
2. 如果配置了 AAAA 记录，也将它改成新服务器可用的 IPv6，或移除失效记录。
3. 若使用 DNS/CDN 代理，确认当前配置可让新服务器完成 ACME 证书验证；初次签发可先使用仅 DNS 解析。
4. 等待解析生效，确认指向新服务器：

```bash
getent ahostsv4 your.original.domain
```

DNS 缓存可能使部分访问暂时仍到旧服务器。切换期间避免两边同时写入。

## 7. 启动三个容器，验证 HTTP/HTTPS

确认新服务器公网 TCP 80、443 均已放行后：

```bash
cd /opt/qslink-migration/qslink-be57db257036-linux-amd64

docker compose up -d --wait
docker compose ps
docker compose logs --tail=100 proxy

curl -I http://your.original.domain
curl --fail https://your.original.domain/api/health
```

预期：app、db、proxy 三个容器运行，app 和 db 健康；HTTP 返回到 HTTPS 的跳转；HTTPS 健康接口成功。

Caddy 会为新服务器自动签发和续期原域名的证书。备份中的 `caddy-data.tar.gz`、`caddy-config.tar.gz` 留作单独灾难恢复，本流程不覆盖新服务器证书卷。HTTPS 尚未就绪时先检查 DNS、AAAA、80/443、防火墙和 proxy 日志，不通过忽略证书错误作为正式验收。

## 8. 在浏览器完成验收

- [ ] 用原管理员账号登录。
- [ ] 原用户、卡片、图片、分享链接和换卡记录均可查看。
- [ ] 上传新卡片、后台审核和权限控制正常。
- [ ] 注册邮件验证码正常发送和验证。
- [ ] 换卡流程和地址授权正常。
- [ ] 登录页没有演示账号入口，HTTPS 没有证书警告。
- [ ] 检查应用和数据库日志没有持续报错。

```bash
docker compose logs --tail=100 app db
```

不要公开复制包含用户信息的日志。验收完成后配置新服务器的定时备份，再考虑退役旧服务器；不要先删旧站或唯一备份。

## 9. 日常操作与回退

在新部署目录执行：

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs --tail=100 app db proxy

# 重启网站应用
docker compose restart app

# 停止服务，保留数据卷
docker compose stop

# 再次启动
docker compose up -d --wait
```

数据保存在 Docker 持久化卷中，运行期间不要删除卷。

若切换失败：先停止新站写入、保存新站产生的数据和日志，保留旧站和备份，再判断是否将 DNS 切回旧服务器。旧服务器目前仍处于备案停站状态，80/443 已关闭，切回 DNS 本身不会恢复旧站公网访问；是否恢复旧站入口需另行决定。

新站已经产生数据后，直接切回旧数据库会丢失这些新增数据，应先处理数据差异。不要把回退当成删除新卷或覆盖旧数据库。

## 本次已经验证与仍需现场验证的项目

已经验证：Linux AMD64 镜像构建和离线加载、三个容器启动、HTTP 跳转、带证书校验的测试 HTTPS 代理、数据库及上传文件迁移、恢复后登录、备份校验，以及真实旧站数据库的隔离恢复。

仍需在目标服务器完成：Docker 安装、域名和邮件配置、网络与 DNS 切换、公网证书签发、正式账号和业务验收。本文不修改旧服务器端口，不自动部署到新服务器。

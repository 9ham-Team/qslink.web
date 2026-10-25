import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Prepare a credential-free Linux AMD64 distribution. Build/save images separately.
const root = path.resolve(import.meta.dirname, '..');
const revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const out = path.join(root, 'artifacts', `qslink-${revision}-linux-amd64`);
await fs.mkdir(path.join(out, 'deploy'), { recursive: true });
let compose = await fs.readFile(path.join(root, 'compose.yaml'), 'utf8');
compose = 'name: qslink\n' + compose.replace('    build: .', `    image: qslink/app:${revision}\n    pull_policy: never`);
compose = compose.replace('    image: postgres:17-alpine', '    image: qslink/postgres:17-alpine\n    pull_policy: never');
compose = compose.replace('    image: caddy:2-alpine', '    image: qslink/caddy:2-alpine\n    pull_policy: never');
await fs.writeFile(path.join(out, 'compose.yaml'), compose);
for (const file of ['Caddyfile', 'Caddyfile.ip', 'init-postgres.sh']) {
  const content = await fs.readFile(path.join(root, 'deploy', file), 'utf8');
  await fs.writeFile(path.join(out, 'deploy', file), content.replaceAll('\r\n', '\n'));
}
await fs.copyFile(path.join(root, 'compose.ip.yaml'), path.join(out, 'compose.ip.yaml'));
await fs.writeFile(path.join(out, 'VERSION'), `${revision}\nlinux/amd64\n`);
await fs.writeFile(path.join(out, 'setup.sh'), `#!/bin/sh
set -eu
cd "$(dirname "$0")"
umask 077
if [ "$#" -ne 1 ]; then echo 'Usage: sh setup.sh your.domain.example (or public IP)'; exit 1; fi
if [ -e .env ]; then echo '.env already exists; refusing to replace it.'; exit 1; fi
sha256sum -c SHA256SUMS
docker load -i images.tar
docker run --rm --network none --entrypoint node qslink/app:${revision} -e 'const c=require("crypto"); console.log("POSTGRES_PASSWORD="+c.randomBytes(32).toString("hex")); console.log("QSL_DB_PASSWORD="+c.randomBytes(32).toString("hex"))' > .env
printf '%s' "QSL_DOMAIN=$1" >> .env
echo >> .env
chmod 600 .env
docker compose config --quiet
echo 'Images loaded and .env created. Follow README.md to restore data before starting app.'
`);
await fs.writeFile(path.join(out, 'export-data.sh'), `#!/bin/sh
# Run from the OLD deployment directory; does not modify or stop services.
set -eu
umask 077
dest=${'$'}{1:?Usage: sh export-data.sh /absolute/new-backup-directory}
case "$dest" in /*) ;; *) echo 'Use an absolute destination path'; exit 1;; esac
mkdir "$dest"
docker compose exec -T db pg_dump -U qslink -d qslink -Fc > "$dest/database.dump"
docker compose exec -T app tar -czf - -C /var/lib/qslink uploads > "$dest/uploads.tar.gz"
(cd "$dest" && sha256sum database.dump uploads.tar.gz > SHA256SUMS)
echo "Exported to $dest. Copy the original .env separately and keep it private."
`);
await fs.writeFile(path.join(out, 'restore-data.sh'), `#!/bin/sh
# Only restores to empty target volumes. Leaves the app/proxy stopped.
set -eu
cd "$(dirname "$0")"
src=${'$'}{1:?Usage: sh restore-data.sh /absolute/backup-directory}
case "$src" in /*) ;; *) echo 'Use an absolute backup path'; exit 1;; esac
(cd "$src" && sha256sum -c SHA256SUMS)
docker compose config --quiet
if [ -n "$(docker compose ps --status running -q app proxy)" ]; then echo 'Stop app and proxy before restoring'; exit 1; fi
docker compose up -d --wait db
tables=$(docker compose exec -T db psql -U qslink -d qslink -Atc "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")
if [ "$tables" != 0 ]; then echo 'Target database is not empty; refusing to overwrite'; exit 1; fi
docker compose run --rm -T --no-deps --entrypoint sh app -ec 'test ! -d /var/lib/qslink/uploads || test -z "$(ls -A /var/lib/qslink/uploads)"'
docker compose exec -T db pg_restore -U qslink -d qslink --no-owner --no-acl --exit-on-error < "$src/database.dump"
docker compose run --rm -T --no-deps --entrypoint tar app -xzf - -C /var/lib/qslink < "$src/uploads.tar.gz"
echo 'Restored. Start app with docker compose up -d --wait app, or all services with docker compose up -d --wait.'
`);
await fs.writeFile(path.join(out, 'README.md'), `# QSLink 离线迁移包（Linux AMD64）

应用源码版本：${revision}。包含 app、PostgreSQL 17、Caddy 三个 Docker 镜像；无需在目标服务器构建或拉取镜像。目标需要 Docker Engine 和 Compose v2+。

## 备案状态

旧服务器截至 2026-10-25 备案期间公网 80、443 暂时关闭。用户已明确新服务器允许 HTTP/HTTPS，本包默认包含公网 80/443 入口：HTTP 自动跳转 HTTPS。仅启动 db/app 时不会启动 proxy；完整启动会启动三个服务。本包不会自行修改服务器防火墙。

## 1. 旧服务器导出真实数据

镜像不包含真实数据库、上传文件、邮件密钥或证书。请先保存旧 .env 和部署配置到私有安全位置，不要提交到 Git。迁移窗口暂停写入，保留旧服务器和备份直到新服务器验证完成。

把 export-data.sh 拷到旧服务器，在原 compose.yaml 所在目录运行（app、db 必须运行）：

\x60\x60\x60sh
sh /path/to/export-data.sh /var/backups/qslink-migration
\x60\x60\x60

如旧部署使用 Compose 覆盖文件，先设置 COMPOSE_FILE，例如 export COMPOSE_FILE=compose.yaml:compose.ip.yaml；项目名称也应与旧部署一致。脚本先做 PostgreSQL 快照再复制不可变上传文件；暂停写入能使迁移截止点明确。将生成的整个备份目录安全传到新服务器。

## 2. 新服务器加载镜像和配置

\x60\x60\x60sh
tar -xzf qslink-${revision}-linux-amd64.tar.gz
cd qslink-${revision}-linux-amd64
sh setup.sh your.actual.domain
\x60\x60\x60

setup.sh 校验文件、加载三个镜像、生成随机数据库密码和权限为 600 的 .env，不启动服务。域名不带 https://。如果迁移后域名不变继续填原域名；更换域名时分享链接和来源校验随新域名生效。邮件验证需要将旧环境的 ALIBABA_CLOUD_ACCESS_KEY_ID、ALIBABA_CLOUD_ACCESS_KEY_SECRET、QSL_MAIL_REGION、QSL_MAIL_ENDPOINT、QSL_MAIL_FROM、QSL_MAIL_FROM_NAME 安全补充至新 .env；不要盲目覆盖刚生成的数据库密码。

## 3. 恢复数据并运行

\x60\x60\x60sh
sh restore-data.sh /absolute/path/to/qslink-migration
docker compose up -d --wait app
docker compose exec -T app node -e "fetch('http://127.0.0.1:8787/api/health').then(async r=>{console.log(await r.text());if(!r.ok)process.exit(1)})"
docker compose ps
\x60\x60\x60

恢复脚本仅接受空的目标数据库和上传目录，拒绝覆盖已有数据。恢复成功后使用原管理员账号，不要再运行管理员初始化。数据库备份恢复失败时先查看错误，不要删原备份；修复或另建空的目标项目卷后再恢复。禁止对旧服务器执行 down --volumes。

如果是全新空站而非迁移，跳过恢复，执行以下命令交互创建管理员，再启动 app：

\x60\x60\x60sh
docker compose up -d --wait db
docker compose run --rm --no-deps app node server/init-admin.js
docker compose up -d --wait app
\x60\x60\x60

## 4. 确认允许恢复公网访问后

域名解析指向新服务器，操作者确认开放公网 80/443 后执行：

\x60\x60\x60sh
docker compose up -d --wait
curl --fail https://your.actual.domain/api/health
\x60\x60\x60

没有域名而使用公网 IP 时，使用：docker compose -f compose.yaml -f compose.ip.yaml up -d --wait。IP 证书需要公网 443 和出站 ACME 可达。域名证书也需要满足 ACME 签发条件；关闭入站端口时不能假定证书签发或续期可用。生产登录仍使用 HTTPS，HTTP 自动跳转 HTTPS。

原证书未打包，新服务器通过 Caddy 重新签发；如需保留原证书，请另行安全迁移旧 caddy-data 卷。app-data、postgres-data、caddy-data 和 caddy-config 为持久化卷。可用 docker compose stop 停止服务，不要用 down --volumes 删除数据。

最后验证管理员登录、卡片图片、分享、邮件验证码和换卡流程，再切换流量并退役旧服务器。本包不修改 DNS、不开放防火墙，也不自动部署到服务器。
`);
console.log(out);

#!/usr/bin/env bash
# First deployment only: snapshot the existing dev test site into isolated
# resources. Never modify the source database/container/volume — vue3.
set -Eeuo pipefail
umask 077
[[ $(id -u) -eq 0 ]] || { echo '请以 root 身份执行。' >&2; exit 1; }
[[ "${QSL_EXPECTED_REVISION_VUE3:-}" =~ ^[a-f0-9]{40}$ ]] || { echo '必须指定完整 Vue3 SHA。' >&2; exit 1; }
exec 8>/var/lock/qslink-bootstrap-dev-vue3.lock
flock -n 8 || { echo '已有 Vue3 初始化任务。' >&2; exit 1; }

ROOT=/root/qslink-vue3
NETWORK=qslink-test-net-vue3
DB=qslink-test-db-vue3
APP=qslink-test-app-vue3
UPLOADS=qslink-test-uploads-vue3
DBDATA=qslink-test-dbdata-vue3
IMAGE="ghcr.io/9ham-team/qslink.web:sha-${QSL_EXPECTED_REVISION_VUE3}-vue3"
[[ ! -L "$ROOT" ]] || exit 1
install -d -m 700 "$ROOT" "$ROOT/backups"
for name in "$APP" "$DB"; do
  if docker inspect "$name" >/dev/null 2>&1; then echo "资源已存在，停止首次初始化：$name" >&2; exit 1; fi
done
if docker network inspect "$NETWORK" >/dev/null 2>&1; then echo 'Vue3 网络已存在，停止首次初始化。' >&2; exit 1; fi
for name in "$UPLOADS" "$DBDATA"; do
  if docker volume inspect "$name" >/dev/null 2>&1; then echo "数据卷已存在，禁止覆盖：$name" >&2; exit 1; fi
done
[[ ! -e "$ROOT/app-vue3.env" && ! -e "$ROOT/database-vue3.env" ]] || { echo '已有 Vue3 私有配置，禁止覆盖。' >&2; exit 1; }
[[ -z $(ss -H -ltn 'sport = :44381') ]] || { echo '44381 已被占用。' >&2; exit 1; }
[[ $(docker inspect qslink-test-app --format '{{.State.Health.Status}}') == healthy ]] || exit 1
docker exec qslink-test-app node -e '
  const c = require("./server/lib/config").readConfig(); const u = new URL(c.databaseUrl);
  if (u.hostname !== "qslink-test-db" || u.pathname !== "/qslink" || decodeURIComponent(u.username) !== "qslink" ||
      c.databaseSchema !== "public" || c.env !== "development" || c.demo) process.exit(1);
'
docker network inspect qslink-test-net >/dev/null
docker volume inspect qslink-test-uploads >/dev/null
docker pull "$IMAGE"
[[ $(docker image inspect "$IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}') == "$QSL_EXPECTED_REVISION_VUE3" ]] || exit 1
DB_IMAGE=$(docker inspect qslink-test-db --format '{{.Image}}')
[[ $(docker inspect qslink-test-db --format '{{.Config.Image}}') == postgres:17-alpine ]] || { echo '源数据库镜像不是预期 PostgreSQL 17。' >&2; exit 1; }

BACKUP="$ROOT/backups/bootstrap-$(date -u +%Y%m%dT%H%M%SZ)-${QSL_EXPECTED_REVISION_VUE3:0:7}-vue3"
install -d -m 700 "$BACKUP"
docker exec qslink-test-db pg_dump -U qslink -d qslink -Fc > "$BACKUP/database-vue3.dump"
test -s "$BACKUP/database-vue3.dump"
docker run --rm --network none --read-only --user 0:0 -v qslink-test-uploads:/source:ro "$IMAGE" \
  tar -czf - -C /source . > "$BACKUP/uploads-vue3.tar.gz"
test -s "$BACKUP/uploads-vue3.tar.gz"
sha256sum "$BACKUP/database-vue3.dump" "$BACKUP/uploads-vue3.tar.gz" > "$BACKUP/checksums-vue3.txt"
echo "原测试服数据快照：$BACKUP"

DB_PASSWORD=$(openssl rand -hex 32)
printf 'POSTGRES_USER=qslink\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=qslink\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n' "$DB_PASSWORD" > "$ROOT/database-vue3.env"
{
  printf 'NODE_ENV=development\nQSL_HOST=0.0.0.0\nQSL_PORT=8787\nQSL_DATA_DIR=/var/lib/qslink\nQSL_SEED_DEMO=false\n'
  printf 'DATABASE_URL=postgresql://qslink:%s@qslink-test-db-vue3:5432/qslink\n' "$DB_PASSWORD"
  printf 'QSL_DB_SCHEMA=public\nQSL_PUBLIC_ORIGIN=http://43.142.58.20:44381\nQSL_TRUST_PROXY=false\n'
  printf 'QSL_MAIL_FROM=\nALIBABA_CLOUD_ACCESS_KEY_ID=\nALIBABA_CLOUD_ACCESS_KEY_SECRET=\nQSL_REVIEW_WEBHOOK_URL=\n'
} > "$ROOT/app-vue3.env"
unset DB_PASSWORD

docker network create --label qslink.environment=dev-vue3 "$NETWORK" >/dev/null
docker volume create --label qslink.environment=dev-vue3 "$UPLOADS" >/dev/null
docker volume create --label qslink.environment=dev-vue3 "$DBDATA" >/dev/null
docker run -d --name "$DB" --network "$NETWORK" --restart unless-stopped \
  --env-file "$ROOT/database-vue3.env" -v "$DBDATA:/var/lib/postgresql/data" \
  --health-cmd 'pg_isready -U qslink -d qslink' --health-interval 5s --health-timeout 5s --health-retries 12 \
  "$DB_IMAGE" >/dev/null
READY=0
for ((i=0; i<60; i++)); do
  if [[ $(docker inspect "$DB" --format '{{.State.Health.Status}}') == healthy ]]; then READY=1; break; fi
  sleep 2
done
[[ "$READY" -eq 1 ]] || { echo 'Vue3 数据库未就绪；保留配置及数据卷供排查。' >&2; exit 1; }
docker exec -i "$DB" pg_restore -U qslink -d qslink --no-owner --no-privileges --single-transaction < "$BACKUP/database-vue3.dump"
docker run --rm -i --network none --user 0:0 -v "$UPLOADS:/target" "$IMAGE" \
  sh -c 'tar -xzf - -C /target && chown -R node:node /target' < "$BACKUP/uploads-vue3.tar.gz"
printf '%s\n' "$BACKUP" > "$ROOT/bootstrap-backup-vue3.txt"
echo '独立 Vue3 数据库与上传卷已恢复，邮件和 Webhook 均关闭；原 44380 环境未修改。'
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
bash "$SCRIPT_DIR/deploy-dev-vue3.sh"

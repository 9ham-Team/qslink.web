#!/bin/sh
# Privileged Docker-host operator only; backups contain private data and secrets.
set -eu
umask 077
cd "${QSL_RELEASE_DIR:?Set QSL_RELEASE_DIR to the deployment directory}"
backup_dir=${QSL_BACKUP_DIR:-/var/backups/qslink}
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
exec 9>"$backup_dir/.backup.lock"
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T db pg_dump -U qslink -d qslink -Fc > "$backup_dir/$stamp.dump.partial"
# Current uploads are immutable UUID files and are not removed by the app.
# Copy after the DB snapshot to include all committed references, without downtime.
docker compose exec -T app tar -czf - -C /var/lib/qslink uploads > "$backup_dir/$stamp-uploads.tar.gz.partial"
mv "$backup_dir/$stamp.dump.partial" "$backup_dir/$stamp.dump"
mv "$backup_dir/$stamp-uploads.tar.gz.partial" "$backup_dir/$stamp-uploads.tar.gz"
install -m 600 .env "$backup_dir/$stamp.env"
sha256sum "$backup_dir/$stamp.dump" "$backup_dir/$stamp-uploads.tar.gz" > "$backup_dir/$stamp.sha256"
printf 'Backup complete: %s\n' "$stamp"

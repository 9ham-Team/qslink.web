#!/bin/sh
# Export only the prepared distribution's known files; never add data or .env.
set -eu
qsl_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$qsl_root/tools/migration-common.sh"
[ "$#" -eq 1 ] || qsl_fail 'Usage: sh tools/export-migration-images.sh /absolute/prepared-bundle-directory'
bundle=$(CDPATH= cd -- "$1" && pwd)
case "$bundle" in "$qsl_root"/artifacts/qslink-*-linux-amd64) ;; *) qsl_fail 'Bundle must be a generated directory inside this repository artifacts/' ;; esac
QSL_BUNDLE_REVISION=$(sed -n '1p' "$bundle/VERSION")
qsl_revision false
qsl_docker
qsl_need sha256sum
qsl_need tar
name="qslink-$QSL_BUNDLE_REVISION-linux-amd64"
[ "$(basename "$bundle")" = "$name" ] || qsl_fail 'VERSION and bundle directory disagree'
archive="$qsl_root/artifacts/$name.tar.gz"
for target in "$bundle/images.tar" "$bundle/images.tar.partial" "$archive" "$archive.partial" "$archive.sha256"; do
  [ ! -e "$target" ] || qsl_fail "Refusing to replace existing output: $target"
done
for image in "qslink/app:$QSL_BUNDLE_REVISION" qslink/postgres:17-alpine qslink/caddy:2-alpine; do qsl_amd64_image "$image"; done
# Explicit allowlist: real backups and local credential files cannot enter this tar.
files='VERSION README.md compose.yaml compose.ip.yaml deploy/Caddyfile deploy/Caddyfile.ip deploy/init-postgres.sh setup.sh export-data.sh restore-data.sh VALIDATION.txt images.tar IMAGES.txt'
for file in VERSION README.md compose.yaml compose.ip.yaml deploy/Caddyfile deploy/Caddyfile.ip deploy/init-postgres.sh setup.sh export-data.sh restore-data.sh VALIDATION.txt; do
  [ -f "$bundle/$file" ] && [ ! -L "$bundle/$file" ] || qsl_fail "Missing or symlinked distribution file: $file"
done
docker image save -o "$bundle/images.tar.partial" "qslink/app:$QSL_BUNDLE_REVISION" qslink/postgres:17-alpine qslink/caddy:2-alpine
mv "$bundle/images.tar.partial" "$bundle/images.tar"
docker image inspect "qslink/app:$QSL_BUNDLE_REVISION" qslink/postgres:17-alpine qslink/caddy:2-alpine --format '{{json .RepoTags}} {{.Id}} {{.Os}}/{{.Architecture}}' > "$bundle/IMAGES.txt"
(
  cd "$bundle"
  # File names are fixed literals without whitespace.
  sha256sum $files > SHA256SUMS
  sha256sum -c SHA256SUMS
)
# tar receives a literal list rather than recursively traversing the bundle.
(
  cd "$qsl_root/artifacts"
  for file in $files SHA256SUMS; do printf '%s/%s\n' "$name" "$file"; done > "$bundle/.archive-files"
  tar -czf "$archive.partial" -T "$bundle/.archive-files"
  tar -tzf "$archive.partial" >/dev/null
  mv "$archive.partial" "$archive"
  sha256sum "$name.tar.gz" > "$archive.sha256"
)
printf '\nBundle: %s\nChecksum: %s.sha256\n' "$archive" "$archive"

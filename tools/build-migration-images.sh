#!/bin/sh
# Build the application and tag all three Linux AMD64 images for offline export.
set -eu
qsl_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$qsl_root/tools/migration-common.sh"
skip_pull=false
allow_dirty=false
for arg in "$@"; do
  case "$arg" in
    --skip-pull) skip_pull=true ;;
    --allow-dirty) allow_dirty=true ;;
    --help) echo 'Usage: sh tools/build-migration-images.sh [--skip-pull] [--allow-dirty]'; exit 0 ;;
    *) qsl_fail "Unknown option: $arg" ;;
  esac
done
qsl_revision "$allow_dirty"
qsl_docker
for image in node:24-alpine postgres:17-alpine caddy:2-alpine; do
  if [ "$skip_pull" = false ]; then docker pull --platform linux/amd64 "$image"; fi
  qsl_amd64_image "$image"
done
docker build --platform linux/amd64 --pull=false \
  --network "${QSL_BUILD_NETWORK:-default}" \
  --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY \
  --build-arg http_proxy --build-arg https_proxy --build-arg no_proxy \
  --label "org.opencontainers.image.revision=$(qsl_git rev-parse HEAD)" \
  --label "org.opencontainers.image.version=$QSL_BUNDLE_REVISION" \
  -t "qslink/app:$QSL_BUNDLE_REVISION" "$qsl_root"
docker tag postgres:17-alpine qslink/postgres:17-alpine
docker tag caddy:2-alpine qslink/caddy:2-alpine
qsl_amd64_image "qslink/app:$QSL_BUNDLE_REVISION"
printf 'Images ready: qslink/app:%s, qslink/postgres:17-alpine, qslink/caddy:2-alpine\n' "$QSL_BUNDLE_REVISION"

#!/bin/sh
# Complete pipeline: build -> generate Compose -> verify -> docker save -> tar.gz.
set -eu
umask 022
qsl_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$qsl_root/tools/migration-common.sh"
skip_pull=false
allow_dirty=false
verify=true
for arg in "$@"; do
  case "$arg" in
    --skip-pull) skip_pull=true ;;
    --allow-dirty) allow_dirty=true ;;
    --no-verify) verify=false ;;
    --help) echo 'Usage: sh tools/package-migration.sh [--skip-pull] [--allow-dirty] [--no-verify]'; exit 0 ;;
    *) qsl_fail "Unknown option: $arg" ;;
  esac
done
qsl_need grep
qsl_need sha256sum
qsl_need tar
qsl_revision "$allow_dirty"
qsl_docker
if [ "$verify" = true ]; then docker compose version >/dev/null; fi
bundle="$qsl_root/artifacts/qslink-$QSL_BUNDLE_REVISION-linux-amd64"
for target in "$bundle" "$bundle.tar.gz" "$bundle.tar.gz.partial" "$bundle.tar.gz.sha256"; do
  [ ! -e "$target" ] || qsl_fail "Output already exists; it will not be overwritten: $target"
done
mkdir -p "$qsl_root/artifacts"
lock="$bundle.lock"
mkdir "$lock" || qsl_fail 'A build for this revision is already running (or its lock needs inspection)'
trap 'rmdir "$lock"' EXIT
if [ "$skip_pull" = true ]; then
  sh "$qsl_root/tools/build-migration-images.sh" --skip-pull
else
  sh "$qsl_root/tools/build-migration-images.sh"
fi
# No host Node.js installation required: the newly built image can run the generator.
if command -v node >/dev/null 2>&1; then
  node "$qsl_root/tools/prepare-migration.mjs"
else
  docker run --rm --network none --user "$(id -u):$(id -g)" \
    -e QSL_BUNDLE_REVISION -v "$qsl_root:/workspace" -w /workspace \
    --entrypoint node "qslink/app:$QSL_BUNDLE_REVISION" tools/prepare-migration.mjs
fi
QSL_DOMAIN=localhost POSTGRES_PASSWORD=isolated-config-check QSL_DB_PASSWORD=isolated-app-check \
  docker compose -f "$bundle/compose.yaml" config --quiet
for file in setup.sh export-data.sh restore-data.sh; do sh -n "$bundle/$file"; done
docker run --rm --network none -e QSL_DOMAIN=localhost \
  -v "$bundle/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  qslink/caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
QSL_DOMAIN=203.0.113.1 POSTGRES_PASSWORD=isolated-config-check QSL_DB_PASSWORD=isolated-app-check \
  docker compose -f "$bundle/compose.yaml" -f "$bundle/compose.ip.yaml" config --quiet
docker run --rm --network none -e QSL_DOMAIN=203.0.113.1 \
  -v "$bundle/deploy/Caddyfile.ip:/etc/caddy/Caddyfile:ro" \
  qslink/caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
{
  printf 'Built UTC: %s\nRevision: %s\nPlatform: linux/amd64\n' "$(date -u +%FT%TZ)" "$QSL_BUNDLE_REVISION"
  printf 'PASS: Docker image build, domain/IP Compose, scripts and Caddy configuration validation.\n'
} > "$bundle/VALIDATION.txt"
if [ "$verify" = true ]; then
  if sh "$qsl_root/tools/verify-migration.sh" "$bundle" > "$bundle/.verification.log" 2>&1; then
    cat "$bundle/.verification.log"
    printf 'PASS: three-container startup, verified HTTPS, HTTP redirect, database/uploads restore, restored login, demo isolation, overwrite refusal.\n' >> "$bundle/VALIDATION.txt"
  else
    cat "$bundle/.verification.log" >&2
    qsl_fail 'Migration verification failed; no distribution archive was created.'
  fi
else
  printf 'NOT RUN: container startup and data restore verification (--no-verify).\n' >> "$bundle/VALIDATION.txt"
fi
printf 'No production data, credentials or TLS private keys included.\nPublic DNS and ACME issuance require destination-server verification.\n' >> "$bundle/VALIDATION.txt"
sh "$qsl_root/tools/export-migration-images.sh" "$bundle"

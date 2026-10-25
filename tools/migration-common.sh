#!/bin/sh
# Shared helpers; source from scripts in tools/. No Docker resources are deleted.
set -eu
qsl_fail() { printf '%s\n' "$*" >&2; exit 1; }
qsl_need() { command -v "$1" >/dev/null 2>&1 || qsl_fail "Required command missing: $1"; }
# Scope the trust exception to this invocation; do not edit global Git settings.
qsl_git() { git -c "safe.directory=$qsl_root" -C "$qsl_root" "$@"; }
qsl_revision() {
  qsl_need git
  if [ -z "${QSL_BUNDLE_REVISION:-}" ]; then
    QSL_BUNDLE_REVISION=$(qsl_git rev-parse --short=12 HEAD)
    if [ -n "$(qsl_git status --porcelain)" ]; then
      [ "$1" = true ] || qsl_fail 'Working tree is dirty. Commit changes first, or use --allow-dirty for a timestamped development bundle.'
      QSL_BUNDLE_REVISION="$QSL_BUNDLE_REVISION-dirty-$(date -u +%Y%m%d%H%M%S)"
    fi
  fi
  printf '%s\n' "$QSL_BUNDLE_REVISION" | grep -Eq '^[a-f0-9]{12}(-dirty-[0-9]{14})?$' || qsl_fail 'Invalid bundle revision'
  export QSL_BUNDLE_REVISION
}
qsl_docker() {
  qsl_need docker
  docker info >/dev/null
  [ "$(docker info --format '{{.OSType}}')" = linux ] || qsl_fail 'A Linux Docker engine is required'
}
qsl_amd64_image() {
  [ "$(docker image inspect "$1" --format '{{.Os}}/{{.Architecture}}')" = linux/amd64 ] || qsl_fail "Image is not Linux AMD64: $1"
}

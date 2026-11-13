#!/usr/bin/env bash
# Same locking/backup/recovery implementation as dev, scoped to Vue3 — vue3
set -Eeuo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export QSL_DEPLOY_PROFILE=vue3
exec bash "$SCRIPT_DIR/deploy-dev.sh"

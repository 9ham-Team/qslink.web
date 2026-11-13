#!/usr/bin/env bash
# QSLink 测试服务器：手动执行此脚本即可更新到 dev；不修改数据库或数据卷。
set -Eeuo pipefail
umask 077

IMAGE=ghcr.io/9ham-team/qslink.web:dev
APP=qslink-test-app
NETWORK=qslink-test-net
VOLUME=qslink-test-uploads
# Explicit Vue3 profile shares these deployment protections; defaults above
# remain the existing dev site. The Vue3 wrapper always pins a full SHA — vue3.
PORT=44380
LOCK=/var/lock/qslink-deploy-dev.lock
INITIAL_ENV_FILE=
if [[ "${QSL_DEPLOY_PROFILE:-dev}" == vue3 ]]; then
  [[ "${QSL_EXPECTED_REVISION_VUE3:-}" =~ ^[a-f0-9]{40}$ ]] || { echo 'Vue3 部署必须指定完整 SHA。' >&2; exit 1; }
  IMAGE="ghcr.io/9ham-team/qslink.web:sha-${QSL_EXPECTED_REVISION_VUE3}-vue3"
  APP=qslink-test-app-vue3
  NETWORK=qslink-test-net-vue3
  VOLUME=qslink-test-uploads-vue3
  PORT=44381
  LOCK=/var/lock/qslink-deploy-dev-vue3.lock
  INITIAL_ENV_FILE=/root/qslink-vue3/app-vue3.env
elif [[ "${QSL_DEPLOY_PROFILE:-dev}" != dev ]]; then
  echo '未知部署配置。' >&2; exit 1
fi
MAIL_ENV_FILE=${QSL_MAIL_ENV_FILE:-}
WEBHOOK_ENV_FILE=${QSL_WEBHOOK_ENV_FILE:-}
[[ -z "$MAIL_ENV_FILE" || -z "$WEBHOOK_ENV_FILE" ]] || { echo '邮件与 Webhook 配置请分别重载。' >&2; exit 1; }
CONFIG_ENV_FILE=${MAIL_ENV_FILE:-$WEBHOOK_ENV_FILE}
RELOAD_KIND=mail
if [[ -n "$WEBHOOK_ENV_FILE" ]]; then RELOAD_KIND=webhook; fi

[[ $(id -u) -eq 0 ]] || { echo '请以 root 身份执行。' >&2; exit 1; }
exec 9>"$LOCK"
flock -n 9 || { echo '已有部署任务运行中。' >&2; exit 1; }

APP_EXISTS=0
if docker inspect "$APP" >/dev/null 2>&1; then APP_EXISTS=1; fi
if [[ "$APP_EXISTS" -eq 0 ]]; then
  [[ -n "$INITIAL_ENV_FILE" && -f "$INITIAL_ENV_FILE" && ! -L "$INITIAL_ENV_FILE" ]] || { echo '缺少现有应用或 Vue3 首次部署配置。' >&2; exit 1; }
  [[ $(stat -c '%u:%a' "$INITIAL_ENV_FILE") =~ ^0:(400|600)$ ]] || { echo 'Vue3 首次配置须属于 root，权限为 400 或 600。' >&2; exit 1; }
fi
docker network inspect "$NETWORK" >/dev/null
docker volume inspect "$VOLUME" >/dev/null
if [[ "${QSL_DEPLOY_PROFILE:-dev}" == vue3 ]]; then
  [[ -z "$MAIL_ENV_FILE" && -z "$WEBHOOK_ENV_FILE" ]] || { echo 'Vue3 部署不重载原测试服通知配置。' >&2; exit 1; }
  if [[ "$APP_EXISTS" -eq 1 ]]; then
    [[ $(docker inspect "$APP" --format '{{(index (index .HostConfig.PortBindings "8787/tcp") 0).HostPort}}') == "$PORT" ]] || { echo 'Vue3 现有端口不符。' >&2; exit 1; }
    [[ $(docker inspect "$APP" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/qslink"}}{{.Name}}{{end}}{{end}}') == "$VOLUME" ]] || { echo 'Vue3 现有数据卷不符。' >&2; exit 1; }
  fi
fi

if [[ -n "$CONFIG_ENV_FILE" ]]; then
  [[ "$CONFIG_ENV_FILE" == /* && -f "$CONFIG_ENV_FILE" && ! -L "$CONFIG_ENV_FILE" ]] || { echo '通知配置必须是绝对路径的常规文件。' >&2; exit 1; }
  [[ $(stat -c '%u:%a' "$CONFIG_ENV_FILE") =~ ^0:(400|600)$ ]] || { echo '通知配置须属于 root，权限为 400 或 600。' >&2; exit 1; }
  # Docker reads literal values; never source/eval a file containing credentials.
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" == *=* ]] || { echo '通知配置行必须使用 KEY=VALUE 格式。' >&2; exit 1; }
    if [[ "$RELOAD_KIND" == webhook ]]; then
      [[ "${line%%=*}" == QSL_REVIEW_WEBHOOK_URL ]] || { echo 'Webhook 配置包含不允许覆盖的环境变量。' >&2; exit 1; }
      continue
    fi
    case "${line%%=*}" in
      QSL_MAIL_FROM|QSL_MAIL_FROM_NAME|QSL_MAIL_REGION|QSL_MAIL_ENDPOINT|ALIBABA_CLOUD_ACCESS_KEY_ID|ALIBABA_CLOUD_ACCESS_KEY_SECRET|QSL_PUBLIC_ORIGIN) ;;
      *) echo '邮件配置包含不允许覆盖的环境变量。' >&2; exit 1 ;;
    esac
  done < "$CONFIG_ENV_FILE"
  echo '仅重载通知配置，保留当前应用镜像版本。'
else
  echo "拉取 $IMAGE（如无权限，请先 docker login ghcr.io）"
  docker pull "$IMAGE"
fi
# 常规部署固定刚拉取的镜像 ID；通知重载固定现有容器镜像。
OLD_IMAGE=
if [[ "$APP_EXISTS" -eq 1 ]]; then OLD_IMAGE=$(docker inspect "$APP" --format '{{.Image}}'); fi
NEW_IMAGE=$OLD_IMAGE
if [[ -z "$CONFIG_ENV_FILE" ]]; then NEW_IMAGE=$(docker image inspect "$IMAGE" --format '{{.Id}}'); fi
if [[ "${QSL_DEPLOY_PROFILE:-dev}" == vue3 ]]; then
  [[ $(docker image inspect "$NEW_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}') == "$QSL_EXPECTED_REVISION_VUE3" ]] || { echo 'Vue3 镜像修订不符。' >&2; exit 1; }
fi
if [[ -z "$CONFIG_ENV_FILE" && "$NEW_IMAGE" == "$OLD_IMAGE" ]] && [[ $(docker inspect "$APP" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}') == healthy ]]; then
  echo '当前已运行最新 dev 镜像且健康，无需重新部署。'
  exit 0
fi

ENV_FILE=$(mktemp /tmp/qslink-deploy-env.XXXXXX)
BACKUP="${APP}-backup-$(date +%Y%m%d%H%M%S)-$$"
RENAMED=0
STOPPED=0
CREATED=0
SUCCESS=0
cleanup() {
  local code=$?
  trap - EXIT INT TERM
  rm -f "$ENV_FILE"
  if [[ "$SUCCESS" -eq 0 ]]; then
    echo '部署未完成，尝试恢复原容器。' >&2
    if [[ "$CREATED" -eq 1 ]]; then
      docker logs --tail 60 "$APP" >&2 || true
      docker rm -f "$APP" >/dev/null || true
    fi
    if [[ "$RENAMED" -eq 1 ]]; then
      docker rename "$BACKUP" "$APP" || true
    fi
    if [[ "$STOPPED" -eq 1 ]]; then
      docker start "$APP" >/dev/null || true
    fi
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# 从原容器继承环境变量，避免在脚本中存储数据库密码。
if [[ "$APP_EXISTS" -eq 1 ]]; then
  docker inspect "$APP" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$ENV_FILE"
else
  cp "$INITIAL_ENV_FILE" "$ENV_FILE"
fi
EXTRA_ENV_ARGS=()
if [[ -n "$CONFIG_ENV_FILE" ]]; then
  EXTRA_ENV_ARGS=(--env-file "$CONFIG_ENV_FILE")
  # Validate the merged config before stopping the app. Network and data are unavailable.
  docker run --rm --network none --read-only --env-file "$ENV_FILE" "${EXTRA_ENV_ARGS[@]}" -e "QSL_CONFIG_RELOAD_KIND=$RELOAD_KIND" \
    --entrypoint node "$NEW_IMAGE" -e '
      try {
        const config = require("./server/lib/config").readConfig();
        if (process.env.QSL_CONFIG_RELOAD_KIND === "mail" &&
            (!config.mail.from || !config.mail.accessKeyId || !config.mail.accessKeySecret || !config.publicOrigin)) throw new Error();
        console.log("通知配置校验通过（未发送通知）。");
      } catch { console.error("通知配置无效或不完整，请检查配置文件。"); process.exit(1); }
    '
fi

if [[ "$APP_EXISTS" -eq 1 ]]; then
echo "保留原容器为 $BACKUP"
# 先标记停止，确保 stop 被中断时也尝试恢复。
STOPPED=1
docker stop -t 15 "$APP" >/dev/null
docker rename "$APP" "$BACKUP"
RENAMED=1
else
  BACKUP=none-initial-vue3
  echo '首次启动独立 Vue3 应用；失败保留数据库和上传卷。'
fi

docker create --name "$APP" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -p "$PORT:8787" \
  --env-file "$ENV_FILE" \
  "${EXTRA_ENV_ARGS[@]}" \
  -v "$VOLUME:/var/lib/qslink" \
  "$NEW_IMAGE" >/dev/null
CREATED=1
docker start "$APP" >/dev/null

echo '等待新容器健康检查（最多约 120 秒）'
for ((i=0; i<60; i++)); do
  STATE=$(docker inspect "$APP" --format '{{.State.Status}}')
  HEALTH=$(docker inspect "$APP" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')
  if [[ "$STATE" == running && "$HEALTH" == healthy ]]; then
    SUCCESS=1
    echo "部署成功：$IMAGE"
    echo "镜像 ID：$NEW_IMAGE"
    echo "旧容器：$BACKUP（已停止，保留供回退）"
    echo '数据库和上传数据卷未删除。'
    exit 0
  fi
  if [[ "$STATE" == exited || "$STATE" == dead || "$HEALTH" == unhealthy ]]; then
    echo "新容器异常：state=$STATE health=$HEALTH" >&2
    exit 1
  fi
  sleep 2
done

echo '健康检查超时。' >&2
exit 1

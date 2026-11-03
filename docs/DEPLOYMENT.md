# 生产部署与维护（PostgreSQL 17）

适用于单机小型社区：Node.js + PostgreSQL 17 + Caddy HTTPS。代码和测试已支持 PostgreSQL 事务；上传文件仍需独立持久化。旧 JSON 数据迁移详见 [PostgreSQL 指南](POSTGRESQL.md)。

## 当前运行状态（2026-10-25）

用户确认：网站已进入备案期，公网 80 和 443 端口已暂时关闭。期间通过域名或 IP 的标准 HTTP/HTTPS 公网访问不可用，属于主动暂停访问；排查时不要据此判断应用故障，也不要自行重新开放端口。待用户确认恢复后，再开放端口并检查 HTTPS 证书及续期状态。本记录为用户提供的状态，未进行服务器实测。

## 首次部署

要求 Docker Engine、Compose v2、真实域名和 TCP 80/443。域名 A/AAAA 必须指向服务器。不公开 8787 或 5432 端口。

在选定的、CI 已通过的发布标签目录执行：

```sh
cp .env.example .env
```

设置 QSL_DOMAIN 为实际域名，POSTGRES_PASSWORD 为数据库管理员密码，QSL_DB_PASSWORD 为独立的应用数据库密码。用密码管理器或 `openssl rand -hex 32` 分别生成两个值。Compose 将应用密码拼接到连接串，因此示例建议十六进制字符串。不要保留空值、复用演示密码或提交 .env；服务器上限制 .env 的读取权限，例如 `chmod 600 .env`。

```sh
docker compose config --quiet
# 仅为干净、已提交的源码注入身份；构建时采集 UTC，不能使用提交时间或启动时间。
test -z "$(git status --porcelain)" || { echo '工作区有修改，请先确认发布源码'; exit 1; }
QSL_BUILD_REVISION=$(git rev-parse HEAD)
QSL_BUILD_CREATED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose build --build-arg "QSL_BUILD_REVISION=$QSL_BUILD_REVISION" --build-arg "QSL_BUILD_CREATED=$QSL_BUILD_CREATED" app
docker compose up -d --wait db
docker compose run --rm --no-deps app node server/init-admin.js
docker compose up -d --wait
```

初始化会询问第一位网站管理员的用户名、邮箱和密码，密码不回显，至少 12 位且包含字母数字。这与数据库账号不是同一个账号。网站管理员已存在时拒绝覆盖。已有真实 JSON 库应先导入，不要先初始化管理员。

新的 PostgreSQL 卷会通过 deploy/init-postgres.sh 创建数据库及非超级用户 qslink。应用仅使用这个角色，数据库管理员凭据不传给应用。已初始化的数据库卷不会重新执行初始化脚本；更改 .env 不会自动修改数据库内密码，轮换必须通过 PostgreSQL 完成并同步应用配置。

app-data 保存上传文件，postgres-data 保存数据库，caddy-data 保存证书。应用非 root、代码文件系统只读、数据库和 app 都不发布宿主机端口。Caddy 自动获取并续期证书；失败时检查 DNS、防火墙和日志，不绕过证书警告。

响应式卡图会在 `QSL_DATA_DIR/image-cache/` 按需生成 WebP 缓存，使用现有 app-data 数据卷，不需要额外公开目录或服务。升级时通过镜像内的 `npm ci` 安装 Sharp 的 Linux/Alpine 原生可选依赖，不可把 Windows 的 node_modules 复制进容器，也不要禁用 optional dependencies。缓存可在维护时清理并自动重建；备份应优先保留原始 uploads 和数据库，缓存不属于唯一原件。

## 配置与上线验证

卡片审核通过邮件复用注册验证码和换卡通知的阿里云 Direct Mail 配置，以及 `QSL_PUBLIC_ORIGIN`。无需新凭据；审核结果提交后发送到卡片主人注册邮箱，未配置邮件/站点地址或账号禁用时跳过。发送失败不撤销审核，无持久化重试；部署后如需验证真实收件箱，须使用获准的测试卡片及邮箱，不能仅以 API 返回成功认定邮件送达。

QSLink 仅推送审核文本消息，@ 人员及企业微信地址由中转项目配置。原 `QSL_REVIEW_WEBHOOK_AT_LIST` 不再读取，可从 QSLink 环境中移除。

卡片待审核提醒使用可选的 `QSL_REVIEW_WEBHOOK_URL`。将接收项目的唯一 URL 写入服务器私有 `.env`，例如 `QSL_REVIEW_WEBHOOK_URL=https://relay.example.com/hooks/qslink/随机令牌`；也可使用企业微信机器人 URL。Compose 已将该值传入 app，重建应用容器后生效。直接运行 Node 时需注入进程环境并重启。支持 HTTP(S)，公网建议 HTTPS，不允许 URL 用户名、密码、片段或重定向；配置无效时启动失败且不输出原始 URL；留空关闭提醒。接收端须在 5 秒内返回 HTTP 2xx 和 JSON `{"errcode":0}`，建议可靠入队后确认，转发异步处理。

该 URL 含机器人密钥，应与密码一样保管，不提交代码或输出到日志。配置 `QSL_PUBLIC_ORIGIN` 可在消息中提供管理员审核入口，点击后仍需管理员登录。当前仅支持一个机器人实例；新卡提交、用户编辑重新送审及管理员将卡片转回待审核触发一次尽力通知，失败不影响卡片写入，无自动重试。测试服 `QSL_MAIL_ENV_FILE` 仅允许邮件配置，不能用它加载 Webhook。

测试服的 Webhook 地址可填写到服务器私有文件 `/root/qslink-test/review-webhook.env`，内容仅一行 `QSL_REVIEW_WEBHOOK_URL=实际接收地址`。文件须属于 root，权限为 600 或 400，不允许符号链接。上传最新 `deployment/deploy-dev.sh` 后执行：

```sh
QSL_WEBHOOK_ENV_FILE=/root/qslink-test/review-webhook.env bash /root/deploy-dev.sh
```

此模式不拉取新镜像，固定测试应用当前镜像；先在无网络、无数据挂载的临时容器中验证合并配置，再通过标准锁、容器备份和失败恢复流程重建应用。仅允许覆盖 `QSL_REVIEW_WEBHOOK_URL`，不发送测试消息；后续标准部署继承新容器环境。文件编辑后需再次执行上述命令才生效，留空 URL 可关闭推送。不能同时设置邮件与 Webhook 配置重载文件，请分两次执行；配置重载不提交或部署本地尚未发布的业务代码。

测试服加载邮件配置时，可将仅包含 `QSL_MAIL_FROM`、`QSL_MAIL_FROM_NAME`、`QSL_MAIL_REGION`、`QSL_MAIL_ENDPOINT`、`ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET` 和可选 `QSL_PUBLIC_ORIGIN` 的 Docker env 文件放在服务器私有目录，归 root 所有、权限 400 或 600。例如：

```sh
QSL_MAIL_ENV_FILE=/root/qslink-test/mail.env bash /root/deploy-dev.sh
```

此模式不拉取新镜像，使用测试应用当前镜像，先在无网络、无业务数据挂载的临时容器中校验合并后的配置，再通过标准锁、备份和失败恢复流程重建应用。文件以 Docker 字面值读取，不使用 `source`；不允许覆盖数据库等其他环境变量。不会发送测试邮件。后续常规部署继承新容器的邮件环境；再次编辑文件后仍需显式执行上述重载。仅适用于测试服 `qslink-test-app`，不操作生产。

已有域名和可用 HTTPS 证书时，继续使用域名部署配置：`QSL_DOMAIN` 填写实际域名，默认使用 `compose.yaml` 和 `deploy/Caddyfile`。下面的 IP 配置仅用于无域名场景；同步这些文件不会自动切换生产入口。已有部署升级时应保留服务器上的 `.env`、实际使用的 Compose 覆盖文件、代理配置及证书卷，先核对启动命令再更新。

暂时没有域名时，可将 `QSL_DOMAIN` 设为服务器公网 IP，并通过 `docker compose -f compose.yaml -f compose.ip.yaml ...` 使用 IP 部署覆盖配置。它配置 Let’s Encrypt `shortlived` IP 证书、TLS-ALPN 验证和 2GB 主机的保守内存限制；仍保持 HTTPS 来源校验，不启用明文生产登录。需要支持 IP 签发的较新 Caddy、可用的出站 ACME 连接及公网 443 入站。Caddy 持久化证书并自动续期；短期证书尤其需要监测续期失败。

直接运行 Node 时必须先 `npm ci --omit=dev`。必填 DATABASE_URL；生产还必须设置 NODE_ENV=production、独立绝对路径 QSL_DATA_DIR、HTTPS 的 QSL_PUBLIC_ORIGIN，并关闭 QSL_SEED_DEMO。QSL_DB_SCHEMA 默认 public。外部数据库必须按服务商要求校验 TLS。详见 POSTGRESQL.md。

QSL_TRUST_PROXY 仅在应用端口被隔离、所有请求来自可信代理时启用。Compose 已覆盖 X-Real-IP 并隔离 app 端口。认证限流为单进程内存限流，不能替代公网网关的抗滥用保护。

```sh
curl --fail https://实际域名/api/health
curl --fail https://实际域名/api/config
docker compose ps
docker compose logs --tail=50 app db proxy
```

健康响应应含 storage=postgresql；配置响应应为 demo=false、demoAccounts=[]。构建时传入完整 SHA 与 UTC 时间的镜像还应返回 `build: { revision, created }`，与镜像 OCI revision / created 标签完全一致；页脚口号下会显示七位版本及香港时间。镜像内 `/app/build-info.json` 是唯一来源，不接受运行时 ENV 覆盖；本地直接 Node 运行或缺失/无效元数据返回 `build: null`，页脚显示“开发版 · 镜像构建时间未知”。未传构建参数可构建开发镜像，勿将其冒充正式发布；非空但无效或只传一个参数会使构建失败。检查：无演示登录入口；新管理员可登录；普通用户上传、审核、分享可用；两位用户完成换卡流程且地址仅对授权用户可见。不要用真实地址做验收。生产演示模式、默认管理员密码和示例数据均会被拒绝。

## 备份

数据库和图片必须成套备份。以下命令面向 Linux shell：先取得数据库快照，再复制上传文件。当前上传文件使用不可变 UUID 名称，程序不原地修改或删除文件，因此可在线取得快照所引用的图片；未来增加文件清理功能时需重新设计一致性策略或停写备份。

```sh
mkdir -p backups
chmod 700 backups
backup_id=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T db pg_dump -U qslink -d qslink -Fc > "backups/$backup_id.dump"
docker compose exec -T app tar -czf - -C /var/lib/qslink uploads > "backups/$backup_id-uploads.tar.gz"
```

分别检查两条备份命令的退出状态；失败时不能把不完整文件当成功备份。备份包含地址、哈希和会话，需要加密异地保存、限制访问，并安排定时任务及失败告警。应用不会替服务器配置备份调度。不要复制运行中的 PostgreSQL 数据卷文件作为逻辑备份。

恢复时先在隔离的新数据库/卷验证 pg_restore 和图片解压，保持同一批次，确认应用用户可以读取图片；禁止在运行的生产库上直接执行覆盖式恢复。pg_dump/pg_restore 应使用与数据库兼容的版本。旧 JSON 不包含切换 PostgreSQL 之后的新写入，不能直接当最新回滚数据。

## 升级与回滚

历史卡片图片转换不是启动时的数据库迁移。需要将既有 PNG/JPEG 转为有备份的 WebP 并清理原图时，先按 [历史图片迁移指南](IMAGE-MIGRATION.md) 执行试运行、转换、验证和清理；容器回退不会撤销这类文件和引用变更。

可通过 `QSL_RELEASE_DIR=/实际部署目录 sh deploy/backup.sh` 执行带互斥锁和校验和的备份，输出目录默认 `/var/backups/qslink`。脚本还保存 `.env`，因此备份含数据库凭据，必须仅限管理员访问并加密异地保存。失败文件保留 `.partial` 后缀，不会当作完整备份；脚本不会自动删除旧备份，需要监控磁盘和制定保留策略。

可选的 `deploy/qslink-backup.service` 和 `.timer` 假定 `/opt/qslink/current` 指向已部署版本，每日香港时间 03:15 起随机延后最多五分钟执行。安装前核对目录、建立权限为 700 的备份目录，再复制单元至 `/etc/systemd/system/` 并启用 timer。先手动运行一次 service，验证 dump 可列出、tar 可解压和校验和正确；定期在隔离环境演练完整恢复。本机备份不能代替异地备份。

按 CONTRIBUTING.md 经 dev 验证、发布 PR 合入 main、选定版本标签，再部署。升级前成套备份，阅读迁移说明，然后按“首次部署”示例在本次构建前重新取得完整 SHA 和当前 UTC 时间、通过两个 `--build-arg` 执行 `docker compose build`，再 `docker compose up -d --wait`。不要复用上次构建时间；直接 `docker build` 时同样传入 `QSL_BUILD_REVISION` 和 `QSL_BUILD_CREATED`。启动时按 schema_migrations 执行 SQL 迁移。

不要执行 `docker compose down --volumes`，这会删除数据库和图片。保持 Compose 项目名、部署目录和卷配置不变。PostgreSQL 大版本升级必须按官方升级流程操作，不能直接将已有 17 数据卷挂到其他大版本镜像。

回滚不自动降级数据库。先停止 app，保存故障现场，确认旧程序是否兼容现有 schema；不兼容时在新库恢复相应备份，验证后切换。不要移动已发布标签。

## 限制与故障

- PostgreSQL 不可用时接口返回 503，检查连接、权限、磁盘、网络，修复后可重试。不会回退到旧 JSON。
- JSON 文件锁已移除，多个应用进程的写事务由 PostgreSQL 协调。当前领域适配层逐请求加载表数据、串行处理写事务，适合小社区，不宣称高并发扩展完成。
- 多个应用实例需要共享上传文件或对象存储。当前 Compose 仍运行一个 app；不要直接复制独立上传卷来扩容。
- 上传暂未设置每用户配额，需监控容量；SVG 依赖应用的沙箱 CSP，不能绕过应用响应头公开上传目录。
- 监控健康、证书、磁盘、数据库连接和备份结果。真实域名证书、防火墙、恢复演练和业务验收必须在目标机器完成；代码合并不等于已部署公网。

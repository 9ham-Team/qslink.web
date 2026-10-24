# 生产部署与维护（PostgreSQL 17）

适用于单机小型社区：Node.js + PostgreSQL 17 + Caddy HTTPS。代码和测试已支持 PostgreSQL 事务；上传文件仍需独立持久化。旧 JSON 数据迁移详见 [PostgreSQL 指南](POSTGRESQL.md)。

## 首次部署

要求 Docker Engine、Compose v2、真实域名和 TCP 80/443。域名 A/AAAA 必须指向服务器。不公开 8787 或 5432 端口。

在选定的、CI 已通过的发布标签目录执行：

```sh
cp .env.example .env
```

设置 QSL_DOMAIN 为实际域名，POSTGRES_PASSWORD 为数据库管理员密码，QSL_DB_PASSWORD 为独立的应用数据库密码。用密码管理器或 `openssl rand -hex 32` 分别生成两个值。Compose 将应用密码拼接到连接串，因此示例建议十六进制字符串。不要保留空值、复用演示密码或提交 .env；服务器上限制 .env 的读取权限，例如 `chmod 600 .env`。

```sh
docker compose config --quiet
docker compose build app
docker compose up -d --wait db
docker compose run --rm --no-deps app node server/init-admin.js
docker compose up -d --wait
```

初始化会询问第一位网站管理员的用户名、邮箱和密码，密码不回显，至少 12 位且包含字母数字。这与数据库账号不是同一个账号。网站管理员已存在时拒绝覆盖。已有真实 JSON 库应先导入，不要先初始化管理员。

新的 PostgreSQL 卷会通过 deploy/init-postgres.sh 创建数据库及非超级用户 qslink。应用仅使用这个角色，数据库管理员凭据不传给应用。已初始化的数据库卷不会重新执行初始化脚本；更改 .env 不会自动修改数据库内密码，轮换必须通过 PostgreSQL 完成并同步应用配置。

app-data 保存上传文件，postgres-data 保存数据库，caddy-data 保存证书。应用非 root、代码文件系统只读、数据库和 app 都不发布宿主机端口。Caddy 自动获取并续期证书；失败时检查 DNS、防火墙和日志，不绕过证书警告。

## 配置与上线验证

直接运行 Node 时必须先 `npm ci --omit=dev`。必填 DATABASE_URL；生产还必须设置 NODE_ENV=production、独立绝对路径 QSL_DATA_DIR、HTTPS 的 QSL_PUBLIC_ORIGIN，并关闭 QSL_SEED_DEMO。QSL_DB_SCHEMA 默认 public。外部数据库必须按服务商要求校验 TLS。详见 POSTGRESQL.md。

QSL_TRUST_PROXY 仅在应用端口被隔离、所有请求来自可信代理时启用。Compose 已覆盖 X-Real-IP 并隔离 app 端口。认证限流为单进程内存限流，不能替代公网网关的抗滥用保护。

```sh
curl --fail https://实际域名/api/health
curl --fail https://实际域名/api/config
docker compose ps
docker compose logs --tail=50 app db proxy
```

健康响应应含 storage=postgresql；配置响应应为 demo=false、demoAccounts=[]。检查：无演示登录入口；新管理员可登录；普通用户上传、审核、分享可用；两位用户完成换卡流程且地址仅对授权用户可见。不要用真实地址做验收。生产演示模式、默认管理员密码和示例数据均会被拒绝。

## 备份

数据库和图片必须成套备份。以下命令面向 Linux shell，停 app 以保证图片和数据库的一致性，db 继续运行：

```sh
mkdir -p backups
chmod 700 backups
backup_id=$(date -u +%Y%m%dT%H%M%SZ)
docker compose stop app
docker compose exec -T db pg_dump -U qslink -d qslink -Fc > "backups/$backup_id.dump"
docker compose run --rm --no-deps --user 0 -v "$PWD/backups:/backup" app tar -czf "/backup/$backup_id-uploads.tar.gz" -C /var/lib/qslink .
docker compose start app
```

分别检查两条备份命令的退出状态；失败时不能把不完整文件当成功备份。备份包含地址、哈希和会话，需要加密异地保存、限制访问，并安排定时任务及失败告警。应用不会替服务器配置备份调度。不要复制运行中的 PostgreSQL 数据卷文件作为逻辑备份。

恢复时先在隔离的新数据库/卷验证 pg_restore 和图片解压，保持同一批次，确认应用用户可以读取图片；禁止在运行的生产库上直接执行覆盖式恢复。pg_dump/pg_restore 应使用与数据库兼容的版本。旧 JSON 不包含切换 PostgreSQL 之后的新写入，不能直接当最新回滚数据。

## 升级与回滚

按 CONTRIBUTING.md 经 dev 验证、发布 PR 合入 main、选定版本标签，再部署。升级前成套备份，阅读迁移说明，然后 `docker compose build app` 和 `docker compose up -d --wait`。启动时按 schema_migrations 执行 SQL 迁移。

不要执行 `docker compose down --volumes`，这会删除数据库和图片。保持 Compose 项目名、部署目录和卷配置不变。PostgreSQL 大版本升级必须按官方升级流程操作，不能直接将已有 17 数据卷挂到其他大版本镜像。

回滚不自动降级数据库。先停止 app，保存故障现场，确认旧程序是否兼容现有 schema；不兼容时在新库恢复相应备份，验证后切换。不要移动已发布标签。

## 限制与故障

- PostgreSQL 不可用时接口返回 503，检查连接、权限、磁盘、网络，修复后可重试。不会回退到旧 JSON。
- JSON 文件锁已移除，多个应用进程的写事务由 PostgreSQL 协调。当前领域适配层逐请求加载表数据、串行处理写事务，适合小社区，不宣称高并发扩展完成。
- 多个应用实例需要共享上传文件或对象存储。当前 Compose 仍运行一个 app；不要直接复制独立上传卷来扩容。
- 上传暂未设置每用户配额，需监控容量；SVG 依赖应用的沙箱 CSP，不能绕过应用响应头公开上传目录。
- 监控健康、证书、磁盘、数据库连接和备份结果。真实域名证书、防火墙、恢复演练和业务验收必须在目标机器完成；代码合并不等于已部署公网。
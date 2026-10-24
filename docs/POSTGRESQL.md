# PostgreSQL 数据层与旧数据迁移

## 存储方式

应用只使用 PostgreSQL 17，不再读写 JSON 数据库，也没有 JSON 回退模式。用户、卡片、申请、点赞、会话分别存储在关系表中；地址、卡片比例使用 JSONB 字段。图片仍保存为 `QSL_DATA_DIR/uploads/` 下的文件。

`server/migrations/001_initial.sql` 建立外键、级联删除、大小写不敏感的用户名/邮箱唯一索引、每人每卡一次点赞、有效申请唯一索引，以及同卡最多一条已同意申请的约束。服务、管理员初始化和导入命令会自动执行版本化建表；旧程序遇到高于自身支持版本的数据库会拒绝启动，不会自动降级。

API 维持原契约。每次请求在独立事务中加载领域数据快照，修改按行提交，失败整体回滚；不会长期缓存数据库或把全库写入一个 JSONB 字段。写事务通过 PostgreSQL advisory lock 串行处理，跨 Node 进程共享锁。读事务使用一致性快照。

这是保留现有业务层的小型社区实现，仍会逐请求读取领域表，写入按 schema 串行；不是高并发查询架构。数据增长后应把筛选、统计和分页下推 SQL，再按业务实体细化锁；多个应用实例还需要共享上传存储或对象存储。

## 连接配置

- `DATABASE_URL`：必填，例如 `postgresql://qslink:经过URL编码的密码@127.0.0.1:5432/qslink`。不要将真实连接串提交到 Git、PR 或聊天。
- `QSL_DB_SCHEMA`：默认 `public`，仅允许小写字母开头和小写字母/数字/下划线，最长 63 字符。生产、开发应优先使用不同数据库和凭据，而不只是不同 schema。
- 外部数据库连接使用服务商要求的 TLS/CA 校验参数，不要通过禁用证书校验解决连接问题。
- 应用角色需要拥有目标数据库/schema 的建表、查询和修改权限，不需要 PostgreSQL 超级用户、创建角色或创建其他数据库的权限。
- 健康接口实际检查数据库连接，响应包含 `storage: "postgresql"`。数据库故障返回 503，修复连接后可重试；旧 JSON 文件不会接管存储。

## 本地开发

先运行 `npm ci`。已有 PostgreSQL 时，设置 `DATABASE_URL` 并使用独立开发数据库即可。

没有安装 PostgreSQL 的开发者可在第一个终端运行：

```sh
npm run db:local
```

此命令通过仅开发依赖启动本机 PostgreSQL 17，监听 `127.0.0.1:55432`，集群保存在忽略的 `data/postgresql/`，随机凭据在 `data/local-postgres.json`，停止命令不会删除集群。该工具用于开发，不包含在生产镜像，也不创建系统服务。再次启动遇到已有服务器占用端口时，不要删除数据或杀掉未知进程。

第二个 PowerShell 终端可以加载本地连接：

```powershell
$localDb = Get-Content data/local-postgres.json -Raw | ConvertFrom-Json
$env:DATABASE_URL = 'postgresql://postgres:' + $localDb.password + '@127.0.0.1:' + $localDb.port + '/postgres'
$env:QSL_DB_SCHEMA = 'qslink_development'
npm run demo
```

若检测到旧 `data/db.json` 且目标 schema 未初始化，服务会拒绝启动并提示先导入，避免静默跳过原有数据。正式创建生产管理员时使用全新的生产库，不要复制演示库。

## 从旧 JSON 导入

1. 停止旧服务，备份整个旧数据目录（JSON 和 uploads），避免备份/导入时仍有写入。
2. 创建全新的 PostgreSQL 数据库或 schema。目标不能已有管理员、用户或初始化标记；本工具不会覆盖或合并已有数据。
3. 将旧 uploads 原样复制到目标 `QSL_DATA_DIR/uploads/`。卡片引用路径不变。准备目标 `DATABASE_URL`、`QSL_DB_SCHEMA` 和上传目录配置。
4. 先预检，再正式导入：

```sh
npm run db:import-json -- --file /backup/db.json --dry-run
npm run db:import-json -- --file /backup/db.json
```

预检会创建所需表结构并在事务中验证全部 SQL 约束，随后回滚数据。正式导入在一个事务内完成，任一引用、唯一性或字段约束失败会整体回滚。源 JSON 和图片都不会修改或删除。保留密码哈希、ID、地址、会话和分享 token；过期会话仍按认证逻辑失效。

演示库默认拒绝导入。仅本地演示可以设置非生产环境并显式添加 `--allow-demo`；生产禁止这个选项对应的演示数据。旧演示库中指向 `u_like_*` 的虚拟点赞会补成禁用的合成用户以满足外键，数量会在输出中列出；真实业务数据的异常引用不会静默丢弃或修复。

若使用 Compose，先按部署指南启动 db、复制图片至 app-data，再用带源文件只读挂载的 `docker compose run --rm --no-deps -v /backup:/backup:ro app node server/import-json.js --file /backup/db.json --dry-run` 进行预检。不要先运行 admin:init 占用空目标库；导入包含管理员的真实业务库后直接启动应用。

## 验证与回退

核对导入前后用户、卡片、申请、点赞及会话数量，用原账号检查登录、分享、地址权限和换卡流程，再开放访问。原 JSON 可供回退，但新系统开始接收写入后它就不再是最新数据；不要直接切回旧 JSON 丢弃新写入，应先停止服务并制定反向迁移方案。

`npm test` 和 `npm run test:production` 默认创建临时 PostgreSQL 17，测试后停止并清理；它们不使用 `DATABASE_URL`。需要外部测试库时，单独设置 `QSL_TEST_DATABASE_URL`，测试仅操作随机 `qslink_test_*` schema。测试凭据应仅能访问隔离测试库，不要使用生产连接。

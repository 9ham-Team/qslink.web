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

迁移 `008_short_tokens.sql` 在同一迁移事务内为已有卡片补齐密码学安全的六位大小写敏感字母 `shortToken`，保留原 `shareToken`。短 token 有非空、格式及唯一约束；`card_share_tokens` 与触发器保证历史 token 和新 token 不能指向不同卡片。迁移、导入和运行时写入均检查冲突，应用写锁保证多进程分配稳定；重复启动不换号。历史 `/share/:token` 保持可访问，新分享使用 `/s/:token`。升级提高 schema 版本，旧程序会拒绝启动；回退需恢复迁移前数据库备份，不能仅换旧镜像。

迁移 `007_announcements.sql` 新建独立 `announcements` 表，不生成默认公告、不改动既有卡片或用户。字段为文本主键 `id`、非空 `title`（1–120 字符）、非空 `body`（1–10000 字符）、`status`（仅 `draft` / `published`）、可空 `publishedAt` 及非空 `createdAt` / `updatedAt`（时间均为 `timestamptz`）；数据库约束要求已发布公告必须有发布时间。部分索引 `announcements_public_idx` 按发布时间及 ID 倒序支持已发布列表。公告随其它领域表在事务中加载和按行持久化，发布 / 撤下写入受相同写锁保护。草稿初始发布时间为 NULL，发布时由服务端生成；撤下保留发布时间，重新发布更新该时间，编辑已发布正文不改发布时间。

该迁移随启动自动执行并提升 schema 版本，失败由迁移事务回滚；旧程序不能直接使用升级后的 schema，会因版本超前拒绝启动。仓库不提供自动向下迁移。回退前必须停写并备份当前数据库，再恢复升级前数据库备份并使用匹配版本程序；仅恢复旧镜像 / 容器不会恢复数据。删除公告表或修改迁移记录不是安全回滚，会丢失公告及发布历史；恢复旧备份也会丢失备份后的其它业务写入，需事先制定保留或补录方案。

迁移 `006_multiple_card_exchanges.sql` 删除每张卡片只能有一笔 `approved` 交换的唯一索引，保留同一卡片与同一申请人的活动申请唯一约束。已有申请状态及地址保持原样，历史上自动拒绝的申请不会自动恢复；申请人可以重新申请。升级启动时自动执行迁移。旧程序会因 schema 版本提高而拒绝启动；恢复旧限制前需先处理同卡多笔 `approved` 数据，不能直接重建旧索引或仅切回旧镜像。

迁移 `005_public_uid.sql` 为所有已有用户补齐随机唯一九位 `uid`，新增非空、格式及唯一约束；注册、离线管理员、演示和旧 JSON 导入也会分配。内部用户 ID 和现有外键保持不变。迁移在事务内执行，失败不会留下部分分配；再次启动保留已分配 UID。旧程序会因 schema 版本高于自身而拒绝启动，不能仅切回旧镜像回滚。回退需停写并恢复迁移前的数据库备份；移除新列会丢失公开主页链接对应关系。

核对导入前后用户、卡片、申请、点赞及会话数量，用原账号检查登录、分享、地址权限和换卡流程，再开放访问。原 JSON 可供回退，但新系统开始接收写入后它就不再是最新数据；不要直接切回旧 JSON 丢弃新写入，应先停止服务并制定反向迁移方案。

`npm test` 和 `npm run test:production` 默认创建临时 PostgreSQL 17，测试后停止并清理；它们不使用 `DATABASE_URL`。需要外部测试库时，单独设置 `QSL_TEST_DATABASE_URL`，测试仅操作随机 `qslink_test_*` schema。测试凭据应仅能访问隔离测试库，不要使用生产连接。

### 009：换卡偏好

`009_exchange_card_preference.sql` 为 exchanges 增加可空的 `preferredCardId`（外键，删除卡片时 SET NULL）和 `preferredCardTitle`（标题快照）。旧记录两字段为 null，表示无偏好；新版本启动自动迁移到 schema 9。旧版本会拒绝较新的 schema，不能仅恢复旧镜像完成回滚。迁移不修改现有申请状态和地址。

### 010：公告提醒偏好与停留时长

`010_announcement_reminders.sql` 为公告增加非空整数 `displaySeconds`（1–3600，已有公告补为 30），新建 `announcementDismissals` 表，按用户和公告唯一保存“不再提醒”，外键随用户或公告删除级联清理。旧 JSON 导入补齐空偏好集合和默认 30 秒。启动自动升级至 schema 10，不改变原有公告发布状态或内容。旧程序会拒绝 schema 10，回滚需停写、备份当前数据并恢复迁移前数据库及对应程序；只换旧镜像不能撤销迁移，恢复旧备份会丢失其后的写入。

## 011：私有通联日志

`011_contact_logs.sql` 新增 `contactLogs` 表，以 userId 外键关联账号并在删号时级联删除，按账号/去重键唯一，按账号/UTC 通联时间建索引；details JSONB 仅保存标准化通联字段，不保存 LoTW 凭据或原始文件。随现有请求事务加载及按行持久化，写入由原有 advisory lock 串行保护。每账号最多 50000 条；当前全域快照架构仍适用于小型社区，大规模日志应另行设计 SQL 查询及分批持久化。

启动自动迁移至 schema 11，不改动已有卡片、申请或用户信息。旧程序会拒绝较新的 schema；回退必须停写、备份并恢复迁移前的数据库及匹配程序，不能仅换旧镜像。恢复旧备份会失去备份后的日志和其它业务写入，应在部署前安排备份和保留方案。

TQ8 文件导入沿用 schema 11，details.source 新增 tq8 标记；不增加迁移或修改已有日志。TQ8 仅持久化签名覆盖的标准化通联数据，不持久化上传文件、签名及内嵌用户证书。ADI / ADIF 支持继续导入；有 STATION_CALLSIGN 字段时须与账号呼号一致，空值或不一致整批拒绝，无该字段时由当前账号资料赋值；source 为 adif。三种来源重复导入保留已确认状态并按 LoTW > TQ8 > ADIF 优先级补充信息。

## 012：换卡通联记录快照

`012_exchange_contact_logs.sql` 为 exchanges 增加非空 JSONB 数组 `selectedContactLogs`，最多 100 条。历史申请补为 []，不追溯匹配已有日志。保存由申请人明确勾选的标准化通联快照，不使用源日志外键；后续日志变化不重写申请附件，申请删除时随行删除快照。旧 JSON 导入和演示数据省略此字段时由持久化层补为空数组。

启动自动升级至 schema 12，旧程序拒绝较新 schema。回滚需停写并备份，恢复迁移前数据库及对应程序；不能只更换旧镜像。恢复旧备份会丢失备份后的写入。

## 013：卡片库存

`013_card_stock.sql` 为 cards 增加可空 integer 字段 stock，CHECK 限制为 0–2147483647。已有卡片为 NULL（未设置，不限制换卡），不根据历史申请推算库存。0 表示暂无库存；卡片仍公开展示。发卡者可手动设置剩余库存，同意申请时与状态更新在同一写事务内扣减 1 张；共用现有跨进程 advisory lock，避免并发超卖。偏好卡片不扣减，pending 不预占，完成/拒绝/撤回不改变库存。

启动自动升级至 schema 13。旧版本会拒绝较新 schema；不提供自动向下迁移。回退需停写并备份当前数据，恢复迁移前数据库及匹配程序，不能仅更换旧镜像。恢复旧备份会丢失备份后的库存与其它写入。

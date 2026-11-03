# 历史卡片图片迁移

`server/migrate-images.js` 是显式维护工具，不在应用启动时运行，不自动部署生产、不执行 SQL schema 迁移。它读取当前数据库所有状态卡片的 `frontImage` / `backImage`，按图片去重，将 PNG/JPEG 以及长边超过 3840 的 WebP 转为长边最多 3840、质量 82 的 WebP，不放大小图。已符合尺寸的 WebP、SVG、外部 URL 和未引用文件不改动。

## 执行顺序

1. 核实目标数据库、schema、上传卷和运行镜像。按部署指南完成数据库及上传目录成套备份，并检查 `pg_restore --list`、归档目录和校验和。备份仅供管理员访问，不下载到公开目录。
2. 用含 Sharp 和本工具的已验证镜像运行维护命令，复用目标环境、数据库网络和上传卷；不要为运行维护工具替换生产应用镜像。维护容器与应用必须共享同一上传路径，备份父目录必须已存在且不可公开访问。多个实例须共享上传卷，不得并行运行迁移。
3. 先试运行，再使用一个不存在的绝对备份目录执行 apply。默认模式为 dry-run：会实际解码和转换以验证所有候选图片，但不会写入文件或数据库。

```sh
node server/migrate-images.js --dry-run
node server/migrate-images.js --apply --backup-dir /var/lib/qslink/image-migrations/本次唯一目录
node server/migrate-images.js --verify --backup-dir /var/lib/qslink/image-migrations/本次唯一目录
# 核对已迁移图片 HTTP 响应及审核页面后再清理：
node server/migrate-images.js --prune --backup-dir /var/lib/qslink/image-migrations/本次唯一目录
```

apply 先备份原图并生成新文件，保存逐图 SHA-256 和原引用清单，再发布全新 UUID 文件，并在事务中一次性更新引用。准备期间不阻塞业务写入；切换时取得应用写事务使用的 advisory lock 和 cards 表写锁，检测并发图片变更，发生变化则拒绝切换。迁移不改审核状态、内容或更新时间。失败可能留下备份或未引用的新文件，不会自动删除这些诊断材料，也不要直接重用该备份目录。

verify 检查备份、新图哈希、实际 WebP 尺寸及所有原引用。prune 在相同写锁下复核备份和引用，只删除本次清单中已无引用且内容未变的旧文件，不扫描删除其他上传文件、缓存或数据卷。清理可能分批完成，中断后可重新运行 verify/prune。若引用已被后续编辑或删除，工具保守拒绝清理，需要人工审查。

原图从活跃 uploads 目录删除后，旧图片直链将失效；卡片详情和分享链接不变，数据库已切换新图片地址。长期缓存不会因替换同名文件而混淆，因为迁移使用新 UUID。SVG 保留历史沙箱行为。备份原图仍占用备份空间，不会因清理活跃原文件自动删除；镜像或容器回退不会撤销图片迁移。

## 回退

```sh
node server/migrate-images.js --rollback --backup-dir /var/lib/qslink/image-migrations/本次唯一目录
```

回退校验备份，必要时恢复原文件，仅将仍指向本次新图的原卡片字段改回旧地址，不覆盖迁移后用户编辑或删除的字段。转换后的 WebP 保留，避免破坏后续引用。工具不自动恢复整库备份，不修改 schema。若备份损坏、数据库/卷不匹配、源图变化或权限/空间不足，停止并先核查；禁止用替换旧镜像代替数据回退。

控制台仅报告数量、字节数和备份目录；manifest 含卡片 ID 和文件引用，必须与原图一样限制访问。建议在完成恢复演练后，将成套备份加密保存到独立介质。

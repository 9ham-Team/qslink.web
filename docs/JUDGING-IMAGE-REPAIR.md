# 赛事评审图片排查与修复

`server/repair-judging-images.js` 是离线维护命令，不会随应用启动。它按作品编号遍历当届赛事，跳过已撤回或当前不满足评审资格的作品。尚未冻结的作品使用和评审相同的 WebP 编码器试转，已冻结的作品核对文件大小和 SHA-256。报告只列作品编号、正反面、处理状态和原因。

## 先扫描，再修复

1. 确认目标 `DATABASE_URL`、`QSL_DB_SCHEMA`、`QSL_DATA_DIR` 和对应上传卷。用含该脚本、Sharp 和 `pg` 的已验证环境运行；容器内使用 `/app` 下的脚本，挂载与目标应用相同的数据卷，连接同一个数据库网络。
2. 先只读检查 69 号，再做全场扫描。跨作品的 1000 件及 256 MiB 限制只在全场扫描时估算；如果有读不到的图片，估算不含这些图片的实际字节数。

   ```sh
   node server/repair-judging-images.js --dry-run --number 69
   node server/repair-judging-images.js --dry-run
   ```

3. 执行前按 [历史图片迁移指南](IMAGE-MIGRATION.md) 成套备份数据库和上传卷。选择父目录已存在、未公开的绝对备份路径；命令会在第一张可修复图片出现时新建该目录。可加 `--number 69` 只写这一件；不加会处理扫描范围内所有可修复的图片。

   ```sh
   node server/repair-judging-images.js --apply --number 69 --backup-dir /var/lib/qslink/judging-repair-69-001
   node server/repair-judging-images.js --dry-run --number 69
   node server/repair-judging-images.js --dry-run
   ```

4. 回到管理员评审页重新下载 `1–80`，确认 ZIP 清单包含 `69` 且正反面符合预期。仍在评审截止前时，正常读取评审页或导出会触发材料同步；脚本本身不会生成冻结材料或修改截止时间。

`repairable` 表示试转成功；`repaired` 表示新图片已发布且卡片引用已切换。工具仅对可解码的单帧 JPEG、PNG 或 WebP 自动重编码，单个输入最多 64 MiB；会校验输出确实能走完评审编码流程。新文件使用独立地址，保留原文件、审核状态、评分和内容字段。切换前在事务内重新核对参赛资格、冻结状态与原引用。若同批有其他 `manual` 项，可修复项仍会处理；程序退出码 `2` 表示仍有人工事项，`1` 表示命令未能正常完成，`0` 表示没有人工事项（试运行仍可能包含 `repairable`）。失败可能留下备份或未引用的新文件，先检查清单，重新执行时换一个备份目录。

缺失、不可解码、无效站内路径、超出维护上限的原图不会被占位图代替。先从可信备份找回原图；需要更换卡面时，由作者走正常上传和审核流程。若报错涉及**已冻结**的图片，只能从备份恢复与原记录 SHA-256 完全一致的文件；不要对冻结图片二次编码，也不要修改校验和或评分记录。

## 回退图片引用

```sh
node server/repair-judging-images.js --rollback --backup-dir /var/lib/qslink/judging-repair-69-001
```

回退检查目标库、上传目录和原图备份校验和，仅切回还指向本次新图的字段。原图被删或修改时先人工恢复并核对原图。回退会保留新图；在修复后已经成功冻结的材料不受影响。容器或镜像回退不会撤销图片引用修改。备份清单含内部卡片和图片引用，按上传备份同等保护。

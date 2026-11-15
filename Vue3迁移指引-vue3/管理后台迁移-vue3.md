# 管理后台 Vue3 迁移 — vue3

本轮将 `/admin?tab=overview|users|cards|exchanges|announcements|contest` 的业务界面迁入 Vue，分支保持 `dev-vue3`。权限仍由既有 Router/Pinia 与服务端 `requireAdmin` 共同校验；未新增后台 API、权限或数据库迁移。

## 实现与所有权

- `client/src/pages/Admin.vue`：后台外壳、六分区、键盘导航、URL tab 同步及审核角标。分区筛选与成功页码只保留在本次后台访问内存中，登出、切号、离开后台后释放。
- `client/src/components/AdminRoute.vue`：严格 admin 角色，复用 `RoutePage` 按需加载真实 Vue 页面，提供加载骨架、失败重试和导航完成事件；不再调用 LegacyPageHost 或原生 render。
- `client/src/admin/`：各分区、表单弹窗、分页、反馈、统计、缩略图与受控请求作用域。业务数据由 Vue 响应式状态渲染，没有后台 HTML 拼接或原生后台 DOM 岛。
- `tools/build.mjs`：从生成入口移除 `admin.js` 与 `admin-contest-judging.js`；`migration.json` 的 legacyPageHost 为 null。原生脚本保留在 `public/`，仅供显式 legacy 对照，不在默认站点执行。

## 保留的业务契约

| 模块 | 行为 |
| --- | --- |
| 概览 | 原有七项统计、递增动效、待审核卡片、最近用户与申请、快捷入口 |
| 用户 | 防抖搜索、状态/角色筛选、分页、编辑资料/颜色/角色/状态/密码、禁用/恢复/删除确认；本人禁止禁用、删除及修改角色/状态；服务端最终裁决最后管理员与冻结评委密码保护 |
| 卡片 | 搜索与审核筛选、响应式正反面图、3D 预览、通过/驳回/编辑/删除、前台查看；自动参赛说明确认及 skipped 原因；编辑不写 stock |
| 换卡 | 状态与分页、3D、双方及服务端返回地址、留言/拒绝原因/时间线/偏好卡片与已附通联快照；保持只读 |
| 公告 | 全站与赛事范围隔离、8 条分页、标题/正文 Unicode 计数、1–3600 秒、草稿/发布/撤下与失败重试、纯文本渲染 |
| 比赛 | 报名说明审核、卡片可批准条件、expectedRevision 冲突后强制刷新、北京时间投票起止与关闭、XLSX 导出 |
| 人工评审 | 五位正常普通用户选择、未来北京时间截止、开始/调整确认、30 秒进度轮询、保留未保存配置、冲突禁写与显式刷新；结果只在服务端允许时手动加载，材料每批最多 20 件，ZIP/XLSX 手动下载与原有授权说明 |

所有管理请求携带 AbortSignal，离页/切号中止，迟到响应核对 token、用户 ID 与 admin 角色。列表使用请求代次隔离并重试失败目标页；删除最后一页记录会回到有效页码。定时器、监听、下载 Blob URL 与 3D 查看器随组件卸载清理。沿用共享 Dialog 的焦点、Escape 和弹窗栈；图片沿用响应式接口；动效尊重 reduced-motion。

## 验证记录

本次实际执行结果在同目录 `迁移进度-vue3.md` 本轮记录中更新。新增 `client/tests/admin.test.ts`，调整旧后台宿主单测；新增 `client/e2e/admin.spec.mjs`，更新懒加载浏览器断言。浏览器使用现有独立临时 PostgreSQL 与合成账号，不访问测试服业务库或生产。

用户已追加授权本次提交、推送与独立 44381 部署；须核验目标完整 SHA 的 CI 与镜像发布均成功后部署。发布实际结果另存本轮发布记录。原有 `.gitignore` 的 `/.zcode/` 保留。

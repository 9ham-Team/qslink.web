# QSLink 验收报告（QA · v3.1 最终版）

> **重要：历史验收范围说明（2026-10-19 · v3.1）**
>
> 本报告仅保留 2026-10-19 v3.1 当时的验收记录。下文「全部验收完成」「通过，可以交付」等结论仅适用于该历史范围，**不是当前版本的发布验收结论**。
>
> 本报告不覆盖后续 PostgreSQL、邮件、法律、CI 及生产相关变更，也不能作为这些变更或当前生产环境已通过验收的证据。文中的命令、脚本、路径、截图及其他产物均为当时记录，使用前须核实其在当前仓库和环境中的存在性、适用性及实际结果。
>
> 本次仅补充历史范围说明，保留原有历史结果；未执行新的回归测试，未新增当前版本通过结论。

> 负责人：qa ｜ 工作目录：`qsl-card-exchange/` ｜ 数据：8787 种子 **v3.1**（13 卡 = 10 已通过 / 2 待审核 / 1 拒绝；公开 10 张全为程序化生成 SVG，无 BG7MOM 真实图；band/mode 为空；最高赞 BH8ABC《高原星空下的守候》46）
> 更新时间：2026-10-19 20:35 ｜ 状态：**✅ 全部验收完成，可交付**（无 P0/P1/P2 遗留）

## 0. 最终结论

**✅ 通过，可以交付。** 用户第三轮反馈（移除真实卡图、移除波段/模式、探索页只搜呼号、3D 厚度、卡面 MODE/BAND 空字段）已全部实现并经 QA 回归验证。

| 验收项 | 结果 |
|---|---|
| 后端 E2E 冒烟（`node tests/smoke.mjs`，隔离实例，128 项） | **128/128 PASS**，退出码 0（约 5s） |
| 全量视觉截图（20 路由 × 桌面 1440×1000 + 真机移动 390×844 = **40 张**） | **40/40 成功**，manifest failures=0 warnings=0；逐张人工复核通过 |
| 控制台/溢出/禁用词扫描（`node tests/console.mjs --forbid=波段,模式`） | 桌面 **18/18**、移动 **18/18** 路由无报错；无「波段/模式」字样、无真实卡图路径、无 body 横向溢出 |
| 表单字段级校验（`node tests/forms.mjs`） | **4/4** 场景通过 |
| 3D 卡片厚度（`node tests/card3d-shot.mjs` 斜侧角度 + 翻面截图） | 厚度 2-4px / 5 层，侧面自然、无突兀厚板；翻转/拖拽/复位正常 |
| 种子 v3.1 数据 | 13 总卡 / 10 公开；band/mode 为空；公开数据 0 处真实图路径；26 张卡面 SVG **无 MODE/BAND 空字段** |
| 缺陷 | P0×0；本轮 P1×1（后端删除卡片回归）+ P2×1（卡面 SVG 空字段，视觉）均已修复回归；遗留 P3 建议 1 条 |

## 1. 本轮（v3）变更点与验收对照

| 用户反馈 / 需求 | 实现验证 | 结果 |
|---|---|---|
| 移除 BG7MOM 真实卡片图（公开不展示） | 公开列表/详情/分享 token 接口中 frontImage/backImage 全部 `/uploads/seed-*.svg`，0 处 `bg7mom-front/back`；首页 Hero 为生成卡《高原星空下的守候》BH8ABC（46 赞） | ✅ |
| 移除卡片波段/模式（上传/展示/筛选/后台） | 前端所有页面无「波段/模式」字样（console `--forbid` 18×2 路由 0 命中）；建卡表单仅剩标题/呼号/简介；详情/分享只显示卡片比例/换卡次数/发布时间；后台卡片列表无波段/模式元信息；后端 band/mode 变可选，未传时返回 `''` | ✅ |
| 探索页只按呼号搜索（后端新增 callSign 参数） | `/explore?callSign=bg7` →「找到 3 张卡片」（截图 `explore-search-*`）；搜索匹配卡片 callSign 与 owner.callSign、大小写不敏感、无结果空态、非法参数 200 不报错（smoke 6 项） | ✅ |
| 3D 卡片厚度自然 | 厚度改为 2-4px / 5 层；斜侧角度截图 `qa-shots/card3d-angle-desktop.png`、翻面+侧角 `card3d-back-desktop.png`：纸片厚度自然、边缘干净、无变形 | ✅ |
| 卡面 SVG 仍印 `MODE — / BAND —` 空字段（v3.1 修复） | 扫描全部 13 张卡正反面 **26 张 SVG**：0 处 MODE/BAND 空字段（smoke 新增用例 `seed: card faces do not print empty MODE/BAND fields` + 首页/详情/分享截图人工确认） | ✅ |
| 移动端无溢出 | 移动视口 18/18 路由 `scrollWidth == innerWidth`；截图 390×844 全部正常 | ✅ |

## 2. 阶段一：后端 E2E 冒烟（128 项，全部通过）

**结果：`RESULT: PASS — 128 passed, 0 failed, 128 checks`**（隔离实例 + 全新 v3.1 种子，退出码 0，约 5s）。

覆盖分组（在 v1/v2 的 112 项基础上新增/调整 16 项）：

| 分组 | 覆盖点（✅ 全部通过） |
|---|---|
| 健康/静态/路由 | `/api/health`；`/`、`/index.html` 200 含 `#app`；SPA 回退；带扩展名未知静态文件 404 |
| **种子 v3.1** | 公共卡恰 10 张、全部 approved；管理后台共 13 张；公开数据无真实图路径；公开详情+分享 token 全量无真实图路径；公开卡 band/mode 为 `''`；**13 卡 26 张卡面 SVG 无 MODE/BAND 空字段**；callSign=BG7MOM 种子搜索命中 |
| 注册/登录/会话 | 成功/默认值/重复用户名/邮箱/弱密码/缺字段/格式；登录大小写不敏感、错误密码 401、被封禁 403、me、logout 失效 |
| 建卡（v3 语义） | **不传 band/mode → 201 且响应 band/mode 为 `''`**；传 band/mode 仍兼容；all-optional（不传 callSign/band/mode）201；非法比例 400；缺正面图 400；我的卡片含 pending；公共列表隐藏 pending；pending 详情权限 |
| 呼号搜索（v3 新增） | `?callSign=` 命中卡片 callSign；命中 owner.callSign（卡片自身 callSign 不同）；大小写不敏感；无匹配空结果；超长/中文/空/带空格参数均 200 不报错；`q` 标题搜索回归仍可用 |
| 管理员审核 | stats；pending 列表；审核通过；公共可见性；admin 可看 pending 详情 |
| 点赞 / 分享 | 点赞切换与权限；share token/url；匿名公共接口；pending 卡 404；无效 token 404；分享页路由 |
| 换卡全状态机 | 自己卡 400/403、未登录 401、缺地址 400、重复 409、审批通过（地址可见）、自动拒绝其它 pending、拒绝/撤回/完成及非法状态、越权 403/404、box/status 过滤 |
| 管理后台 | 用户分页/搜索/改名/改密/禁用（登录 403、token 失效）/不能禁自己/不能删最后 admin/删除用户（记录消失+登录 401）；卡片过滤/编辑/删除（记录消失+详情 404）；换卡记录；非管理员 403；未登录 401 |
| 当前用户 | profile 地址/改名持久化；overview；me/exchanges 过滤 |
| 边界/安全 | 不存在资源 404；非法 JSON 400；30MB body → 413 PAYLOAD_TOO_LARGE；超大请求后服务健康；响应体无明文密码 |

## 3. 阶段二：视觉验收（40 张截图 + 逐张检查）

截图清单（`qa-shots/`，每项桌面 + 移动各一张）：home、explore、**explore-search**（`?callSign=bg7`）、login、register、not-found、card-detail、share、dashboard、my-cards、card-new、card-edit、exchanges、exchanges-outgoing、profile、admin、admin-overview/users/cards/exchanges；另有 `card3d-angle-desktop.png`、`card3d-back-desktop.png`、`empty-search-*.png`。

重点复核结论：
- **首页**：Hero 为生成卡《高原星空下的守候》BH8ABC（46 赞），无真实 BG7MOM 图；统计改为「收录卡片 / 独立呼号 / 累计点赞」，无波段模式字样。
- **探索页**：仅呼号搜索框 + 排序；无波段/模式 chips；输入 `bg7` 得 3 张 BG7MOM 卡片（截图）。
- **详情/分享**：徽章仅呼号 + 比例 + 公开分享；信息为卡片比例/换卡次数/点赞/发布时间；3D 查看器厚度自然。
- **我的卡片/换卡/后台**：无 band/mode 字段与字样；卡面 SVG 无 MODE/BAND 空字段。
- **移动端**：全部路由无横向溢出；布局正常。
- **空状态**：呼号搜索无结果时显示插画空状态 + 「没有匹配的卡片」。
- 控制台：桌面/移动各 18 路由 0 报错、0 真实图路径泄漏、0 禁用词。

### 3.1 自动化辅助

- `tests/console.mjs`：新增 `--forbid=term,...` 页面可见文本禁用词检查 + 页面 img/background 真实图路径泄漏检查；本轮 `--forbid=波段,模式` 桌面/移动 18/18 通过。
- `tests/forms.mjs`：注册空提交/非法值、登录错误密码、建卡空提交 4/4。
- `tests/card3d-shot.mjs`（新增）：CDP 鼠标拖拽旋转 + 双击翻面截取 3D 厚度角度图。
- `tests/shots.mjs`：新增 `explore-search` 路由；40/40 成功（此前一次运行出现 1 次截图表单 EBUSY 瞬时错误，重试即过，属截图工具偶发，非应用缺陷）。

## 4. 缺陷清单（全轮次，最终）

> P0 阻断 ｜ P1 严重 ｜ P2 一般 ｜ P3 建议

| ID | 级别 | 模块 | 问题 | 状态 |
|---|---|---|---|---|
| D-01 | P1 | backend | DELETE 用户未真正删除（v1 发现） | ✅ 已修复回归 |
| D-03 | P1 | cards-ui | /share 移动端两列挤压（v2 发现） | ✅ 已修复回归 |
| D-04 | P2 | flows-ui | profile「换卡」统计错误显示 0（v2 发现） | ✅ 已修复回归 |
| D-05/D-06 | P2/P3 | admin-ui | 移动端第 4 个 Tab 不可见、表格横滑提示（v2 发现） | ✅ 已修复/优化回归 |
| D-08 | P3 | cards-ui | explore 空结果计数文案停留 loading（v2 发现） | ✅ 已修复回归 |
| D-09 | **P1** | backend | **v3 回归**：`DELETE /api/admin/cards/:id` 返回 ok 但卡片未删除（`cascadeDeleteCard()` 漏删 `db.data.cards`；公共列表/管理列表仍可见） | ✅ 已修复，smoke 回归通过 |
| D-10 | **P2** | backend/seed | **v3 回归**：程序化生成卡 SVG 图面仍印 `MODE — / BAND —` 空字段，与"无波段模式内容"预期不符 | ✅ 已修复（v3.1 重生成 26 张 SVG 零命中），QA 扫描+截图确认 |
| D-07 | P3 | flows-ui | 建卡/编辑页移动端「实时预览」排在表单前（建议项，不影响交付） | 建议保留后续优化 |
| D-02 | — | backend | band/mode 枚举校验（原 P3 建议） | 已随字段移除而失效（N/A） |

**遗留：仅 1 条 P3 建议（D-07 移动端建卡页信息顺序）。无 P0/P1/P2 遗留。**

## 5. 交付物

- `qa-report.md`：本报告（最终版）。
- `tests/`：`smoke.mjs`（128 项 E2E，零依赖，`npm test` 即跑，退出码 0/1/2）、`shots.mjs`（批量截图，`--only/--parallel/--skip-existing/--spawn`）、`console.mjs`（控制台+溢出+禁用词+真实图泄漏，`--mobile`）、`forms.mjs`（表单校验交互）、`card3d-shot.mjs`（3D 厚度角度截图）。
- `qa-shots/`：40 张最终截图 + `card3d-angle/back` + 空状态截图 + `manifest.json`。

## 6. 交付建议

- 保留 `npm test`（= `node tests/smoke.mjs`）作为后端回归门禁。
- 发版前在 8787 跑 `node tests/shots.mjs && node tests/console.mjs --mobile --forbid=波段,模式` 做页面健康检查。
- D-07（移动端建卡页先表单后预览）可作为后续小迭代，不阻塞本次交付。

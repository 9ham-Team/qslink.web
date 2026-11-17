# Vue3 性能对照与收尾验收 — vue3

测量日期：2026-11-16，Asia/Hong_Kong。代码迁移完成、实验室性能改善和全部发布验收通过是不同结论。

## 结论

- 当前 Vue3 对照为 `1888c0447e1ee8d39ff185e96403cc9c483f6edc`，已发布到团队 dev/44381；[该 SHA 的完整 CI、容器检查与 GHCR 发布](https://github.com/9ham-Team/qslink.web/actions/runs/43861003572) 成功。main/生产发布独立授权。
- 本次完成桌面、模拟手机及实体 Android 共 **180 次**冷/热加载，每个组合 5 次。Vue3 冷加载 JS/CSS 网络传输减少约 **39%–41%**，加载指标总体改善，公开页面未请求后台/私有评审 JS 分块。
- **性能验收仍不能全绿**：桌面首页/广场和真机三个页面的冷加载 CLS 超过建议 0.1；真机详情冷加载 LCP 中位数 **3.404 秒**；部分冷启动长任务总时长高于原生。需后续归因、修复及复测，本次不修改应用来掩盖测量结果。
- 两版本各做 30 次带实际图片转换的路由往返，记录资源与前后堆快照；额外完成实体 Android Chrome 横/竖 WebP 卡的拖动、快速翻面及前后台恢复。限制与证据见下文。

## 版本、数据和测量条件

| 项目 | 条件 |
| --- | --- |
| 原生对照 | git archive 导出的归档前端 `f3289231bb3fd50941980eb146b5e5667095b034/public`，不是运行中的 44380 |
| Vue 对照 | `1888c04` 的生产构建 `dist-public/` |
| 后端/数据 | 两版本使用同一个当前后端、独立临时 PostgreSQL 和合成种子；每次完整运行内共用 10 张公开卡片及同一张详情卡，无线上数据库/真实账号 |
| 初始页面 | 首页、广场、横卡详情；种子图片为 SVG，不代表真实大幅照片成本。手势阶段另建横/竖 WebP 卡验证缩图 |
| 重复顺序 | 每个版本×页面×设备×缓存状态各 5 次，轮次间交替版本顺序，取中位数，异常样本保留 |
| 网络 | CDP 延迟 80ms、下行 200000 B/s（1.6Mbps）、上行 93750 B/s；API/上传图经过相同本地代理 |
| 压缩/缓存 | 相同 gzip 代理模型；HTML/API no-store，旧固定 JS/CSS no-cache+ETag，新哈希资源 immutable。不是实际 CDN 线路测量 |
| 桌面 | Windows、Edge 157.0.4341.60、1440×1000、DPR 1、CPU ×1 |
| 模拟手机 | 同一 Edge、375×812、DPR 2、CPU ×4；不冒充真机 |
| 实体手机 | HONOR AAK-AN00、Android 16/API 36、Chrome 138.0.7204.45、1272×2800 物理屏幕、363×705 CSS 视口、DPR 3.5；不降速 CPU，显式激活标签页并以原生截屏确认前台 |
| 冷/热定义 | 桌面为新 context 首访/同 context 离开后重访；真机冷为 CDP 绕过缓存，热为打开缓存后额外预热一次再重访；不清空用户已有缓存或浏览历史 |
| 窗口 | 网络空闲后等待 700ms，输入前采集 LCP；CLS 使用最大会话窗口；记录 >50ms 长任务和完整请求瀑布 |

[桌面元数据](性能测量数据/desktop-metadata.json)、[Android 元数据](性能测量数据/android-metadata.json) 包含宿主、浏览器和数据标识。同一设备内两版本共享数据；不同完整运行重新生成种子 ID，不把跨设备的绝对时延当作配对硬件性能结论。

## 加载结果

LCP 单位 ms，每项为 5 次中位数。CLS 加粗表示高于建议 0.1，不等于线上用户 p75。

| 设备 / 页面 | 原生冷 LCP | Vue 冷 | 原生热 | Vue 热 | 原生冷 CLS | Vue 冷 CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 桌面 首页 | 2396 | 1680 | 1516 | 232 | 0.0850 | **0.2216** |
| 桌面 广场 | 2856 | 2136 | 992 | 352 | 0.0499 | **0.1284** |
| 桌面 详情 | 3080 | 2536 | 1456 | 828 | 0.0628 | 0.0627 |
| 模拟手机 首页 | 2836 | 2140 | 1692 | 388 | 0.1142 | **0.2517** |
| 模拟手机 广场 | 3348 | 1452 | 1544 | 196 | 0.1141 | 0.0000 |
| 模拟手机 详情 | 3328 | 2904 | 1540 | 952 | 0.0559 | **0.1328** |
| 真机 首页 | 3624 | 2468 | 1800 | 428 | 0.1406 | **0.1924** |
| 真机 广场 | 3400 | 1988 | 1636 | 260 | 0.1405 | **0.1917** |
| 真机 详情 | 3664 | 3404 | 1676 | 1020 | 0.0870 | **0.1279** |

异常不删除：模拟手机 Vue 广场冷加载虽然 CLS 中位数为 0，仍有 2/5 次达到 0.2512，不能称稳定通过。真机 Vue 首页冷 LCP 为 2396–3016ms，中位数接近 2.5 秒且有超出样本；详情冷加载全部超过 2.5 秒。真机 Vue 热加载 CLS 为首页约 0.0004、广场和详情为 0。

| 页面 | 原生冷 JS/CSS 网络 KiB | Vue 冷 KiB | 减少 | 原生热 KiB | Vue 热 KiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| 首页 | 343.4 | 208.6 | 39.3% | 10.3 | 0.0 |
| 广场 | 343.4 | 201.6 | 41.3% | 10.3 | 0.0 |
| 详情 | 343.4 | 209.1 | 39.1% | 10.3 | 0.0 |

字节来自 CDP loadingFinished（含 HTTP 开销）；另存 Resource Timing 的 gzip body 大小。热缓存 0 仅指 JS/CSS 无网络传输，不代表 HTML/API/图片免费。原生首访 40 个 JS/CSS 响应，Vue 首页/广场/详情分别 14/13/16 个，未请求后台/私有评审 JS；原生按原入口加载这些脚本。

| 真机冷加载长任务总时长中位数 ms | 原生 | Vue |
| --- | ---: | ---: |
| 首页 | 638 | **847** |
| 广场 | 537 | **794** |
| 详情 | 489 | **737** |

加载快不等于主线程成本更低。这里是观察窗口内长任务时长总和，不是 INP。完整摘要见 [桌面/模拟手机](性能测量数据/desktop-summary.json)、[实体 Android](性能测量数据/android-summary.json)；[全部 180 次样本](性能测量数据/samples.json) 保留异常。完整瀑布在本地 `artifacts/frontend-benchmark*/` 的逐次 JSON 中。

## 交互、路由和资源清理

桌面不人为降速网络/CPU，各测 5 次，使用浏览器时钟。搜索包含约 320ms 防抖，取 fetch 响应后两个 rAF；翻面/弹窗从触发到两个 rAF，不代表整个动画结束，也不是 INP。

| 项目 / 中位数 ms | 原生 | Vue |
| --- | ---: | ---: |
| 搜索输入至响应后画面 | 340.8 | 340.3 |
| 翻面触发至第二帧 | 9.3 | 7.6 |
| 确认弹窗触发至第二帧 | 10.9 | 11.2 |
| 详情→广场链接至首个 UI/骨架 | 1.3 | 1.3 |
| 同一路由点击至数据画面 | 17.2 | 9.0 |

路由处于已启动应用及预热模块，<150ms 只适用于这一受控场景；包含实际发生的 API 等待。响应至画面另列在 [runtime-results.json](性能测量数据/runtime-results.json)，内存恢复发生在本次响应之前的记录保留 null，不当作 0ms。

两版本各做 30 次「详情→上传编辑器→选择合成 PNG 并实际转换 WebP→确认放弃草稿→广场」，不提交卡片。每轮回到同一列表、清理调试 console 后强制 GC，保存前后堆快照。

- 每轮离页后 live Worker、详情 3D 实例、弹窗均为 0；pending rAF 恒为 1（外壳背景），活动观察器回到列表基线，未按轮次新增。
- 原始节点/监听/堆统计增长。检查到上传 input 经 `GC roots → Global handles → DevTools console` 保留；改用 Locator 和 Runtime.discardConsoleEntries 不能完全移除该调试句柄，不能直接归为应用泄漏。
- 在堆图中仅排除调试 console 根边和弱引用，再沿其余 GC 强根遍历：仍可达的 detached DOM 原生 **3→3**、Vue **4→4**；Vue 30 个历史编辑器表单无非 console 强根保留路径。分析没有删除应用属性边。
- 原始 JSHeapUsedSize 为原生 3.28→4.30MB、Vue 5.48→9.86MB（十进制）；有调试保留及编辑器首次懒加载/JIT 影响。**不能用聚合堆值证明完全无泄漏**，本结论仅限本场景的活动资源和 DOM 保留证据。

见 [堆根分析](性能测量数据/heap-root-analysis.json)、[逐轮资源指标](性能测量数据/runtime-results.json)、[运行元数据](性能测量数据/runtime-metadata.json)。完整 `.heapsnapshot.gz` 留在 ignored artifacts，可由 [堆分析脚本](../tools/analyze-benchmark-heaps.mjs) 重现，不提交大体积快照。

## 实体 Android 手势和视觉

使用上述实体手机 Chrome，非模拟器。通过隔离库 API 创建并审核合成 WebP 横卡（1500×1000）/竖卡（1000×1500），正反面标注 FRONT/BACK。两版本每种卡形均做 **20 次真实触摸拖动、9 次按钮翻面、一次系统 Home/回到 Chrome**；记录正反面语义状态、实际选图 URL、请求事件、原生截屏及过程帧。

- 四组均实际显示正/背面；拖动前后选图 URL 保持相同，均为 `w=1280`，未见旋转触发新的缩图宽度序列。
- 四组拖动未改变页面 scrollY，无横向溢出，图片均加载完成，pageerror 为空。
- 请求事件数原生横/竖为 4/0、Vue 为 12/8，包含原图和推荐图的已有 URL 重复/缓存事件，不等于实际网络传输次数；不是每帧切换 src 的请求风暴。
- 系统 Home 后失焦、返回 Chrome 后重新获焦，页面和图片正常恢复。Chrome 调试连接期间 visibilityState 仍为 visible；**未验证真实隐藏时的定时器暂停行为**，不把空 visibilitychange 数组当通过证据。
- 已查看正式原生录屏抽帧和 Vue 竖卡过程采样，未观察到拖动期间整页消失或明显卡面空白；跨文档切换时的新标签页空白不计作拖动闪烁。有限采样不证明所有设备/GPU 无闪烁，也不能用带调试/录屏的约 16.6ms rAF 宣称物理屏幕无掉帧。

去敏结果见 [android-gestures.json](性能测量数据/android-gestures.json)。正式原生截屏、过程帧及 90 秒录屏保存在 `artifacts/frontend-benchmark-android/`；录屏覆盖原生横/竖卡和 Vue 横卡，Vue 竖卡另有完整过程帧与原生截图。首次未激活标签页的离屏试测隔离到 `artifacts/frontend-benchmark-android-offscreen/`，不计正式加载或视觉成绩。脚本创建的测试页已关闭，本次 ADB reverse/forward 已清理，手机恢复此前前台应用；本次录屏已拉回后删除手机上的本次副本。

## 复现

Node ≥24.15.0，锁定依赖含 optional；先准备归档前端并构建。脚本只启动隔离测试后端，不接真实数据库：

```powershell
git archive --format=zip --output=artifacts/legacy-baseline-f328923.zip f3289231bb3fd50941980eb146b5e5667095b034 public
Expand-Archive artifacts/legacy-baseline-f328923.zip artifacts/legacy-baseline-f328923
npm run build
node tools/benchmark-frontend.mjs
# 只重测交互与资源，不覆盖加载摘要
node tools/benchmark-frontend.mjs --runtime-only
node tools/analyze-benchmark-heaps.mjs
```

Android 先从 adb devices 选择用户授权设备、核实 Chrome 调试 socket，再建立本机转发；不要猜序列号或清除用户浏览器数据：

```powershell
adb -s <设备序列号> forward tcp:19223 localabstract:<已核实的Chrome调试socket>
$env:QSL_ANDROID_SERIAL='<设备序列号>'
$env:QSL_BENCH_OUTPUT='artifacts/frontend-benchmark-android'
node tools/benchmark-frontend.mjs --android
node tools/benchmark-frontend.mjs --android --gestures-only
adb -s <设备序列号> forward --remove tcp:19223
```

[主测量脚本](../tools/benchmark-frontend.mjs) 在 finally 中关闭自己创建的测试页、移除 reverse 并清理临时库；结束后还应恢复原前台应用。原始瀑布、录屏、过程帧和堆快照保存在 ignored artifacts；文档数据目录仅保留去敏 JSON，不含账号令牌、真实资料或手机序列号。

## 剩余范围

1. 冷启动 CLS、手机详情 LCP、长任务需优化及复测；本次完成测量，不代表这些指标已经通过。
2. 若要证明长期 JS 堆稳定，仍需脱离调试器的长期会话/原生内存观测；不宣称全部资源风险消失。
3. iOS Safari、微信内置浏览器、其他 Android/GPU、真实业务照片和真实隐藏状态尚未覆盖。
4. 双 CDN、维护者独立交接和 main/生产发布独立验收。本轮仅新增测量工具、数据及文档，业务实现不变；后续提交/测试服发布以对应完整 SHA 的 CI、镜像及运行记录为准，不改写本报告测量基线。

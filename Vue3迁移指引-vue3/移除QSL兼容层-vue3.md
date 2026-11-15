# 默认应用移除 QSL 兼容层 — vue3

本轮在 codex/remove-qsl-runtime 实施，基于正式 dev 的 b5c466e。目标是默认站点采用 Vue 组件、Pinia / Vue Router 和标准模块，保留成熟算法；不把逐帧旋转或图片转换塞进 Vue 响应式状态。

## 默认运行边界

- client/src/application.ts 显式组装应用服务；entry.ts 导出应用模块实例，默认页面及法律页都不注册 window.QSL / self.QSL。
- store 是实际 Pinia store，不再存在 QSL.state 的 getter/setter 镜像，也不再包装旧 API 的 setToken 来通知 Pinia。独立 API 模块通过构造回调更新会话版本，token 仍只由 API 实例持有。
- router.ts 只安装同一个 Vue Router 的导航服务；没有旧路由器启动、全局 QSL.router 别名或 registerPage 页面注册。页面直接按需加载 SFC，query/history/hash/离页守卫行为保留。
- 服务以显式参数注入 Vue 页面与模块；ApplicationContext 是应用服务容器，不是浏览器全局兼容对象。业务服务接口保留以隔离 HTTP、会话与 UI，便于测试。

## 独立模块与 Vue UI

| 能力 | 默认实现 |
| --- | --- |
| API | client/src/lib/api.js，独立 ApiError / 客户端工厂；保留请求取消、错误字段、skipAuthClear、迟到 401 与新会话隔离 |
| 格式化、语言、事件 | lib/formatting.js、lib/i18n.js、locales/en.js、events.ts；默认词典不再通过 window 注册 |
| 3D 与响应式选图 | lib/card3d.js / images.js；引擎只注入 t/images/icon/escapeHtml，Vue 查看器掌管挂载/更新/销毁 |
| 图片处理 | lib/image-upload.js 与独立 module Worker；保留 EXIF、3840px WebP、串行队列、取消与主线程降级 |
| QR / 配色 / 海报 | lib/qr.js / poster-palette.js / poster.js；算法保持，输出一致性与真实 PNG 生成已验证 |
| 分享 UI | CardShareControl / ShareContent / ShareQr / PosterPreview，Vue 模板和 Teleport 负责 DOM、移动弹窗、键盘焦点、异步请求及 Blob 清理 |
| 通用提示/确认/主页链接 | Vue ToastHost、dialog-service、ConfirmDialog / ProfileLinkDialog；不再接受字符串 HTML 或返回可被外部写入的 body DOM 岛 |
| 换卡申请 | exchange-request-service 是有生命周期的 Vue 面板服务，保持同步 close 句柄；删除 recordsHtml / 后台 HTML 兼容输出 |

移除了 state 全局桥接、bridge.ts / contest-bridge.ts、LegacyPageHost、各页面旧 mount entry、modal-bridge / ModalDialog 等默认兼容源码；所有 Vue 调用方改为显式 platform 服务与实际 store。

## 原生对照与缓存

public/js 和 npm run start:legacy 仍作为独立的历史对照应用保留；默认构建不导入其中的运行时 JS。它们不是默认 Vue 应用的兼容层，也没有通过改名或全局代理偷偷接回默认入口。更新默认算法应修改 client/src/lib；更新默认词典应修改 client/src/locales/en.js。

法律文本仍为静态 HTML，但语言切换改为独立 legal 模块入口，不加载旧全局脚本。CSS 和站点媒体继续作为静态资源源文件，由 Vite/资源插件指纹化。

保留哈希入口/分块/CSS/Worker/媒体、HTML/API no-store 与旧哈希资源回源。asset-manifest.json 的 application 字段提供正式模块导出地址，entry 是 HTML 启动地址；浏览器测试显式导入 application，并只在测试环境暂存 __appTest，生产代码不设置测试全局。migration.json 改为 es-modules / globalNamespace=false。

## 验证与范围

- 类型/构建通过；默认源码及构建产物不包含 window.QSL / self.QSL 的注册或调用，SPA 与法律页真实浏览器验证全局对象不存在。
- 36 个前端单测文件共 177 项通过；覆盖原会话/路由/业务回归，并新增实际 API 401 竞态、算法输出一致性、真实 Pinia 所有权、分享 URL 缓存、切号取消与海报 Blob 清理。
- Edge 完整 E2E 84 项中 83 通过、1 项手机鼠标倾斜按设计跳过。新增架构用例验证无全局/状态路由别名、Vue 分享实际海报、路由清理；既有鉴权、后台、赛事、编辑、换卡、日志、广场、资料与缓存/Worker 均通过。
- 最终补充事件异常隔离与重复解绑/重订阅回归；独立进程专项 8 项通过。Windows 最后一轮线程池全量复验停滞后已中止该轮；此前完整 177 项已通过，最终受影响模块专项再次通过。
- 已检查桌面/手机 Vue 海报弹窗截图。原 bridge 注册卸载测试改为真实 RoutePage 迟到 chunk 不挂载测试；旧 DOM 岛测试改为 Vue 内容安全渲染、嵌套 Escape、焦点与应用清理测试，业务断言保留。

本轮未改后端权限/数据库/接口，未运行后端 npm test / test:production；未进行 Docker、远端 CI、真实手机或远端部署验收。当前未提交、未推送、未部署，dev 测试站仍为 b5c466e；既有 .gitignore 的 /.zcode/ 保留。

# CDN 缓存与版本化静态资源 — vue3

适用链路：国内 → DOOKICDN 日本高防优化节点 → 德国 Netcup；海外 → Cloudflare → 德国 Netcup。两条线路分别配置，源站返回同一套缓存头。此文是可执行的规则语义与发布步骤，不代表已经登录或修改任一 CDN 控制台。

## 默认构建

- `client/index.html` 是默认构建入口；`client/src/runtime.ts` 按原顺序引入共享 JS 与 CSS，再启动 Vue。API、3D、图片、分享等算法仍可使用原生 JS，但现在进入 Vite 依赖图，修改后 URL 随内容改变。
- 主入口、页面分块、CSS、上传 module Worker、站点图片和法律页依赖全部位于 `/build/` 的哈希文件名。原生对照的 `public/index.html` / `npm run start:legacy` 保留，不能用它替代默认生产构建。
- `tools/asset-plugin.mjs` 对 SFC / 共享脚本中的字面量站点图片 URL 做内容指纹，避免动态 `:src` 绕过打包；法律 HTML 保留稳定 URL，但引用带哈希的脚本与样式。
- `asset-manifest.json` 记录主入口与所有构建资源的 SHA-256；它和 HTML 都不缓存。CI 根据清单检查入口，不再假定 `/build/entry.js`。

## 源站响应头

| 类型 | Cache-Control / CDN-Cache-Control / Cloudflare-CDN-Cache-Control |
| --- | --- |
| SPA 首页、所有 history 深链、法律 HTML、JSON 构建清单 | `no-store` |
| API、鉴权、私有导出、错误响应 | `no-store` |
| 清单登记的 `/build/` 哈希资源和保留的旧哈希资源 | `public, max-age=31536000, immutable` |
| 上传图片 | 沿用既有不可变 URL / 图片派生规则；缓存键必须保留 `w` 参数 |

代码可以声明策略，但不能撤销 CDN 上已经存在的强制 TTL、Cache Everything 或忽略源站响应头配置。必须同时落实以下边缘规则。

## Cloudflare

在 Cache Rules 中按站点域名配置以下规则，先检查并移除会覆盖它们的旧规则。若同一路径匹配多条规则，确保最终生效设置符合下表。

1. 版本资源：表达式 `starts_with(http.request.uri.path, "/build/")`，允许缓存；Edge TTL 使用/尊重源站 Cache-Control，Browser TTL 尊重源站，不强制缓存 404/5xx。
2. 其余动态内容：表达式 `not starts_with(http.request.uri.path, "/build/") and not starts_with(http.request.uri.path, "/uploads/")`，Cache eligibility 设为 Bypass cache。覆盖首页、任意卡片/分享/管理深链、法律页、API 和构建清单。
3. `/uploads/` 使用既有图片规则并尊重源站；不能忽略 `?w=...`，否则不同分辨率会串缓存。保持默认完整查询参数缓存键即可。

Cloudflare 刷新与验证须在实际域名执行；本地单测或直接 IP 测试不能证明 Cloudflare 边缘规则生效。

## DOOKICDN

在日本节点所用站点规则中配置同等语义；具体字段名称和规则优先级以实际面板为准，不假定它提供 Cloudflare 相同的按钮或 API。

- `/build/`：可缓存、遵守源站缓存头，浏览器与节点允许一年；错误状态不缓存。
- `/api/`：绕过缓存，包括 GET、鉴权失败和私有下载；不能缓存带身份信息的响应。
- `/`、HTML 文件、SPA history 路径与 JSON 构建清单：不缓存。如果面板支持“其余路径”兜底规则，除 `/build/` 和 `/uploads/` 外统一绕过，避免漏掉 `/s/:token` 等无扩展名页面。
- `/uploads/`：沿用图片缓存，缓存键保留宽度查询参数。关闭对以上动态路径“忽略 no-store / 强制缓存”的覆盖。
- 通过实际国内域名检查最终响应和节点命中情况；节点地址、线路和源站地址保持当前配置，不需要为了此改动更换源站。

## 发布与旧资源

服务器启动会验证清单与文件校验和，将构建资源保存到 `<QSL_DATA_DIR>/static-assets/`，之后按清单/保留记录提供不可变响应。使用既有持久数据卷，不把资源放进对外的 `/uploads/` 命名空间，也不改数据库结构。

`deployment/deploy-dev.sh` 在停止旧容器前使用新镜像中的独立工具保留旧镜像的哈希分块；随后沿用原锁、固定 SHA、环境继承、健康检查和失败恢复流程。缓存工具不需要数据库或邮件凭据，失败发生在停服前。新旧资源同名但内容不同会拒绝覆盖，避免污染已缓存版本。

后续发布不会删除旧哈希文件，因此旧页面按需加载旧分块仍可回源。前提是持续复用同一持久数据目录；不要清理该目录或每次部署换空卷。历史资源会占用空间，本次不自动按版本数/时间删除，以免破坏仍打开的页面；后续清理须结合保留期和业务验收单独安排。

首次从固定 URL 切换时：

1. 先配置两家 CDN 的上述规则，再按正常 SHA/CI 流程部署。
2. 在 Cloudflare 和 DOOKICDN 清理已缓存 HTML、旧 `/build/entry.js`、`/js/`、`/css/` 和 `/legal/` 固定资源；动态 HTML URL 很多时，使用面板支持的批量刷新，必要时在低峰做一次全站刷新。
3. 首次切换前已经打开的旧页面建议刷新一次。旧哈希分块可以保留，但旧固定 URL 脚本/Worker 不能作为不可变资源长期承诺；之后的哈希版本之间有完整资源保留。
4. 分别从国内和海外访问实际域名：HTML/API 不应返回缓存旧版本；HTML 引用新哈希；重复读取哈希资源可命中 CDN；修改 JS/CSS 后生成新 URL。

示例（用实际域名替换，不能只测源站 IP）：
```sh
curl -I https://example.com/
curl -I https://example.com/card/example
curl -I https://example.com/api/config
curl -I https://example.com/asset-manifest.json
# 从 HTML/清单取当前 URL，再测试；不要猜测哈希值
curl -I https://example.com/build/index-ACTUALHASH.js
```

## 验证范围

本地包含资源指纹与网络图、真实 module Worker WebP 转换、HTML/API/错误响应缓存头、A→B 发布后旧资源读取、校验失败、同名冲突、路径/符号链接拒绝等回归。首次实施时仅修改仓库代码与指引；此后已提交并发布到 dev/44381，当前 SHA 和完整 CI 见 [迁移进度](迁移进度-vue3.md)。本次未配置 CDN 控制台；[实验室性能对照](性能对照与收尾验收-vue3.md) 的 gzip/限速模型也不能证明两家 CDN 的实际命中率或域名线路行为。

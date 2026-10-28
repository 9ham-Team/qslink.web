# LoTW 公共 CA 证书

此目录仅包含 ARRL 的**公共 CA 证书**，不包含用户呼号证书或任何私钥。

2026-10-28 从本机已安装的 TrustedQSL 2.8 信任库中提取当前有效的 Root CA 与 Production CA；应用固定使用这两个随版本发布的证书，不接受上传者提供的根或中间 CA，不在请求期间联网更新信任库。

| 文件 | SHA-256 指纹 | 到期（UTC） |
| --- | --- | --- |
| lotw-roots.pem | `0F:B9:62:75:EA:CA:03:EF:29:FF:50:9D:9E:54:5B:1F:38:61:F4:46:8F:06:87:BE:CC:59:3E:D0:06:04:B2:E6` | 2033-06-25 |
| lotw-intermediates.pem | `98:EA:7D:C6:B1:4D:8E:A6:A5:B7:26:83:0D:45:E2:B5:A5:E0:ED:5B:5D:B9:B1:26:E8:AD:13:2D:33:5D:9A:8C` | 2027-06-29 |

更新时应从经核实的 ARRL / TrustedQSL 信任库取得证书，核对主体、指纹、有效期和链签名，并重新运行 TQ8 测试。到期后导入会拒绝旧证书链，须更新应用中的公共 CA；不应通过关闭校验处理。

格式与签名字段依据 [ARRL TQ8 结构说明](https://lotw.arrl.org/lotw-help/developer-tq8/)、[官方配置数据](https://lotw.arrl.org/lotw/config.tq6)（核对时为 11.34，LOTW V1.0 / V2.0）及 TrustedQSL `location.cpp` 的签名数据生成流程。TQSL 按规范使用 RSA / SHA-1，本应用仅为兼容该协议验证 SHA-1 签名，不用于本站密码或其它新签名。

证书链及文件签名校验不代表 LoTW 已接受或确认通联；本实现不联网查询证书吊销状态，也不能证明用户持有文件内证书的私钥（TQ8 文件可被复制）。

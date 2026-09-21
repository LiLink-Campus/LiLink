# 邮件域名认证与免费 BIMI 配置

LiLink 的人工沟通邮件由飞书发送，域名为 `lilink.top`；网站验证码、匹配通知等系统邮件由阿里云 DirectMail 发送，域名为 `notify.lilink.top`。两条渠道使用各自原有 SPF 授权，不能相互覆盖。

## 品牌标识

BIMI 文件为 [lilink-bimi.svg](../assets/email/lilink-bimi.svg)，复用网站品牌 logo，仅调整 SVG 配置以符合 Tiny PS 规范。图形、颜色与尺寸保持一致。通过现有 Caddy 提供公开 HTTPS 地址：

`https://api.lilink.top/.well-known/lilink-bimi.svg`

[Caddyfile](../Caddyfile) 仅为这个固定路径提供文件，其余路径继续转发原 API。文件根目录为 `/home/admin/lilink/assets/email`，部署时需同步仓库文件并 reload Caddy，无需重启 API。

默认 BIMI TXT 值：

```text
v=BIMI1; l=https://api.lilink.top/.well-known/lilink-bimi.svg; a=;
```

该记录可以发布到 `default._bimi.lilink.top` 和 `default._bimi.notify.lilink.top`。`a=` 留空表示没有品牌证书，不能宣称 Gmail 品牌头像或认证勾号已生效。记录和文件托管使用已有基础设施，不购买证书或新增套餐。

## 邮件防冒用策略

保留 SPF：

| 域名 | 授权记录 |
| --- | --- |
| `lilink.top` | `v=spf1 +include:_netblocks.m.feishu.cn -all` |
| `notify.lilink.top` | `v=spf1 include:spf1.dm.aliyun.com -all` |

机器邮件的收件端原始邮件头已验证 SPF、DKIM、DMARC 均为 pass，DKIM 和 Return-Path 均对齐 `notify.lilink.top`。阿里云 API 的 SPF、DKIM、MX、DMARC 及域名状态也均验证通过。机器发信域名使用：

```text
v=DMARC1; p=quarantine; sp=quarantine; pct=100; adkim=r; aspf=r; rua=mailto:dmarc_report@service.aliyun.com
```

用户已从飞书人工发信，Gmail 实际收件头显示 SPF pass，Return-Path 与可见发件人均为 `lilink.top`，满足 DMARC 的 SPF 对齐条件。DKIM 签名也通过，但签名域是飞书托管域，不计为与 LiLink 对齐的 DKIM。核验后为主域名启用以下策略：

```text
v=DMARC1; p=quarantine; sp=quarantine; pct=100; adkim=r; aspf=r
```

`quarantine` 请求收件方隔离未通过认证的邮件；`adkim=r` 和 `aspf=r` 保留宽松域名对齐，避免无必要地改成严格对齐。机器域名保留原阿里云汇总报告地址；主域名不新增外部报告接收人，也不把自动报告发送到个人邮箱。

BIMI 要求组织主域名及其子域名启用完整 DMARC 执行策略，本次两者都使用 `quarantine`、`pct=100`。飞书人工邮件当前依靠对齐的 SPF 通过 DMARC；转发可能改变 SPF，若后续需要提高转发兼容性，应在飞书支持的设置中启用自定义域名 DKIM，不能仅复制公钥伪装为已启用。

飞书核验邮件在主域名策略启用前已被 Gmail 放入垃圾箱。认证通过不等于投递到收件箱，本次未移动该邮件或声称解决信誉/过滤问题。收件头证据取得于策略修改前；策略修改后的验证是 DNS 回读及既有已认证邮件的域名对齐核验，没有额外重复发信。

## 验证与回退

- 使用 [BIMI 官方 RNC Schema](https://bimigroup.org/resources/SVG_PS-latest.rnc.txt) 验证 SVG，并比较 Chromium/WebKit 渲染与原图一致。
- `caddy validate --config /home/admin/lilink/Caddyfile --adapter caddyfile` 通过后 reload；核验 logo 的 HTTPS 200、`image/svg+xml`、文件摘要，以及既有 `/v1/health`、`/v1/public/landing` 和未登录鉴权行为。
- 从权威 DNS 与公共递归解析器回读 TXT；DNS 传播期间可能仍有缓存旧值。
- 回退机器 DMARC 时恢复原值 `v=DMARC1;p=none;rua=mailto:dmarc_report@service.aliyun.com`；主域名本次配置前没有 DMARC 记录，回退时删除本次新增记录。保留 SPF、DKIM、MX 原值。
- BIMI 记录可以独立撤除，文件路由可以独立恢复；均不需要回滚数据库。

操作证据保存在 Git 忽略目录 `artifacts/mail-brand-20260921/`。不提交完整邮件头、邮箱个人信息、凭据或第三方签名。

参考：[BIMI 实施指南](https://bimigroup.org/implementation-guide/)、[Google BIMI 要求](https://knowledge.workspace.google.com/admin/security/set-up-bimi)、[阿里云 DMARC 配置](https://help.aliyun.com/zh/direct-mail/what-is-dmarc-and-how-to-configure-dmarc-records)。

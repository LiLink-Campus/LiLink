# 协议与隐私页面改版

## 本次交付

- 共用 LegalDocument：暖色背景、中文页头、更新日期、独立的 /terms 和 /privacy 页面、单栏分节正文；按反馈移除政策切换、阅读目录和底部联系卡片。
- 用户协议 10 节；隐私政策 11 节。涵盖注册、匹配披露、安全与举报、费用、内容权利、责任、注销、数据种类和目的、自动化处理、第三方、浏览器存储、个人信息权利和更新。
- 不创建不存在的邮箱或公司名称。更新日期不是正式生效声明。

## 实现依据

- `apps/api/src/modules/auth/auth.service.ts`：学校识别及注册资格；不能写成只允许学校邮箱注册。
- `apps/api/src/modules/account/account-deletion.service.ts`：停用、释放原邮箱、原邮箱审计保留、终止待投递通知；不是物理删除。
- `apps/api/prisma/schema.prisma`：账号、资料、问卷、联系方式、匹配及举报数据。
- `apps/web/src/app/layout.tsx`、`src/instrumentation-client.ts`、`src/lib/sentry-config.ts`：Vercel Analytics、条件启用 Speed Insights/Sentry；Sentry 配置含会话回放，默认 sendDefaultPii 为 true。未读取生产密钥或确认线上实际启用配置。
- `apps/api/src/modules/auth/auth.controller.ts`、`apps/web/src/lib/product-analytics.ts`：会话 Cookie、浏览器会话存储。

## 发布前仍须确认

1. 运营主体完整名称、可长期使用的隐私联系邮箱/地址、请求处理负责人和响应时限；需补充正式联系渠道。
2. 托管、数据库、邮件、监测服务的实际提供方、地域、字段、保留期限及跨境处理安排，补充可核实的完整第三方清单。
3. 注销后的记录清理及备份删除期限。现有程序保留关联数据；文案不能替代删除功能和保留期限治理。
4. 敏感个人信息单独同意、第三方/跨境所需告知同意、未成年人适用年龄及实际核验机制。当前草稿未声称这些流程已经实现。
5. 正式协议版本、生效时间和对已有用户的重大变更通知/重新同意流程。本次没有修改注册同意机制，也没有部署。

## 参考

- [个人信息保护法](https://www.itsec.gov.cn/fgbz/gjbz/202108/t20210822_62807.html)：告知、最短保存期限、敏感信息、权利及删除要求。
- [民法典](https://www.cac.gov.cn/2020-06/01/c_15925617772683192.htm)：格式条款提示、公平性和责任边界。
- [Vercel 统计隐私说明](https://vercel.com/docs/analytics/privacy-policy)、[Sentry 隐私政策](https://sentry.io/privacy/)：已在隐私页提供入口；不能以厂商说明代替项目配置核验。

## 验证

Web 类型、Storybook 类型、CSS 检查通过；公开页面 Storybook 文件 16 项浏览器测试通过。浏览器实测手机及 1100px 桌面布局；后续简化为无目录的单栏版式。条款完整性仍受上述事实待确认项限制，本次不是完整合规审计。

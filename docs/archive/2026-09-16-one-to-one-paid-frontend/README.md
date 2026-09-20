# 人工匹配付费版前端备份

备份时间：2026-09-16。首周免费活动上线前的原始文件，未改写内容。

- `one-to-one/`：原页面、手机号登记弹窗、样式及 Storybook，共 5 个文件。
- `assets/one-to-one-minimal.webp`：原插画。
- `dependencies/`：FAQ 样式、国家区号选择器及其样式。
- `sha256.json`：备份文件校验值。

原付费版包含 ¥299 专人牵线和 ¥599 七天恋爱挑战，以及手机号登记至后台的入口。仅保存设计与实现，不表示支付已接入。

## 后续恢复

先备份届时正在使用的首周版本，再将 `one-to-one/` 内文件恢复到 `apps/web/src/app/one-to-one/`。插画对应 `apps/web/public/images/one-to-one-minimal.webp`。依赖文件仅供对照，不要无差别覆盖共享组件。

原版继续依赖现有 Next.js、全局字体 / tokens、`apps/web/src/lib/api.ts`、`libphonenumber-js`、`/public/match-leads` API 和对应后台登记管理。恢复后复核接口与共享组件，运行 Web / Storybook 类型检查和桌面、手机验证。

此目录位于路由外，不会作为公开页面发布。

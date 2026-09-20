# 用户中心重启验收

## 实现

- `/dashboard/me` 按确认的生图方案实现账号信息、VIP 卡片、邀请与优惠券、账号安全。
- 账号信息由 `/auth/me` 加载并同步登录上下文；VIP 状态由 `/me/vip` 加载，聚焦及每 30 秒刷新。
- 底部增加第四项用户中心，桌面导航同步；VIP、邀请、优惠券属于用户中心导航范围。
- 头像菜单仅保留返回首页、退出登录；注销确认组件移入用户中心，继续使用原有密码及确认文字校验。
- `/dashboard/settings` 转到用户中心；VIP 返回链接改为 `/dashboard/me`。

## 已执行

- `npm run typecheck:web`：通过。
- `npm run typecheck:storybook:web`：通过。
- `npm run test:storybook:web -- --run apps/web/src/stories/dashboard-pages.stories.tsx`：30 项通过，含 5 项新增用户中心状态/入口/菜单/注销取消检查。
- 修改文件 ESLint、两份 CSS 语法检查、范围内 diff 空白检查通过。
- 安装的 Google Chrome 与 Safari：使用 Storybook 合成账号，iframe CSS 宽度 360、430、879、880、1100，高度 908；检查布局、换行、导航及会员状态。Safari 的滚动条会影响临界宽度的内容区域，1100px 桌面导航正常。
- 两浏览器 430px、1100px：注销弹窗打开、禁用确认按钮及取消返回；430px：头像菜单只有两项。
- 双浏览器视觉截图保留在本任务 CUA 工具输出中。部分 Safari 菜单展开时系统截图不可用，菜单项通过可访问性树核对。
- 本地实际登录会话：底部用户中心入口、账号及未开通状态加载；VIP、邀请、优惠券入口和返回用户中心链路成功。

## 边界

未提交账号删除、未修改密码、未购买或兑换会员。未运行实体 iOS 设备检查。未提交、推送或部署；远端 CI 未触发。保留仓库原有其他工作改动。

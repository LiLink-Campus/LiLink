# 生产前分支审查修复验收

日期：2026-09-20。分支：`codex/autumn-2026-ui-implementation`。基线 main/HEAD：`23765a33ff31b462b53c64e52d5813ec16b186bf`。本轮仅修复工作区，不提交、推送或部署，不操作生产数据。

## 已修复

- 匹配页桌面与手机共享同一个完整状态组件，恢复未匹配、缺意向、资料未完成、锁定和等待揭晓状态的说明及下一步入口；桌面保留双栏布局，内容较长时在本栏滚动，避免 flex 压缩造成按钮裁切或重叠。旧“参与开关”提示改为“选择意向并报名”。
- 匹配 E2E 用明确的 h2 定位当前对象，避免新增历史栏同名内容引发 strict-mode 失败。未匹配测试增加按钮完整进入视口、879/880/1280px 断点、横向溢出、截图及点击后实际进入资料页的验证。
- VIP Storybook 按可见桌面目录或手机目录跳题；新增手机会员锁定/启用检查，保留实际筛选操作及权限断言。
- 团队详情页提取共享展示组件供真实路由和 Storybook 使用，覆盖两位成员，覆盖审计不再缺该动态路由。
- 以现有标准 `apps/web/public/icons/icon.svg` 鸽子为唯一图形来源，用 sharp 确定性生成 192/512px PNG、512px maskable PNG、180px Apple Touch Icon；未重新设计鸽子。Apple/maskable 保留安全留白与米白背景。manifest、Apple 图标 URL 加版本，Service Worker 缓存升级为 `lilink-pwa-v4-standard-dove`。
- `seed-defaults.mjs` 同步引用 shared 的三道生活习惯题，权重保持 0，避免新环境默认初始化缺题。没有执行此脚本或覆盖任何现有问卷。

## 验证结果

证据目录：`artifacts/fix-review-20260920/`。

| 检查 | 结果与证据 |
| --- | --- |
| 四项目功能浏览器 E2E | 72/72 通过；Chromium / mobile Chromium / WebKit / mobile WebKit；`browser.log`；独立运行 `artifacts/e2e/a7a581d69c1c/` |
| 最终布局调整后的匹配 E2E | 8/8 通过，包含断点截图、完整按钮可见性及跳转；`matching-final.log`；`artifacts/e2e/9216df1272ae/` |
| Storybook 全套 | 245/245 通过；`story-tests-final.log` |
| 最终布局调整后的匹配 Storybook | 20/20 通过；`match-stories-final.log` |
| Web 单测 | 88/88 通过；`web-tests.log` |
| Web 类型检查 | 通过；`types-final.log` 中 Web 阶段；同日志后续 Storybook 初次错误已由下面最终检查修复 |
| Storybook 类型检查 | 最终通过；`story-types-final.log` |
| Storybook 覆盖审计 | missing 为空；`audit-final.log` |
| Web lint / CSS / diff whitespace | 无 error；生成的 mockServiceWorker.js 保留 1 个既有 unused-disable warning；CSS 和 git diff --check 通过 |
| 独立响应式复核 | 56 个组合通过：Chromium 148.0.7778.96 / WebKit 26.4，390/879/880/1280×844，5 个匹配状态和2个团队详情；`ui-final.log` 与 `screenshots/` |
| 图标与缓存 | 实际 manifest URL 响应与本地生成资产一致、PNG 尺寸正确；隔离 Chromium 真实注册新 SW 后旧缓存移除、新缓存存在；`icons.log` |
| 默认种子题定义 | 三题唯一、选项与 shared 一致、权重为 0；只读定义验证及 node --check 通过；未连接数据库 |
| 生产构建 | 最终匹配 E2E 在独立工作区重新完成 Next.js/API 构建和迁移 |

Codex IAB 实际查看了未匹配、缺意向、锁定、资料未完成、等待揭晓状态的桌面/手机显示，包含 880×720 的临界宽度、滚动后的按钮完整显示，以及实际 Apple Touch Icon 图片。IAB 截图保存在会话工具证据中；独立引擎截图保存在本地证据目录。

响应式脚本最初复用同一个 WebKit 页面连续导航时出现 Storybook 空白加载，随后改为每个状态使用独立浏览器上下文，最终所有 56 个组合通过，无失败重试配置。全套 Storybook 最初新增团队页断言遇到入场动画，通过等待真实可见状态修复；没有禁用产品动画或删除断言。

本轮未改 API 业务源码/schema，因此未重复上一轮已通过的 578 个 API 单测和85个数据库 E2E，也未重复构建未修改的 API Docker 镜像。未进行物理 iPhone 添加到主屏幕测试；已有安装图标的系统级刷新由设备行为决定。

## 仍需在发布阶段完成

1. 生产后台保留现有运营题，发布包含 exercise_frequency / smoking_status / drinking_frequency 的问卷版本；核实旧用户未补答时的提示和筛选过渡。不可运行默认种子覆盖生产问卷。
2. 确认旧 OPEN 轮次已报名记录的保留策略、历史联系人迁移备份及发布窗口。
3. 核实有效活动唯一性、VIP 商品可售、库存/兑换码一致性、真实支付兑换与生产邮件送达。
4. 经授权提交全部相关 tracked/untracked 文件，在准确 commit 上取得适用远端 CI 结果，然后按生产发布流程验收。

这些是生产发布前置条件，不是本轮尚未修复的本地代码失败；本轮未对它们作已完成声明。原 localhost:3000 预览保留，临时 Storybook 与本轮 disposable E2E 服务清理。

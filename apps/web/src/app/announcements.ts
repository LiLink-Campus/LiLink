export interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
}

/**
 * Append new entries at the top. The first element is always treated as
 * the "latest" and will be shown in the pop-up dialog on first visit.
 */
export const announcements: Announcement[] = [
  {
    id: "2026-04-22-eligible-schools-and-concurrency-perf",
    title: "新增「支持的学校」总览，并发性能优化",
    content:
      "页脚与注册页新增「支持的学校」入口，注册前即可查看完整的可注册邮箱后缀。后端完成一轮并发性能优化，多人同时使用时响应会更稳。",
    date: "2026-04-22",
  },
  {
    id: "2026-04-21-school-gender-exclusion",
    title: "新增按学校内性别排除，学校变更后草稿偏好也会自动同步",
    content:
      "现在你可以在「对方条件」里按学校分别勾选不希望匹配的性别，三项全选等同整校排除。我们也补上了学校合并或删除后的草稿同步逻辑，已保存但未正式提交的相关偏好不会再被静默丢失。",
    date: "2026-04-21",
  },
  {
    id: "2026-04-19-friend-date-both",
    title: "新增 Friend / Date / Both，现已支持找朋友",
    content:
      "LiLink 前端已完成一轮更新升级，新增 Friend、Date、Both 三种选项。现在除了约会，你也可以在 LiLink 里找朋友了。",
    date: "2026-04-19",
  },
  {
    id: "2026-04-15-excluded-school",
    title: "新增「不希望对方学校」硬性条件",
    content:
      "现在你可以在「对方条件」中选择不希望匹配对象所在的学校（可多选），该选项为硬性约束，被选中的学校将被双向排除在匹配之外，不选任何学校则不限，请前往问卷页面更新你的偏好。",
    date: "2026-04-15",
  },
  {
    id: "2026-04-14-launch",
    title: "LiLink 全量开放注册",
    content:
      "欢迎来到 LiLink！平台现已全量开放注册，完成深度问卷即可参与每周匹配。祝你在这里遇见值得期待的人。",
    date: "2026-04-14",
  },
];

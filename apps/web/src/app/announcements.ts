import type { SupportedLocale } from "@lilink/shared";

export interface Announcement {
  id: string;
  title: Record<SupportedLocale, string>;
  content: Record<SupportedLocale, string>;
  date: string;
}

/**
 * Append new entries at the top. The first element is always treated as
 * the "latest" and will be shown in the pop-up dialog on first visit.
 */
export const announcements: Announcement[] = [
  {
    id: "2026-04-29-nationality-language-weight-matching",
    title: {
      "zh-CN": "新增国籍、语言和体重匹配项",
      "en-US": "Nationality, language, and weight matching added",
    },
    content: {
      "zh-CN":
        "基本信息新增国籍、语言、体重，并在「我」和「希望 TA」两侧继续按双向硬性条件匹配。希望对方国籍、语言可多选或留空不限；体重未填写时按不限处理，范围支持 30-300 kg。",
      "en-US":
        "Basic details now include nationality, languages, and weight, still matched as two-way hard preferences across About you and Partner preferences. Preferred partner nationalities and languages can be multi-selected or left empty for no preference; empty weight is treated as no preference, with supported values from 30 to 300 kg.",
    },
    date: "2026-04-29",
  },
  {
    id: "2026-04-22-eligible-schools-and-concurrency-perf",
    title: {
      "zh-CN": "新增「支持的学校」总览，并发性能优化",
      "en-US": "Supported schools overview and concurrency improvements",
    },
    content: {
      "zh-CN":
        "页脚与注册页新增「支持的学校」入口，注册前即可查看完整的可注册邮箱后缀。后端完成一轮并发性能优化，多人同时使用时响应会更稳。",
      "en-US":
        "The footer and registration page now link to the supported schools list, so you can check accepted email domains before registering. The backend also received concurrency improvements for steadier responses under simultaneous use.",
    },
    date: "2026-04-22",
  },
  {
    id: "2026-04-21-school-gender-exclusion",
    title: {
      "zh-CN": "新增按学校内性别排除，学校变更后草稿偏好也会自动同步",
      "en-US": "School-level gender exclusions and draft preference sync",
    },
    content: {
      "zh-CN":
        "现在你可以在「对方条件」里按学校分别勾选不希望匹配的性别，三项全选等同整校排除。我们也补上了学校合并或删除后的草稿同步逻辑，已保存但未正式提交的相关偏好不会再被静默丢失。",
      "en-US":
        "You can now exclude specific genders by school in partner preferences. Selecting all three options excludes the whole school. Draft preferences also stay synced after school changes.",
    },
    date: "2026-04-21",
  },
  {
    id: "2026-04-19-friend-date-both",
    title: {
      "zh-CN": "新增 Friend / Date / Both，现已支持找朋友",
      "en-US": "Friend / Date / Both now supported",
    },
    content: {
      "zh-CN":
        "前端已完成一轮更新升级，新增 Friend、Date、Both 三种选项。现在除了约会，你也可以在 LiLink 里找朋友了。",
      "en-US":
        "The weekly intent flow now supports Friend, Date, and Both. LiLink can be used for friendship as well as dating.",
    },
    date: "2026-04-19",
  },
  {
    id: "2026-04-15-excluded-school",
    title: {
      "zh-CN": "新增「不希望对方学校」硬性条件",
      "en-US": "School exclusion added as a hard preference",
    },
    content: {
      "zh-CN":
        "现在你可以在「对方条件」中选择不希望匹配对象所在的学校（可多选），该选项为硬性约束，被选中的学校将被双向排除在匹配之外，不选任何学校则不限，请前往问卷页面更新你的偏好。",
      "en-US":
        "You can now choose schools you do not want to match with. This is a hard preference and applies both ways.",
    },
    date: "2026-04-15",
  },
  {
    id: "2026-04-14-launch",
    title: {
      "zh-CN": "LiLink 全量开放注册",
      "en-US": "LiLink registration is open",
    },
    content: {
      "zh-CN":
        "欢迎来到 LiLink！平台现已全量开放注册，完成深度问卷即可参与每周匹配。祝你在这里遇见值得期待的人。",
      "en-US":
        "Welcome to LiLink. Registration is now open; complete the questionnaire to join weekly matching.",
    },
    date: "2026-04-14",
  },
];

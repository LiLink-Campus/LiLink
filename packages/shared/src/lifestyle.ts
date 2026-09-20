export const LIFESTYLE_QUESTIONS = [
  {
    key: "exercise_frequency",
    prompt: "锻炼频率",
    options: ["很少或不锻炼", "每周 1–2 次", "每周 3–4 次", "每周 5 次及以上"],
  },
  {
    key: "smoking_status",
    prompt: "吸烟情况",
    options: ["不吸烟", "偶尔吸烟", "经常吸烟", "每天吸烟"],
  },
  {
    key: "drinking_frequency",
    prompt: "饮酒频率",
    options: ["不饮酒", "偶尔社交饮酒", "每周 1–2 次", "每周 3 次及以上"],
  },
] as const;

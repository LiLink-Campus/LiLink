import { test, expect, api, password, visit, completeProfile } from "../support/fixtures";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("admin profile uses current sections and labels while hiding retired fields @webkit @mobile", async ({
  page,
  context,
  db,
  account,
  signedIn,
}, info) => {
  void signedIn;
  await completeProfile(context, db);
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const response = await db.questionnaireResponse.findUniqueOrThrow({
    where: { userId: account.id },
  });
  const current = await db.questionnaireVersion.findFirstOrThrow({
    where: { isCurrent: true },
    include: { questions: true },
  });
  const valueQuestion = current.questions.find(
    (q: any) => !["smoking_status", "drinking_frequency", "exercise_frequency"].includes(q.key)
  );
  expect(valueQuestion).toBeTruthy();
  await db.questionnaireResponse.update({
    where: { userId: account.id },
    data: {
      answers: {
        ...response.answers,
        hard_partner_languages: ["obsolete-language"],
        hard_partner_nationalities: ["obsolete-country"],
        retired_question: "obsolete-answer",
        hard_partner_smoking_status: ["不吸烟"],
        hard_partner_drinking_frequency: [],
        hard_partner_weight_min: null,
        hard_partner_weight_max: null,
      },
    },
  });
  const admin = await db.adminOperator.create({
    data: { email: `sections-${account.email}`, passwordHash: source.passwordHash },
  });
  expect(
    (
      await context.request.post(`${api}/admin-session/login`, {
        data: { email: admin.email, password },
      })
    ).ok()
  ).toBe(true);
  await visit(page, "/admin");
  await expect(page.getByRole("heading", { name: "运营概览", exact: true })).toBeVisible();
  await expect(page.getByText("测试工具", { exact: true })).toHaveCount(0);
  await expect(page.getByText("最近轮次", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("overview.png"), fullPage: true });
  await visit(page, "/admin/users");
  await page.getByPlaceholder("邮箱、昵称、姓名或学校").fill(account.email);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.getByRole("button", { name: `查看 自动化同学 ${account.email}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "用户详情", exact: true });
  await dialog.getByRole("button", { name: "关于你", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "关于你", exact: true })).toBeVisible();
  await expect(dialog.getByRole("row").filter({ hasText: "吸烟情况" })).toBeVisible();
  await dialog.getByRole("button", { name: "希望遇见谁", exact: true }).click();
  await expect(dialog.getByRole("row").filter({ hasText: "希望对方吸烟情况" })).toContainText(
    "不吸烟"
  );
  await expect(dialog.getByRole("row").filter({ hasText: "希望对方饮酒频率" })).toContainText(
    "不限"
  );
  await expect(dialog.getByRole("row").filter({ hasText: "希望对方体重下限" })).toContainText(
    "不限"
  );
  await expect(dialog.getByText(/hard_|obsolete-|retired_question/)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("partner.png"), fullPage: true });
  await dialog.getByRole("button", { name: "价值观", exact: true }).click();
  await expect(dialog.getByRole("row").filter({ hasText: valueQuestion.prompt })).toBeVisible();
  await expect(dialog.getByText(/hard_|obsolete-|retired_question/)).toHaveCount(0);
  await expect(dialog.getByText("希望对方吸烟情况", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("values.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  expect(
    (await db.questionnaireResponse.findUniqueOrThrow({ where: { userId: account.id } })).answers
      .retired_question
  ).toBe("obsolete-answer");
  const originalOptions = valueQuestion.options;
  const changedPrompt = `动态修改题目 ${account.id}`;
  const changedOptions = originalOptions.map(
    (option: { value: string; label: string }, index: number) => ({
      ...option,
      label: index === 0 ? "动态选项名称" : option.label,
    })
  );
  const extraKey = `dynamic_${account.id}`;
  async function reopenValues() {
    await dialog.getByRole("button", { name: "账号信息", exact: true }).click();
    await dialog.getByRole("button", { name: "价值观", exact: true }).click();
  }
  async function currentQuestion(key: string) {
    const catalog = await (await context.request.get(`${api}/admin/questionnaire`)).json();
    return catalog.questions.find((q: { key: string }) => q.key === key);
  }
  try {
    const changed = await context.request.put(`${api}/admin/questionnaire/questions`, {
      data: {
        questionId: valueQuestion.id,
        key: valueQuestion.key,
        prompt: changedPrompt,
        type: valueQuestion.type,
        options: changedOptions,
        order: valueQuestion.order,
        weight: valueQuestion.weight,
        ...(valueQuestion.selectionLimit == null
          ? {}
          : { selectionLimit: valueQuestion.selectionLimit }),
      },
    });
    expect(changed.ok(), await changed.text()).toBe(true);
    await reopenValues();
    await expect(dialog.getByRole("row").filter({ hasText: changedPrompt })).toContainText(
      "动态选项名称"
    );
    expect(
      (
        await context.request.put(`${api}/admin/questionnaire/questions`, {
          data: {
            key: extraKey,
            prompt: "动态新增问题",
            type: "SINGLE_SELECT",
            options: [
              { value: "yes", label: "愿意" },
              { value: "no", label: "不愿意" },
            ],
            order: 999,
            weight: 1,
          },
        })
      ).ok()
    ).toBe(true);
    await reopenValues();
    await expect(dialog.getByRole("row").filter({ hasText: "动态新增问题" })).toContainText(
      "未填写"
    );
    const extra = await currentQuestion(extraKey);
    expect(
      (await context.request.delete(`${api}/admin/questionnaire/questions/${extra.id}`)).ok()
    ).toBe(true);
    await reopenValues();
    await expect(dialog.getByText("动态新增问题", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("dynamic-questionnaire.png"), fullPage: true });
  } finally {
    const extra = await currentQuestion(extraKey);
    if (extra)
      expect(
        (await context.request.delete(`${api}/admin/questionnaire/questions/${extra.id}`)).ok()
      ).toBe(true);
    const active = await currentQuestion(valueQuestion.key);
    expect(
      (
        await context.request.put(`${api}/admin/questionnaire/questions`, {
          data: {
            questionId: active.id,
            key: valueQuestion.key,
            prompt: valueQuestion.prompt,
            type: valueQuestion.type,
            options: originalOptions,
            order: valueQuestion.order,
            weight: valueQuestion.weight,
            ...(valueQuestion.selectionLimit == null
              ? {}
              : { selectionLimit: valueQuestion.selectionLimit }),
          },
        })
      ).ok()
    ).toBe(true);
  }
});

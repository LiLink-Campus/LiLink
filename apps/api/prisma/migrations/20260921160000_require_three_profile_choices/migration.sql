-- Keep existing answers and archives; users reconcile selections in the current form.
UPDATE "Question" q
SET "selectionLimit" = 3, "prompt" = patch.prompt
FROM (VALUES
  ('values', '请选择你最看重的 3 项价值。'),
  ('red_flag_sensitivity', '请选择你最在意的 3 个"雷点"。'),
  ('shared_growth_topics', '如果长期相处，你更愿意一起投入哪 3 个方向？'),
  ('feeling_cared_for', '你最容易从哪 3 种行为里感到被在乎？')
) AS patch(key, prompt), "QuestionnaireVersion" v
WHERE q."versionId" = v."id" AND v."isCurrent" = true
  AND q."key" = patch.key AND q."type" = 'MULTI_SELECT';

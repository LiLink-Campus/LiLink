ALTER TABLE "Question"
ADD COLUMN "reasonRules" JSONB;

UPDATE "Question"
SET
  "reasonRules" = '[{"type":"EXACT_MATCH","template":"你们对进入关系的期待很一致。","priority":3}]'::jsonb
WHERE "key" = 'relationship_intent'
  AND "reasonRules" IS NULL;

UPDATE "Question"
SET
  "reasonRules" = '[{"type":"EXACT_MATCH","template":"你们对关系推进节奏的期待很接近。","priority":2}]'::jsonb
WHERE "key" = 'pace'
  AND "reasonRules" IS NULL;

UPDATE "Question"
SET
  "reasonRules" = '[{"type":"MULTI_OVERLAP","template":"你们都把 {{labels_2}} 放在重要位置。","priority":4,"minOverlap":1,"maxLabels":2}]'::jsonb
WHERE "key" = 'values'
  AND "reasonRules" IS NULL;

UPDATE "Question"
SET
  "reasonRules" = '[{"type":"EXACT_MATCH","template":"你们对周末相处方式的偏好相近。","priority":2}]'::jsonb
WHERE "key" = 'weekend'
  AND "reasonRules" IS NULL;

UPDATE "Question"
SET
  "reasonRules" = '[{"type":"EXACT_MATCH","template":"你们处理分歧时更容易对齐彼此的沟通方式。","priority":3}]'::jsonb
WHERE "key" = 'communication'
  AND "reasonRules" IS NULL;

UPDATE "Question"
SET
  "reasonRules" = '[{"type":"EXACT_MATCH","template":"你们对出去玩时谁来买单或 AA 的期待比较一致，相处时更省心。","priority":2}]'::jsonb
WHERE "key" = 'outing_spend_style'
  AND "reasonRules" IS NULL;

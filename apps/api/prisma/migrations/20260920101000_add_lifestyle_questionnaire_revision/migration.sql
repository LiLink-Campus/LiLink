-- Add missing traits without rewriting custom questions or submitted responses.
DO $$
DECLARE
  current_version RECORD;
  new_id TEXT;
BEGIN
  LOCK TABLE "QuestionnaireVersion", "Question" IN SHARE ROW EXCLUSIVE MODE;
  FOR current_version IN SELECT * FROM "QuestionnaireVersion" WHERE "isCurrent" LOOP
    IF (SELECT COUNT(*) FROM "Question" WHERE "versionId" = current_version."id"
        AND "key" IN ('exercise_frequency', 'smoking_status', 'drinking_frequency')) = 3 THEN
      CONTINUE;
    END IF;
    new_id := 'lifestyle_' || md5(current_version."id");
    INSERT INTO "QuestionnaireVersion" ("id", "title", "description", "isCurrent", "updatedAt")
    VALUES (new_id, current_version."title", current_version."description", false, CURRENT_TIMESTAMP);
    INSERT INTO "Question" ("id", "versionId", "key", "prompt", "description", "type",
      "weight", "order", "required", "selectionLimit", "options")
    SELECT 'lifestyle_' || md5(new_id || ':' || "id"), new_id, "key", "prompt", "description", "type",
      "weight", "order", "required", "selectionLimit", "options"
    FROM "Question" WHERE "versionId" = current_version."id";
    INSERT INTO "Question" ("id", "versionId", "key", "prompt", "type", "weight", "order", "required", "options")
    SELECT 'lifestyle_' || md5(new_id || ':' || q.key), new_id, q.key, q.prompt,
      'SINGLE_SELECT'::"QuestionType", 0,
      (SELECT COALESCE(MAX("order"), 0) FROM "Question" WHERE "versionId" = current_version."id") + q.position,
      true, (SELECT jsonb_agg(jsonb_build_object('value', label, 'label', label)) FROM unnest(q.labels) AS label)
    FROM (VALUES
      ('exercise_frequency', '锻炼频率', 1, ARRAY['很少或不锻炼','每周 1–2 次','每周 3–4 次','每周 5 次及以上']),
      ('smoking_status', '吸烟情况', 2, ARRAY['不吸烟','偶尔吸烟','经常吸烟','每天吸烟']),
      ('drinking_frequency', '饮酒频率', 3, ARRAY['不饮酒','偶尔社交饮酒','每周 1–2 次','每周 3 次及以上'])
    ) AS q(key, prompt, position, labels)
    WHERE NOT EXISTS (SELECT 1 FROM "Question" WHERE "versionId" = new_id AND "key" = q.key);
    UPDATE "QuestionnaireVersion" SET "isCurrent" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = current_version."id";
    UPDATE "QuestionnaireVersion" SET "isCurrent" = true WHERE "id" = new_id;
  END LOOP;
END $$;

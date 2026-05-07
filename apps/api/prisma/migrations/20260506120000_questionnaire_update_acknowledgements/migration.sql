ALTER TABLE "QuestionnaireResponse"
ADD COLUMN "acknowledgedQuestionnaireVersionId" TEXT,
ADD COLUMN "acknowledgedQuestionnaireKeys" JSONB;

import { hardMatchQuestionKeys } from '@lilink/shared';
import { BadRequestException } from '@nestjs/common';
import { Prisma, type QuestionType } from '../../common/prisma/client';
import {
  sanitizeHardMatchDraftForm,
  type HardMatchDraftForm,
} from '../questionnaire/hard-match';
export type QuestionnaireDraftPayload = {
  softAnswers: Record<string, Prisma.InputJsonValue>;
  hardMatchForm: HardMatchDraftForm;
  displayName: string;
};
export type QuestionnaireDraftQuestion = {
  key: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  selectionLimit?: number | null;
  options: Prisma.JsonValue | null;
};
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function assertKnownQuestionnaireKeys(
  questions: Array<{ key: string }>,
  rawAnswers: Record<string, unknown>,
) {
  const allowedKeys = new Set([
    ...questions.map((question) => question.key),
    ...hardMatchQuestionKeys(),
  ]);

  for (const answerKey of Object.keys(rawAnswers)) {
    if (!allowedKeys.has(answerKey)) {
      throw new BadRequestException(
        `Unexpected questionnaire field: ${answerKey}.`,
      );
    }
  }
}
export function buildQuestionnaireDraftPayload(
  softAnswers: Record<string, Prisma.InputJsonValue>,
  hardMatchForm: unknown,
  displayName: unknown,
  allowedSchoolIds: readonly string[],
): QuestionnaireDraftPayload {
  return {
    softAnswers,
    hardMatchForm: sanitizeHardMatchDraftForm(hardMatchForm, allowedSchoolIds),
    displayName: typeof displayName === 'string' ? displayName.trim() : '',
  };
}

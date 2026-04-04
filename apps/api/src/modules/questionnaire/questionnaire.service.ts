import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hardMatchQuestionKeys, normalizeHardMatchAnswers } from './hard-match';
import {
  normalizeQuestionAnswer,
  normalizeQuestionOptions,
  normalizeQuestionReasonRules,
} from './questionnaire-config';

type QuestionnaireQuestion = {
  id?: string;
  key: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  selectionLimit?: number | null;
  options: Prisma.JsonValue | null;
  reasonRules?: Prisma.JsonValue | null;
};

@Injectable()
export class QuestionnaireService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentVersion() {
    const questionnaire = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!questionnaire) {
      throw new NotFoundException(
        'Current questionnaire version is not configured.',
      );
    }

    return {
      ...questionnaire,
      questions: questionnaire.questions.map((question) => ({
        ...question,
        options: normalizeQuestionOptions(question.options),
        reasonRules: normalizeQuestionReasonRules(question.reasonRules),
      })),
    };
  }

  validateAnswers(
    questions: QuestionnaireQuestion[],
    rawAnswers: Record<string, unknown>,
  ) {
    const questionsByKey = new Map(
      questions.map((question) => [question.key, question]),
    );
    const allowedQuestionKeys = new Set([
      ...questionsByKey.keys(),
      ...hardMatchQuestionKeys(),
    ]);

    for (const answerKey of Object.keys(rawAnswers)) {
      if (!allowedQuestionKeys.has(answerKey)) {
        throw new BadRequestException(
          `Unexpected questionnaire field: ${answerKey}.`,
        );
      }
    }

    const normalizedAnswers: Record<string, Prisma.InputJsonValue> = {
      ...normalizeHardMatchAnswers(rawAnswers),
    };

    for (const question of questions) {
      const rawAnswer = rawAnswers[question.key];

      if (rawAnswer == null) {
        if (question.required) {
          throw new BadRequestException(
            `Question "${question.prompt}" is required.`,
          );
        }

        continue;
      }

      const normalizedAnswer = normalizeQuestionAnswer(question, rawAnswer);

      if (normalizedAnswer == null) {
        if (question.required) {
          throw new BadRequestException(
            `Question "${question.prompt}" is required.`,
          );
        }

        continue;
      }

      normalizedAnswers[question.key] = normalizedAnswer;
    }

    return normalizedAnswers;
  }

  sanitizeStoredAnswers(
    questions: QuestionnaireQuestion[],
    rawAnswers: Record<string, unknown>,
  ) {
    const sanitizedAnswers: Record<string, Prisma.InputJsonValue> = {};

    for (const question of questions) {
      if (!(question.key in rawAnswers)) {
        continue;
      }

      const normalizedAnswer = normalizeQuestionAnswer(
        question,
        rawAnswers[question.key],
        { invalidAsNull: true },
      );

      if (normalizedAnswer != null) {
        sanitizedAnswers[question.key] = normalizedAnswer;
      }
    }

    return sanitizedAnswers;
  }
}

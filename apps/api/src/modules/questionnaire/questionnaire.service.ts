import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType } from '../../common/prisma/client';
import type { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hardMatchQuestionKeys, normalizeHardMatchAnswers } from './hard-match';
import { IncompleteQuestionnaireSubmissionException } from './incomplete-questionnaire-submission.exception';
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

type QuestionnaireSchoolOption = {
  id: string;
  name: string;
};

type QuestionnaireAnswerValue = Prisma.InputJsonValue | null;

type CurrentQuestionnairePayload = {
  id: string;
  title: string;
  description: string | null;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
  questions: Array<{
    id: string;
    versionId: string;
    key: string;
    prompt: string;
    description: string | null;
    type: QuestionType;
    weight: number;
    order: number;
    required: boolean;
    selectionLimit: number | null;
    options: ReturnType<typeof normalizeQuestionOptions>;
    reasonRules: ReturnType<typeof normalizeQuestionReasonRules>;
  }>;
  schools: QuestionnaireSchoolOption[];
};

type CachedCurrentQuestionnaire = {
  expiresAt: number;
  value: CurrentQuestionnairePayload;
};

const CURRENT_QUESTIONNAIRE_CACHE_TTL_MS = 30 * 1000;

@Injectable()
export class QuestionnaireService {
  private cachedCurrentQuestionnaire: CachedCurrentQuestionnaire | null = null;
  private currentQuestionnaireInFlight: Promise<CurrentQuestionnairePayload> | null =
    null;

  constructor(private readonly prisma: PrismaService) {}

  async getCurrentVersion() {
    const cachedQuestionnaire = this.readCachedCurrentQuestionnaire();
    if (cachedQuestionnaire) {
      return cachedQuestionnaire;
    }

    if (this.currentQuestionnaireInFlight) {
      return this.currentQuestionnaireInFlight;
    }

    this.currentQuestionnaireInFlight = this.loadCurrentVersion().finally(
      () => {
        this.currentQuestionnaireInFlight = null;
      },
    );

    return this.currentQuestionnaireInFlight;
  }

  private readCachedCurrentQuestionnaire() {
    if (!this.cachedCurrentQuestionnaire) {
      return null;
    }

    if (this.cachedCurrentQuestionnaire.expiresAt <= Date.now()) {
      this.cachedCurrentQuestionnaire = null;
      return null;
    }

    return this.cachedCurrentQuestionnaire.value;
  }

  private async loadCurrentVersion() {
    const [questionnaire, schools] = await Promise.all([
      this.prisma.questionnaireVersion.findFirst({
        where: { isCurrent: true },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      }),
      this.prisma.school.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    if (!questionnaire) {
      throw new NotFoundException(
        'Current questionnaire version is not configured.',
      );
    }

    const currentQuestionnaire = {
      ...questionnaire,
      questions: questionnaire.questions.map((question) => ({
        ...question,
        options: normalizeQuestionOptions(question.options),
        reasonRules: normalizeQuestionReasonRules(question.reasonRules),
      })),
      schools,
    } satisfies CurrentQuestionnairePayload;

    this.cachedCurrentQuestionnaire = {
      expiresAt: Date.now() + CURRENT_QUESTIONNAIRE_CACHE_TTL_MS,
      value: currentQuestionnaire,
    };

    return currentQuestionnaire;
  }

  validateAnswers(
    questions: QuestionnaireQuestion[],
    rawAnswers: Record<string, unknown>,
    allowedSchoolIds: readonly string[],
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

    const normalizedAnswers: Record<string, QuestionnaireAnswerValue> = {
      ...normalizeHardMatchAnswers(rawAnswers, allowedSchoolIds),
    };

    for (const question of questions) {
      const rawAnswer = rawAnswers[question.key];

      if (rawAnswer == null) {
        if (question.required) {
          throw new IncompleteQuestionnaireSubmissionException(
            `Question "${question.prompt}" is required.`,
          );
        }

        continue;
      }

      const normalizedAnswer = normalizeQuestionAnswer(question, rawAnswer);

      if (normalizedAnswer == null) {
        if (question.required) {
          throw new IncompleteQuestionnaireSubmissionException(
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

  listSchoolOptions(): Promise<QuestionnaireSchoolOption[]> {
    return this.prisma.school.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });
  }
}

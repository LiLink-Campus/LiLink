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
} from './questionnaire-config';

type QuestionnaireQuestion = {
  id?: string;
  key: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  selectionLimit?: number | null;
  options: Prisma.JsonValue | null;
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
  }>;
  schools: QuestionnaireSchoolOption[];
};

type CachedCurrentQuestionnaire = {
  expiresAt: number;
  value: CurrentQuestionnairePayload;
};

// Public read-only snapshot, same class as the landing/eligible-schools caches
// (see PublicService). The current questionnaire only changes when an admin
// publishes a revision, so a long TTL keeps Neon idle while admin edits stay
// fresh via invalidateCurrentQuestionnaireCache() rather than the TTL. This
// mirrors the 30min TTL used for the landing/schools snapshots.
const CURRENT_QUESTIONNAIRE_CACHE_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class QuestionnaireService {
  private cachedCurrentQuestionnaire: CachedCurrentQuestionnaire | null = null;
  private currentQuestionnaireInFlight: Promise<CurrentQuestionnairePayload> | null =
    null;
  private currentQuestionnaireCacheEpoch = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getCurrentVersion() {
    const cachedQuestionnaire = this.readCachedCurrentQuestionnaire();
    if (cachedQuestionnaire) {
      return cachedQuestionnaire;
    }

    if (this.currentQuestionnaireInFlight) {
      return this.currentQuestionnaireInFlight;
    }

    const requestEpoch = this.currentQuestionnaireCacheEpoch;
    const inFlight = this.loadCurrentVersion(requestEpoch).finally(() => {
      // An invalidation can replace this promise before it settles. Only clear
      // the single-flight slot when it still points at this load, otherwise the
      // stale load would detach the fresh replacement and allow duplicate reads.
      if (this.currentQuestionnaireInFlight === inFlight) {
        this.currentQuestionnaireInFlight = null;
      }
    });
    this.currentQuestionnaireInFlight = inFlight;

    return this.currentQuestionnaireInFlight;
  }

  // Drop the cached snapshot so the next read reflects an admin questionnaire
  // publish before the long TTL expires (mirrors invalidateEligibleSchoolsCache).
  // Bumping the epoch also discards any load that was already in flight when the
  // publish happened, so a stale pre-publish snapshot cannot overwrite the cache.
  invalidateCurrentQuestionnaireCache() {
    this.currentQuestionnaireCacheEpoch += 1;
    this.cachedCurrentQuestionnaire = null;
    this.currentQuestionnaireInFlight = null;
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

  private async loadCurrentVersion(requestEpoch: number) {
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
        required: true,
        options: normalizeQuestionOptions(question.options),
      })),
      schools,
    } satisfies CurrentQuestionnairePayload;

    // Only publish to the cache if no invalidation happened while this load was
    // in flight; otherwise a stale snapshot could overwrite fresher data.
    if (requestEpoch === this.currentQuestionnaireCacheEpoch) {
      this.cachedCurrentQuestionnaire = {
        expiresAt: Date.now() + CURRENT_QUESTIONNAIRE_CACHE_TTL_MS,
        value: currentQuestionnaire,
      };
    }

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
        throw new IncompleteQuestionnaireSubmissionException(
          `Question "${question.prompt}" is required.`,
        );
      }

      const normalizedAnswer = normalizeQuestionAnswer(question, rawAnswer);

      if (
        normalizedAnswer == null ||
        (question.type === 'MULTI_SELECT' &&
          question.selectionLimit != null &&
          Array.isArray(normalizedAnswer) &&
          normalizedAnswer.length !== question.selectionLimit)
      ) {
        throw new IncompleteQuestionnaireSubmissionException(
          `Question "${question.prompt}" is required.`,
        );
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

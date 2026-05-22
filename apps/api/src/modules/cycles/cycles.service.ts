import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import blossom from 'edmonds-blossom-fixed';
import { Prisma, QuestionType } from '../../common/prisma/client';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ensureStickyCycleParticipations } from '../../common/participation/sticky-cycle-participation';
import {
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
  HardMatchAnswers,
  areHardMatchAnswersCompatible,
  tryReadHardMatchAnswers,
} from '../questionnaire/hard-match';
import {
  areWeeklyIntentsCompatible,
  calculateAgeOnDate,
  isWeeklyIntent,
  type WeeklyIntent,
} from '@lilink/shared';
import {
  type QuestionOption,
  normalizeQuestionAnswer,
  normalizeQuestionOptions,
  resolveQuestionOptionValue,
} from '../questionnaire/questionnaire-config';

const BASE_MATCH_SCORE = 48;
const SINGLE_SELECT_MATCH_BONUS = 6;
const MULTI_SELECT_OVERLAP_BONUS = 3;
const LOOKS_PREFERENCE_SOFT_BONUS = MULTI_SELECT_OVERLAP_BONUS;
// Age is a soft preference (see hard-match.ts comment on
// areHardMatchAnswersCompatible). Each side contributes 0..1 to the fit
// score: 1 when their age sits inside the partner's preferred window, then
// linearly decays toward 0 outside the window. Hitting both sides perfectly
// adds AGE_PREFERENCE_SOFT_BONUS to the raw match score; falling fully
// outside on both sides adds nothing without dropping the pair.
const AGE_PREFERENCE_SOFT_BONUS = 6;
const AGE_PREFERENCE_DECAY_PER_YEAR = 0.25;
const PREPARATION_RECOVERY_THRESHOLD_MS = 10 * 60 * 1000;
const NORMALIZED_SCORE_MIN = 70;
const NORMALIZED_SCORE_MAX = 100;
const PRIORITY_UNMATCHED_STREAK_THRESHOLD = 3;
const PRE_PRIORITY_UNMATCHED_STREAK_BONUS = 2;

/**
 * Only ACTIVE users with a stored weekly intent may appear in matching /
 * preview / reveal pools. Sticky carry-over preserves the latest intent for
 * OPTED_IN users and falls back to BOTH for pre-feature rows, so a NULL
 * intent here means the participation still lacks a usable cycle intent.
 */
const ACTIVE_OPTED_IN_PARTICIPATION_FILTER: Prisma.CycleParticipationWhereInput =
  {
    status: 'OPTED_IN',
    intent: { not: null },
    user: { status: 'ACTIVE' },
  };

const CYCLE_PROCESSING_INCLUDE = {
  participations: {
    where: ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
    select: {
      intent: true,
      user: {
        select: {
          id: true,
          displayName: true,
          questionnaireResponse: {
            select: {
              versionId: true,
              answers: true,
              submittedAt: true,
            },
          },
          school: { select: { id: true } },
        },
      },
    },
  },
} satisfies Prisma.MatchCycleInclude;

type EligibleParticipant = {
  id: string;
  displayName: string | null;
  questionnaireVersionId: string | null;
  hardMatchAnswers: HardMatchAnswers;
  answers: Record<string, unknown>;
  intent: WeeklyIntent;
  introLine: string;
};

type CandidatePair = {
  left: EligibleParticipant;
  right: EligibleParticipant;
  rawScore: number;
  score: number;
  matchingWeight: number;
};

type RetentionWeightTiers = {
  priorityUser: number;
  priorityStreak: number;
  matchedUser: number;
};

type QuestionnaireQuestion = {
  key: string;
  prompt: string;
  description?: string | null;
  type: QuestionType;
  weight: number;
  selectionLimit?: number | null;
  options: Prisma.JsonValue | null;
};

type PreparedQuestion = Omit<QuestionnaireQuestion, 'options'> & {
  normalizedOptions: QuestionOption[];
};

type MatchQuestion = QuestionnaireQuestion | PreparedQuestion;

type ComparableQuestion = {
  key: string;
  order: number;
  type: QuestionType;
  weight: number;
  leftQuestion: PreparedQuestion;
  rightQuestion: PreparedQuestion;
};

type PairQuestionSet = {
  leftQuestions: PreparedQuestion[];
  rightQuestions: PreparedQuestion[];
  comparableQuestions: ComparableQuestion[];
};

type RunRevealCycleOptions = {
  force?: boolean;
  cycleId?: string;
  adminActorId?: string;
};

type CyclePreparationResult = {
  ok: true;
  cycleId: string;
  state: 'PREPARED' | 'PENDING' | 'SKIPPED';
  message: string;
  createdMatches: number;
  unmatchedCount: number;
};

type CycleRevealResult = {
  ok: true;
  cycleId: string;
  state: 'REVEALED' | 'SKIPPED';
  message: string;
  createdMatches: number;
};

type MatchScoreBounds = {
  min: number;
  max: number;
};

class PreparationClaimLostError extends Error {
  constructor() {
    super('Cycle state changed before preparation finished.');
  }
}

function buildInsufficientParticipantsMessage(
  optedInCount: number,
  eligibleCount: number,
): string {
  const prefix = 'Not enough complete participants to generate matches.';
  if (optedInCount === 0) {
    return `${prefix} No users are opted in with a weekly intent (FRIEND/DATE/BOTH) for this cycle. At least 2 opted-in users with valid hard-matching questionnaire answers and a weekly intent are required.`;
  }
  if (eligibleCount === 0) {
    return `${prefix} ${optedInCount} user(s) opted in (with a weekly intent), but none have valid hard-matching questionnaire answers (birth date, partner age range, gender / partner genders, looks / partner looks, height / partner height range, and a recognized school).`;
  }
  return `${prefix} Only ${eligibleCount} of ${optedInCount} opted-in user(s) are eligible; at least 2 are required.`;
}

function isPreparedQuestion(
  question: MatchQuestion,
): question is PreparedQuestion {
  return 'normalizedOptions' in question;
}

function prepareQuestion(question: MatchQuestion): PreparedQuestion {
  if (isPreparedQuestion(question)) {
    return question;
  }

  return {
    key: question.key,
    prompt: question.prompt,
    description: question.description ?? null,
    type: question.type,
    weight: question.weight,
    selectionLimit: question.selectionLimit ?? null,
    normalizedOptions: normalizeQuestionOptions(question.options),
  };
}

function prepareQuestions(questions: MatchQuestion[]): PreparedQuestion[] {
  return questions.map((question) => prepareQuestion(question));
}

function readNormalizedQuestionString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizePreparedQuestionAnswer(
  question: PreparedQuestion,
  rawAnswer: unknown,
  options: { invalidAsNull?: boolean } = {},
) {
  const fallbackQuestion = {
    ...question,
    options: question.normalizedOptions,
  };

  if (
    question.type === QuestionType.SINGLE_SELECT ||
    question.type === QuestionType.SCALE
  ) {
    if (typeof rawAnswer !== 'string') {
      return options.invalidAsNull
        ? null
        : normalizeQuestionAnswer(fallbackQuestion, rawAnswer);
    }

    const normalizedAnswer = readNormalizedQuestionString(rawAnswer);
    if (!normalizedAnswer) {
      return null;
    }

    if (question.normalizedOptions.length === 0) {
      return normalizedAnswer;
    }

    const resolvedValue = resolveQuestionOptionValue(
      normalizedAnswer,
      question.normalizedOptions,
    );

    if (!resolvedValue) {
      return options.invalidAsNull
        ? null
        : normalizeQuestionAnswer(fallbackQuestion, rawAnswer);
    }

    return resolvedValue;
  }

  if (question.type !== QuestionType.MULTI_SELECT) {
    return options.invalidAsNull
      ? null
      : normalizeQuestionAnswer(fallbackQuestion, rawAnswer);
  }

  if (!Array.isArray(rawAnswer)) {
    return options.invalidAsNull
      ? null
      : normalizeQuestionAnswer(fallbackQuestion, rawAnswer);
  }

  const normalizedValues = [
    ...new Set(
      rawAnswer
        .map((value) => {
          if (typeof value !== 'string') {
            return null;
          }

          if (question.normalizedOptions.length === 0) {
            return readNormalizedQuestionString(value);
          }

          return resolveQuestionOptionValue(value, question.normalizedOptions);
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  if (normalizedValues.length === 0) {
    return null;
  }

  if (
    question.selectionLimit != null &&
    normalizedValues.length > question.selectionLimit
  ) {
    return options.invalidAsNull
      ? null
      : normalizeQuestionAnswer(fallbackQuestion, rawAnswer);
  }

  return normalizedValues;
}

@Injectable()
export class CyclesService {
  private readonly logger = new Logger(CyclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
  ) {}

  async runRevealCycle(options: RunRevealCycleOptions = {}) {
    if (!options.cycleId) {
      return this.runAutomationTick();
    }

    let cycle = await this.loadCycleForProcessing(options.cycleId);

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (options.force && cycle.status !== 'OPEN') {
      if (cycle.status === 'DRAFT') {
        throw new BadRequestException('Draft cycles cannot be executed.');
      }

      await this.resetCycleForForcedRerun(cycle.id);
      cycle = await this.loadCycleForProcessing(cycle.id);

      if (!cycle) {
        throw new NotFoundException('Cycle not found.');
      }
    }

    if (cycle.status === 'OPEN') {
      const preparationResult = await this.prepareCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });

      if (preparationResult.state !== 'PREPARED') {
        return preparationResult;
      }

      if (!options.force && cycle.revealAt > new Date()) {
        return preparationResult;
      }

      return this.revealPreparedCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });
    }

    if (cycle.status === 'PREPARING') {
      const preparationResult = await this.continuePreparingCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });

      if (preparationResult.state !== 'PREPARED') {
        return preparationResult;
      }

      if (!options.force && cycle.revealAt > new Date()) {
        return preparationResult;
      }

      return this.revealPreparedCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });
    }

    if (cycle.status === 'REVEAL_READY') {
      return this.revealPreparedCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });
    }

    if (cycle.status === 'REVEALED') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        message: 'Cycle has already been revealed.',
      } satisfies CycleRevealResult;
    }

    throw new BadRequestException(
      'Only open or prepared cycles can be executed.',
    );
  }

  async runAutomationTick() {
    const preparedCycleIds: string[] = [];
    const revealedCycleIds: string[] = [];

    const duePreparationCycles = await this.prisma.matchCycle.findMany({
      where: {
        status: 'OPEN',
        participationDeadline: { lte: new Date() },
      },
      orderBy: [{ participationDeadline: 'asc' }, { revealAt: 'asc' }],
      select: { id: true },
    });

    for (const cycle of duePreparationCycles) {
      try {
        const result = await this.prepareCycle({
          cycleId: cycle.id,
        });

        if (result.state === 'PREPARED') {
          preparedCycleIds.push(cycle.id);
        }
      } catch (error) {
        this.logAutomationError('prepare', cycle.id, error);
      }
    }

    const preparingCycles = await this.prisma.matchCycle.findMany({
      where: {
        status: 'PREPARING',
      },
      orderBy: [{ revealAt: 'asc' }, { updatedAt: 'asc' }],
      select: { id: true },
    });

    for (const cycle of preparingCycles) {
      try {
        const result = await this.continuePreparingCycle({
          cycleId: cycle.id,
        });

        if (result.state === 'PREPARED') {
          preparedCycleIds.push(cycle.id);
        }
      } catch (error) {
        this.logAutomationError('prepare', cycle.id, error);
      }
    }

    const dueRevealCycles = await this.prisma.matchCycle.findMany({
      where: {
        status: 'REVEAL_READY',
        revealAt: { lte: new Date() },
      },
      orderBy: { revealAt: 'asc' },
      select: { id: true },
    });

    for (const cycle of dueRevealCycles) {
      try {
        const result = await this.revealPreparedCycle({
          cycleId: cycle.id,
        });

        if (result.state === 'REVEALED') {
          revealedCycleIds.push(cycle.id);
        }
      } catch (error) {
        this.logAutomationError('reveal', cycle.id, error);
      }
    }

    return {
      ok: true,
      preparedCycleIds,
      revealedCycleIds,
    };
  }

  private async prepareCycle(options: {
    cycleId: string;
    force?: boolean;
    adminActorId?: string;
  }): Promise<CyclePreparationResult> {
    const [cycleCandidate, questionnaire] = await Promise.all([
      this.loadCycleForProcessing(options.cycleId),
      this.prisma.questionnaireVersion.findFirst({
        where: { isCurrent: true },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      }),
    ]);

    let cycle = cycleCandidate;

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    const stickyParticipationInitialization =
      await ensureStickyCycleParticipations(this.prisma, cycle);

    if (stickyParticipationInitialization.createdCount > 0) {
      cycle = await this.loadCycleForProcessing(cycle.id);

      if (!cycle) {
        throw new NotFoundException('Cycle not found.');
      }
    }

    if (cycle.status === 'REVEAL_READY') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount: 0,
        message: 'Cycle is already prepared and waiting for reveal.',
      };
    }

    if (cycle.status === 'REVEALED') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount: 0,
        message: 'Cycle has already been revealed.',
      };
    }

    if (cycle.status !== 'OPEN') {
      throw new BadRequestException('Only open cycles can be prepared.');
    }

    if (!options.force && cycle.participationDeadline > new Date()) {
      throw new BadRequestException(
        'Participation deadline has not been reached yet.',
      );
    }

    if (!questionnaire) {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount: 0,
        message: 'Current questionnaire is not configured.',
      };
    }

    const claimUpdatedAt = new Date();
    const claimResult = await this.prisma.matchCycle.updateMany({
      where: {
        id: cycle.id,
        status: 'OPEN',
      },
      data: {
        status: 'PREPARING',
        updatedAt: claimUpdatedAt,
      },
    });

    if (claimResult.count === 0) {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount: 0,
        message: 'Cycle is already being prepared.',
      };
    }

    try {
      const optedInCount = cycle.participations.length;
      const participants = this.toEligibleParticipants(cycle.participations);
      const questionnairesByVersionId =
        await this.loadQuestionnairesByVersionId(participants, questionnaire);

      let selectedPairs: CandidatePair[] = [];
      let preparationMessage = 'Cycle is prepared and waiting for reveal.';

      if (participants.length < 2) {
        preparationMessage = `${buildInsufficientParticipantsMessage(
          optedInCount,
          participants.length,
        )} The cycle has been prepared and will reveal zero matches.`;
      } else {
        const calculatedPairs = await this.calculatePairs(
          participants,
          questionnaire.questions,
          cycle.revealAt,
          cycle.id,
          questionnairesByVersionId,
        );

        selectedPairs = calculatedPairs.selectedPairs;

        if (selectedPairs.length === 0) {
          preparationMessage =
            'No compatible pairs were found for this cycle. The cycle has been prepared and will reveal zero matches.';
        }
      }

      const unmatchedCount = participants.length - selectedPairs.length * 2;

      await this.prisma.$transaction(async (tx) => {
        const activeClaim = await tx.matchCycle.updateMany({
          where: {
            id: cycle.id,
            status: 'PREPARING',
            updatedAt: claimUpdatedAt,
          },
          data: {
            updatedAt: claimUpdatedAt,
          },
        });

        if (activeClaim.count === 0) {
          throw new PreparationClaimLostError();
        }

        for (const pair of selectedPairs) {
          await tx.match.create({
            data: {
              cycleId: cycle.id,
              score: pair.score,
              participants: {
                create: [
                  {
                    cycleId: cycle.id,
                    userId: pair.left.id,
                    position: 1,
                  },
                  {
                    cycleId: cycle.id,
                    userId: pair.right.id,
                    position: 2,
                  },
                ],
              },
            },
          });
        }

        if (selectedPairs.length === 0) {
          const finalizedCycle = await tx.matchCycle.updateMany({
            where: {
              id: cycle.id,
              status: 'PREPARING',
              updatedAt: claimUpdatedAt,
            },
            data: {
              status: 'REVEAL_READY',
            },
          });

          if (finalizedCycle.count === 0) {
            throw new PreparationClaimLostError();
          }

          await tx.auditLog.create({
            data: {
              adminActorId: options.adminActorId,
              action: 'cycle.prepared',
              metadata: {
                cycleId: cycle.id,
                createdMatches: selectedPairs.length,
                unmatchedCount,
                forced: options.force ?? false,
                message: preparationMessage,
              },
            },
          });

          return;
        }
      });

      if (selectedPairs.length === 0) {
        return {
          ok: true,
          cycleId: cycle.id,
          state: 'PREPARED',
          createdMatches: 0,
          unmatchedCount,
          message: preparationMessage,
        };
      }

      return this.finalizePreparedCycle({
        cycleId: cycle.id,
        claimUpdatedAt,
        adminActorId: options.adminActorId,
        force: options.force,
        createdMatches: selectedPairs.length,
        unmatchedCount,
        message: preparationMessage,
      });
    } catch (error) {
      await this.revertPreparationClaimIfEmpty(cycle.id, claimUpdatedAt);

      if (error instanceof PreparationClaimLostError) {
        return {
          ok: true,
          cycleId: cycle.id,
          state: 'SKIPPED',
          createdMatches: 0,
          unmatchedCount: 0,
          message: error.message,
        };
      }

      throw error;
    }
  }

  private async continuePreparingCycle(options: {
    cycleId: string;
    force?: boolean;
    adminActorId?: string;
  }): Promise<CyclePreparationResult> {
    const cycle = await this.loadCycleForProcessing(options.cycleId);

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (cycle.status === 'REVEAL_READY') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'PREPARED',
        createdMatches: await this.prisma.match.count({
          where: { cycleId: cycle.id },
        }),
        unmatchedCount: 0,
        message: 'Cycle is already prepared and waiting for reveal.',
      };
    }

    if (cycle.status !== 'PREPARING') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount: 0,
        message: 'Cycle is not in preparing state.',
      };
    }

    const totalMatchCount = await this.prisma.match.count({
      where: { cycleId: cycle.id },
    });
    const unmatchedCount = Math.max(
      0,
      cycle.participations.length - totalMatchCount * 2,
    );

    if (totalMatchCount === 0) {
      const recoveredPreparation = await this.recoverStaleEmptyPreparation(
        cycle,
        options,
        unmatchedCount,
      );

      if (recoveredPreparation) {
        return recoveredPreparation;
      }

      return {
        ok: true,
        cycleId: cycle.id,
        state: 'PENDING',
        createdMatches: 0,
        unmatchedCount,
        message: 'Cycle is still being prepared.',
      };
    }

    return this.finalizePreparedCycle({
      cycleId: cycle.id,
      claimUpdatedAt: cycle.updatedAt,
      adminActorId: options.adminActorId,
      force: options.force,
      createdMatches: totalMatchCount,
      unmatchedCount,
      message: 'Cycle is prepared and waiting for reveal.',
    });
  }

  private async revealPreparedCycle(options: {
    cycleId: string;
    force?: boolean;
    adminActorId?: string;
  }): Promise<CycleRevealResult> {
    const cycle = await this.prisma.matchCycle.findUnique({
      where: { id: options.cycleId },
      select: {
        id: true,
        revealAt: true,
        status: true,
      },
    });

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (cycle.status === 'PREPARING') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        message: 'Cycle is still being prepared.',
      };
    }

    if (cycle.status === 'OPEN') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        message: 'Cycle has not been prepared yet.',
      };
    }

    if (cycle.status === 'REVEALED') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        message: 'Cycle has already been revealed.',
      };
    }

    if (cycle.status !== 'REVEAL_READY') {
      throw new BadRequestException('Only prepared cycles can be revealed.');
    }

    if (!options.force && cycle.revealAt > new Date()) {
      throw new BadRequestException('Reveal time has not been reached yet.');
    }

    const revealedAt = new Date();
    const revealedMatchCount = await this.prisma.$transaction(async (tx) => {
      const claimedCycle = await tx.matchCycle.updateMany({
        where: {
          id: cycle.id,
          status: 'REVEAL_READY',
        },
        data: {
          status: 'REVEALED',
        },
      });

      if (claimedCycle.count === 0) {
        return null;
      }

      const revealedMatches = await tx.match.updateMany({
        where: {
          cycleId: cycle.id,
          revealedAt: null,
        },
        data: {
          revealedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          adminActorId: options.adminActorId,
          action: 'cycle.revealed',
          metadata: {
            cycleId: cycle.id,
            createdMatches: revealedMatches.count,
            forced: options.force ?? false,
          },
        },
      });

      await this.dashboardSnapshotService.syncCycleSnapshots(cycle.id, tx);

      return revealedMatches.count;
    });

    if (revealedMatchCount == null) {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        message: 'Cycle is already being revealed.',
      };
    }

    return {
      ok: true,
      cycleId: cycle.id,
      state: 'REVEALED',
      createdMatches: revealedMatchCount,
      message:
        revealedMatchCount > 0
          ? `Cycle revealed ${revealedMatchCount} prepared match(es).`
          : 'Cycle revealed with no matches.',
    };
  }

  async previewCycle(cycleId: string) {
    const [cycle, questionnaire] = await Promise.all([
      this.prisma.matchCycle.findUnique({
        where: { id: cycleId },
        include: {
          participations: {
            where: ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
            select: {
              intent: true,
              user: {
                select: {
                  id: true,
                  displayName: true,
                  questionnaireResponse: {
                    select: {
                      versionId: true,
                      answers: true,
                      submittedAt: true,
                    },
                  },
                  school: { select: { id: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.questionnaireVersion.findFirst({
        where: { isCurrent: true },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      }),
    ]);

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (!questionnaire) {
      return {
        cycleId,
        message: 'Current questionnaire is not configured.',
        candidates: [],
        suggestedPairs: [],
        unmatchedUserIds: [],
      };
    }

    const participants = this.toEligibleParticipants(cycle.participations);
    const questionnairesByVersionId = await this.loadQuestionnairesByVersionId(
      participants,
      questionnaire,
    );
    const { candidates, selectedPairs } = await this.calculatePairs(
      participants,
      questionnaire.questions,
      cycle.revealAt,
      cycle.id,
      questionnairesByVersionId,
    );
    const matchedUserIds = new Set(
      selectedPairs.flatMap((pair) => [pair.left.id, pair.right.id]),
    );

    return {
      cycleId,
      totalCandidateCount: candidates.length,
      candidates: candidates.slice(0, 20).map((pair) => ({
        leftUserId: pair.left.id,
        rightUserId: pair.right.id,
        leftDisplayName: pair.left.displayName,
        rightDisplayName: pair.right.displayName,
        score: pair.score,
      })),
      suggestedPairs: selectedPairs.map((pair) => ({
        leftUserId: pair.left.id,
        rightUserId: pair.right.id,
        leftDisplayName: pair.left.displayName,
        rightDisplayName: pair.right.displayName,
        score: pair.score,
      })),
      unmatchedUserIds: participants
        .filter((participant) => !matchedUserIds.has(participant.id))
        .map((participant) => participant.id),
    };
  }

  private createPairKey(firstUserId: string, secondUserId: string) {
    return [firstUserId, secondUserId].sort().join('::');
  }

  private buildHistoricalPairKeySet(
    matches: Array<{ participants: Array<{ userId: string }> }>,
  ) {
    return new Set(
      matches
        .map((match) => {
          const ids = match.participants.map(
            (participant) => participant.userId,
          );

          if (ids.length !== 2) {
            return null;
          }

          return this.createPairKey(ids[0], ids[1]);
        })
        .filter((value): value is string => Boolean(value)),
    );
  }

  private loadHistoricalPairKeys(
    participantIds: string[],
    currentCycleId?: string,
  ) {
    return this.prisma.match
      .findMany({
        where: {
          participants: {
            some: { userId: { in: participantIds } },
          },
          ...(currentCycleId ? { cycleId: { not: currentCycleId } } : {}),
        },
        select: {
          participants: {
            select: {
              userId: true,
            },
          },
        },
      })
      .then((matches) => this.buildHistoricalPairKeySet(matches));
  }

  private async loadUnmatchedStreaks(
    participantIds: string[],
    beforeRevealAt: Date,
    currentCycleId?: string,
  ) {
    if (participantIds.length === 0) {
      return new Map<string, number>();
    }

    const participations = await this.prisma.cycleParticipation.findMany({
      where: {
        userId: { in: participantIds },
        status: 'OPTED_IN',
        intent: { not: null },
        ...(currentCycleId ? { cycleId: { not: currentCycleId } } : {}),
        cycle: {
          status: 'REVEALED',
          revealAt: { lt: beforeRevealAt },
        },
      },
      select: {
        userId: true,
        cycleId: true,
        updatedAt: true,
        cycle: {
          select: {
            revealAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { userId: 'asc' },
        { cycle: { revealAt: 'desc' } },
        { cycle: { createdAt: 'desc' } },
        { updatedAt: 'desc' },
      ],
    });
    const cycleIds = Array.from(
      new Set(participations.map((participation) => participation.cycleId)),
    );
    const matchedParticipations =
      cycleIds.length === 0
        ? []
        : await this.prisma.matchParticipant.findMany({
            where: {
              userId: { in: participantIds },
              cycleId: { in: cycleIds },
            },
            select: {
              userId: true,
              cycleId: true,
            },
          });
    const matchedParticipationKeys = new Set(
      matchedParticipations.map(
        (participant) => `${participant.userId}::${participant.cycleId}`,
      ),
    );
    const participationsByUserId = new Map<string, typeof participations>();

    for (const participation of participations) {
      const userParticipations =
        participationsByUserId.get(participation.userId) ?? [];
      userParticipations.push(participation);
      participationsByUserId.set(participation.userId, userParticipations);
    }

    return new Map(
      participantIds.map((participantId) => {
        const userParticipations =
          participationsByUserId.get(participantId) ?? [];
        let streak = 0;

        for (const participation of userParticipations) {
          const participationKey = `${participation.userId}::${participation.cycleId}`;
          if (matchedParticipationKeys.has(participationKey)) {
            break;
          }

          streak += 1;
        }

        return [participantId, streak];
      }),
    );
  }

  private loadCycleForProcessing(cycleId: string) {
    return this.prisma.matchCycle.findUnique({
      where: { id: cycleId },
      include: CYCLE_PROCESSING_INCLUDE,
    });
  }

  private toEligibleParticipants(
    participations: Array<{
      intent: WeeklyIntent | null;
      user: {
        id: string;
        displayName: string | null;
        school?: { id: string } | null;
        questionnaireResponse: {
          versionId?: string | null;
          answers: Prisma.JsonValue;
          submittedAt: Date | null;
        } | null;
      };
    }>,
  ): EligibleParticipant[] {
    return participations
      .map((entry): EligibleParticipant | null => {
        const { user } = entry;
        if (
          !user.questionnaireResponse ||
          user.questionnaireResponse.submittedAt == null
        ) {
          return null;
        }

        // Defense in depth — the SQL filter already excludes intent=null,
        // but if anything ever bypasses it (eg. raw queries) we still drop
        // the row instead of silently treating it as compatible with all.
        if (!isWeeklyIntent(entry.intent)) {
          return null;
        }

        const answers: Record<string, unknown> = {
          ...((user.questionnaireResponse.answers ?? {}) as Record<
            string,
            unknown
          >),
          [HARD_MATCH_KEYS.school]: user.school?.id ?? '',
        };
        const hardMatchAnswers = tryReadHardMatchAnswers(answers);

        if (!hardMatchAnswers) {
          return null;
        }

        return {
          id: user.id,
          displayName: user.displayName,
          questionnaireVersionId: user.questionnaireResponse.versionId ?? null,
          hardMatchAnswers,
          answers,
          intent: entry.intent,
          introLine: hardMatchAnswers.oneLinerIntro,
        };
      })
      .filter(
        (participant): participant is EligibleParticipant =>
          participant !== null,
      );
  }

  private async loadQuestionnairesByVersionId(
    participants: EligibleParticipant[],
    currentQuestionnaire?: {
      id: string;
      questions: QuestionnaireQuestion[];
    } | null,
  ) {
    const versionIds = [
      ...new Set(
        participants
          .map((participant) => participant.questionnaireVersionId)
          .filter((versionId): versionId is string => Boolean(versionId)),
      ),
    ];
    const questionnairesByVersionId = new Map<string, PreparedQuestion[]>();

    if (currentQuestionnaire) {
      questionnairesByVersionId.set(
        currentQuestionnaire.id,
        prepareQuestions(currentQuestionnaire.questions),
      );
    }

    const missingVersionIds = versionIds.filter(
      (versionId) => !questionnairesByVersionId.has(versionId),
    );

    if (missingVersionIds.length === 0) {
      return questionnairesByVersionId;
    }

    const questionnaireVersions =
      await this.prisma.questionnaireVersion.findMany({
        where: {
          id: { in: missingVersionIds },
        },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      });

    for (const questionnaireVersion of questionnaireVersions) {
      questionnairesByVersionId.set(
        questionnaireVersion.id,
        prepareQuestions(questionnaireVersion.questions),
      );
    }

    return questionnairesByVersionId;
  }

  private async calculatePairs(
    participants: EligibleParticipant[],
    questions: QuestionnaireQuestion[],
    revealAt: Date,
    currentCycleId?: string,
    questionnairesByVersionId = new Map<string, PreparedQuestion[]>(),
  ) {
    const preparedQuestions = prepareQuestions(questions);
    const scoreBounds = this.calculateMaxMatchScoreBounds([
      preparedQuestions,
      ...questionnairesByVersionId.values(),
    ]);
    const participantIds = participants.map((participant) => participant.id);
    if (participants.length < 2) {
      return {
        candidates: [],
        selectedPairs: [],
      };
    }

    const [blocks, historicalPairKeys, unmatchedStreaks] = await Promise.all([
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: { in: participantIds } },
            { blockedId: { in: participantIds } },
          ],
        },
      }),
      this.loadHistoricalPairKeys(participantIds, currentCycleId),
      this.loadUnmatchedStreaks(participantIds, revealAt, currentCycleId),
    ]);
    const retentionWeightTiers = this.buildRetentionWeightTiers(
      participants.length,
      scoreBounds,
      unmatchedStreaks,
    );

    const blockedPairKeys = new Set(
      blocks.map((block) =>
        this.createPairKey(block.blockerId, block.blockedId),
      ),
    );

    const candidateByPairKey = new Map<string, CandidatePair>();
    const participantCount = participants.length;

    for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
      for (const rightIndex of this.buildCandidatePartnerIndexes(
        leftIndex,
        participantCount,
      )) {
        const left = participants[leftIndex];
        const right = participants[rightIndex];
        const candidateResult = this.buildCandidatePair({
          left,
          right,
          fallbackQuestions: preparedQuestions,
          questionnairesByVersionId,
          revealAt,
          scoreBounds,
          blockedPairKeys,
          historicalPairKeys,
          unmatchedStreaks,
          retentionWeightTiers,
        });
        if (
          !candidateResult ||
          candidateByPairKey.has(candidateResult.pairKey)
        ) {
          continue;
        }

        candidateByPairKey.set(
          candidateResult.pairKey,
          candidateResult.candidate,
        );
      }
    }

    const candidates = [...candidateByPairKey.values()].sort((first, second) =>
      this.compareCandidatePairs(first, second),
    );
    const selectedPairs = this.selectRetentionPriorityPairs(
      participants,
      candidates,
    );

    this.logger.log(
      `Cycle ${currentCycleId ?? 'preview'} matching considered ${participants.length} participant(s), kept ${candidates.length} candidate pair(s), selected ${selectedPairs.length} pair(s).`,
    );

    return {
      candidates,
      selectedPairs,
    };
  }

  private buildCandidatePair(input: {
    left: EligibleParticipant;
    right: EligibleParticipant;
    fallbackQuestions: PreparedQuestion[];
    questionnairesByVersionId: Map<string, PreparedQuestion[]>;
    revealAt: Date;
    scoreBounds: MatchScoreBounds;
    blockedPairKeys: Set<string>;
    historicalPairKeys: Set<string>;
    unmatchedStreaks: Map<string, number>;
    retentionWeightTiers: RetentionWeightTiers;
  }): { pairKey: string; candidate: CandidatePair } | null {
    const pairKey = this.createPairKey(input.left.id, input.right.id);

    if (
      input.blockedPairKeys.has(pairKey) ||
      input.historicalPairKeys.has(pairKey)
    ) {
      return null;
    }

    const pairQuestionSet = this.buildPairQuestionSet(
      input.left,
      input.right,
      input.fallbackQuestions,
      input.questionnairesByVersionId,
    );
    const scored = this.calculatePairRawScore(
      input.left,
      input.right,
      input.fallbackQuestions,
      input.revealAt,
      input.scoreBounds,
      pairQuestionSet,
    );
    if (!scored) {
      return null;
    }
    const score = this.normalizeMatchScore(scored.rawScore, scored.scoreBounds);

    const leftUnmatchedStreak = input.unmatchedStreaks.get(input.left.id) ?? 0;
    const rightUnmatchedStreak =
      input.unmatchedStreaks.get(input.right.id) ?? 0;

    return {
      pairKey,
      candidate: {
        left: input.left,
        right: input.right,
        rawScore: scored.rawScore,
        score,
        matchingWeight: this.calculateRetentionMatchingWeight({
          rawScore: scored.rawScore,
          leftUnmatchedStreak,
          rightUnmatchedStreak,
          tiers: input.retentionWeightTiers,
        }),
      },
    };
  }

  private buildCandidatePartnerIndexes(
    leftIndex: number,
    participantCount: number,
  ) {
    const indexes: number[] = [];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < participantCount;
      rightIndex += 1
    ) {
      indexes.push(rightIndex);
    }

    return indexes;
  }

  private compareCandidatePairs(first: CandidatePair, second: CandidatePair) {
    if (second.score !== first.score) {
      return second.score - first.score;
    }

    if (second.rawScore !== first.rawScore) {
      return second.rawScore - first.rawScore;
    }

    return this.createPairKey(first.left.id, first.right.id).localeCompare(
      this.createPairKey(second.left.id, second.right.id),
    );
  }

  private buildRetentionWeightTiers(
    participantCount: number,
    scoreBounds: MatchScoreBounds,
    unmatchedStreaks: Map<string, number>,
  ): RetentionWeightTiers {
    const maxPairCount = Math.max(1, Math.floor(participantCount / 2));
    const maxPrePriorityBonusTotal =
      maxPairCount *
      2 *
      (PRIORITY_UNMATCHED_STREAK_THRESHOLD - 1) *
      PRE_PRIORITY_UNMATCHED_STREAK_BONUS;
    const maxCompatibilityTotal =
      maxPairCount *
        Math.max(1, Math.ceil(scoreBounds.max), NORMALIZED_SCORE_MAX) +
      maxPrePriorityBonusTotal;
    const matchedUser = maxCompatibilityTotal + 1;
    const maxMatchedUserTotal = maxPairCount * 2 * matchedUser;
    const priorityStreak = maxMatchedUserTotal + maxCompatibilityTotal + 1;
    const maxPriorityStreak = Math.max(
      0,
      ...[...unmatchedStreaks.values()].filter(
        (streak) => streak >= PRIORITY_UNMATCHED_STREAK_THRESHOLD,
      ),
    );
    const maxPriorityStreakTotal =
      maxPairCount * 2 * maxPriorityStreak * priorityStreak;
    const priorityUser =
      maxPriorityStreakTotal + maxMatchedUserTotal + maxCompatibilityTotal + 1;

    return {
      priorityUser,
      priorityStreak,
      matchedUser,
    };
  }

  private calculateRetentionMatchingWeight(input: {
    rawScore: number;
    leftUnmatchedStreak: number;
    rightUnmatchedStreak: number;
    tiers: RetentionWeightTiers;
  }) {
    const leftPriorityStreak = this.toPriorityStreak(input.leftUnmatchedStreak);
    const rightPriorityStreak = this.toPriorityStreak(
      input.rightUnmatchedStreak,
    );
    const priorityUserCount =
      (leftPriorityStreak > 0 ? 1 : 0) + (rightPriorityStreak > 0 ? 1 : 0);
    const priorityStreakTotal = leftPriorityStreak + rightPriorityStreak;
    const regularStreakTotal =
      this.toRegularStreak(input.leftUnmatchedStreak) +
      this.toRegularStreak(input.rightUnmatchedStreak);

    return (
      priorityUserCount * input.tiers.priorityUser +
      priorityStreakTotal * input.tiers.priorityStreak +
      2 * input.tiers.matchedUser +
      regularStreakTotal * PRE_PRIORITY_UNMATCHED_STREAK_BONUS +
      input.rawScore
    );
  }

  private toPriorityStreak(unmatchedStreak: number) {
    return unmatchedStreak >= PRIORITY_UNMATCHED_STREAK_THRESHOLD
      ? unmatchedStreak
      : 0;
  }

  private toRegularStreak(unmatchedStreak: number) {
    return unmatchedStreak < PRIORITY_UNMATCHED_STREAK_THRESHOLD
      ? unmatchedStreak
      : 0;
  }

  private resolveParticipantQuestions(
    participant: EligibleParticipant,
    fallbackQuestions: PreparedQuestion[],
    questionnairesByVersionId: Map<string, PreparedQuestion[]> = new Map(),
  ) {
    if (!participant.questionnaireVersionId) {
      return fallbackQuestions;
    }

    return (
      questionnairesByVersionId.get(participant.questionnaireVersionId) ??
      fallbackQuestions
    );
  }

  private buildPairQuestionSet(
    left: EligibleParticipant,
    right: EligibleParticipant,
    fallbackQuestions: PreparedQuestion[],
    questionnairesByVersionId: Map<string, PreparedQuestion[]> = new Map(),
  ): PairQuestionSet {
    const leftQuestions = this.resolveParticipantQuestions(
      left,
      fallbackQuestions,
      questionnairesByVersionId,
    );
    const rightQuestions = this.resolveParticipantQuestions(
      right,
      fallbackQuestions,
      questionnairesByVersionId,
    );
    const rightQuestionsByKey = new Map(
      rightQuestions.map((question) => [question.key, question]),
    );

    const comparableQuestions = leftQuestions
      .map((leftQuestion, order): ComparableQuestion | null => {
        const rightQuestion = rightQuestionsByKey.get(leftQuestion.key);

        if (!rightQuestion || leftQuestion.type !== rightQuestion.type) {
          return null;
        }

        return {
          key: leftQuestion.key,
          order,
          type: leftQuestion.type,
          weight: (leftQuestion.weight + rightQuestion.weight) / 2,
          leftQuestion,
          rightQuestion,
        };
      })
      .filter((question): question is ComparableQuestion => question !== null);

    return {
      leftQuestions,
      rightQuestions,
      comparableQuestions,
    };
  }

  private calculateLooksPreferenceSimilarity(
    left: HardMatchAnswers,
    right: HardMatchAnswers,
  ) {
    const leftAcceptsRight = this.looksPreferenceIncludes(
      left.partnerLooks,
      right.looks,
    );
    const rightAcceptsLeft = this.looksPreferenceIncludes(
      right.partnerLooks,
      left.looks,
    );

    return (leftAcceptsRight + rightAcceptsLeft) / 2;
  }

  private looksPreferenceIncludes(
    selectedLooks: readonly string[],
    candidateLooks: string,
  ) {
    if (selectedLooks.length === 0) {
      return 0;
    }

    if (selectedLooks.length === HARD_MATCH_LOOKS.length) {
      return 1;
    }

    return selectedLooks.includes(candidateLooks) ? 1 : 0;
  }

  private calculateAgePreferenceSimilarity(
    left: HardMatchAnswers,
    right: HardMatchAnswers,
    revealAt: Date,
  ) {
    const leftAge = calculateAgeOnDate(left.birthDate, revealAt);
    const rightAge = calculateAgeOnDate(right.birthDate, revealAt);
    const leftFit = this.agePreferenceFit(
      rightAge,
      left.partnerAgeMin,
      left.partnerAgeMax,
    );
    const rightFit = this.agePreferenceFit(
      leftAge,
      right.partnerAgeMin,
      right.partnerAgeMax,
    );

    return (leftFit + rightFit) / 2;
  }

  private agePreferenceFit(
    candidateAge: number,
    partnerAgeMin: number,
    partnerAgeMax: number,
  ) {
    if (candidateAge >= partnerAgeMin && candidateAge <= partnerAgeMax) {
      return 1;
    }

    const yearsOutside =
      candidateAge < partnerAgeMin
        ? partnerAgeMin - candidateAge
        : candidateAge - partnerAgeMax;
    return Math.max(0, 1 - AGE_PREFERENCE_DECAY_PER_YEAR * yearsOutside);
  }

  private calculateScaleAnswerSimilarity(
    leftQuestion: PreparedQuestion,
    leftAnswer: string,
    rightQuestion: PreparedQuestion,
    rightAnswer: string,
  ) {
    if (leftAnswer === rightAnswer) {
      return 1;
    }

    const leftPosition = this.getScaleAnswerPosition(leftQuestion, leftAnswer);
    const rightPosition = this.getScaleAnswerPosition(
      rightQuestion,
      rightAnswer,
    );

    if (leftPosition == null || rightPosition == null) {
      return 0;
    }

    return Math.max(0, 1 - Math.abs(leftPosition - rightPosition));
  }

  private getScaleAnswerPosition(question: PreparedQuestion, answer: string) {
    const optionIndex = question.normalizedOptions.findIndex(
      (option) => option.value === answer,
    );

    if (optionIndex < 0 || question.normalizedOptions.length < 2) {
      return null;
    }

    return optionIndex / (question.normalizedOptions.length - 1);
  }

  private calculatePairRawScore(
    left: EligibleParticipant,
    right: EligibleParticipant,
    questions: MatchQuestion[],
    revealAt: Date,
    scoreBounds?: MatchScoreBounds,
    pairQuestionSet?: PairQuestionSet,
  ) {
    const fallbackQuestions = prepareQuestions(questions);
    const resolvedQuestionSet =
      pairQuestionSet ??
      this.buildPairQuestionSet(left, right, fallbackQuestions);
    const resolvedScoreBounds =
      scoreBounds ??
      this.calculateMatchScoreBounds(resolvedQuestionSet.comparableQuestions);

    // Weekly-intent compatibility (FRIEND/DATE/BOTH) is a hard cycle-level
    // constraint, evaluated alongside the long-lived hard-match answers.
    if (!areWeeklyIntentsCompatible(left.intent, right.intent)) {
      return null;
    }

    if (
      !areHardMatchAnswersCompatible(
        left.hardMatchAnswers,
        right.hardMatchAnswers,
      )
    ) {
      return null;
    }

    let rawScore = BASE_MATCH_SCORE;

    rawScore +=
      this.calculateLooksPreferenceSimilarity(
        left.hardMatchAnswers,
        right.hardMatchAnswers,
      ) * LOOKS_PREFERENCE_SOFT_BONUS;

    rawScore +=
      this.calculateAgePreferenceSimilarity(
        left.hardMatchAnswers,
        right.hardMatchAnswers,
        revealAt,
      ) * AGE_PREFERENCE_SOFT_BONUS;

    for (const question of resolvedQuestionSet.comparableQuestions) {
      const leftAnswer = normalizePreparedQuestionAnswer(
        question.leftQuestion,
        left.answers[question.key],
        { invalidAsNull: true },
      );
      const rightAnswer = normalizePreparedQuestionAnswer(
        question.rightQuestion,
        right.answers[question.key],
        { invalidAsNull: true },
      );
      const weight = question.weight;

      if (leftAnswer == null || rightAnswer == null) {
        continue;
      }

      if (
        question.type === QuestionType.SINGLE_SELECT &&
        leftAnswer === rightAnswer
      ) {
        rawScore += weight * SINGLE_SELECT_MATCH_BONUS;
      }

      if (
        question.type === QuestionType.SCALE &&
        typeof leftAnswer === 'string' &&
        typeof rightAnswer === 'string'
      ) {
        const similarity = this.calculateScaleAnswerSimilarity(
          question.leftQuestion,
          leftAnswer,
          question.rightQuestion,
          rightAnswer,
        );

        if (similarity > 0) {
          rawScore += weight * SINGLE_SELECT_MATCH_BONUS * similarity;
        }
      }

      if (question.type === QuestionType.MULTI_SELECT) {
        const leftOptions = Array.isArray(leftAnswer) ? leftAnswer : [];
        const rightOptions = Array.isArray(rightAnswer) ? rightAnswer : [];
        const overlap = leftOptions.filter((value) =>
          rightOptions.includes(value),
        );
        const union = [...new Set([...leftOptions, ...rightOptions])];

        if (overlap.length > 0) {
          rawScore +=
            (overlap.length / union.length) *
            weight *
            MULTI_SELECT_OVERLAP_BONUS;
        }
      }
    }

    return {
      rawScore,
      scoreBounds: resolvedScoreBounds,
    };
  }

  private selectRetentionPriorityPairs(
    participants: EligibleParticipant[],
    candidates: CandidatePair[],
  ) {
    if (candidates.length === 0) {
      return [];
    }

    const participantIndexById = new Map(
      participants.map((participant, index) => [participant.id, index]),
    );
    const candidateByVertexPair = new Map<string, CandidatePair>();
    const edges: [number, number, number][] = [];

    for (const candidate of candidates) {
      const leftIndex = participantIndexById.get(candidate.left.id);
      const rightIndex = participantIndexById.get(candidate.right.id);
      if (leftIndex == null || rightIndex == null) continue;

      const [firstIndex, secondIndex] =
        leftIndex < rightIndex
          ? [leftIndex, rightIndex]
          : [rightIndex, leftIndex];
      const vertexPairKey = `${firstIndex}::${secondIndex}`;

      candidateByVertexPair.set(vertexPairKey, candidate);
      edges.push([firstIndex, secondIndex, candidate.matchingWeight]);
    }

    const matchedVertices = blossom(edges);
    return matchedVertices
      .map((rightIndex, leftIndex) => {
        if (rightIndex <= leftIndex) {
          return null;
        }

        return candidateByVertexPair.get(`${leftIndex}::${rightIndex}`) ?? null;
      })
      .filter((candidate): candidate is CandidatePair => candidate !== null)
      .sort((first, second) => this.compareCandidatePairs(first, second));
  }

  private calculateMaxMatchScoreBounds(
    questionSets: Array<Array<{ type: QuestionType; weight: number }>>,
  ): MatchScoreBounds {
    return questionSets
      .map((questions) => this.calculateMatchScoreBounds(questions))
      .reduce(
        (bounds, currentBounds) => ({
          min: Math.min(bounds.min, currentBounds.min),
          max: Math.max(bounds.max, currentBounds.max),
        }),
        {
          min: BASE_MATCH_SCORE,
          max:
            BASE_MATCH_SCORE +
            LOOKS_PREFERENCE_SOFT_BONUS +
            AGE_PREFERENCE_SOFT_BONUS,
        },
      );
  }

  private calculateMatchScoreBounds(
    questions: Array<{ type: QuestionType; weight: number }>,
  ): MatchScoreBounds {
    let max =
      BASE_MATCH_SCORE +
      LOOKS_PREFERENCE_SOFT_BONUS +
      AGE_PREFERENCE_SOFT_BONUS;

    for (const question of questions) {
      if (
        question.type === QuestionType.SINGLE_SELECT ||
        question.type === QuestionType.SCALE
      ) {
        max += question.weight * SINGLE_SELECT_MATCH_BONUS;
        continue;
      }

      if (question.type === QuestionType.MULTI_SELECT) {
        max += question.weight * MULTI_SELECT_OVERLAP_BONUS;
      }
    }

    return {
      min: BASE_MATCH_SCORE,
      max,
    };
  }

  private normalizeMatchScore(rawScore: number, scoreBounds: MatchScoreBounds) {
    if (scoreBounds.max < scoreBounds.min) {
      throw new BadRequestException(
        'Match score bounds are invalid for the current questionnaire.',
      );
    }

    if (scoreBounds.max === scoreBounds.min) {
      return NORMALIZED_SCORE_MAX;
    }

    const ratio =
      (rawScore - scoreBounds.min) / (scoreBounds.max - scoreBounds.min);
    const normalizedScore =
      NORMALIZED_SCORE_MIN +
      ratio * (NORMALIZED_SCORE_MAX - NORMALIZED_SCORE_MIN);

    return Math.round(normalizedScore * 10) / 10;
  }

  private async resetCycleForForcedRerun(cycleId: string) {
    await this.prisma.$transaction([
      this.prisma.match.deleteMany({
        where: { cycleId },
      }),
      this.prisma.userCycleDashboardSnapshot.deleteMany({
        where: { cycleId },
      }),
      this.prisma.matchCycle.update({
        where: { id: cycleId },
        data: { status: 'OPEN' },
      }),
    ]);
  }

  private async revertPreparationClaimIfEmpty(
    cycleId: string,
    claimUpdatedAt?: Date,
  ) {
    await this.prisma.matchCycle.updateMany({
      where: {
        id: cycleId,
        status: 'PREPARING',
        matches: { none: {} },
        ...(claimUpdatedAt ? { updatedAt: claimUpdatedAt } : {}),
      },
      data: {
        status: 'OPEN',
      },
    });
  }

  private async recoverStaleEmptyPreparation(
    cycle: {
      id: string;
      participationDeadline: Date;
      updatedAt: Date;
    },
    options: {
      cycleId: string;
      force?: boolean;
      adminActorId?: string;
    },
    unmatchedCount: number,
  ): Promise<CyclePreparationResult | null> {
    if (!this.isStalePreparationClaim(cycle.updatedAt)) {
      return null;
    }

    const recoveredCycle = await this.prisma.matchCycle.updateMany({
      where: {
        id: cycle.id,
        status: 'PREPARING',
        updatedAt: cycle.updatedAt,
      },
      data: {
        status: 'OPEN',
      },
    });

    if (recoveredCycle.count === 0) {
      return null;
    }

    if (!options.force && cycle.participationDeadline > new Date()) {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount,
        message:
          'Stale empty preparation was reset; participation deadline has not been reached yet.',
      };
    }

    return this.prepareCycle({
      cycleId: cycle.id,
      force: options.force,
      adminActorId: options.adminActorId,
    });
  }

  private isStalePreparationClaim(updatedAt: Date) {
    return (
      Date.now() - updatedAt.getTime() >= PREPARATION_RECOVERY_THRESHOLD_MS
    );
  }

  private async finalizePreparedCycle(options: {
    cycleId: string;
    claimUpdatedAt?: Date;
    adminActorId?: string;
    force?: boolean;
    createdMatches: number;
    unmatchedCount: number;
    message: string;
  }): Promise<CyclePreparationResult> {
    const finalized = await this.prisma.$transaction(async (tx) => {
      const claimedCycle = await tx.matchCycle.updateMany({
        where: {
          id: options.cycleId,
          status: 'PREPARING',
          ...(options.claimUpdatedAt
            ? { updatedAt: options.claimUpdatedAt }
            : {}),
        },
        data: {
          status: 'REVEAL_READY',
        },
      });

      if (claimedCycle.count === 0) {
        return false;
      }

      await tx.auditLog.create({
        data: {
          adminActorId: options.adminActorId,
          action: 'cycle.prepared',
          metadata: {
            cycleId: options.cycleId,
            createdMatches: options.createdMatches,
            unmatchedCount: options.unmatchedCount,
            forced: options.force ?? false,
            message: options.message,
          },
        },
      });

      return true;
    });

    return {
      ok: true,
      cycleId: options.cycleId,
      state: 'PREPARED',
      createdMatches: options.createdMatches,
      unmatchedCount: options.unmatchedCount,
      message: finalized
        ? options.message
        : 'Cycle is already prepared and waiting for reveal.',
    };
  }

  private logAutomationError(
    stage: 'prepare' | 'reveal',
    cycleId: string,
    error: unknown,
  ) {
    const message =
      error instanceof Error ? error.message : 'Unknown automation error.';
    this.logger.error(
      `Cycle automation ${stage} failed for cycle ${cycleId}. ${message}`,
    );
  }
}

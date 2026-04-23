import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import blossom from 'edmonds-blossom-fixed';
import { Prisma, QuestionType } from '@prisma/client';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ensureStickyCycleParticipations } from '../../common/participation/sticky-cycle-participation';
import {
  HARD_MATCH_KEYS,
  HardMatchAnswers,
  areHardMatchAnswersCompatible,
  isHardMatchKey,
  tryReadHardMatchAnswers,
} from '../questionnaire/hard-match';
import {
  areWeeklyIntentsCompatible,
  isWeeklyIntent,
  type WeeklyIntent,
} from '@lilink/shared';
import {
  type QuestionOption,
  type QuestionReasonRule,
  labelForQuestionValue,
  normalizeQuestionAnswer,
  normalizeQuestionOptions,
  normalizeQuestionReasonRules,
  resolveQuestionOptionValue,
  renderReasonTemplate,
} from '../questionnaire/questionnaire-config';
import {
  MatchNarrativeService,
  type MatchNarrativeInput,
  type MatchNarrativeQuestionAnswer,
  type MatchNarrativeResult,
  type MatchNarrativeSignal,
} from './match-narrative.service';

const BASE_MATCH_SCORE = 48;
const SINGLE_SELECT_MATCH_BONUS = 6;
const MULTI_SELECT_OVERLAP_BONUS = 3;
const MAX_MATCH_REASONS = 3;
const MATCH_NARRATIVE_MAX_CONCURRENCY = 3;
const MATCH_NARRATIVE_DEFAULT_AFTER_MS = 60 * 60 * 1000;
const PREPARATION_RECOVERY_THRESHOLD_MS = 10 * 60 * 1000;
const NORMALIZED_SCORE_MIN = 70;
const NORMALIZED_SCORE_MAX = 100;
type DashboardSnapshotPort = Pick<
  DashboardSnapshotService,
  'syncCycleSnapshots'
>;

const defaultDashboardSnapshotPort: DashboardSnapshotPort = {
  syncCycleSnapshots() {
    return Promise.resolve();
  },
};

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
          questionnaireResponse: true,
          school: { select: { id: true } },
        },
      },
    },
  },
} satisfies Prisma.MatchCycleInclude;

type EligibleParticipant = {
  id: string;
  displayName: string | null;
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
  reasons: string[];
  sharedSignals: MatchNarrativeSignal[];
};

type QuestionnaireQuestion = {
  key: string;
  prompt: string;
  description?: string | null;
  type: QuestionType;
  weight: number;
  selectionLimit?: number | null;
  options: Prisma.JsonValue | null;
  reasonRules: Prisma.JsonValue | null;
};

type PreparedQuestion = Omit<
  QuestionnaireQuestion,
  'options' | 'reasonRules'
> & {
  normalizedOptions: QuestionOption[];
  normalizedReasonRules: QuestionReasonRule[];
};

type MatchQuestion = QuestionnaireQuestion | PreparedQuestion;

type RunRevealCycleOptions = {
  force?: boolean;
  cycleId?: string;
  adminActorId?: string;
};

type MatchScoreBounds = {
  min: number;
  max: number;
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

type NarrativePersistenceMatch = {
  id: string;
  score: number;
  reasons: Prisma.JsonValue;
  createdAt: Date;
  participants: Array<{
    userId: string;
    position: number;
  }>;
};

type NarrativeAttemptResult = {
  matchId: string;
  narrative: MatchNarrativeResult | null;
};

class PreparationClaimLostError extends Error {
  constructor() {
    super('Cycle state changed before preparation finished.');
  }
}

/**
 * Blossom maximizes the sum of edge weights. To maximize matching cardinality
 * first and total raw score second, shift each edge by a prefix derived from
 * score bounds so that one extra matched pair always outweighs any raw-score
 * tradeoff among feasible matchings.
 */
function lexicographicMatchingEdgeWeight(
  rawScore: number,
  participantCount: number,
  scoreBounds: MatchScoreBounds,
): number {
  const maxPairs = Math.floor(participantCount / 2);
  if (maxPairs <= 0) {
    return rawScore;
  }

  let lexPrefix =
    (maxPairs - 1) * scoreBounds.max - maxPairs * scoreBounds.min + 1;

  if (lexPrefix < 1) {
    lexPrefix = maxPairs * scoreBounds.max + 1;
  }

  return lexPrefix + rawScore;
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
  return 'normalizedOptions' in question && 'normalizedReasonRules' in question;
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
    normalizedReasonRules: normalizeQuestionReasonRules(question.reasonRules),
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
    reasonRules: question.normalizedReasonRules,
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
  private readonly dashboardSnapshotService: DashboardSnapshotPort;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly matchNarrativeService: MatchNarrativeService = new MatchNarrativeService(),
    @Optional() dashboardSnapshotService?: DashboardSnapshotService,
  ) {
    this.dashboardSnapshotService =
      dashboardSnapshotService ?? defaultDashboardSnapshotPort;
  }

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

    const claimResult = await this.prisma.matchCycle.updateMany({
      where: {
        id: cycle.id,
        status: 'OPEN',
      },
      data: {
        status: 'PREPARING',
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

    const optedInCount = cycle.participations.length;
    const participants = this.toEligibleParticipants(cycle.participations);
    const preparedQuestions = prepareQuestions(questionnaire.questions);

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
      );

      selectedPairs = calculatedPairs.selectedPairs;

      if (selectedPairs.length === 0) {
        preparationMessage =
          'No compatible pairs were found for this cycle. The cycle has been prepared and will reveal zero matches.';
      }
    }

    const unmatchedCount = participants.length - selectedPairs.length * 2;

    try {
      const resolvedNarratives = await this.generateNarrativesForPairs(
        selectedPairs,
        preparedQuestions,
      );
      const pendingNarrativeCount = resolvedNarratives.filter(
        (narrative) => narrative == null,
      ).length;

      await this.prisma.$transaction(async (tx) => {
        for (const [pairIndex, pair] of selectedPairs.entries()) {
          const narrative = resolvedNarratives[pairIndex];

          await tx.match.create({
            data: {
              cycleId: cycle.id,
              score: pair.score,
              reasons: pair.reasons,
              reason: narrative?.reason ?? null,
              conversationTopics: narrative?.conversationTopics ?? null,
              narrativeSource: narrative?.source ?? null,
              revealedAt: null,
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

        if (pendingNarrativeCount === 0) {
          const finalizedCycle = await tx.matchCycle.updateMany({
            where: {
              id: cycle.id,
              status: 'PREPARING',
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

        await tx.auditLog.create({
          data: {
            adminActorId: options.adminActorId,
            action: 'cycle.preparing',
            metadata: {
              cycleId: cycle.id,
              createdMatches: selectedPairs.length,
              unmatchedCount,
              pendingNarrativeCount,
              forced: options.force ?? false,
              message:
                'Cycle created matches and is waiting for pending narratives.',
            },
          },
        });

        await this.dashboardSnapshotService.syncCycleSnapshots(cycle.id, tx);
      });

      if (pendingNarrativeCount > 0) {
        return {
          ok: true,
          cycleId: cycle.id,
          state: 'PENDING',
          createdMatches: selectedPairs.length,
          unmatchedCount,
          message: `Cycle created ${selectedPairs.length} match(es) and is still generating ${pendingNarrativeCount} narrative(s).`,
        };
      }
    } catch (error) {
      await this.revertPreparationClaimIfEmpty(cycle.id);

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

    return {
      ok: true,
      cycleId: cycle.id,
      state: 'PREPARED',
      createdMatches: selectedPairs.length,
      unmatchedCount,
      message: preparationMessage,
    };
  }

  private async continuePreparingCycle(options: {
    cycleId: string;
    force?: boolean;
    adminActorId?: string;
  }): Promise<CyclePreparationResult> {
    const [cycle, questionnaire] = await Promise.all([
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

    const [pendingMatches, totalMatchCount] = await Promise.all([
      this.loadPendingNarrativeMatches(cycle.id),
      this.prisma.match.count({
        where: { cycleId: cycle.id },
      }),
    ]);
    const unmatchedCount = Math.max(
      0,
      cycle.participations.length - totalMatchCount * 2,
    );

    if (pendingMatches.length === 0) {
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
        adminActorId: options.adminActorId,
        force: options.force,
        createdMatches: totalMatchCount,
        unmatchedCount,
        message: 'Cycle is prepared and waiting for reveal.',
      });
    }

    const preparedQuestions = questionnaire
      ? prepareQuestions(questionnaire.questions)
      : [];
    const participantsById = new Map(
      this.toEligibleParticipants(cycle.participations).map((participant) => [
        participant.id,
        participant,
      ]),
    );
    const resolvedNarratives = await this.resolvePendingNarrativesForMatches(
      pendingMatches,
      participantsById,
      preparedQuestions,
      cycle.revealAt,
    );
    const completedNarratives = resolvedNarratives.filter(
      (entry): entry is { matchId: string; narrative: MatchNarrativeResult } =>
        entry.narrative != null,
    );

    if (completedNarratives.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const entry of completedNarratives) {
          await tx.match.updateMany({
            where: {
              id: entry.matchId,
              OR: [
                { reason: null },
                { conversationTopics: { equals: Prisma.AnyNull } },
                { narrativeSource: null },
              ],
            },
            data: {
              reason: entry.narrative.reason,
              conversationTopics: entry.narrative.conversationTopics,
              narrativeSource: entry.narrative.source,
            },
          });
        }
      });
    }

    const remainingPendingCount = await this.countPendingNarratives(cycle.id);

    if (remainingPendingCount === 0) {
      return this.finalizePreparedCycle({
        cycleId: cycle.id,
        adminActorId: options.adminActorId,
        force: options.force,
        createdMatches: totalMatchCount,
        unmatchedCount,
        message: 'Cycle is prepared and waiting for reveal.',
      });
    }

    return {
      ok: true,
      cycleId: cycle.id,
      state: 'PENDING',
      createdMatches: totalMatchCount,
      unmatchedCount,
      message: `Cycle still has ${remainingPendingCount} pending narrative(s).`,
    };
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

  private async generateNarrativesForPairs(
    selectedPairs: CandidatePair[],
    preparedQuestions: PreparedQuestion[],
  ) {
    return this.mapWithNarrativeConcurrency(
      selectedPairs,
      async (pair, pairIndex) => {
        try {
          return await this.matchNarrativeService.generateNarrative(
            this.buildNarrativeInput(pair, preparedQuestions),
          );
        } catch (error) {
          this.logger.warn(
            this.buildNarrativeErrorMessage(
              'pair_generation',
              `${pair.left.id}::${pair.right.id}`,
              pairIndex,
              error,
            ),
          );
          return this.matchNarrativeService.buildDefaultNarrative();
        }
      },
    );
  }

  private async resolvePendingNarrativesForMatches(
    pendingMatches: NarrativePersistenceMatch[],
    participantsById: Map<string, EligibleParticipant>,
    preparedQuestions: PreparedQuestion[],
    revealAt: Date,
  ) {
    return this.mapWithNarrativeConcurrency(
      pendingMatches,
      async (pendingMatch, matchIndex) => {
        if (this.hasNarrativeTimedOut(pendingMatch.createdAt)) {
          return {
            matchId: pendingMatch.id,
            narrative: this.matchNarrativeService.buildDefaultNarrative(),
          } satisfies NarrativeAttemptResult;
        }

        const narrativeInput = this.buildNarrativeInputForStoredMatch(
          pendingMatch,
          participantsById,
          preparedQuestions,
          revealAt,
        );

        if (!narrativeInput) {
          this.logger.warn(
            `Narrative retry skipped for match ${pendingMatch.id} because the stored participants are no longer eligible.`,
          );
          return {
            matchId: pendingMatch.id,
            narrative: this.matchNarrativeService.buildDefaultNarrative(),
          } satisfies NarrativeAttemptResult;
        }

        try {
          return {
            matchId: pendingMatch.id,
            narrative:
              await this.matchNarrativeService.generateNarrative(
                narrativeInput,
              ),
          } satisfies NarrativeAttemptResult;
        } catch (error) {
          this.logger.warn(
            this.buildNarrativeErrorMessage(
              'match_retry',
              pendingMatch.id,
              matchIndex,
              error,
            ),
          );
          return {
            matchId: pendingMatch.id,
            narrative: this.matchNarrativeService.buildDefaultNarrative(),
          } satisfies NarrativeAttemptResult;
        }
      },
    );
  }

  private async mapWithNarrativeConcurrency<Item, Result>(
    items: Item[],
    handler: (item: Item, index: number) => Promise<Result>,
  ): Promise<Result[]> {
    if (items.length === 0) {
      return [];
    }

    const results = Array<Result>(items.length);
    const completed = Array<boolean>(items.length).fill(false);
    const workerCount = Math.min(MATCH_NARRATIVE_MAX_CONCURRENCY, items.length);
    let nextItemIndex = 0;

    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentItemIndex = nextItemIndex;
        nextItemIndex += 1;

        if (currentItemIndex >= items.length) {
          return;
        }

        results[currentItemIndex] = await handler(
          items[currentItemIndex],
          currentItemIndex,
        );
        completed[currentItemIndex] = true;
      }
    });

    await Promise.all(workers);

    return results.map((result, index) => {
      if (!completed[index]) {
        throw new BadRequestException(
          'Concurrent narrative processing completed with missing results.',
        );
      }

      return result;
    });
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
                  questionnaireResponse: true,
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
    const { candidates, selectedPairs } = await this.calculatePairs(
      participants,
      questionnaire.questions,
      cycle.revealAt,
      cycle.id,
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
        reasons: pair.reasons,
      })),
      suggestedPairs: selectedPairs.map((pair) => ({
        leftUserId: pair.left.id,
        rightUserId: pair.right.id,
        leftDisplayName: pair.left.displayName,
        rightDisplayName: pair.right.displayName,
        score: pair.score,
        reasons: pair.reasons,
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

  private async calculatePairs(
    participants: EligibleParticipant[],
    questions: QuestionnaireQuestion[],
    revealAt: Date,
    currentCycleId?: string,
  ) {
    const preparedQuestions = prepareQuestions(questions);
    const scoreBounds = this.calculateMatchScoreBounds(preparedQuestions);
    const participantIds = participants.map((participant) => participant.id);

    const [blocks, historicalPairKeys] = await Promise.all([
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: { in: participantIds } },
            { blockedId: { in: participantIds } },
          ],
        },
      }),
      this.loadHistoricalPairKeys(participantIds, currentCycleId),
    ]);

    const blockedPairKeys = new Set(
      blocks.map((block) =>
        this.createPairKey(block.blockerId, block.blockedId),
      ),
    );

    const candidates: CandidatePair[] = [];

    for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < participants.length;
        rightIndex += 1
      ) {
        const left = participants[leftIndex];
        const right = participants[rightIndex];
        const pairKey = this.createPairKey(left.id, right.id);

        if (blockedPairKeys.has(pairKey) || historicalPairKeys.has(pairKey)) {
          continue;
        }

        const scored = this.scorePair(
          left,
          right,
          preparedQuestions,
          revealAt,
          scoreBounds,
        );
        if (!scored) {
          continue;
        }

        candidates.push({
          left,
          right,
          rawScore: scored.rawScore,
          score: scored.score,
          reasons: scored.reasons,
          sharedSignals: scored.sharedSignals,
        });
      }
    }

    candidates.sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return this.createPairKey(first.left.id, first.right.id).localeCompare(
        this.createPairKey(second.left.id, second.right.id),
      );
    });
    const selectedPairs = this.selectOptimalDisjointPairs(
      candidates,
      participants,
      scoreBounds,
    );

    return {
      candidates,
      selectedPairs,
    };
  }

  private scorePair(
    left: EligibleParticipant,
    right: EligibleParticipant,
    questions: MatchQuestion[],
    revealAt: Date,
    scoreBounds = this.calculateMatchScoreBounds(prepareQuestions(questions)),
  ) {
    const preparedQuestions = prepareQuestions(questions);

    // Weekly-intent compatibility (FRIEND/DATE/BOTH) is a hard cycle-level
    // constraint, evaluated alongside the long-lived hard-match answers.
    if (!areWeeklyIntentsCompatible(left.intent, right.intent)) {
      return null;
    }

    if (
      !areHardMatchAnswersCompatible(
        left.hardMatchAnswers,
        right.hardMatchAnswers,
        revealAt,
      )
    ) {
      return null;
    }

    let rawScore = BASE_MATCH_SCORE;
    const reasons: Array<{ text: string; priority: number; order: number }> =
      [];
    const sharedSignals: MatchNarrativeSignal[] = [];

    for (const [order, question] of preparedQuestions.entries()) {
      const leftAnswer = normalizePreparedQuestionAnswer(
        question,
        left.answers[question.key],
        { invalidAsNull: true },
      );
      const rightAnswer = normalizePreparedQuestionAnswer(
        question,
        right.answers[question.key],
        { invalidAsNull: true },
      );
      const weight = question.weight;

      if (leftAnswer == null || rightAnswer == null) {
        continue;
      }

      if (
        (question.type === QuestionType.SINGLE_SELECT ||
          question.type === QuestionType.SCALE) &&
        leftAnswer === rightAnswer
      ) {
        rawScore += weight * SINGLE_SELECT_MATCH_BONUS;
        const matchedLabel =
          typeof leftAnswer === 'string'
            ? labelForQuestionValue(leftAnswer, question.normalizedOptions)
            : '';

        if (this.canUseQuestionForNarrative(question.key)) {
          sharedSignals.push({
            questionKey: question.key,
            prompt: question.prompt,
            type: 'EXACT_MATCH',
            weight,
            sharedLabels: matchedLabel ? [matchedLabel] : [],
            leftAnswerLabels: matchedLabel ? [matchedLabel] : [],
            rightAnswerLabels: matchedLabel ? [matchedLabel] : [],
          });
        }
        reasons.push(
          ...this.buildReasonMessages(question, leftAnswer, rightAnswer, order),
        );
      }

      if (question.type === QuestionType.MULTI_SELECT) {
        const leftOptions = Array.isArray(leftAnswer) ? leftAnswer : [];
        const rightOptions = Array.isArray(rightAnswer) ? rightAnswer : [];
        const overlap = leftOptions.filter((value) =>
          rightOptions.includes(value),
        );

        if (overlap.length > 0) {
          rawScore += overlap.length * weight * MULTI_SELECT_OVERLAP_BONUS;
          if (this.canUseQuestionForNarrative(question.key)) {
            sharedSignals.push({
              questionKey: question.key,
              prompt: question.prompt,
              type: 'MULTI_OVERLAP',
              weight,
              sharedLabels: overlap.map((value) =>
                labelForQuestionValue(value, question.normalizedOptions),
              ),
              leftAnswerLabels: leftOptions.map((value) =>
                labelForQuestionValue(value, question.normalizedOptions),
              ),
              rightAnswerLabels: rightOptions.map((value) =>
                labelForQuestionValue(value, question.normalizedOptions),
              ),
            });
          }
          reasons.push(
            ...this.buildReasonMessages(
              question,
              leftAnswer,
              rightAnswer,
              order,
            ),
          );
        }
      }
    }

    const uniqueReasonMap = new Map<
      string,
      { text: string; priority: number; order: number }
    >();

    for (const reason of reasons) {
      const existingReason = uniqueReasonMap.get(reason.text);
      if (
        !existingReason ||
        reason.priority > existingReason.priority ||
        (reason.priority === existingReason.priority &&
          reason.order < existingReason.order)
      ) {
        uniqueReasonMap.set(reason.text, reason);
      }
    }

    const uniqueReasons = [...uniqueReasonMap.values()]
      .sort(
        (leftReason, rightReason) =>
          rightReason.priority - leftReason.priority ||
          leftReason.order - rightReason.order,
      )
      .slice(0, MAX_MATCH_REASONS)
      .map((reason) => reason.text);

    return {
      rawScore,
      score: this.normalizeMatchScore(rawScore, scoreBounds),
      sharedSignals,
      reasons:
        uniqueReasons.length > 0
          ? uniqueReasons
          : ['你们在多项关系与生活方式判断上表现出相容趋势。'],
    };
  }

  private buildReasonMessages(
    question: MatchQuestion,
    leftAnswer: string | string[],
    rightAnswer: string | string[],
    order: number,
  ) {
    const preparedQuestion = prepareQuestion(question);

    return preparedQuestion.normalizedReasonRules
      .map((rule) => {
        if (rule.type === 'EXACT_MATCH') {
          if (
            typeof leftAnswer !== 'string' ||
            typeof rightAnswer !== 'string' ||
            leftAnswer !== rightAnswer
          ) {
            return null;
          }

          const text = renderReasonTemplate(rule.template, {
            answer_label: labelForQuestionValue(
              leftAnswer,
              preparedQuestion.normalizedOptions,
            ),
            question_prompt: preparedQuestion.prompt,
            question_key: preparedQuestion.key,
            count: 1,
          }).trim();

          if (!text) {
            return null;
          }

          return {
            text,
            priority: rule.priority ?? preparedQuestion.weight,
            order,
          };
        }

        if (!Array.isArray(leftAnswer) || !Array.isArray(rightAnswer)) {
          return null;
        }

        const overlap = leftAnswer.filter((value) =>
          rightAnswer.includes(value),
        );
        if (overlap.length < (rule.minOverlap ?? 1)) {
          return null;
        }

        const overlapLabels = overlap.map((value) =>
          labelForQuestionValue(value, preparedQuestion.normalizedOptions),
        );
        const maxLabels = rule.maxLabels ?? overlapLabels.length;
        const visibleLabels = overlapLabels.slice(0, maxLabels);
        const text = renderReasonTemplate(rule.template, {
          labels: visibleLabels.join('、'),
          labels_2: overlapLabels.slice(0, 2).join('、'),
          labels_3: overlapLabels.slice(0, 3).join('、'),
          question_prompt: preparedQuestion.prompt,
          question_key: preparedQuestion.key,
          count: overlap.length,
        }).trim();

        if (!text) {
          return null;
        }

        return {
          text,
          priority: rule.priority ?? preparedQuestion.weight,
          order,
        };
      })
      .filter(
        (reason): reason is { text: string; priority: number; order: number } =>
          reason !== null,
      );
  }

  private canUseQuestionForNarrative(questionKey: string) {
    return !isHardMatchKey(questionKey);
  }

  private filterNarrativeSignals(signals: MatchNarrativeSignal[]) {
    return signals.filter((signal) =>
      this.canUseQuestionForNarrative(signal.questionKey),
    );
  }

  private buildNarrativeInput(
    pair: CandidatePair,
    preparedQuestions: PreparedQuestion[],
  ): MatchNarrativeInput {
    const leftIntent = isWeeklyIntent(pair.left.intent)
      ? pair.left.intent
      : 'BOTH';
    const rightIntent = isWeeklyIntent(pair.right.intent)
      ? pair.right.intent
      : 'BOTH';

    return {
      score: pair.score,
      intentPair: [leftIntent, rightIntent],
      heuristicReasons: pair.reasons,
      sharedSignals: this.filterNarrativeSignals(pair.sharedSignals ?? []),
      participantA: {
        intro: pair.left.introLine ?? '',
        questionnaire: this.buildNarrativeQuestionnaire(
          pair.left,
          preparedQuestions,
        ),
      },
      participantB: {
        intro: pair.right.introLine ?? '',
        questionnaire: this.buildNarrativeQuestionnaire(
          pair.right,
          preparedQuestions,
        ),
      },
    };
  }

  private buildNarrativeInputForStoredMatch(
    match: NarrativePersistenceMatch,
    participantsById: Map<string, EligibleParticipant>,
    preparedQuestions: PreparedQuestion[],
    revealAt: Date,
  ): MatchNarrativeInput | null {
    const orderedParticipants = [...match.participants].sort(
      (left, right) => left.position - right.position,
    );
    const left = orderedParticipants[0]
      ? participantsById.get(orderedParticipants[0].userId)
      : null;
    const right = orderedParticipants[1]
      ? participantsById.get(orderedParticipants[1].userId)
      : null;

    if (!left || !right) {
      return null;
    }

    const rescoredPair = this.scorePair(
      left,
      right,
      preparedQuestions,
      revealAt,
    );

    return {
      score: match.score,
      intentPair: [left.intent, right.intent],
      heuristicReasons: this.normalizeStoredReasons(match.reasons),
      sharedSignals: this.filterNarrativeSignals(
        rescoredPair?.sharedSignals ?? [],
      ),
      participantA: {
        intro: left.introLine ?? '',
        questionnaire: this.buildNarrativeQuestionnaire(
          left,
          preparedQuestions,
        ),
      },
      participantB: {
        intro: right.introLine ?? '',
        questionnaire: this.buildNarrativeQuestionnaire(
          right,
          preparedQuestions,
        ),
      },
    };
  }

  private buildNarrativeQuestionnaire(
    participant: EligibleParticipant,
    preparedQuestions: PreparedQuestion[],
  ): MatchNarrativeQuestionAnswer[] {
    if (!participant.answers) {
      return [];
    }

    return preparedQuestions
      .filter((question) => !isHardMatchKey(question.key))
      .map((question) => {
        const normalizedAnswer = normalizePreparedQuestionAnswer(
          question,
          participant.answers[question.key],
          { invalidAsNull: true },
        );

        if (normalizedAnswer == null) {
          return null;
        }

        const answerValues = Array.isArray(normalizedAnswer)
          ? normalizedAnswer
          : [normalizedAnswer];
        const answerLabels = answerValues.map((value) =>
          labelForQuestionValue(value, question.normalizedOptions),
        );

        return {
          key: question.key,
          prompt: question.prompt,
          description: question.description ?? null,
          type: question.type,
          weight: question.weight,
          answerValues,
          answerLabels,
        } satisfies MatchNarrativeQuestionAnswer;
      })
      .filter(
        (questionAnswer): questionAnswer is MatchNarrativeQuestionAnswer =>
          questionAnswer !== null,
      );
  }

  private normalizeStoredReasons(rawReasons: Prisma.JsonValue) {
    if (!Array.isArray(rawReasons)) {
      return [];
    }

    return rawReasons.filter(
      (reason): reason is string =>
        typeof reason === 'string' && reason.trim().length > 0,
    );
  }

  private selectOptimalDisjointPairs(
    candidates: CandidatePair[],
    participants: EligibleParticipant[],
    scoreBounds: MatchScoreBounds,
  ) {
    if (candidates.length === 0) {
      return [];
    }

    const participantIndexById = new Map(
      participants.map((participant, index) => [participant.id, index]),
    );
    const candidateByPairKey = new Map(
      candidates.map((candidate) => [
        this.createPairKey(candidate.left.id, candidate.right.id),
        candidate,
      ]),
    );
    const edges: Array<[number, number, number]> = candidates.map(
      (candidate) => {
        const leftIndex = participantIndexById.get(candidate.left.id);
        const rightIndex = participantIndexById.get(candidate.right.id);

        if (leftIndex == null || rightIndex == null) {
          throw new BadRequestException(
            'Candidate pair contains a participant outside the current cycle.',
          );
        }

        const blossomWeight = lexicographicMatchingEdgeWeight(
          candidate.rawScore,
          participants.length,
          scoreBounds,
        );

        return [leftIndex, rightIndex, blossomWeight];
      },
    );
    const mateByIndex = blossom(edges, true);

    const selectedPairs: CandidatePair[] = [];

    for (let leftIndex = 0; leftIndex < mateByIndex.length; leftIndex += 1) {
      const rightIndex = mateByIndex[leftIndex];
      if (
        !Number.isInteger(rightIndex) ||
        rightIndex < 0 ||
        rightIndex <= leftIndex
      ) {
        continue;
      }

      const left = participants[leftIndex];
      const right = participants[rightIndex];
      if (!left || !right) {
        continue;
      }

      const candidate = candidateByPairKey.get(
        this.createPairKey(left.id, right.id),
      );
      if (candidate) {
        selectedPairs.push(candidate);
      }
    }

    selectedPairs.sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return this.createPairKey(first.left.id, first.right.id).localeCompare(
        this.createPairKey(second.left.id, second.right.id),
      );
    });

    return selectedPairs;
  }

  private calculateMatchScoreBounds(
    questions: MatchQuestion[],
  ): MatchScoreBounds {
    let max = BASE_MATCH_SCORE;

    for (const question of questions) {
      const preparedQuestion = prepareQuestion(question);

      if (
        preparedQuestion.type === QuestionType.SINGLE_SELECT ||
        preparedQuestion.type === QuestionType.SCALE
      ) {
        max += preparedQuestion.weight * SINGLE_SELECT_MATCH_BONUS;
        continue;
      }

      if (preparedQuestion.type === QuestionType.MULTI_SELECT) {
        max +=
          this.getMaxMultiSelectOverlap(preparedQuestion) *
          preparedQuestion.weight *
          MULTI_SELECT_OVERLAP_BONUS;
      }
    }

    return {
      min: BASE_MATCH_SCORE,
      max,
    };
  }

  private getMaxMultiSelectOverlap(question: {
    prompt: string;
    selectionLimit?: number | null;
    normalizedOptions?: QuestionOption[];
    options?: Prisma.JsonValue | null;
  }) {
    const optionCount =
      question.normalizedOptions?.length ??
      normalizeQuestionOptions(question.options ?? null).length;
    const selectionLimit = question.selectionLimit ?? null;

    if (selectionLimit != null) {
      if (!Number.isInteger(selectionLimit) || selectionLimit < 0) {
        throw new BadRequestException(
          `Question "${question.prompt}" has an invalid selection limit.`,
        );
      }

      if (optionCount === 0) {
        return selectionLimit;
      }

      return Math.min(selectionLimit, optionCount);
    }

    if (optionCount === 0) {
      throw new BadRequestException(
        `Question "${question.prompt}" must define options or a selection limit before match scores can be normalized.`,
      );
    }

    return optionCount;
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

  private async revertPreparationClaimIfEmpty(cycleId: string) {
    const createdMatchCount = await this.prisma.match.count({
      where: { cycleId },
    });

    if (createdMatchCount > 0) {
      return;
    }

    await this.prisma.matchCycle.updateMany({
      where: {
        id: cycleId,
        status: 'PREPARING',
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

  private countPendingNarratives(cycleId: string) {
    return this.prisma.match.count({
      where: {
        cycleId,
        OR: [
          { reason: null },
          { conversationTopics: { equals: Prisma.AnyNull } },
          { narrativeSource: null },
        ],
      },
    });
  }

  private loadPendingNarrativeMatches(cycleId: string) {
    return this.prisma.match.findMany({
      where: {
        cycleId,
        OR: [
          { reason: null },
          { conversationTopics: { equals: Prisma.AnyNull } },
          { narrativeSource: null },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        score: true,
        reasons: true,
        createdAt: true,
        participants: {
          select: {
            userId: true,
            position: true,
          },
          orderBy: { position: 'asc' },
        },
      },
    });
  }

  private hasNarrativeTimedOut(createdAt: Date) {
    return Date.now() - createdAt.getTime() >= MATCH_NARRATIVE_DEFAULT_AFTER_MS;
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

  private buildNarrativeErrorMessage(
    stage: 'pair_generation' | 'match_retry',
    key: string,
    index: number,
    error: unknown,
  ) {
    const message =
      error instanceof Error ? error.message : 'Unknown narrative error.';
    return `Narrative ${stage} failed for ${key} at index ${index}. ${message}`;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  type QuestionType,
  type UserCycleDashboardSnapshot,
  type WeeklyIntent as PrismaWeeklyIntent,
} from '../../common/prisma/client';
import {
  hardMatchAttentionFields,
  hardMatchAttentionKeys,
  isWeeklyIntent,
  normalizeLocale,
} from '@lilink/shared';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import {
  HARD_MATCH_KEYS,
  buildHardMatchAnswerRecordFromFormInput,
  type HardMatchDraftForm,
  hardMatchQuestionKeys,
  normalizeHardMatchAnswers,
  readQuestionnaireOneLiner,
  sanitizeHardMatchDraftForm,
  tryReadHardMatchAnswers,
} from '../questionnaire/hard-match';
import { IncompleteQuestionnaireSubmissionException } from '../questionnaire/incomplete-questionnaire-submission.exception';
import { normalizeQuestionOptions } from '../questionnaire/questionnaire-config';
import { syncQuestionnaireSchoolAnswers } from '../questionnaire/questionnaire-school-sync';
import {
  AcknowledgeQuestionnaireItemsDto,
  DashboardHistoryItemResponseDto,
  DashboardHistoryLimitedReason,
  DashboardHistoryResult,
  DashboardHistoryVisibility,
  DashboardResponseDto,
  ReportMatchDto,
  SaveQuestionnaireDto,
  ToggleParticipationDto,
  UpdateLocaleDto,
  UpdateProfileDto,
} from './dto';

const DASHBOARD_HISTORY_LIMIT = 3;

type DashboardCycleSummary = Prisma.MatchCycleGetPayload<{
  select: {
    id: true;
    codename: true;
    revealAt: true;
  };
}>;

type DashboardSnapshotRecord = UserCycleDashboardSnapshot;
type CurrentParticipationSummary = {
  status: 'OPTED_IN' | 'OPTED_OUT';
  intent: PrismaWeeklyIntent | null;
};
type DashboardSnapshotStore = {
  findFirst: (
    args: Prisma.UserCycleDashboardSnapshotFindFirstArgs,
  ) => Promise<DashboardSnapshotRecord | null>;
  findMany: (
    args: Prisma.UserCycleDashboardSnapshotFindManyArgs,
  ) => Promise<DashboardSnapshotRecord[]>;
};
type QuestionnaireDraftPayload = {
  softAnswers: Record<string, Prisma.InputJsonValue>;
  hardMatchForm: HardMatchDraftForm;
  displayName: string;
};

type QuestionnaireDraftQuestion = {
  key: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  selectionLimit?: number | null;
  options: Prisma.JsonValue | null;
};

type QuestionnaireAttentionQuestion = Omit<
  QuestionnaireDraftQuestion,
  'options'
> & {
  description?: string | null;
  options: unknown;
};

type QuestionnaireAttentionItem = {
  key: string;
  prompt: string;
  updated: boolean;
  missingRequired: boolean;
  acknowledged: boolean;
};

type QuestionnaireAcknowledgementRow = {
  acknowledgedQuestionnaireKeys: Prisma.JsonValue | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAcknowledgedQuestionnaireKeys(rawKeys: unknown) {
  if (!Array.isArray(rawKeys)) {
    return [];
  }

  return [
    ...new Set(
      rawKeys
        .filter((key): key is string => typeof key === 'string')
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    ),
  ];
}

function normalizeQuestionOptionsForComparison(
  question: Pick<QuestionnaireAttentionQuestion, 'options'>,
) {
  return normalizeQuestionOptions(question.options);
}

function hasQuestionnaireQuestionUpdate(
  previousQuestion: QuestionnaireAttentionQuestion | undefined,
  currentQuestion: QuestionnaireAttentionQuestion,
) {
  if (!previousQuestion) {
    return true;
  }

  return (
    previousQuestion.prompt !== currentQuestion.prompt ||
    (previousQuestion.description ?? null) !==
      (currentQuestion.description ?? null) ||
    previousQuestion.type !== currentQuestion.type ||
    previousQuestion.required !== currentQuestion.required ||
    (previousQuestion.selectionLimit ?? null) !==
      (currentQuestion.selectionLimit ?? null) ||
    JSON.stringify(normalizeQuestionOptionsForComparison(previousQuestion)) !==
      JSON.stringify(normalizeQuestionOptionsForComparison(currentQuestion))
  );
}

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly questionnaireService: QuestionnaireService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
  ) {}

  async getUserSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      ...user,
      preferredLocale: normalizeLocale(user.preferredLocale),
    };
  }

  async updateLocale(userId: string, input: UpdateLocaleDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { preferredLocale: input.locale },
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
      },
    });

    return {
      ...user,
      preferredLocale: normalizeLocale(user.preferredLocale),
    };
  }

  async getDashboard(userId: string): Promise<DashboardResponseDto> {
    const snapshotStore = (
      this.prisma as PrismaService & {
        userCycleDashboardSnapshot?: DashboardSnapshotStore;
      }
    ).userCycleDashboardSnapshot;
    const [
      profile,
      questionnaire,
      cycle,
      revealedCycles,
      lastRevealedParticipation,
    ] = await Promise.all([
      this.prisma.userProfile.findUnique({
        where: { userId },
      }),
      this.prisma.questionnaireResponse.findUnique({
        where: { userId },
      }),
      this.prisma.matchCycle.findFirst({
        where: { status: { in: ['OPEN', 'PREPARING', 'REVEAL_READY'] } },
        orderBy: { revealAt: 'asc' },
      }),
      this.prisma.matchCycle.findMany({
        where: { status: 'REVEALED' },
        orderBy: { revealAt: 'desc' },
        take: DASHBOARD_HISTORY_LIMIT,
        select: {
          id: true,
          codename: true,
          revealAt: true,
        },
      }),
      this.prisma.cycleParticipation.findFirst({
        where: {
          userId,
          cycle: { status: 'REVEALED' },
        },
        orderBy: {
          cycle: { revealAt: 'desc' },
        },
        select: {
          cycleId: true,
          status: true,
          cycle: {
            select: {
              id: true,
              codename: true,
              revealAt: true,
            },
          },
        },
      }),
    ]);

    const revealedCycleIds = revealedCycles.map((item) => item.id);
    const latestSnapshotCandidateCycleIds = Array.from(
      new Set(
        [
          ...revealedCycleIds,
          ...(lastRevealedParticipation?.cycleId
            ? [lastRevealedParticipation.cycleId]
            : []),
        ].filter(Boolean),
      ),
    );
    await this.dashboardSnapshotService.ensureUserSnapshotCoverage({
      userId,
      latestParticipationCycleId: lastRevealedParticipation?.cycleId ?? null,
      recentRevealedCycleIds: revealedCycleIds,
    });

    const [currentParticipation, latestSnapshot, recentSnapshots]: [
      CurrentParticipationSummary | null,
      DashboardSnapshotRecord | null,
      DashboardSnapshotRecord[],
    ] = await Promise.all([
      cycle
        ? this.prisma.cycleParticipation.findUnique({
            where: {
              cycleId_userId: {
                cycleId: cycle.id,
                userId,
              },
            },
            select: {
              status: true,
              intent: true,
            },
          })
        : Promise.resolve(null),
      latestSnapshotCandidateCycleIds.length === 0 || !snapshotStore
        ? Promise.resolve<DashboardSnapshotRecord | null>(null)
        : snapshotStore.findFirst({
            where: {
              userId,
              cycleId: {
                in: latestSnapshotCandidateCycleIds,
              },
            },
            orderBy: {
              cycleRevealAt: 'desc',
            },
          }),
      revealedCycleIds.length === 0 || !snapshotStore
        ? Promise.resolve<DashboardSnapshotRecord[]>([])
        : snapshotStore.findMany({
            where: {
              userId,
              cycleId: {
                in: revealedCycleIds,
              },
            },
            orderBy: {
              cycleRevealAt: 'desc',
            },
          }),
    ]);
    const recentSnapshotByCycleId = new Map(
      recentSnapshots.map((snapshot) => [snapshot.cycleId, snapshot]),
    );
    const recentMatchHistory = revealedCycles.map((revealedCycle) => {
      const snapshot = recentSnapshotByCycleId.get(revealedCycle.id);
      return snapshot
        ? this.buildDashboardHistoryItemFromSnapshot(snapshot)
        : this.buildDefaultDashboardHistoryItem(revealedCycle);
    });
    const latestMatch = this.readLatestDashboardMatch(latestSnapshot);

    let lastRevealedRound: {
      cycleId: string;
      codename: string;
      revealAt: string;
      participationStatus: 'OPTED_IN' | 'OPTED_OUT';
      matched: boolean;
    } | null = null;

    if (latestSnapshot) {
      lastRevealedRound = {
        cycleId: latestSnapshot.cycleId,
        codename: latestSnapshot.cycleCodename,
        revealAt: latestSnapshot.cycleRevealAt.toISOString(),
        participationStatus: latestSnapshot.participationStatus,
        matched: latestSnapshot.result === 'MATCHED',
      };
    } else if (lastRevealedParticipation) {
      lastRevealedRound = {
        cycleId: lastRevealedParticipation.cycle.id,
        codename: lastRevealedParticipation.cycle.codename,
        revealAt: lastRevealedParticipation.cycle.revealAt.toISOString(),
        participationStatus: lastRevealedParticipation.status,
        matched: false,
      };
    }

    return {
      profile,
      questionnaireSubmittedAt: this.toIsoString(questionnaire?.submittedAt),
      currentCycle: cycle
        ? {
            id: cycle.id,
            codename: cycle.codename,
            revealAt: cycle.revealAt.toISOString(),
            participationDeadline: cycle.participationDeadline.toISOString(),
            status: cycle.status,
            participationStatus: currentParticipation?.status ?? 'OPTED_OUT',
            intent: currentParticipation?.intent ?? null,
          }
        : null,
      latestMatch,
      latestMatchVisibility:
        latestMatch != null
          ? this.toDashboardHistoryVisibility(latestSnapshot?.visibility)
          : null,
      latestMatchLimitedReason:
        latestMatch != null
          ? this.toDashboardHistoryLimitedReason(latestSnapshot?.limitedReason)
          : null,
      lastRevealedRound,
      recentMatchHistory,
    };
  }

  private buildDefaultDashboardHistoryItem(
    cycle: DashboardCycleSummary,
  ): DashboardHistoryItemResponseDto {
    return {
      cycleId: cycle.id,
      codename: cycle.codename,
      revealAt: cycle.revealAt.toISOString(),
      participationStatus: 'OPTED_OUT',
      result: DashboardHistoryResult.NOT_PARTICIPATED,
      visibility: DashboardHistoryVisibility.NOT_APPLICABLE,
      limitedReason: null,
      match: null,
    };
  }

  private buildDashboardHistoryItemFromSnapshot(
    snapshot: DashboardSnapshotRecord,
  ): DashboardHistoryItemResponseDto {
    return {
      cycleId: snapshot.cycleId,
      codename: snapshot.cycleCodename,
      revealAt: snapshot.cycleRevealAt.toISOString(),
      participationStatus: snapshot.participationStatus,
      result: this.toDashboardHistoryResult(snapshot.result),
      visibility:
        this.toDashboardHistoryVisibility(snapshot.visibility) ??
        DashboardHistoryVisibility.NOT_APPLICABLE,
      limitedReason: this.toDashboardHistoryLimitedReason(
        snapshot.limitedReason,
      ),
      match: this.dashboardSnapshotService.readDashboardMatchPayload(
        snapshot.matchPayload,
      ),
    };
  }

  private readLatestDashboardMatch(snapshot: DashboardSnapshotRecord | null) {
    if (!snapshot || snapshot.result !== 'MATCHED') {
      return null;
    }

    return this.dashboardSnapshotService.readDashboardMatchPayload(
      snapshot.matchPayload,
    );
  }

  private normalizeMatchReasons(rawReasons: Prisma.JsonValue): string[] {
    if (!Array.isArray(rawReasons)) {
      return [];
    }

    return rawReasons.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }

  private normalizeMatchReason(
    rawReason: string | null | undefined,
    normalizedReasons: string[],
  ) {
    const trimmedReason = rawReason?.trim();
    if (trimmedReason) {
      return trimmedReason;
    }

    if (normalizedReasons.length === 0) {
      return null;
    }

    return normalizedReasons.join(' ');
  }

  private normalizeConversationTopics(
    rawTopics: Prisma.JsonValue | null | undefined,
  ) {
    if (!Array.isArray(rawTopics)) {
      return [];
    }

    return rawTopics.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }

  private defaultConversationTopics() {
    return [
      '最近一次让你觉得很放松的周末通常怎么过',
      '你最近在慢慢坚持的一件事是什么',
      '什么样的聊天节奏会让你觉得相处自然',
    ];
  }

  private toDashboardHistoryResult(
    result: DashboardSnapshotRecord['result'],
  ): DashboardHistoryResult {
    switch (result) {
      case 'MATCHED':
        return DashboardHistoryResult.MATCHED;
      case 'UNMATCHED':
        return DashboardHistoryResult.UNMATCHED;
      default:
        return DashboardHistoryResult.NOT_PARTICIPATED;
    }
  }

  private toDashboardHistoryVisibility(
    visibility: DashboardSnapshotRecord['visibility'] | null | undefined,
  ): DashboardHistoryVisibility | null {
    if (visibility == null) {
      return null;
    }

    switch (visibility) {
      case 'VISIBLE':
        return DashboardHistoryVisibility.VISIBLE;
      case 'LIMITED':
        return DashboardHistoryVisibility.LIMITED;
      default:
        return DashboardHistoryVisibility.NOT_APPLICABLE;
    }
  }

  private toDashboardHistoryLimitedReason(
    limitedReason: DashboardSnapshotRecord['limitedReason'] | null | undefined,
  ): DashboardHistoryLimitedReason | null {
    switch (limitedReason) {
      case 'REPORTED':
        return DashboardHistoryLimitedReason.REPORTED;
      case 'BLOCKED':
        return DashboardHistoryLimitedReason.BLOCKED;
      default:
        return null;
    }
  }

  private toIsoString(value: Date | null | undefined): string | null {
    return value ? value.toISOString() : null;
  }

  private hasDisplayNameChange(
    currentDisplayName: string | null | undefined,
    nextDisplayName: string,
  ) {
    if (nextDisplayName.length < 2) {
      return false;
    }

    return (currentDisplayName?.trim() ?? '') !== nextDisplayName;
  }

  private normalizeQuestionnaireDisplayName(value: unknown) {
    return typeof value === 'string' ? value.trim() : undefined;
  }

  private resolveQuestionnaireSubmissionDisplayName(
    requestedDisplayName: string | undefined,
    currentDisplayName: string | null | undefined,
  ) {
    if (
      requestedDisplayName !== undefined &&
      requestedDisplayName.length >= 2
    ) {
      return requestedDisplayName;
    }

    return currentDisplayName?.trim() ?? '';
  }

  private assertKnownQuestionnaireKeys(
    questions: Array<{ key: string }>,
    rawAnswers: Record<string, unknown>,
  ) {
    const allowedKeys = new Set(questions.map((question) => question.key));

    for (const answerKey of Object.keys(rawAnswers)) {
      if (!allowedKeys.has(answerKey)) {
        throw new BadRequestException(
          `Unexpected questionnaire field: ${answerKey}.`,
        );
      }
    }
  }

  private buildQuestionnaireDraftPayload(
    questions: QuestionnaireDraftQuestion[],
    input: SaveQuestionnaireDto,
    allowedSchoolIds: readonly string[],
  ): QuestionnaireDraftPayload {
    return {
      softAnswers: this.questionnaireService.sanitizeStoredAnswers(
        questions,
        input.answers,
      ),
      hardMatchForm: sanitizeHardMatchDraftForm(
        input.hardMatchForm,
        allowedSchoolIds,
      ),
      displayName:
        typeof input.displayName === 'string' ? input.displayName.trim() : '',
    };
  }

  private normalizeStoredQuestionnaireDraftPayload(
    questions: QuestionnaireDraftQuestion[],
    rawDraftPayload: Prisma.JsonValue | null | undefined,
    allowedSchoolIds: readonly string[],
  ): QuestionnaireDraftPayload | null {
    if (!isRecord(rawDraftPayload)) {
      return null;
    }

    return {
      softAnswers: this.questionnaireService.sanitizeStoredAnswers(
        questions,
        isRecord(rawDraftPayload.softAnswers)
          ? rawDraftPayload.softAnswers
          : {},
      ),
      hardMatchForm: sanitizeHardMatchDraftForm(
        rawDraftPayload.hardMatchForm,
        allowedSchoolIds,
      ),
      displayName:
        typeof rawDraftPayload.displayName === 'string'
          ? rawDraftPayload.displayName.trim()
          : '',
    };
  }

  private buildQuestionnaireAttention(args: {
    currentVersionId: string;
    currentQuestions: QuestionnaireAttentionQuestion[];
    previousQuestions: QuestionnaireAttentionQuestion[];
    responseVersionId: string | null | undefined;
    rawAnswers: Record<string, unknown>;
    filteredAnswers: Record<string, unknown>;
    acknowledgedVersionId: string | null | undefined;
    acknowledgedKeys: unknown;
  }) {
    const acknowledgedKeys =
      args.acknowledgedVersionId === args.currentVersionId
        ? normalizeAcknowledgedQuestionnaireKeys(args.acknowledgedKeys)
        : [];
    const acknowledgedKeySet = new Set(acknowledgedKeys);
    const previousQuestionsByKey = new Map(
      args.previousQuestions.map((question) => [question.key, question]),
    );
    const hasVersionUpdate =
      args.responseVersionId != null &&
      args.responseVersionId !== args.currentVersionId;
    const itemsByKey = new Map<string, QuestionnaireAttentionItem>();

    for (const question of args.currentQuestions) {
      const updated =
        hasVersionUpdate &&
        hasQuestionnaireQuestionUpdate(
          previousQuestionsByKey.get(question.key),
          question,
        );
      const missingRequired =
        question.required &&
        !Object.prototype.hasOwnProperty.call(
          args.filteredAnswers,
          question.key,
        );

      if (!updated && !missingRequired) {
        continue;
      }

      itemsByKey.set(question.key, {
        key: question.key,
        prompt: question.prompt,
        updated,
        missingRequired,
        acknowledged: !updated || acknowledgedKeySet.has(question.key),
      });
    }

    for (const field of hardMatchAttentionFields()) {
      const updated =
        hasVersionUpdate &&
        !Object.prototype.hasOwnProperty.call(args.rawAnswers, field.key);
      const missingRequired =
        field.required &&
        !Object.prototype.hasOwnProperty.call(args.filteredAnswers, field.key);

      if (!updated && !missingRequired) {
        continue;
      }

      itemsByKey.set(field.key, {
        key: field.key,
        prompt: field.label,
        updated,
        missingRequired,
        acknowledged: !updated || acknowledgedKeySet.has(field.key),
      });
    }

    const items = [...itemsByKey.values()];
    const pendingUpdatedKeys = items
      .filter((item) => item.updated && !item.acknowledged)
      .map((item) => item.key);
    const missingRequiredKeys = items
      .filter((item) => item.missingRequired)
      .map((item) => item.key);

    return {
      currentVersionId: args.currentVersionId,
      acknowledgedKeys,
      pendingUpdatedKeys,
      missingRequiredKeys,
      pendingKeys: [
        ...new Set([...pendingUpdatedKeys, ...missingRequiredKeys]),
      ],
      items,
    };
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    const { displayName, ...profileFields } = input;

    if (displayName !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { displayName },
      });
    }

    const hasProfileFields = Object.keys(profileFields).length > 0;

    const profile = hasProfileFields
      ? await this.prisma.userProfile.upsert({
          where: { userId },
          create: { userId, ...profileFields },
          update: profileFields,
        })
      : await this.prisma.userProfile.findUnique({ where: { userId } });

    if (displayName !== undefined || profileFields.headline !== undefined) {
      await this.dashboardSnapshotService.syncUserMatchSnapshots(userId);
    }

    return profile;
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile has not been created yet.');
    }

    return profile;
  }

  async saveQuestionnaire(userId: string, input: SaveQuestionnaireDto) {
    const [questionnaire, user] = await Promise.all([
      this.questionnaireService.getCurrentVersion(),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: { school: { select: { id: true } } },
      }),
    ]);

    if (!user.school?.id) {
      throw new BadRequestException(
        'A recognized school is required before saving the questionnaire.',
      );
    }

    this.assertKnownQuestionnaireKeys(questionnaire.questions, input.answers);

    const allowedSchoolIds = questionnaire.schools.map((school) => school.id);
    const draftPayload = this.buildQuestionnaireDraftPayload(
      questionnaire.questions,
      input,
      allowedSchoolIds,
    );
    const requestedDisplayName = this.normalizeQuestionnaireDisplayName(
      input.displayName,
    );
    const submissionDisplayName =
      this.resolveQuestionnaireSubmissionDisplayName(
        requestedDisplayName,
        user.displayName,
      );
    const displayNameUpdate =
      requestedDisplayName !== undefined &&
      this.hasDisplayNameChange(user.displayName, requestedDisplayName)
        ? requestedDisplayName
        : undefined;

    try {
      if (submissionDisplayName.length < 2) {
        throw new IncompleteQuestionnaireSubmissionException(
          'Display name must contain at least 2 characters.',
        );
      }

      const hardMatchAnswers = buildHardMatchAnswerRecordFromFormInput(
        input.hardMatchForm,
        user.school.id,
        allowedSchoolIds,
      );
      const normalizedAnswers = this.questionnaireService.validateAnswers(
        questionnaire.questions,
        {
          ...input.answers,
          ...hardMatchAnswers,
        },
        allowedSchoolIds,
      );
      const acknowledgedQuestionnaireKeys = questionnaire.questions.map(
        (question) => question.key,
      );
      const submittedAt = new Date();

      const submittedOperations: Prisma.PrismaPromise<unknown>[] = [];

      if (displayNameUpdate !== undefined) {
        submittedOperations.push(
          this.prisma.user.update({
            where: { id: userId },
            data: { displayName: displayNameUpdate },
          }),
        );
      }

      submittedOperations.push(
        this.prisma.questionnaireResponse.upsert({
          where: { userId },
          create: {
            userId,
            versionId: questionnaire.id,
            answers: normalizedAnswers as Prisma.InputJsonValue,
            draftAnswers: Prisma.DbNull,
            acknowledgedQuestionnaireVersionId: questionnaire.id,
            acknowledgedQuestionnaireKeys:
              acknowledgedQuestionnaireKeys as Prisma.InputJsonValue,
            submittedAt,
          },
          update: {
            versionId: questionnaire.id,
            answers: normalizedAnswers as Prisma.InputJsonValue,
            draftAnswers: Prisma.DbNull,
            acknowledgedQuestionnaireVersionId: questionnaire.id,
            acknowledgedQuestionnaireKeys:
              acknowledgedQuestionnaireKeys as Prisma.InputJsonValue,
            submittedAt,
          },
        }),
      );

      await this.prisma.$transaction(submittedOperations);

      await this.dashboardSnapshotService.syncUserMatchSnapshots(userId);

      return {
        saveState: 'SUBMITTED' as const,
        questionnaireSubmittedAt: submittedAt.toISOString(),
        hasDraft: false,
      };
    } catch (error) {
      if (!(error instanceof IncompleteQuestionnaireSubmissionException)) {
        throw error;
      }

      const draftUpsertArgs = {
        where: { userId },
        create: {
          userId,
          versionId: questionnaire.id,
          answers: {},
          draftAnswers: draftPayload as Prisma.InputJsonValue,
          submittedAt: null,
        },
        update: {
          draftAnswers: draftPayload as Prisma.InputJsonValue,
        },
      };
      const response =
        displayNameUpdate !== undefined
          ? await this.prisma.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: userId },
                data: { displayName: displayNameUpdate },
              });

              return tx.questionnaireResponse.upsert(draftUpsertArgs);
            })
          : await this.prisma.questionnaireResponse.upsert(draftUpsertArgs);

      if (displayNameUpdate !== undefined) {
        await this.dashboardSnapshotService.syncUserMatchSnapshots(userId);
      }

      return {
        saveState: 'DRAFT' as const,
        questionnaireSubmittedAt: this.toIsoString(response.submittedAt),
        hasDraft: true,
      };
    }
  }

  async getQuestionnaire(userId: string) {
    const [response, currentQuestionnaire, user] = await Promise.all([
      this.prisma.questionnaireResponse.findUnique({
        where: { userId },
        include: {
          version: {
            include: {
              questions: {
                orderBy: { order: 'asc' },
              },
            },
          },
        },
      }),
      this.questionnaireService.getCurrentVersion().catch(() => null),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { schoolId: true },
      }),
    ]);

    if (!response) {
      return null;
    }

    if (!currentQuestionnaire) {
      return {
        versionId: response.versionId,
        currentVersionId: null,
        answers: isRecord(response.answers) ? response.answers : {},
        submittedAt: this.toIsoString(response.submittedAt),
        draft: null,
        attention: null,
      };
    }

    const allowedSchoolIds = currentQuestionnaire.schools.map(
      (school) => school.id,
    );
    const schoolAwareAnswers = syncQuestionnaireSchoolAnswers(
      (response.answers ?? {}) as Record<string, unknown>,
      {
        currentSchoolId: user?.schoolId ?? null,
        allowedSchoolIds,
      },
    );
    const filteredAnswers = this.questionnaireService.sanitizeStoredAnswers(
      currentQuestionnaire.questions,
      schoolAwareAnswers,
    );

    try {
      Object.assign(
        filteredAnswers,
        normalizeHardMatchAnswers(schoolAwareAnswers, allowedSchoolIds),
      );
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        throw error;
      }

      for (const hardMatchKey of hardMatchQuestionKeys()) {
        if (
          Object.prototype.hasOwnProperty.call(schoolAwareAnswers, hardMatchKey)
        ) {
          filteredAnswers[hardMatchKey] = schoolAwareAnswers[hardMatchKey];
        }
      }
    }

    return {
      versionId: response.versionId,
      currentVersionId: currentQuestionnaire.id,
      answers: filteredAnswers,
      submittedAt: this.toIsoString(response.submittedAt),
      draft: this.normalizeStoredQuestionnaireDraftPayload(
        currentQuestionnaire.questions,
        response.draftAnswers,
        allowedSchoolIds,
      ),
      attention: this.buildQuestionnaireAttention({
        currentVersionId: currentQuestionnaire.id,
        currentQuestions: currentQuestionnaire.questions,
        previousQuestions: response.version?.questions ?? [],
        responseVersionId: response.versionId,
        rawAnswers: schoolAwareAnswers,
        filteredAnswers,
        acknowledgedVersionId: response.acknowledgedQuestionnaireVersionId,
        acknowledgedKeys: response.acknowledgedQuestionnaireKeys,
      }),
    };
  }

  async acknowledgeQuestionnaireItems(
    userId: string,
    input: AcknowledgeQuestionnaireItemsDto,
  ) {
    const currentQuestionnaire =
      await this.questionnaireService.getCurrentVersion();

    if (input.versionId !== currentQuestionnaire.id) {
      throw new BadRequestException('Questionnaire version is outdated.');
    }

    const currentQuestionKeys = new Set([
      ...currentQuestionnaire.questions.map((question) => question.key),
      ...hardMatchAttentionKeys(),
    ]);
    const requestedKeys = [
      ...new Set(
        input.keys.map((key) => key.trim()).filter((key) => key.length > 0),
      ),
    ];

    for (const key of requestedKeys) {
      if (!currentQuestionKeys.has(key)) {
        throw new BadRequestException(
          `Unexpected questionnaire acknowledgement key: ${key}.`,
        );
      }
    }

    if (requestedKeys.length === 0) {
      const response = await this.prisma.questionnaireResponse.findUnique({
        where: { userId },
        select: {
          acknowledgedQuestionnaireVersionId: true,
          acknowledgedQuestionnaireKeys: true,
        },
      });

      return {
        currentVersionId: currentQuestionnaire.id,
        acknowledgedKeys:
          response?.acknowledgedQuestionnaireVersionId ===
          currentQuestionnaire.id
            ? normalizeAcknowledgedQuestionnaireKeys(
                response.acknowledgedQuestionnaireKeys,
              )
            : [],
      };
    }

    const updatedRows = await this.prisma.$queryRaw<
      QuestionnaireAcknowledgementRow[]
    >`
      UPDATE "QuestionnaireResponse" AS response
      SET
        "acknowledgedQuestionnaireVersionId" = ${currentQuestionnaire.id},
        "acknowledgedQuestionnaireKeys" = (
          SELECT COALESCE(
            jsonb_agg(DISTINCT acknowledged_key ORDER BY acknowledged_key),
            '[]'::jsonb
          )
          FROM (
            SELECT jsonb_array_elements_text(
              CASE
                WHEN response."acknowledgedQuestionnaireVersionId" = ${currentQuestionnaire.id}
                  AND jsonb_typeof(response."acknowledgedQuestionnaireKeys") = 'array'
                THEN response."acknowledgedQuestionnaireKeys"
                ELSE '[]'::jsonb
              END
            ) AS acknowledged_key
            UNION
            SELECT unnest(ARRAY[${Prisma.join(requestedKeys)}]::text[]) AS acknowledged_key
          ) AS acknowledged_keys
        )
      WHERE response."userId" = ${userId}
      RETURNING response."acknowledgedQuestionnaireKeys"
    `;

    if (updatedRows.length === 0) {
      return {
        currentVersionId: currentQuestionnaire.id,
        acknowledgedKeys: [],
      };
    }

    return {
      currentVersionId: currentQuestionnaire.id,
      acknowledgedKeys: normalizeAcknowledgedQuestionnaireKeys(
        updatedRows[0].acknowledgedQuestionnaireKeys,
      ),
    };
  }

  async setParticipation(userId: string, input: ToggleParticipationDto) {
    const cycle = await this.prisma.matchCycle.findFirst({
      where: { status: { in: ['OPEN', 'PREPARING', 'REVEAL_READY'] } },
      orderBy: { revealAt: 'asc' },
    });

    if (!cycle) {
      throw new NotFoundException('No active cycle is currently available.');
    }

    if (cycle.status !== 'OPEN') {
      throw new BadRequestException(
        'Participation can no longer be changed for the current cycle.',
      );
    }

    if (new Date() >= cycle.participationDeadline) {
      throw new BadRequestException(
        'Participation can no longer be changed after the deadline.',
      );
    }

    if (input.optIn) {
      // Strict contract: opting in MUST come with an intent. The DTO already
      // enforces this, but we re-check here for defense in depth so that any
      // bypass of class-validator still fails loudly.
      if (!isWeeklyIntent(input.intent)) {
        throw new BadRequestException(
          'A weekly intent (FRIEND, DATE, or BOTH) is required when opting into a cycle.',
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { status: true, schoolId: true },
      });

      if (!user) {
        throw new NotFoundException('User not found.');
      }

      if (user.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Suspended or pending accounts cannot opt in to matching.',
        );
      }

      await this.assertQuestionnaireReadyForOptIn(userId, user.schoolId);
    }

    const nextStatus = input.optIn ? 'OPTED_IN' : 'OPTED_OUT';
    const nextIntent = input.optIn ? input.intent : null;

    const participation = await this.prisma.cycleParticipation.upsert({
      where: {
        cycleId_userId: {
          cycleId: cycle.id,
          userId,
        },
      },
      create: {
        cycleId: cycle.id,
        userId,
        status: nextStatus,
        intent: nextIntent,
        optedInAt: input.optIn ? new Date() : null,
      },
      update: {
        status: nextStatus,
        intent: nextIntent,
        optedInAt: input.optIn ? new Date() : null,
      },
    });

    await this.createAuditLog(userId, 'participation.updated', {
      cycleId: cycle.id,
      status: participation.status,
      intent: participation.intent,
    });

    return participation;
  }

  async requestContact(userId: string, matchId: string) {
    const participant = await this.prisma.matchParticipant.findFirst({
      where: {
        matchId,
        userId,
      },
      include: {
        match: {
          include: {
            participants: {
              include: {
                user: {
                  include: {
                    profile: true,
                    school: true,
                    questionnaireResponse: {
                      select: { answers: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Match was not found for this user.');
    }

    if (participant.match.revealedAt == null) {
      throw new BadRequestException('This match is not revealed yet.');
    }

    if (participant.match.introducedAt) {
      throw new BadRequestException('This match has already been introduced.');
    }

    const counterpart = participant.match.participants.find(
      (item) => item.userId !== userId,
    );

    if (!counterpart) {
      throw new BadRequestException(
        'Counterpart was not found for this match.',
      );
    }

    const existingBlock = await this.prisma.block.findFirst({
      where: {
        OR: [
          {
            blockerId: userId,
            blockedId: counterpart.userId,
          },
          {
            blockerId: counterpart.userId,
            blockedId: userId,
          },
        ],
      },
    });

    if (existingBlock) {
      throw new BadRequestException(
        'This match is no longer available for introductions.',
      );
    }

    const requester = participant.match.participants.find(
      (item) => item.userId === userId,
    );

    const claimedAt = new Date();
    const conversationTopics = this.normalizeConversationTopics(
      participant.match.conversationTopics,
    );

    const queuedEmails = this.mailService.buildIntroductionEmails({
      matchId: participant.match.id,
      requester: {
        email: requester!.user.email,
        displayName: requester!.user.displayName,
        schoolName: requester!.user.school?.name ?? null,
        introLine: this.displayIntroLine(
          requester!.user.questionnaireResponse?.answers,
          requester!.user.profile?.headline,
        ),
      },
      recipient: {
        email: counterpart.user.email,
        displayName: counterpart.user.displayName,
        schoolName: counterpart.user.school?.name ?? null,
        introLine: this.displayIntroLine(
          counterpart.user.questionnaireResponse?.answers,
          counterpart.user.profile?.headline,
        ),
      },
      reason:
        this.normalizeMatchReason(
          participant.match.reason,
          this.normalizeMatchReasons(participant.match.reasons),
        ) ?? '你们在多项关系判断与日常偏好上呈现出稳定的相容趋势。',
      conversationTopics:
        conversationTopics.length > 0
          ? conversationTopics
          : this.defaultConversationTopics(),
    });

    await this.prisma.$transaction(async (tx) => {
      const claimedMatch = await tx.match.updateMany({
        where: {
          id: participant.match.id,
          introducedAt: null,
        },
        data: {
          introducedAt: claimedAt,
        },
      });

      if (claimedMatch.count === 0) {
        throw new BadRequestException(
          'This match has already been introduced.',
        );
      }

      await tx.matchParticipant.updateMany({
        where: {
          id: participant.id,
          contactRequestedAt: null,
        },
        data: {
          contactRequestedAt: claimedAt,
        },
      });

      await tx.outboundEmail.createMany({
        data: queuedEmails,
      });

      await this.dashboardSnapshotService.syncMatchSnapshots(
        participant.match.id,
        tx,
      );
    });

    void this.mailService.flushQueuedEmails({
      dedupeKeys: queuedEmails.map((email) => email.dedupeKey),
    });

    await this.createAuditLog(userId, 'match.contact_requested', {
      matchId: participant.match.id,
      counterpartUserId: counterpart.userId,
    });

    return {
      ok: true,
    };
  }

  async reportMatch(userId: string, matchId: string, input: ReportMatchDto) {
    const participant = await this.prisma.matchParticipant.findFirst({
      where: {
        matchId,
        userId,
      },
      include: {
        match: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('Match was not found for this user.');
    }

    if (participant.match.revealedAt == null) {
      throw new BadRequestException('This match is not revealed yet.');
    }

    const counterpart = await this.prisma.matchParticipant.findFirst({
      where: {
        matchId,
        userId: {
          not: userId,
        },
      },
    });

    if (!counterpart) {
      throw new BadRequestException(
        'Counterpart was not found for this match.',
      );
    }

    const existingReport = await this.prisma.report.findFirst({
      where: {
        reporterId: userId,
        matchId,
        status: 'OPEN',
      },
    });

    if (existingReport) {
      throw new BadRequestException('This match has already been reported.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.report.create({
        data: {
          reporterId: userId,
          reportedUserId: counterpart.userId,
          matchId,
          reason: input.reason,
          details: input.details,
          createdBlock: true,
        },
      });
      await tx.block.upsert({
        where: {
          blockerId_blockedId: {
            blockerId: userId,
            blockedId: counterpart.userId,
          },
        },
        update: {},
        create: {
          blockerId: userId,
          blockedId: counterpart.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'match.reported',
          metadata: {
            matchId,
            reportedUserId: counterpart.userId,
            reason: input.reason,
          },
        },
      });
      await this.dashboardSnapshotService.syncMatchSnapshots(matchId, tx);
    });

    return { ok: true };
  }

  private displayIntroLine(
    answers: Prisma.JsonValue | null | undefined,
    profileHeadline: string | null | undefined,
  ): string | null {
    const fromQuestionnaire = readQuestionnaireOneLiner(answers);
    if (fromQuestionnaire) {
      return fromQuestionnaire;
    }

    const trimmedHeadline = profileHeadline?.trim();
    return trimmedHeadline ? trimmedHeadline : null;
  }

  private async createAuditLog(
    actorId: string,
    action: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        metadata,
      },
    });
  }

  // Refuses opt-in until the user has a fully submitted questionnaire whose
  // hard-match answers parse cleanly. Mirrors the eligibility check in
  // CyclesService.toEligibleParticipants so nobody can sit in OPTED_IN with a
  // draft and silently fail at preparation time.
  //
  // Also rejects opt-in when the user has an unsaved draft that no longer
  // satisfies the questionnaire requirements: the matching engine would
  // silently use the older complete `answers` snapshot, which conflicts with
  // what the user sees in /dashboard/profile (and on the home progress bar).
  private async assertQuestionnaireReadyForOptIn(
    userId: string,
    schoolId: string | null,
  ) {
    const response = await this.prisma.questionnaireResponse.findUnique({
      where: { userId },
      select: { answers: true, draftAnswers: true, submittedAt: true },
    });

    if (!response || response.submittedAt == null) {
      throw new BadRequestException(
        'Submit a complete questionnaire before opting into matching.',
      );
    }

    const hardMatchAnswers = tryReadHardMatchAnswers({
      ...((response.answers ?? {}) as Record<string, unknown>),
      [HARD_MATCH_KEYS.school]: schoolId ?? '',
    });

    if (!hardMatchAnswers) {
      throw new BadRequestException(
        'Your questionnaire is missing required fields. Please update your profile before opting into matching.',
      );
    }

    if (response.draftAnswers != null) {
      await this.assertDraftQuestionnaireIsComplete(
        response.draftAnswers,
        schoolId,
      );
    }
  }

  // Validates the in-progress draft using the same rules as a real submission.
  // Throws a user-facing BadRequest when the draft is missing required answers
  // so the home participation gate can surface it as "questionnaire has
  // unsaved incomplete changes".
  private async assertDraftQuestionnaireIsComplete(
    rawDraftAnswers: Prisma.JsonValue,
    schoolId: string | null,
  ) {
    const questionnaire = await this.questionnaireService.getCurrentVersion();
    const allowedSchoolIds = questionnaire.schools.map((school) => school.id);
    const draft = this.normalizeStoredQuestionnaireDraftPayload(
      questionnaire.questions,
      rawDraftAnswers,
      allowedSchoolIds,
    );

    if (!draft) {
      return;
    }

    try {
      const draftHardMatchAnswers = buildHardMatchAnswerRecordFromFormInput(
        draft.hardMatchForm,
        schoolId ?? '',
        allowedSchoolIds,
      );
      this.questionnaireService.validateAnswers(
        questionnaire.questions,
        { ...draft.softAnswers, ...draftHardMatchAnswers },
        allowedSchoolIds,
      );
    } catch (error) {
      if (error instanceof IncompleteQuestionnaireSubmissionException) {
        throw new BadRequestException(
          'Your questionnaire has unsaved incomplete changes. Please finish or discard the draft before opting in.',
        );
      }
      throw error;
    }
  }
}

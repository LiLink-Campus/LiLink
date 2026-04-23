import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  type QuestionType,
  type UserCycleDashboardSnapshot,
  type WeeklyIntent as PrismaWeeklyIntent,
} from '@prisma/client';
import { isWeeklyIntent } from '@lilink/shared';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import {
  buildHardMatchAnswerRecordFromFormInput,
  type HardMatchDraftForm,
  hardMatchQuestionKeys,
  readQuestionnaireOneLiner,
  sanitizeHardMatchDraftForm,
} from '../questionnaire/hard-match';
import { IncompleteQuestionnaireSubmissionException } from '../questionnaire/incomplete-questionnaire-submission.exception';
import { syncQuestionnaireSchoolAnswers } from '../questionnaire/questionnaire-school-sync';
import {
  DashboardHistoryItemResponseDto,
  DashboardHistoryLimitedReason,
  DashboardHistoryResult,
  DashboardHistoryVisibility,
  DashboardResponseDto,
  ReportMatchDto,
  SaveQuestionnaireDto,
  ToggleParticipationDto,
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
type DashboardSnapshotPort = Pick<
  DashboardSnapshotService,
  | 'ensureUserSnapshotCoverage'
  | 'readDashboardMatchPayload'
  | 'syncMatchSnapshots'
  | 'syncUserMatchSnapshots'
>;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const defaultDashboardSnapshotPort: DashboardSnapshotPort = {
  ensureUserSnapshotCoverage() {
    return Promise.resolve();
  },
  readDashboardMatchPayload(rawPayload: Prisma.JsonValue | null | undefined) {
    if (!isRecord(rawPayload)) {
      return null;
    }

    return rawPayload as unknown as ReturnType<
      DashboardSnapshotPort['readDashboardMatchPayload']
    >;
  },
  syncMatchSnapshots() {
    return Promise.resolve();
  },
  syncUserMatchSnapshots() {
    return Promise.resolve();
  },
};

@Injectable()
export class AccountService {
  private readonly dashboardSnapshotService: DashboardSnapshotPort;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly questionnaireService: QuestionnaireService,
    @Optional() dashboardSnapshotService?: DashboardSnapshotService,
  ) {
    this.dashboardSnapshotService =
      dashboardSnapshotService ?? defaultDashboardSnapshotPort;
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
    const trimmedDisplayName = draftPayload.displayName;
    const shouldUpdateDisplayName = this.hasDisplayNameChange(
      user.displayName,
      trimmedDisplayName,
    );

    try {
      if (trimmedDisplayName.length < 2) {
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
      const submittedAt = new Date();

      const submittedOperations: Prisma.PrismaPromise<unknown>[] = [];

      if (shouldUpdateDisplayName) {
        submittedOperations.push(
          this.prisma.user.update({
            where: { id: userId },
            data: { displayName: trimmedDisplayName },
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
            submittedAt,
          },
          update: {
            versionId: questionnaire.id,
            answers: normalizedAnswers as Prisma.InputJsonValue,
            draftAnswers: Prisma.DbNull,
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
      const response = shouldUpdateDisplayName
        ? await this.prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: userId },
              data: { displayName: trimmedDisplayName },
            });

            return tx.questionnaireResponse.upsert(draftUpsertArgs);
          })
        : await this.prisma.questionnaireResponse.upsert(draftUpsertArgs);

      if (shouldUpdateDisplayName) {
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
        answers: isRecord(response.answers) ? response.answers : {},
        submittedAt: this.toIsoString(response.submittedAt),
        draft: null,
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

    for (const hardMatchKey of hardMatchQuestionKeys()) {
      if (schoolAwareAnswers[hardMatchKey] != null) {
        filteredAnswers[hardMatchKey] = schoolAwareAnswers[hardMatchKey];
      }
    }

    return {
      answers: filteredAnswers,
      submittedAt: this.toIsoString(response.submittedAt),
      draft: this.normalizeStoredQuestionnaireDraftPayload(
        currentQuestionnaire.questions,
        response.draftAnswers,
        allowedSchoolIds,
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
        select: { status: true },
      });

      if (!user) {
        throw new NotFoundException('User not found.');
      }

      if (user.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Suspended or pending accounts cannot opt in to matching.',
        );
      }
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
}

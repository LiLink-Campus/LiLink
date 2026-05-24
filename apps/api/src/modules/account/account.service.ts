import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  Prisma,
  type ContactChannelType as PrismaContactChannelType,
  type QuestionType,
  type UserCycleDashboardSnapshot,
  type WeeklyIntent as PrismaWeeklyIntent,
} from '../../common/prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import {
  CONTACT_CHANNEL_LABELS,
  EDITABLE_CONTACT_CHANNEL_TYPES,
  contactChannelLabel,
  hardMatchAttentionFields,
  hardMatchAttentionKeys,
  hardMatchFieldHasValue,
  hardMatchFieldSignature,
  hardMatchSignatureFieldKeys,
  currentHardMatchConfirmSignature,
  HARD_MATCH_WEIGHT_KEYS,
  HARD_MATCH_WEIGHT_ACK,
  isWeeklyIntent,
  normalizeLocale,
  type ContactChannelType,
  type EditableContactChannelType,
  type MeetupProgressStatus,
  type MeetupUserTurnStatus,
  DEFAULT_MEETUP_EXPIRATION_WEEKS,
  MEETUP_TODO_PRIORITY,
} from '@lilink/shared';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { ActivationService } from '../activation/activation.service';
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
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
} from '../../common/validation/display-name';
import { CONTACT_METHOD_VALUE_MAX_LENGTH } from '../../common/validation/input-limits';
import {
  AcknowledgeQuestionnaireItemsDto,
  DashboardMeetupSummaryResponseDto,
  DashboardHistoryItemResponseDto,
  DashboardHistoryLimitedReason,
  DashboardHistoryResult,
  DashboardHistoryVisibility,
  DashboardMatchResponseDto,
  DashboardResponseDto,
  DashboardTaskResponseDto,
  MatchFeedbackResponseDto,
  ReportMatchDto,
  SaveQuestionnaireDto,
  SubmitMatchFeedbackDto,
  ToggleParticipationDto,
  UpdateContactPreferencesDto,
  UpdateLocaleDto,
  UpdateProfileDto,
} from './dto';
import { MatchEstimateService } from './match-estimate.service';

const DASHBOARD_HISTORY_LIMIT = 3;
const EDITABLE_CONTACT_CHANNEL_SET = new Set<ContactChannelType>(
  EDITABLE_CONTACT_CHANNEL_TYPES,
);
const MEETUP_TERMINAL_SUMMARY_TEXT =
  '本次见面安排已结束，当前版本暂不支持重新发起。';

const dashboardMeetupSessionSelect = {
  id: true,
  matchId: true,
  status: true,
  currentProposalId: true,
  confirmedTimeOptionId: true,
  confirmedLocationOptionId: true,
  finalConfirmRequiredByUserId: true,
  reopenedFromLockedStartsAt: true,
  lockedAt: true,
  canceledAt: true,
  canceledByUserId: true,
  effectiveExpirationWeeks: true,
  expiresAt: true,
  archiveEligibleAt: true,
  lastActiveAt: true,
  confirmedTimeOption: {
    select: {
      startsAt: true,
      endsAt: true,
    },
  },
  confirmedLocationOption: {
    select: {
      placeName: true,
    },
  },
  participants: {
    select: {
      userId: true,
      turnState: true,
      revisionUsedAt: true,
      lastSeenAt: true,
      user: {
        select: {
          displayName: true,
        },
      },
    },
  },
} satisfies Prisma.MeetupSessionSelect;

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
type DashboardMeetupSession = Prisma.MeetupSessionGetPayload<{
  select: typeof dashboardMeetupSessionSelect;
}>;
type DashboardMeetupPayload = {
  tasks: DashboardTaskResponseDto[];
  meetupSummary: DashboardMeetupSummaryResponseDto | null;
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

type ContactMethodSummary = {
  type: EditableContactChannelType;
  value: string;
};

type PublicContactSummary = {
  type: ContactChannelType;
  label: string;
  value: string;
};

type ContactMethodUser = {
  email: string;
  preferredContactChannel?: ContactChannelType | PrismaContactChannelType;
  contactMethods?: Array<{
    type: ContactChannelType | PrismaContactChannelType;
    value: string;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEditableContactChannel(
  type: ContactChannelType | PrismaContactChannelType,
): type is EditableContactChannelType {
  return EDITABLE_CONTACT_CHANNEL_SET.has(type);
}

function normalizeContactMethodValue(
  type: EditableContactChannelType,
  rawValue: string,
) {
  const value = rawValue.trim();

  if (!value) {
    return null;
  }

  if (value.length > CONTACT_METHOD_VALUE_MAX_LENGTH) {
    throw new BadRequestException('Contact method value is too long.');
  }

  if (type !== 'PHONE') {
    return {
      value,
      normalizedValue: null,
    };
  }

  if (!value.startsWith('+')) {
    throw new BadRequestException(
      'Phone number must use international format.',
    );
  }

  const phoneNumber = parsePhoneNumberFromString(value);

  if (!phoneNumber?.isPossible()) {
    throw new BadRequestException(
      'Phone number must use international format.',
    );
  }

  return {
    value: phoneNumber.number,
    normalizedValue: phoneNumber.number,
  };
}

function normalizeContactPreferencesInput(input: UpdateContactPreferencesDto) {
  const methods = new Map<
    EditableContactChannelType,
    { value: string; normalizedValue: string | null }
  >();

  for (const method of input.methods) {
    if (methods.has(method.type)) {
      throw new BadRequestException('Duplicate contact method type.');
    }

    const normalized = normalizeContactMethodValue(method.type, method.value);
    if (normalized) {
      methods.set(method.type, normalized);
    }
  }

  if (
    isEditableContactChannel(input.preferredContactChannel) &&
    !methods.has(input.preferredContactChannel)
  ) {
    throw new BadRequestException(
      'Selected contact channel must have a value.',
    );
  }

  return methods;
}

function buildContactPreferencesResponse(input: {
  email: string;
  preferredContactChannel: ContactChannelType | PrismaContactChannelType;
  methods: ContactMethodSummary[];
}) {
  return {
    email: input.email,
    preferredContactChannel: input.preferredContactChannel,
    methods: input.methods,
  };
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

function normalizeHardMatchSignatures(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
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
    @Optional()
    private readonly matchEstimateService?: MatchEstimateService,
    @Optional()
    private readonly activationService?: ActivationService,
  ) {}

  async getUserSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
        meetupExpirationWeeks: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      ...user,
      preferredLocale: normalizeLocale(user.preferredLocale),
      meetupExpirationWeeks:
        user.meetupExpirationWeeks ?? DEFAULT_MEETUP_EXPIRATION_WEEKS,
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
        meetupExpirationWeeks: true,
      },
    });

    return {
      ...user,
      preferredLocale: normalizeLocale(user.preferredLocale),
      meetupExpirationWeeks:
        user.meetupExpirationWeeks ?? DEFAULT_MEETUP_EXPIRATION_WEEKS,
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
    await this.attachCurrentUserFeedback(userId, [
      latestMatch,
      ...recentMatchHistory.map((item) => item.match),
    ]);

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

    const latestMatchVisibility =
      latestMatch != null
        ? this.toDashboardHistoryVisibility(latestSnapshot?.visibility)
        : null;
    const latestMatchLimitedReason =
      latestMatch != null
        ? this.toDashboardHistoryLimitedReason(latestSnapshot?.limitedReason)
        : null;
    const meetupDashboard = await this.buildDashboardMeetupPayload({
      userId,
      matchId: latestMatch?.id ?? null,
    });

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
      latestMatchVisibility,
      latestMatchLimitedReason,
      lastRevealedRound,
      recentMatchHistory,
      tasks: meetupDashboard.tasks,
      meetupSummary: meetupDashboard.meetupSummary,
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

  private async buildDashboardMeetupPayload(input: {
    userId: string;
    matchId: string | null;
  }): Promise<DashboardMeetupPayload> {
    if (!input.matchId) {
      return { tasks: [], meetupSummary: null };
    }

    const match = await this.prisma.match.findUnique({
      where: { id: input.matchId },
      select: {
        id: true,
        introducedAt: true,
        participants: {
          select: {
            userId: true,
          },
        },
        meetupSession: {
          select: dashboardMeetupSessionSelect,
        },
      },
    });

    if (!match?.introducedAt || match.participants.length !== 2) {
      return { tasks: [], meetupSummary: null };
    }

    const currentParticipant = match.participants.find(
      (participant) => participant.userId === input.userId,
    );
    const counterpart = match.participants.find(
      (participant) => participant.userId !== input.userId,
    );

    if (!currentParticipant || !counterpart) {
      return { tasks: [], meetupSummary: null };
    }

    if (!match.meetupSession) {
      return {
        tasks: [
          {
            id: `meetup-start:${match.id}`,
            type: 'MEETUP',
            priority: MEETUP_TODO_PRIORITY,
            title: '安排第一次见面',
            text: '可以开始安排第一次见面',
            href: `/dashboard/meetup/start?matchId=${match.id}`,
            userTurnStatus: 'NOT_STARTED',
            progressStatus: 'NOT_STARTED',
            matchId: match.id,
            sessionId: null,
            updatedAt: match.introducedAt.toISOString(),
          },
        ],
        meetupSummary: null,
      };
    }

    const session = await this.convergeDashboardMeetupSession(
      match.meetupSession,
    );
    const meetupSummary = this.buildDashboardMeetupSummary({
      session,
      currentUserId: input.userId,
      now: new Date(),
    });

    if (session.status === 'CANCELED') {
      const canceledTask = this.buildCounterpartCanceledMeetupTask({
        session,
        currentUserId: input.userId,
        matchId: match.id,
      });

      return {
        tasks: canceledTask ? [canceledTask] : [],
        meetupSummary,
      };
    }

    if (session.status !== 'ACTIVE') {
      return { tasks: [], meetupSummary };
    }

    const userTurnStatus = this.deriveMeetupUserTurnStatus(
      session,
      input.userId,
    );

    return {
      tasks: [
        {
          id: `meetup:${session.id}`,
          type: 'MEETUP',
          priority: MEETUP_TODO_PRIORITY,
          title: '安排第一次见面',
          text: this.buildMeetupTaskText(userTurnStatus),
          href: `/dashboard/meetup/${session.id}`,
          userTurnStatus,
          progressStatus: this.deriveMeetupProgressStatus(session),
          matchId: match.id,
          sessionId: session.id,
          updatedAt: session.lastActiveAt.toISOString(),
        },
      ],
      meetupSummary,
    };
  }

  private async convergeDashboardMeetupSession(
    session: DashboardMeetupSession,
  ): Promise<DashboardMeetupSession> {
    const now = new Date();

    if (
      session.status === 'ACTIVE' &&
      session.expiresAt &&
      session.expiresAt <= now
    ) {
      return this.prisma.$transaction(async (tx) => {
        const transition = await tx.meetupSession.updateMany({
          where: {
            id: session.id,
            status: 'ACTIVE',
            currentProposalId: session.currentProposalId,
            finalConfirmRequiredByUserId: session.finalConfirmRequiredByUserId,
            expiresAt: {
              lte: now,
            },
          },
          data: {
            status: 'EXPIRED',
            expiredAt: now,
            currentProposalId: null,
            finalConfirmRequiredByUserId: null,
            expiresAt: null,
            archiveEligibleAt: null,
            lastActiveAt: now,
          },
        });

        if (transition.count === 0) {
          return tx.meetupSession.findUniqueOrThrow({
            where: { id: session.id },
            select: dashboardMeetupSessionSelect,
          });
        }

        if (session.currentProposalId) {
          await tx.meetupProposal.updateMany({
            where: {
              id: session.currentProposalId,
              sessionId: session.id,
              status: 'PENDING',
            },
            data: {
              status: 'SUPERSEDED',
            },
          });
          await tx.meetupOption.updateMany({
            where: {
              proposalId: session.currentProposalId,
              status: 'PENDING',
            },
            data: {
              status: 'DISABLED',
            },
          });
        }

        await tx.meetupParticipant.updateMany({
          where: { sessionId: session.id },
          data: {
            turnState: 'NONE',
            responseRequiredAt: null,
            responseRequiredMessageId: null,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: null,
            action: 'meetup.expired',
            metadata: {
              sessionId: session.id,
              matchId: session.matchId,
            },
          },
        });

        return tx.meetupSession.findUniqueOrThrow({
          where: { id: session.id },
          select: dashboardMeetupSessionSelect,
        });
      });
    }

    if (
      session.status === 'LOCKED' &&
      session.archiveEligibleAt &&
      session.archiveEligibleAt <= now
    ) {
      return this.prisma.$transaction(async (tx) => {
        const transition = await tx.meetupSession.updateMany({
          where: {
            id: session.id,
            status: 'LOCKED',
            currentProposalId: session.currentProposalId,
            finalConfirmRequiredByUserId: session.finalConfirmRequiredByUserId,
            archiveEligibleAt: {
              lte: now,
            },
          },
          data: {
            status: 'ARCHIVED',
            archivedAt: now,
            currentProposalId: null,
            finalConfirmRequiredByUserId: null,
            lastActiveAt: now,
          },
        });

        if (transition.count === 0) {
          return tx.meetupSession.findUniqueOrThrow({
            where: { id: session.id },
            select: dashboardMeetupSessionSelect,
          });
        }

        await tx.meetupParticipant.updateMany({
          where: { sessionId: session.id },
          data: {
            turnState: 'NONE',
            responseRequiredAt: null,
            responseRequiredMessageId: null,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: null,
            action: 'meetup.archived',
            metadata: {
              sessionId: session.id,
              matchId: session.matchId,
            },
          },
        });

        return tx.meetupSession.findUniqueOrThrow({
          where: { id: session.id },
          select: dashboardMeetupSessionSelect,
        });
      });
    }

    return session;
  }

  private buildDashboardMeetupSummary(input: {
    session: DashboardMeetupSession;
    currentUserId: string;
    now: Date;
  }): DashboardMeetupSummaryResponseDto {
    const currentParticipant =
      input.session.participants.find(
        (participant) => participant.userId === input.currentUserId,
      ) ?? null;
    const confirmedStartsAt =
      input.session.confirmedTimeOption?.startsAt ?? null;
    const confirmedEndsAt = input.session.confirmedTimeOption?.endsAt ?? null;
    const lockedStartIsFuture =
      confirmedStartsAt != null && confirmedStartsAt > input.now;
    const reopenedStartIsFuture =
      input.session.reopenedFromLockedStartsAt == null ||
      input.session.reopenedFromLockedStartsAt > input.now;

    return {
      sessionId: input.session.id,
      matchId: input.session.matchId,
      status: input.session.status,
      progressStatus: this.deriveMeetupProgressStatus(input.session),
      href: `/dashboard/meetup/${input.session.id}`,
      confirmedStartsAt: this.toIsoString(confirmedStartsAt),
      confirmedEndsAt: this.toIsoString(confirmedEndsAt),
      confirmedPlaceName:
        input.session.confirmedLocationOption?.placeName ?? null,
      canReviseAfterLock:
        input.session.status === 'LOCKED' &&
        lockedStartIsFuture &&
        currentParticipant?.revisionUsedAt == null,
      canCancel:
        input.session.status === 'ACTIVE'
          ? reopenedStartIsFuture
          : input.session.status === 'LOCKED' && lockedStartIsFuture,
      terminalText: ['CANCELED', 'EXPIRED', 'ARCHIVED'].includes(
        input.session.status,
      )
        ? MEETUP_TERMINAL_SUMMARY_TEXT
        : null,
    };
  }

  private deriveMeetupUserTurnStatus(
    session: DashboardMeetupSession | null,
    currentUserId: string,
  ): MeetupUserTurnStatus {
    if (!session) {
      return 'NOT_STARTED';
    }
    if (session.status !== 'ACTIVE') {
      return 'NONE';
    }

    if (session.finalConfirmRequiredByUserId === currentUserId) {
      return 'NEEDS_YOUR_RESPONSE';
    }
    if (session.finalConfirmRequiredByUserId) {
      return 'WAITING_FOR_COUNTERPART';
    }

    const currentParticipant = session.participants.find(
      (participant) => participant.userId === currentUserId,
    );

    if (currentParticipant?.turnState === 'REQUIRED') {
      return 'NEEDS_YOUR_RESPONSE';
    }

    if (currentParticipant?.turnState === 'WAITING') {
      return 'WAITING_FOR_COUNTERPART';
    }

    return 'NONE';
  }

  private deriveMeetupProgressStatus(
    session: DashboardMeetupSession | null,
  ): MeetupProgressStatus {
    if (!session) {
      return 'NOT_STARTED';
    }
    if (session.status === 'CANCELED') {
      return 'CANCELED';
    }
    if (session.status === 'EXPIRED') {
      return 'EXPIRED';
    }
    if (session.status === 'ARCHIVED') {
      return 'ARCHIVED';
    }
    if (session.status === 'LOCKED') {
      return 'LOCKED';
    }
    if (session.finalConfirmRequiredByUserId) {
      return 'AWAITING_FINAL_CONFIRMATION';
    }
    if (session.confirmedLocationOptionId && !session.confirmedTimeOptionId) {
      return 'LOCATION_CONFIRMED_TIME_PENDING';
    }
    if (session.confirmedTimeOptionId && !session.confirmedLocationOptionId) {
      return 'TIME_CONFIRMED_LOCATION_PENDING';
    }

    return 'NEGOTIATING';
  }

  private buildMeetupTaskText(userTurnStatus: MeetupUserTurnStatus) {
    switch (userTurnStatus) {
      case 'NEEDS_YOUR_RESPONSE':
        return '需要你回应';
      case 'WAITING_FOR_COUNTERPART':
        return '等待对方回应';
      default:
        return '继续安排第一次见面';
    }
  }

  private buildCounterpartCanceledMeetupTask(input: {
    session: DashboardMeetupSession;
    currentUserId: string;
    matchId: string;
  }): DashboardTaskResponseDto | null {
    const canceledAt = input.session.canceledAt ?? input.session.lastActiveAt;
    const currentParticipant =
      input.session.participants.find(
        (participant) => participant.userId === input.currentUserId,
      ) ?? null;
    const canceledByCounterpart = input.session.participants.some(
      (participant) =>
        participant.userId === input.session.canceledByUserId &&
        participant.userId !== input.currentUserId,
    );

    if (!canceledByCounterpart) {
      return null;
    }

    if (
      currentParticipant?.lastSeenAt &&
      currentParticipant.lastSeenAt >= canceledAt
    ) {
      return null;
    }

    return {
      id: `meetup-canceled:${input.session.id}`,
      type: 'MEETUP',
      priority: MEETUP_TODO_PRIORITY,
      title: '第一次见面已取消',
      text: '对方取消了该次见面',
      href: `/dashboard/meetup/${input.session.id}`,
      userTurnStatus: 'NONE',
      progressStatus: 'CANCELED',
      matchId: input.matchId,
      sessionId: input.session.id,
      updatedAt: canceledAt.toISOString(),
    };
  }

  private readPartyGenderInfo(answers: unknown): {
    gender: string | null;
    partnerGenders: string[];
  } {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return { gender: null, partnerGenders: [] };
    }
    const record = answers as Record<string, unknown>;
    const gender = record[HARD_MATCH_KEYS.gender];
    const partnerGenders = record[HARD_MATCH_KEYS.partnerGenders];
    return {
      gender:
        typeof gender === 'string' && gender.trim().length > 0
          ? gender.trim()
          : null,
      partnerGenders: Array.isArray(partnerGenders)
        ? partnerGenders.filter(
            (entry): entry is string =>
              typeof entry === 'string' && entry.trim().length > 0,
          )
        : [],
    };
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
    if (!this.isValidDisplayName(nextDisplayName)) {
      return false;
    }

    return (currentDisplayName?.trim() ?? '') !== nextDisplayName;
  }

  private isValidDisplayName(value: string) {
    return (
      value.length >= DISPLAY_NAME_MIN_LENGTH &&
      value.length <= DISPLAY_NAME_MAX_LENGTH
    );
  }

  private assertValidDisplayName(value: string) {
    if (this.isValidDisplayName(value)) {
      return;
    }

    throw new BadRequestException(
      `Display name must be between ${DISPLAY_NAME_MIN_LENGTH} and ${DISPLAY_NAME_MAX_LENGTH} characters.`,
    );
  }

  private normalizeProfileDisplayName(value: string) {
    const trimmedValue = value.trim();
    this.assertValidDisplayName(trimmedValue);
    return trimmedValue;
  }

  private normalizeQuestionnaireDisplayName(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmedValue = value.trim();
    this.assertValidDisplayName(trimmedValue);
    return trimmedValue;
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
    acknowledgedHardMatchSignatures: unknown;
  }) {
    const acknowledgedKeys =
      args.acknowledgedVersionId === args.currentVersionId
        ? normalizeAcknowledgedQuestionnaireKeys(args.acknowledgedKeys)
        : [];
    const acknowledgedKeySet = new Set(acknowledgedKeys);
    const storedSignatures = normalizeHardMatchSignatures(
      args.acknowledgedHardMatchSignatures,
    );
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
      const value = args.filteredAnswers[field.key];
      const present =
        Object.prototype.hasOwnProperty.call(args.filteredAnswers, field.key) &&
        hardMatchFieldHasValue(value);

      const enumSignature = hardMatchFieldSignature(field.key);
      const isWeight = HARD_MATCH_WEIGHT_KEYS.includes(field.key);

      // Whether this hard-match field is confirmed against the CURRENT schema,
      // decided purely by the stored signature — independent of the soft
      // questionnaire version, so a soft bump never re-nags a confirmed field.
      let signatureConfirmed: boolean;
      if (enumSignature !== null) {
        signatureConfirmed = storedSignatures[field.key] === enumSignature;
      } else if (isWeight) {
        signatureConfirmed =
          present || storedSignatures[field.key] === HARD_MATCH_WEIGHT_ACK;
      } else {
        signatureConfirmed = true;
      }

      // Newly introduced field (version bumped + key absent), suppressed once
      // the field is signature-confirmed.
      const legacyUpdated =
        !signatureConfirmed &&
        hasVersionUpdate &&
        !Object.prototype.hasOwnProperty.call(args.rawAnswers, field.key);
      const enumStale =
        enumSignature !== null && present && !signatureConfirmed;
      const weightNeedsConfirm = isWeight && !present && !signatureConfirmed;
      const updated = legacyUpdated || enumStale || weightNeedsConfirm;

      const missingRequired = field.required && !present;

      if (!updated && !missingRequired) {
        continue;
      }

      itemsByKey.set(field.key, {
        key: field.key,
        prompt: field.label,
        updated,
        missingRequired,
        acknowledged: signatureConfirmed,
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
    const normalizedDisplayName =
      displayName !== undefined
        ? this.normalizeProfileDisplayName(displayName)
        : undefined;

    if (normalizedDisplayName !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { displayName: normalizedDisplayName },
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

    if (
      normalizedDisplayName !== undefined ||
      profileFields.headline !== undefined
    ) {
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

  async getContactPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        preferredContactChannel: true,
        contactMethods: {
          select: {
            type: true,
            value: true,
          },
          orderBy: {
            type: 'asc',
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return buildContactPreferencesResponse({
      email: user.email,
      preferredContactChannel: user.preferredContactChannel,
      methods: user.contactMethods
        .filter((method): method is ContactMethodSummary =>
          isEditableContactChannel(method.type),
        )
        .map((method) => ({
          type: method.type,
          value: method.value,
        })),
    });
  }

  async updateContactPreferences(
    userId: string,
    input: UpdateContactPreferencesDto,
  ) {
    const methods = normalizeContactPreferencesInput(input);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
      },
    });
    const omittedMethodTypes = EDITABLE_CONTACT_CHANNEL_TYPES.filter(
      (type) => !methods.has(type),
    );

    const savedMethods = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { preferredContactChannel: input.preferredContactChannel },
      });

      if (omittedMethodTypes.length > 0) {
        await tx.userContactMethod.deleteMany({
          where: {
            userId,
            type: {
              in: omittedMethodTypes,
            },
          },
        });
      }

      for (const [type, method] of methods) {
        await tx.userContactMethod.upsert({
          where: {
            userId_type: {
              userId,
              type,
            },
          },
          update: {
            value: method.value,
            normalizedValue: method.normalizedValue,
          },
          create: {
            userId,
            type,
            value: method.value,
            normalizedValue: method.normalizedValue,
          },
        });
      }

      return tx.userContactMethod.findMany({
        where: { userId },
        select: {
          type: true,
          value: true,
        },
        orderBy: {
          type: 'asc',
        },
      });
    });

    return buildContactPreferencesResponse({
      email: user.email,
      preferredContactChannel: input.preferredContactChannel,
      methods: savedMethods
        .filter((method): method is ContactMethodSummary =>
          isEditableContactChannel(method.type),
        )
        .map((method) => ({
          type: method.type,
          value: method.value,
        })),
    });
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

      // Submitting is a conscious pass over the whole profile, so it confirms
      // every enum hard-match field against the current option set AND any
      // empty / "no limit" weight (clearing the weight nudge on save).
      const submittedHardMatchSignatures: Record<string, string> = {};
      for (const key of hardMatchSignatureFieldKeys()) {
        const sig = hardMatchFieldSignature(key);
        if (sig) {
          submittedHardMatchSignatures[key] = sig;
        }
      }
      for (const key of HARD_MATCH_WEIGHT_KEYS) {
        submittedHardMatchSignatures[key] = HARD_MATCH_WEIGHT_ACK;
      }

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
            answers: normalizedAnswers,
            draftAnswers: Prisma.DbNull,
            acknowledgedQuestionnaireVersionId: questionnaire.id,
            acknowledgedQuestionnaireKeys,
            submittedAt,
          },
          update: {
            versionId: questionnaire.id,
            answers: normalizedAnswers,
            draftAnswers: Prisma.DbNull,
            acknowledgedQuestionnaireVersionId: questionnaire.id,
            acknowledgedQuestionnaireKeys,
            submittedAt,
          },
        }),
      );

      // Persist enum + weight signatures via JSONB merge (runs after the
      // upsert in the same transaction).
      submittedOperations.push(
        this.prisma.$executeRaw`
          UPDATE "QuestionnaireResponse"
          SET "acknowledgedHardMatchSignatures" =
            COALESCE("acknowledgedHardMatchSignatures", '{}'::jsonb)
            || ${JSON.stringify(submittedHardMatchSignatures)}::jsonb
          WHERE "userId" = ${userId}
        `,
      );

      await this.prisma.$transaction(submittedOperations);

      this.matchEstimateService?.invalidatePrecomputedCycle();
      await this.dashboardSnapshotService.syncUserMatchSnapshots(userId);

      // Submitting the questionnaire is one of the two activation signals; try
      // to grant activation-reward coupons (a no-op until the user has also
      // opted in, and self-contained — it never throws into this flow).
      await this.activationService?.tryGrantCoupons(userId);

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
        acknowledgedHardMatchSignatures:
          response.acknowledgedHardMatchSignatures,
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

    // Hard-match keys carry a signature instead of a bare ack flag: enum
    // fields store the current option-set signature, weight fields the
    // empty-ack sentinel. Merged into the JSONB column in the same UPDATE.
    const hardMatchAcks: Record<string, string> = {};
    for (const key of requestedKeys) {
      const sig = currentHardMatchConfirmSignature(key);
      if (sig) {
        hardMatchAcks[key] = sig;
      }
    }

    const updatedRows = await this.prisma.$queryRaw<
      QuestionnaireAcknowledgementRow[]
    >`
      UPDATE "QuestionnaireResponse" AS response
      SET
        "acknowledgedQuestionnaireVersionId" = ${currentQuestionnaire.id},
        "acknowledgedHardMatchSignatures" =
          COALESCE(response."acknowledgedHardMatchSignatures", '{}'::jsonb)
          || ${JSON.stringify(hardMatchAcks)}::jsonb,
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

    if (input.optIn) {
      // Stable "ever opted in" signal used for merchant-promotion activation
      // gating: written once on the first opt-in and never cleared on opt-out
      // (unlike CycleParticipation.optedInAt). The null guard in updateMany
      // keeps it idempotent across repeated opt-ins.
      await this.prisma.user.updateMany({
        where: { id: userId, firstOptedInAt: null },
        data: { firstOptedInAt: new Date() },
      });
      // Opting in is the second activation signal; try to grant coupons (a
      // no-op until the questionnaire is also submitted; never throws here).
      await this.activationService?.tryGrantCoupons(userId);
    }

    await this.createAuditLog(userId, 'participation.updated', {
      cycleId: cycle.id,
      status: participation.status,
      intent: participation.intent,
    });

    this.matchEstimateService?.invalidatePrecomputedCycle(cycle.id);

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
                    contactMethods: {
                      select: {
                        type: true,
                        value: true,
                      },
                    },
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

    if (!requester) {
      throw new BadRequestException('Requester was not found for this match.');
    }

    const requesterContact = this.resolvePublicContact(requester.user);
    const counterpartContact = this.resolvePublicContact(counterpart.user);

    const claimedAt = new Date();
    const introIntents = await this.prisma.cycleParticipation.findMany({
      where: {
        cycleId: participant.match.cycleId,
        userId: { in: [requester.userId, counterpart.userId] },
      },
      select: { userId: true, intent: true },
    });
    const intentByUserId = new Map(
      introIntents.map((row) => [row.userId, row.intent]),
    );
    const requesterGenderInfo = this.readPartyGenderInfo(
      requester.user.questionnaireResponse?.answers,
    );
    const counterpartGenderInfo = this.readPartyGenderInfo(
      counterpart.user.questionnaireResponse?.answers,
    );

    let queuedEmails: ReturnType<MailService['buildIntroductionEmails']> = [];

    await this.prisma.$transaction(async (tx) => {
      await this.lockMatchForContactDecision(tx, participant.match.id);

      const transactionBlock = await tx.block.findFirst({
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

      if (transactionBlock) {
        throw new BadRequestException(
          'This match is no longer available for introductions.',
        );
      }

      queuedEmails = this.mailService.buildIntroductionEmails({
        matchId: participant.match.id,
        requester: {
          email: requester.user.email,
          displayName: requester.user.displayName,
          schoolName: requester.user.school?.name ?? null,
          introLine: this.displayIntroLine(
            requester.user.questionnaireResponse?.answers,
            requester.user.profile?.headline,
          ),
          publicContact: requesterContact,
          gender: requesterGenderInfo.gender,
          partnerGenders: requesterGenderInfo.partnerGenders,
          weeklyIntent: intentByUserId.get(requester.userId) ?? null,
        },
        recipient: {
          email: counterpart.user.email,
          displayName: counterpart.user.displayName,
          schoolName: counterpart.user.school?.name ?? null,
          introLine: this.displayIntroLine(
            counterpart.user.questionnaireResponse?.answers,
            counterpart.user.profile?.headline,
          ),
          publicContact: counterpartContact,
          gender: counterpartGenderInfo.gender,
          partnerGenders: counterpartGenderInfo.partnerGenders,
          weeklyIntent: intentByUserId.get(counterpart.userId) ?? null,
        },
      });

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
          introducedContactType: requesterContact.type,
          introducedContactValue: requesterContact.value,
        },
      });

      for (const matchParticipant of participant.match.participants) {
        if (matchParticipant.id === participant.id) {
          continue;
        }

        const publicContact = this.resolvePublicContact(matchParticipant.user);
        await tx.matchParticipant.updateMany({
          where: {
            id: matchParticipant.id,
          },
          data: {
            introducedContactType: publicContact.type,
            introducedContactValue: publicContact.value,
          },
        });
      }

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

  private async attachCurrentUserFeedback(
    userId: string,
    matches: Array<DashboardMatchResponseDto | null>,
  ) {
    const present = matches.filter(
      (match): match is DashboardMatchResponseDto => match != null,
    );
    if (present.length === 0) {
      return;
    }

    const matchIds = [...new Set(present.map((match) => match.id))];
    const feedbacks = await this.prisma.matchFeedback.findMany({
      where: {
        matchId: { in: matchIds },
        authorUserId: userId,
      },
      select: {
        matchId: true,
        rating: true,
        comment: true,
        updatedAt: true,
      },
    });
    const feedbackByMatchId = new Map(
      feedbacks.map((feedback) => [feedback.matchId, feedback]),
    );

    for (const match of present) {
      const feedback = feedbackByMatchId.get(match.id);
      match.currentUserFeedback = feedback
        ? {
            rating: feedback.rating,
            comment: feedback.comment,
            submittedAt: feedback.updatedAt.toISOString(),
          }
        : null;
    }
  }

  async submitMatchFeedback(
    userId: string,
    matchId: string,
    input: SubmitMatchFeedbackDto,
  ): Promise<MatchFeedbackResponseDto> {
    const participant = await this.prisma.matchParticipant.findFirst({
      where: {
        matchId,
        userId,
      },
      include: {
        match: {
          select: {
            id: true,
            revealedAt: true,
            participants: {
              select: { userId: true },
            },
            reports: {
              where: { reporterId: userId },
              select: { id: true },
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

    const counterpart = participant.match.participants.find(
      (item) => item.userId !== userId,
    );

    if (!counterpart) {
      throw new BadRequestException(
        'Counterpart was not found for this match.',
      );
    }

    if (participant.match.reports.length > 0) {
      throw new BadRequestException(
        'This match is no longer available for feedback.',
      );
    }

    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: counterpart.userId },
          { blockerId: counterpart.userId, blockedId: userId },
        ],
      },
      select: { id: true },
    });

    if (block) {
      throw new BadRequestException(
        'This match is no longer available for feedback.',
      );
    }

    const comment =
      typeof input.comment === 'string' && input.comment.trim().length > 0
        ? input.comment.trim()
        : null;

    const feedback = await this.prisma.matchFeedback.upsert({
      where: {
        matchId_authorUserId: {
          matchId,
          authorUserId: userId,
        },
      },
      update: {
        rating: input.rating,
        comment,
        subjectUserId: counterpart.userId,
      },
      create: {
        matchId,
        authorUserId: userId,
        subjectUserId: counterpart.userId,
        rating: input.rating,
        comment,
      },
    });

    await this.createAuditLog(userId, 'match.feedback_submitted', {
      matchId,
      rating: feedback.rating,
    });

    return {
      rating: feedback.rating,
      comment: feedback.comment,
      submittedAt: feedback.updatedAt.toISOString(),
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
      await this.lockMatchForContactDecision(tx, matchId);

      const transactionExistingReport = await tx.report.findFirst({
        where: {
          reporterId: userId,
          matchId,
          status: 'OPEN',
        },
      });

      if (transactionExistingReport) {
        throw new BadRequestException('This match has already been reported.');
      }

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

  private async lockMatchForContactDecision(
    tx: Prisma.TransactionClient,
    matchId: string,
  ) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Match"
      WHERE "id" = ${matchId}
      FOR UPDATE
    `;
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

  private resolvePublicContact(user: ContactMethodUser): PublicContactSummary {
    const preferredContactChannel = user.preferredContactChannel ?? 'EMAIL';

    if (preferredContactChannel === 'EMAIL') {
      return {
        type: 'EMAIL',
        label: contactChannelLabel('EMAIL'),
        value: user.email,
      };
    }

    const method = (user.contactMethods ?? []).find(
      (item) => item.type === preferredContactChannel,
    );

    if (!method?.value) {
      throw new BadRequestException(
        'Selected contact channel must have a value.',
      );
    }

    return {
      type: preferredContactChannel,
      label: CONTACT_CHANNEL_LABELS[preferredContactChannel],
      value: method.value,
    };
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
      // `tryReadHardMatchAnswers` returns null whenever any required hard-match
      // field is missing. The shared `parseHardMatchAnswers` still treats a
      // blank one-liner intro as incomplete, so a profile that is otherwise
      // complete but missing only the intro lands here — surface the intro
      // prompt first. This gate's intro enforcement therefore depends on that
      // shared contract; if `parseHardMatchAnswers` is ever relaxed to accept a
      // blank intro, add an explicit intro check here so opt-in cannot silently
      // proceed without one.
      const intro = readQuestionnaireOneLiner(response.answers);
      if (!intro) {
        throw new BadRequestException(
          'Add a one-line intro on your referral card before opting into matching.',
        );
      }

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

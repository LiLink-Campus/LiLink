import { Injectable, NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import {
  HARD_MATCH_KEYS,
  buildHardMatchAnswerRecordFromDraftForm,
  type HardMatchDraftForm,
  hardMatchQuestionKeys,
  readQuestionnaireOneLiner,
  sanitizeHardMatchDraftForm,
} from '../questionnaire/hard-match';
import { syncQuestionnaireSchoolAnswers } from '../questionnaire/questionnaire-school-sync';
import {
  DashboardHistoryItemResponseDto,
  DashboardHistoryLimitedReason,
  DashboardHistoryResult,
  DashboardHistoryVisibility,
  DashboardMatchResponseDto,
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

type DashboardCycleParticipationSummary = Prisma.CycleParticipationGetPayload<{
  select: {
    cycleId: true;
    status: true;
  };
}>;

type DashboardMatchParticipant = Prisma.MatchParticipantGetPayload<{
  select: {
    id: true;
    cycleId: true;
    contactRequestedAt: true;
    match: {
      select: {
        id: true;
        score: true;
        reasons: true;
        introducedAt: true;
        cycle: {
          select: {
            id: true;
            codename: true;
            revealAt: true;
          };
        };
        reports: {
          select: {
            status: true;
          };
        };
        participants: {
          select: {
            userId: true;
            contactRequestedAt: true;
            user: {
              select: {
                email: true;
                displayName: true;
                profile: {
                  select: {
                    headline: true;
                  };
                };
                school: {
                  select: {
                    name: true;
                  };
                };
                questionnaireResponse: {
                  select: {
                    answers: true;
                  };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

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

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly questionnaireService: QuestionnaireService,
  ) {}

  async getDashboard(userId: string): Promise<DashboardResponseDto> {
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
        where: { status: { in: ['OPEN', 'REVEAL_READY'] } },
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
        include: {
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
    const dashboardMatchCycleIds = Array.from(
      new Set([
        ...revealedCycleIds,
        ...(lastRevealedParticipation
          ? [lastRevealedParticipation.cycleId]
          : []),
      ]),
    );

    const [
      currentParticipation,
      recentCycleParticipations,
      revealedMatchParticipants,
    ] = await Promise.all([
      cycle
        ? this.prisma.cycleParticipation.findUnique({
            where: {
              cycleId_userId: {
                cycleId: cycle.id,
                userId,
              },
            },
          })
        : Promise.resolve(null),
      revealedCycleIds.length === 0
        ? Promise.resolve<DashboardCycleParticipationSummary[]>([])
        : this.prisma.cycleParticipation.findMany({
            where: {
              userId,
              cycleId: {
                in: revealedCycleIds,
              },
            },
            select: {
              cycleId: true,
              status: true,
            },
          }),
      dashboardMatchCycleIds.length === 0
        ? Promise.resolve<DashboardMatchParticipant[]>([])
        : this.prisma.matchParticipant.findMany({
            where: {
              userId,
              cycleId: {
                in: dashboardMatchCycleIds,
              },
            },
            select: {
              id: true,
              cycleId: true,
              contactRequestedAt: true,
              match: {
                select: {
                  id: true,
                  score: true,
                  reasons: true,
                  introducedAt: true,
                  cycle: {
                    select: {
                      id: true,
                      codename: true,
                      revealAt: true,
                    },
                  },
                  reports: {
                    where: { reporterId: userId },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                      status: true,
                    },
                  },
                  participants: {
                    select: {
                      userId: true,
                      contactRequestedAt: true,
                      user: {
                        select: {
                          email: true,
                          displayName: true,
                          profile: {
                            select: {
                              headline: true,
                            },
                          },
                          school: {
                            select: {
                              name: true,
                            },
                          },
                          questionnaireResponse: {
                            select: {
                              answers: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
    ]);

    const allRevealedMatchParticipants = [...revealedMatchParticipants].sort(
      (left, right) =>
        right.match.cycle.revealAt.getTime() -
        left.match.cycle.revealAt.getTime(),
    );

    const counterpartUserIds = allRevealedMatchParticipants
      .map((participant) =>
        this.findCounterpartParticipant(participant.match.participants, userId),
      )
      .filter((participant): participant is NonNullable<typeof participant> =>
        Boolean(participant),
      )
      .map((participant) => participant.userId);

    const blockedCounterpartIds = new Set(
      counterpartUserIds.length === 0
        ? []
        : (
            await this.prisma.block.findMany({
              where: {
                OR: [
                  {
                    blockerId: userId,
                    blockedId: {
                      in: counterpartUserIds,
                    },
                  },
                  {
                    blockedId: userId,
                    blockerId: {
                      in: counterpartUserIds,
                    },
                  },
                ],
              },
            })
          ).map((block) =>
            block.blockerId === userId ? block.blockedId : block.blockerId,
          ),
    );

    const recentParticipationByCycleId = new Map(
      recentCycleParticipations.map((participation) => [
        participation.cycleId,
        participation,
      ]),
    );
    const recentMatchParticipantByCycleId = new Map(
      allRevealedMatchParticipants.map((participant) => [
        participant.cycleId,
        participant,
      ]),
    );

    const recentMatchHistory = revealedCycles.map((revealedCycle) =>
      this.buildDashboardHistoryItem({
        userId,
        cycle: revealedCycle,
        participation: recentParticipationByCycleId.get(revealedCycle.id),
        matchParticipant: recentMatchParticipantByCycleId.get(revealedCycle.id),
        blockedCounterpartIds,
      }),
    );

    const latestRevealedMatchParticipant = lastRevealedParticipation
      ? (recentMatchParticipantByCycleId.get(
          lastRevealedParticipation.cycleId,
        ) ?? null)
      : null;
    const latestMatchVisibility = latestRevealedMatchParticipant
      ? this.resolveDashboardMatchVisibility({
          userId,
          participant: latestRevealedMatchParticipant,
          blockedCounterpartIds,
        })
      : null;

    let lastRevealedRound: {
      cycleId: string;
      codename: string;
      revealAt: string;
      participationStatus: 'OPTED_IN' | 'OPTED_OUT';
      matched: boolean;
    } | null = null;

    if (lastRevealedParticipation) {
      lastRevealedRound = {
        cycleId: lastRevealedParticipation.cycle.id,
        codename: lastRevealedParticipation.cycle.codename,
        revealAt: lastRevealedParticipation.cycle.revealAt.toISOString(),
        participationStatus: lastRevealedParticipation.status,
        matched: Boolean(latestRevealedMatchParticipant),
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
          }
        : null,
      latestMatch: latestRevealedMatchParticipant
        ? this.buildDashboardMatch(
            latestRevealedMatchParticipant,
            latestMatchVisibility?.visibility ===
              DashboardHistoryVisibility.LIMITED,
            latestMatchVisibility?.reportStatus ?? null,
          )
        : null,
      latestMatchVisibility: latestMatchVisibility?.visibility ?? null,
      latestMatchLimitedReason: latestMatchVisibility?.limitedReason ?? null,
      lastRevealedRound,
      recentMatchHistory,
    };
  }

  private buildDashboardHistoryItem({
    userId,
    cycle,
    participation,
    matchParticipant,
    blockedCounterpartIds,
  }: {
    userId: string;
    cycle: DashboardCycleSummary;
    participation?: DashboardCycleParticipationSummary;
    matchParticipant?: DashboardMatchParticipant;
    blockedCounterpartIds: Set<string>;
  }): DashboardHistoryItemResponseDto {
    const participationStatus = participation?.status ?? 'OPTED_OUT';

    if (matchParticipant) {
      const { limitedReason, reportStatus, visibility } =
        this.resolveDashboardMatchVisibility({
          userId,
          participant: matchParticipant,
          blockedCounterpartIds,
        });

      return {
        cycleId: cycle.id,
        codename: cycle.codename,
        revealAt: cycle.revealAt.toISOString(),
        participationStatus,
        result: DashboardHistoryResult.MATCHED,
        visibility,
        limitedReason,
        match: this.buildDashboardMatch(
          matchParticipant,
          visibility === DashboardHistoryVisibility.LIMITED,
          reportStatus,
        ),
      };
    }

    return {
      cycleId: cycle.id,
      codename: cycle.codename,
      revealAt: cycle.revealAt.toISOString(),
      participationStatus,
      result:
        participationStatus === 'OPTED_IN'
          ? DashboardHistoryResult.UNMATCHED
          : DashboardHistoryResult.NOT_PARTICIPATED,
      visibility: DashboardHistoryVisibility.NOT_APPLICABLE,
      limitedReason: null,
      match: null,
    };
  }

  private resolveDashboardMatchVisibility({
    userId,
    participant,
    blockedCounterpartIds,
  }: {
    userId: string;
    participant: DashboardMatchParticipant;
    blockedCounterpartIds: Set<string>;
  }) {
    const reportStatus = participant.match.reports[0]?.status ?? null;
    const counterpart = this.findCounterpartParticipant(
      participant.match.participants,
      userId,
    );
    const limitedReason = reportStatus
      ? DashboardHistoryLimitedReason.REPORTED
      : counterpart && blockedCounterpartIds.has(counterpart.userId)
        ? DashboardHistoryLimitedReason.BLOCKED
        : null;

    return {
      reportStatus,
      limitedReason,
      visibility: limitedReason
        ? DashboardHistoryVisibility.LIMITED
        : DashboardHistoryVisibility.VISIBLE,
    };
  }

  private buildDashboardMatch(
    participant: DashboardMatchParticipant,
    hideSensitiveFields: boolean,
    reportStatus: string | null,
  ): DashboardMatchResponseDto {
    return {
      id: participant.match.id,
      score: participant.match.score,
      reasons: hideSensitiveFields
        ? []
        : this.normalizeMatchReasons(participant.match.reasons),
      introducedAt: this.toIsoString(participant.match.introducedAt),
      currentUserRequestedAt: this.toIsoString(participant.contactRequestedAt),
      reportStatus,
      participants: hideSensitiveFields
        ? []
        : participant.match.participants.map((matchParticipant) => ({
            userId: matchParticipant.userId,
            displayName: matchParticipant.user.displayName,
            introLine: this.displayIntroLine(
              matchParticipant.user.questionnaireResponse?.answers,
              matchParticipant.user.profile?.headline,
            ),
            email: participant.match.introducedAt
              ? matchParticipant.user.email
              : null,
            schoolName: matchParticipant.user.school?.name ?? null,
            contactRequestedAt: this.toIsoString(
              matchParticipant.contactRequestedAt,
            ),
          })),
    };
  }

  private findCounterpartParticipant(
    participants: DashboardMatchParticipant['match']['participants'],
    userId: string,
  ) {
    return participants.find((item) => item.userId !== userId) ?? null;
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
        throw new BadRequestException(
          'Display name must contain at least 2 characters.',
        );
      }

      const hardMatchAnswers = buildHardMatchAnswerRecordFromDraftForm(
        draftPayload.hardMatchForm,
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

      return {
        saveState: 'SUBMITTED' as const,
        questionnaireSubmittedAt: submittedAt.toISOString(),
        hasDraft: false,
      };
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        throw error;
      }

      if (shouldUpdateDisplayName) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { displayName: trimmedDisplayName },
        });
      }

      const response = await this.prisma.questionnaireResponse.upsert({
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
      });

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
      where: { status: { in: ['OPEN', 'REVEAL_READY'] } },
      orderBy: { revealAt: 'asc' },
    });

    if (!cycle) {
      throw new NotFoundException('No active cycle is currently available.');
    }

    if (new Date() >= cycle.participationDeadline) {
      throw new BadRequestException(
        'Participation can no longer be changed after the deadline.',
      );
    }

    if (input.optIn) {
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
        status: input.optIn ? 'OPTED_IN' : 'OPTED_OUT',
        optedInAt: input.optIn ? new Date() : null,
      },
      update: {
        status: input.optIn ? 'OPTED_IN' : 'OPTED_OUT',
        optedInAt: input.optIn ? new Date() : null,
      },
    });

    await this.createAuditLog(userId, 'participation.updated', {
      cycleId: cycle.id,
      status: participation.status,
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
      reasons: participant.match.reasons as string[],
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

    await this.prisma.$transaction([
      this.prisma.report.create({
        data: {
          reporterId: userId,
          reportedUserId: counterpart.userId,
          matchId,
          reason: input.reason,
          details: input.details,
          createdBlock: true,
        },
      }),
      this.prisma.block.upsert({
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
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'match.reported',
          metadata: {
            matchId,
            reportedUserId: counterpart.userId,
            reason: input.reason,
          },
        },
      }),
    ]);

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

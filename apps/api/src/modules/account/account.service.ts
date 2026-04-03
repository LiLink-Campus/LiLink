import { Injectable, NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { hardMatchQuestionKeys } from '../questionnaire/hard-match';
import {
  ReportMatchDto,
  SaveQuestionnaireDto,
  ToggleParticipationDto,
  UpdateProfileDto,
} from './dto';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly questionnaireService: QuestionnaireService,
  ) {}

  async getDashboard(userId: string) {
    const [profile, questionnaire, cycle, recentMatchParticipants] =
      await Promise.all([
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
        this.prisma.matchParticipant.findMany({
          where: { userId },
          include: {
            match: {
              include: {
                reports: {
                  where: { reporterId: userId },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
                participants: {
                  include: {
                    user: {
                      include: {
                        profile: true,
                        school: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        }),
      ]);

    const counterpartUserIds = recentMatchParticipants
      .map((participant) =>
        participant.match.participants.find((item) => item.userId !== userId),
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

    const latestMatch =
      recentMatchParticipants.find((participant) => {
        const counterpart = participant.match.participants.find(
          (item) => item.userId !== userId,
        );

        if (!counterpart) {
          return false;
        }

        if (participant.match.reports.length > 0) {
          return false;
        }

        return !blockedCounterpartIds.has(counterpart.userId);
      }) ?? null;

    const participation =
      cycle &&
      (await this.prisma.cycleParticipation.findUnique({
        where: {
          cycleId_userId: {
            cycleId: cycle.id,
            userId,
          },
        },
      }));

    return {
      profile,
      questionnaireSubmittedAt: questionnaire?.submittedAt ?? null,
      currentCycle: cycle
        ? {
            id: cycle.id,
            codename: cycle.codename,
            revealAt: cycle.revealAt,
            participationDeadline: cycle.participationDeadline,
            status: cycle.status,
            participationStatus: participation?.status ?? 'OPTED_OUT',
          }
        : null,
      latestMatch: latestMatch
        ? {
            id: latestMatch.match.id,
            score: latestMatch.match.score,
            reasons: latestMatch.match.reasons,
            introducedAt: latestMatch.match.introducedAt,
            currentUserRequestedAt: latestMatch.contactRequestedAt,
            reportStatus: latestMatch.match.reports[0]?.status ?? null,
            participants: latestMatch.match.participants.map((participant) => ({
              userId: participant.userId,
              displayName: participant.user.displayName,
              headline: participant.user.profile?.headline,
              email: latestMatch.match.introducedAt
                ? participant.user.email
                : null,
              schoolName: participant.user.school?.name ?? null,
              contactRequestedAt: participant.contactRequestedAt,
            })),
          }
        : null,
    };
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    return this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...input,
      },
      update: input,
    });
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
    const questionnaire = await this.questionnaireService.getCurrentVersion();
    const normalizedAnswers = this.questionnaireService.validateAnswers(
      questionnaire.questions,
      input.answers,
    );

    return this.prisma.questionnaireResponse.upsert({
      where: { userId },
      create: {
        userId,
        versionId: questionnaire.id,
        answers: normalizedAnswers as Prisma.InputJsonValue,
        submittedAt: new Date(),
      },
      update: {
        versionId: questionnaire.id,
        answers: normalizedAnswers as Prisma.InputJsonValue,
        submittedAt: new Date(),
      },
    });
  }

  async getQuestionnaire(userId: string) {
    const [response, currentQuestionnaire] = await Promise.all([
      this.prisma.questionnaireResponse.findUnique({
        where: { userId },
      }),
      this.questionnaireService.getCurrentVersion().catch(() => null),
    ]);

    if (!response || !currentQuestionnaire) {
      return response;
    }

    const filteredAnswers = this.questionnaireService.sanitizeStoredAnswers(
      currentQuestionnaire.questions,
      (response.answers ?? {}) as Record<string, unknown>,
    );
    const rawAnswers = (response.answers ?? {}) as Record<string, unknown>;

    for (const hardMatchKey of hardMatchQuestionKeys()) {
      if (rawAnswers[hardMatchKey] != null) {
        filteredAnswers[hardMatchKey] = rawAnswers[
          hardMatchKey
        ] as Prisma.InputJsonValue;
      }
    }

    return {
      ...response,
      answers: filteredAnswers,
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
        headline: requester!.user.profile?.headline ?? null,
      },
      recipient: {
        email: counterpart.user.email,
        displayName: counterpart.user.displayName,
        schoolName: counterpart.user.school?.name ?? null,
        headline: counterpart.user.profile?.headline ?? null,
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

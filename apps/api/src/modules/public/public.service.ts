import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getLandingPayload() {
    const [userCount, completedProfiles, matchCount, currentCycle] =
      await Promise.all([
        this.prisma.user.count({ where: { status: 'ACTIVE' } }),
        this.prisma.questionnaireResponse.count({
          where: { submittedAt: { not: null } },
        }),
        this.prisma.match.count({
          where: {
            revealedAt: { not: null },
          },
        }),
        this.prisma.matchCycle.findFirst({
          where: { status: { in: ['OPEN', 'PREPARING', 'REVEAL_READY'] } },
          orderBy: { revealAt: 'asc' },
        }),
      ]);

    return {
      brand: 'LiLink',
      tagline: '在黎安，遇见真正同频的人。',
      stats: {
        registeredUsers: userCount,
        completedQuestionnaires: completedProfiles,
        matchesDelivered: matchCount,
      },
      currentCycle: currentCycle
        ? {
            codename: currentCycle.codename,
            revealAt: currentCycle.revealAt,
            participationDeadline: currentCycle.participationDeadline,
          }
        : null,
    };
  }
}

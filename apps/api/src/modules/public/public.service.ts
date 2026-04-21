import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

type LandingPayload = {
  brand: string;
  tagline: string;
  stats: {
    registeredUsers: number;
    completedQuestionnaires: number;
    matchesDelivered: number;
  };
  currentCycle: {
    codename: string;
    revealAt: Date;
    participationDeadline: Date;
  } | null;
};

type CachedLandingPayload = {
  expiresAt: number;
  value: LandingPayload;
};

const LANDING_PAYLOAD_CACHE_TTL_MS = 30 * 1000;

@Injectable()
export class PublicService {
  private cachedLandingPayload: CachedLandingPayload | null = null;
  private landingPayloadInFlight: Promise<LandingPayload> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getLandingPayload() {
    const cachedPayload = this.readCachedLandingPayload();
    if (cachedPayload) {
      return cachedPayload;
    }

    if (this.landingPayloadInFlight) {
      return this.landingPayloadInFlight;
    }

    this.landingPayloadInFlight = this.loadLandingPayload().finally(() => {
      this.landingPayloadInFlight = null;
    });

    return this.landingPayloadInFlight;
  }

  private readCachedLandingPayload() {
    if (!this.cachedLandingPayload) {
      return null;
    }

    if (this.cachedLandingPayload.expiresAt <= Date.now()) {
      this.cachedLandingPayload = null;
      return null;
    }

    return this.cachedLandingPayload.value;
  }

  private async loadLandingPayload() {
    const [userCount, completedProfiles, matchCount, currentCycle] =
      await Promise.all([
        this.prisma.user.count({ where: { status: 'ACTIVE' } }),
        this.prisma.questionnaireResponse.count({
          where: { submittedAt: { not: null } },
        }),
        this.prisma.match.count(),
        this.prisma.matchCycle.findFirst({
          where: { status: { in: ['OPEN', 'REVEAL_READY'] } },
          orderBy: { revealAt: 'asc' },
        }),
      ]);

    const landingPayload = {
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
    } satisfies LandingPayload;

    this.cachedLandingPayload = {
      expiresAt: Date.now() + LANDING_PAYLOAD_CACHE_TTL_MS,
      value: landingPayload,
    };

    return landingPayload;
  }
}

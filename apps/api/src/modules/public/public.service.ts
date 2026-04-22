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

type EligibleSchool = {
  name: string;
  description: string | null;
  domains: string[];
};

type EligibleSchoolsPayload = {
  schools: EligibleSchool[];
  totalSchoolCount: number;
  totalDomainCount: number;
  generatedAt: Date;
};

type CachedLandingPayload = {
  expiresAt: number;
  value: LandingPayload;
};

type CachedEligibleSchoolsPayload = {
  expiresAt: number;
  value: EligibleSchoolsPayload;
};

const LANDING_PAYLOAD_CACHE_TTL_MS = 30 * 1000;
const ELIGIBLE_SCHOOLS_CACHE_TTL_MS = 30 * 1000;

@Injectable()
export class PublicService {
  private cachedLandingPayload: CachedLandingPayload | null = null;
  private landingPayloadInFlight: Promise<LandingPayload> | null = null;
  private cachedEligibleSchools: CachedEligibleSchoolsPayload | null = null;
  private eligibleSchoolsInFlight: Promise<EligibleSchoolsPayload> | null =
    null;

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

  async getEligibleSchools() {
    const cachedPayload = this.readCachedEligibleSchools();
    if (cachedPayload) {
      return cachedPayload;
    }

    if (this.eligibleSchoolsInFlight) {
      return this.eligibleSchoolsInFlight;
    }

    this.eligibleSchoolsInFlight = this.loadEligibleSchools().finally(() => {
      this.eligibleSchoolsInFlight = null;
    });

    return this.eligibleSchoolsInFlight;
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

  private readCachedEligibleSchools() {
    if (!this.cachedEligibleSchools) {
      return null;
    }

    if (this.cachedEligibleSchools.expiresAt <= Date.now()) {
      this.cachedEligibleSchools = null;
      return null;
    }

    return this.cachedEligibleSchools.value;
  }

  private async loadLandingPayload() {
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

  private async loadEligibleSchools() {
    const schools = await this.prisma.school.findMany({
      where: {
        domains: { some: {} },
      },
      select: {
        name: true,
        description: true,
        domains: {
          select: { domain: true },
          orderBy: { domain: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const eligibleSchools: EligibleSchool[] = schools.map((school) => ({
      name: school.name,
      description: school.description,
      domains: school.domains.map((entry) => entry.domain),
    }));

    const totalDomainCount = eligibleSchools.reduce(
      (count, school) => count + school.domains.length,
      0,
    );

    const payload: EligibleSchoolsPayload = {
      schools: eligibleSchools,
      totalSchoolCount: eligibleSchools.length,
      totalDomainCount,
      generatedAt: new Date(),
    };

    this.cachedEligibleSchools = {
      expiresAt: Date.now() + ELIGIBLE_SCHOOLS_CACHE_TTL_MS,
      value: payload,
    };

    return payload;
  }
}

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
  id: string;
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

// Public read-only snapshots. The TTL must exceed Neon's ~5min scale-to-zero
// idle threshold. The homepage fetches these via ISR, and an uptime monitor
// probing the homepage every 60s relays into a server-side landing fetch, so a
// 30s TTL re-queried Postgres roughly once a minute and pinned the compute
// awake 24/7. At 10min the DB is touched at most once per window, leaving a
// >5min query-free gap so Neon can scale to zero. Staleness is acceptable:
// landing counters are cosmetic, and eligible-schools edits invalidate the
// cache immediately via invalidateEligibleSchoolsCache().
const LANDING_PAYLOAD_CACHE_TTL_MS = 10 * 60 * 1000;
const ELIGIBLE_SCHOOLS_CACHE_TTL_MS = 10 * 60 * 1000;

function isTrustedSchoolEmailDomain(domain: string) {
  return domain.includes('.');
}

@Injectable()
export class PublicService {
  private cachedLandingPayload: CachedLandingPayload | null = null;
  private landingPayloadInFlight: Promise<LandingPayload> | null = null;
  private cachedEligibleSchools: CachedEligibleSchoolsPayload | null = null;
  private eligibleSchoolsInFlight: Promise<EligibleSchoolsPayload> | null =
    null;
  private eligibleSchoolsCacheEpoch = 0;

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

    const cacheEpoch = this.eligibleSchoolsCacheEpoch;
    this.eligibleSchoolsInFlight = this.loadEligibleSchools(cacheEpoch).finally(
      () => {
        this.eligibleSchoolsInFlight = null;
      },
    );

    return this.eligibleSchoolsInFlight;
  }

  // Drop the cached payload so the next read reflects an admin eligibility change before the TTL expires.
  invalidateEligibleSchoolsCache() {
    this.eligibleSchoolsCacheEpoch += 1;
    this.cachedEligibleSchools = null;
    this.eligibleSchoolsInFlight = null;
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

  private async loadEligibleSchools(cacheEpoch: number) {
    const schools = await this.prisma.school.findMany({
      // Only schools flagged eligible in the admin school center are offered for
      // self-registration; this is the single source of truth shared by the
      // public schools page and the registration manual-school dropdown.
      where: {
        registrationEligible: true,
        domains: { some: {} },
      },
      select: {
        id: true,
        name: true,
        description: true,
        domains: {
          select: { domain: true },
          orderBy: { domain: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const eligibleSchools: EligibleSchool[] = schools
      .map((school) => ({
        id: school.id,
        name: school.name,
        description: school.description,
        domains: school.domains
          .map((entry) => entry.domain)
          .filter(isTrustedSchoolEmailDomain),
      }))
      .filter((school) => school.domains.length > 0);

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

    // Skip caching if the data was invalidated while this load was in flight,
    // so a concurrent admin change is never masked by a stale snapshot.
    if (cacheEpoch === this.eligibleSchoolsCacheEpoch) {
      this.cachedEligibleSchools = {
        expiresAt: Date.now() + ELIGIBLE_SCHOOLS_CACHE_TTL_MS,
        value: payload,
      };
    }

    return payload;
  }
}

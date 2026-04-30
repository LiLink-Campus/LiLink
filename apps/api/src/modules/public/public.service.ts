import { Injectable } from '@nestjs/common';
import {
  DEFAULT_LOCALE,
  PUBLIC_SUPPORTED_SCHOOL_SLUGS,
  localizePublicSupportedSchool,
  normalizeLocale,
  publicSupportedSchoolSortIndex,
  type SupportedLocale,
} from '@lilink/shared';
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
  slug: string;
  name: string;
  nativeName: string;
  englishName: string;
  baseName: string;
  nativeBaseName: string;
  englishBaseName: string;
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
const LANDING_TAGLINE_BY_LOCALE: Record<SupportedLocale, string> = {
  'zh-CN': '在黎安，遇见真正同频的人。',
  'en-US': 'Meet someone genuinely compatible on LiLink.',
};

@Injectable()
export class PublicService {
  private cachedLandingPayload: Partial<
    Record<SupportedLocale, CachedLandingPayload>
  > = {};
  private landingPayloadInFlight: Partial<
    Record<SupportedLocale, Promise<LandingPayload>>
  > = {};
  private cachedEligibleSchools: Partial<
    Record<SupportedLocale, CachedEligibleSchoolsPayload>
  > = {};
  private eligibleSchoolsInFlight: Partial<
    Record<SupportedLocale, Promise<EligibleSchoolsPayload>>
  > = {};

  constructor(private readonly prisma: PrismaService) {}

  async getLandingPayload(locale: unknown = DEFAULT_LOCALE) {
    const normalizedLocale = normalizeLocale(locale);
    const cachedPayload = this.readCachedLandingPayload(normalizedLocale);
    if (cachedPayload) {
      return cachedPayload;
    }

    if (this.landingPayloadInFlight[normalizedLocale]) {
      return this.landingPayloadInFlight[normalizedLocale];
    }

    const inFlight = this.loadLandingPayload(normalizedLocale).finally(() => {
      delete this.landingPayloadInFlight[normalizedLocale];
    });
    this.landingPayloadInFlight[normalizedLocale] = inFlight;

    return inFlight;
  }

  async getEligibleSchools(locale: unknown = DEFAULT_LOCALE) {
    const normalizedLocale = normalizeLocale(locale);
    const cachedPayload = this.readCachedEligibleSchools(normalizedLocale);
    if (cachedPayload) {
      return cachedPayload;
    }

    if (this.eligibleSchoolsInFlight[normalizedLocale]) {
      return this.eligibleSchoolsInFlight[normalizedLocale];
    }

    const inFlight = this.loadEligibleSchools(normalizedLocale).finally(() => {
      delete this.eligibleSchoolsInFlight[normalizedLocale];
    });
    this.eligibleSchoolsInFlight[normalizedLocale] = inFlight;

    return inFlight;
  }

  private readCachedLandingPayload(locale: SupportedLocale) {
    const cachedPayload = this.cachedLandingPayload[locale];
    if (!cachedPayload) {
      return null;
    }

    if (cachedPayload.expiresAt <= Date.now()) {
      delete this.cachedLandingPayload[locale];
      return null;
    }

    return cachedPayload.value;
  }

  private readCachedEligibleSchools(locale: SupportedLocale) {
    const cachedSchools = this.cachedEligibleSchools[locale];
    if (!cachedSchools) {
      return null;
    }

    if (cachedSchools.expiresAt <= Date.now()) {
      delete this.cachedEligibleSchools[locale];
      return null;
    }

    return cachedSchools.value;
  }

  private async loadLandingPayload(locale: SupportedLocale) {
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
      tagline: LANDING_TAGLINE_BY_LOCALE[locale],
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

    this.cachedLandingPayload[locale] = {
      expiresAt: Date.now() + LANDING_PAYLOAD_CACHE_TTL_MS,
      value: landingPayload,
    };

    return landingPayload;
  }

  private async loadEligibleSchools(locale: SupportedLocale) {
    const schools = await this.prisma.school.findMany({
      where: {
        slug: { in: [...PUBLIC_SUPPORTED_SCHOOL_SLUGS] },
        domains: { some: {} },
      },
      select: {
        slug: true,
        domains: {
          select: { domain: true },
          orderBy: { domain: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const eligibleSchools: EligibleSchool[] = schools
      .flatMap((school): EligibleSchool[] => {
        const localizedSchool = localizePublicSupportedSchool(
          school.slug,
          locale,
        );
        if (!localizedSchool) {
          return [];
        }

        return [
          {
            slug: localizedSchool.slug,
            name: localizedSchool.name,
            nativeName: localizedSchool.nativeName,
            englishName: localizedSchool.englishName,
            baseName: localizedSchool.baseName,
            nativeBaseName: localizedSchool.nativeBaseName,
            englishBaseName: localizedSchool.englishBaseName,
            domains: school.domains.map((entry) => entry.domain),
          },
        ];
      })
      .sort(
        (left, right) =>
          publicSupportedSchoolSortIndex(left.slug) -
          publicSupportedSchoolSortIndex(right.slug),
      );

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

    this.cachedEligibleSchools[locale] = {
      expiresAt: Date.now() + ELIGIBLE_SCHOOLS_CACHE_TTL_MS,
      value: payload,
    };

    return payload;
  }
}

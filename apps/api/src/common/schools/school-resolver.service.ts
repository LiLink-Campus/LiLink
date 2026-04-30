import { Injectable } from '@nestjs/common';
import {
  PUBLIC_SUPPORTED_SCHOOL_SLUGS,
  isPublicSupportedSchoolSlug,
  localizePublicSupportedSchool,
} from '@lilink/shared';
import { PrismaService } from '../prisma/prisma.service';

type SchoolResolution = {
  schoolId: string;
  matchedDomain: string;
  schoolName: string;
  schoolSlug: string;
  schoolDescription: string | null;
  schoolNativeName: string;
  schoolEnglishName: string;
  schoolNativeBaseName: string;
  schoolEnglishBaseName: string;
};

type CachedSchoolResolution = {
  expiresAt: number;
  value: SchoolResolution | null;
};

const SCHOOL_RESOLUTION_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class SchoolResolverService {
  private readonly resolutionCache = new Map<string, CachedSchoolResolution>();
  private readonly inFlightResolutions = new Map<
    string,
    Promise<SchoolResolution | null>
  >();
  private cacheEpoch = 0;

  constructor(private readonly prisma: PrismaService) {}

  async resolveByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const atIndex = normalizedEmail.lastIndexOf('@');

    if (atIndex === -1) {
      return null;
    }

    const emailDomain = normalizedEmail.slice(atIndex + 1);
    const cachedResolution = this.readCachedResolution(emailDomain);
    if (cachedResolution !== undefined) {
      return cachedResolution;
    }

    const inFlightResolution = this.inFlightResolutions.get(emailDomain);
    if (inFlightResolution) {
      return inFlightResolution;
    }

    const cacheEpoch = this.cacheEpoch;
    const pendingResolution = this.loadResolutionByDomain(
      emailDomain,
      cacheEpoch,
    ).finally(() => {
      this.inFlightResolutions.delete(emailDomain);
    });
    this.inFlightResolutions.set(emailDomain, pendingResolution);

    return pendingResolution;
  }

  invalidateResolutionCache() {
    this.cacheEpoch += 1;
    this.resolutionCache.clear();
    this.inFlightResolutions.clear();
  }

  private readCachedResolution(emailDomain: string) {
    const cachedEntry = this.resolutionCache.get(emailDomain);
    if (!cachedEntry) {
      return undefined;
    }

    if (cachedEntry.expiresAt <= Date.now()) {
      this.resolutionCache.delete(emailDomain);
      return undefined;
    }

    return cachedEntry.value;
  }

  private async loadResolutionByDomain(
    emailDomain: string,
    cacheEpoch: number,
  ) {
    const candidateDomains = emailDomain
      .split('.')
      .map((_, index, parts) => parts.slice(index).join('.'))
      .filter(Boolean);

    const domains = await this.prisma.schoolDomain.findMany({
      where: {
        domain: {
          in: candidateDomains,
        },
        school: {
          slug: { in: [...PUBLIC_SUPPORTED_SCHOOL_SLUGS] },
        },
      },
      include: {
        school: true,
      },
    });

    const match = [...domains]
      .filter((item) => isPublicSupportedSchoolSlug(item.school.slug))
      .sort((left, right) => right.domain.length - left.domain.length)
      .find(
        (item) =>
          emailDomain === item.domain ||
          emailDomain.endsWith(`.${item.domain}`),
      );

    const localizedSchool = match
      ? localizePublicSupportedSchool(match.school.slug)
      : null;

    const resolution =
      match && localizedSchool
        ? {
            schoolId: match.schoolId,
            matchedDomain: match.domain,
            schoolName: localizedSchool.nativeName,
            schoolSlug: match.school.slug,
            schoolDescription:
              localizedSchool.description ?? match.school.description,
            schoolNativeName: localizedSchool.nativeName,
            schoolEnglishName: localizedSchool.englishName,
            schoolNativeBaseName: localizedSchool.nativeBaseName,
            schoolEnglishBaseName: localizedSchool.englishBaseName,
          }
        : null;

    if (cacheEpoch === this.cacheEpoch) {
      this.resolutionCache.set(emailDomain, {
        expiresAt: Date.now() + SCHOOL_RESOLUTION_CACHE_TTL_MS,
        value: resolution,
      });
    }

    return resolution;
  }
}

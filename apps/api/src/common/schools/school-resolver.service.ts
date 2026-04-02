import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchoolResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const atIndex = normalizedEmail.lastIndexOf('@');

    if (atIndex === -1) {
      return null;
    }

    const emailDomain = normalizedEmail.slice(atIndex + 1);
    const candidateDomains = emailDomain
      .split('.')
      .map((_, index, parts) => parts.slice(index).join('.'))
      .filter(Boolean);

    const domains = await this.prisma.schoolDomain.findMany({
      where: {
        domain: {
          in: candidateDomains,
        },
      },
      include: {
        school: true,
      },
    });

    const match = [...domains]
      .sort((left, right) => right.domain.length - left.domain.length)
      .find(
        (item) =>
          emailDomain === item.domain ||
          emailDomain.endsWith(`.${item.domain}`),
      );

    if (!match) {
      return null;
    }

    return {
      schoolId: match.schoolId,
      matchedDomain: match.domain,
      schoolName: match.school.name,
      schoolSlug: match.school.slug,
      schoolDescription: match.school.description,
    };
  }
}

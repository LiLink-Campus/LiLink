import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSchoolDto, ListSchoolsQueryDto, UpdateSchoolDto } from './dto';
import { AdminAuditService } from './admin-audit.service';

@Injectable()
export class AdminSchoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async list(query: ListSchoolsQueryDto = {}) {
    if (!this.hasListQuery(query)) {
      return this.prisma.school.findMany({
        include: {
          domains: {
            orderBy: { domain: 'asc' },
          },
          _count: {
            select: {
              users: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    }

    const pagination = this.normalizePagination(query);
    const search = query.search?.trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
            {
              domains: {
                some: {
                  domain: { contains: search, mode: 'insensitive' as const },
                },
              },
            },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        include: {
          domains: {
            orderBy: { domain: 'asc' },
          },
          _count: {
            select: {
              users: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.school.count({ where }),
    ]);

    return this.buildPageResult(items, total, pagination);
  }

  async create(input: CreateSchoolDto, adminActorId: string) {
    const normalizedDomains = this.normalizeDomains(input.domains);

    const school = await this.prisma.school.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        domains: {
          create: normalizedDomains.map((domain) => ({ domain })),
        },
      },
      include: {
        domains: true,
      },
    });

    await this.adminAuditService.write(adminActorId, 'school.created', {
      schoolId: school.id,
      slug: school.slug,
    });

    return school;
  }

  async update(schoolId: string, input: UpdateSchoolDto, adminActorId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new NotFoundException('School not found.');
    }

    const normalizedDomains = this.normalizeDomains(input.domains);

    const updatedSchool = await this.prisma.$transaction(async (tx) => {
      await tx.schoolDomain.deleteMany({
        where: { schoolId },
      });

      await tx.schoolDomain.deleteMany({
        where: { domain: { in: normalizedDomains } },
      });

      return tx.school.update({
        where: { id: schoolId },
        data: {
          name: input.name,
          description: input.description,
          domains: {
            create: normalizedDomains.map((domain) => ({ domain })),
          },
        },
        include: { domains: true },
      });
    });

    await this.adminAuditService.write(adminActorId, 'school.updated', {
      schoolId: updatedSchool.id,
      slug: updatedSchool.slug,
    });

    return updatedSchool;
  }

  async merge(
    sourceSchoolId: string,
    targetSchoolId: string,
    adminActorId: string,
  ) {
    if (sourceSchoolId === targetSchoolId) {
      throw new BadRequestException('Cannot merge a school into itself.');
    }

    const [source, target] = await Promise.all([
      this.prisma.school.findUnique({
        where: { id: sourceSchoolId },
        include: { domains: true, _count: { select: { users: true } } },
      }),
      this.prisma.school.findUnique({
        where: { id: targetSchoolId },
      }),
    ]);

    if (!source) throw new NotFoundException('Source school not found.');
    if (!target) throw new NotFoundException('Target school not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { schoolId: sourceSchoolId },
        data: { schoolId: targetSchoolId },
      });

      await tx.schoolDomain.updateMany({
        where: { schoolId: sourceSchoolId },
        data: { schoolId: targetSchoolId },
      });

      await tx.school.delete({ where: { id: sourceSchoolId } });
    });

    await this.adminAuditService.write(adminActorId, 'school.merged', {
      sourceSchoolId,
      sourceSchoolName: source.name,
      targetSchoolId,
      targetSchoolName: target.name,
      movedUserCount: source._count.users,
      movedDomainCount: source.domains.length,
    });

    return { ok: true, movedUsers: source._count.users };
  }

  async delete(schoolId: string, adminActorId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new NotFoundException('School not found.');
    }

    await this.prisma.schoolDomain.deleteMany({ where: { schoolId } });
    await this.prisma.school.delete({ where: { id: schoolId } });
    await this.adminAuditService.write(adminActorId, 'school.deleted', {
      schoolId,
      slug: school.slug,
    });
    return { ok: true };
  }

  private hasListQuery(query: ListSchoolsQueryDto) {
    return Boolean(query.page || query.pageSize || query.search);
  }

  private normalizeDomains(rawDomains: string[]) {
    const normalizedDomains = rawDomains
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);

    if (normalizedDomains.length === 0) {
      throw new BadRequestException(
        'At least one valid email domain is required.',
      );
    }

    return [...new Set(normalizedDomains)];
  }

  private normalizePagination(query: { page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 12, 50);

    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize,
    };
  }

  private buildPageResult<T>(
    items: T[],
    total: number,
    pagination: { page: number; pageSize: number },
  ) {
    return {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    };
  }
}

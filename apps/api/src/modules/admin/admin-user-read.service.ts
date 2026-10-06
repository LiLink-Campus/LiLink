import { adminUserListSelect } from './admin-read-projections';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { syncQuestionnaireSchoolAnswers } from '../questionnaire/questionnaire-school-sync';
import {
  buildPageResult,
  normalizeAdminListPagination,
} from '../../common/pagination';
import { ADMIN_LIST_UNFILTERED_MAX } from '../../common/validation/input-limits';
import { ListUserParticipationsQueryDto, ListUsersQueryDto } from './dto';
import { hasAdminListQuery } from './admin-list-query';

@Injectable()
export class AdminUserReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...adminUserListSelect,
        questionnaireResponse: {
          select: {
            submittedAt: true,
            answers: true,
          },
        },
        _count: {
          select: {
            participations: {
              where: { status: 'OPTED_IN' },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      displayName: user.displayName,
      isTest: user.isTest,
      createdAt: user.createdAt,
      nonEduReferralLimit: user.nonEduReferralLimit,
      nonEduReferralUses: user.nonEduReferralUses,
      school: user.school,
      profile: user.profile,
      questionnaireResponse: user.questionnaireResponse
        ? {
            submittedAt: user.questionnaireResponse.submittedAt,
          }
        : null,
      participationCount: user._count.participations,
      questionnaireAnswerCount:
        user.questionnaireResponse &&
        typeof user.questionnaireResponse.answers === 'object' &&
        user.questionnaireResponse.answers
          ? Object.keys(user.questionnaireResponse.answers).length
          : 0,
    };
  }

  async getUsers(query: ListUsersQueryDto = {}) {
    if (!hasAdminListQuery(query)) {
      return this.prisma.user.findMany({
        where: { deactivatedAt: null },
        select: adminUserListSelect,
        orderBy: { createdAt: 'desc' },
        take: ADMIN_LIST_UNFILTERED_MAX,
      });
    }

    const pagination = normalizeAdminListPagination(query);
    const search = query.search?.trim();
    const whereClauses: Prisma.UserWhereInput[] = [{ deactivatedAt: null }];

    if (query.status) {
      whereClauses.push({ status: query.status });
    }

    if (query.questionnaire === 'submitted') {
      whereClauses.push({
        questionnaireResponse: {
          is: { submittedAt: { not: null } },
        },
      });
    }

    if (query.questionnaire === 'missing') {
      whereClauses.push({
        OR: [
          { questionnaireResponse: { is: null } },
          { questionnaireResponse: { is: { submittedAt: null } } },
        ],
      });
    }

    if (query.userType === 'test') {
      whereClauses.push({ isTest: true });
    } else if (query.userType === 'real') {
      whereClauses.push({ isTest: false });
    }

    if (query.gender && query.gender !== 'all') {
      whereClauses.push({
        questionnaireResponse: {
          is: {
            answers: {
              path: ['hard_gender'],
              equals: query.gender,
            },
          },
        },
      });
    }

    if (search) {
      whereClauses.push({
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          {
            displayName: { contains: search, mode: 'insensitive' },
          },
          {
            profile: {
              is: {
                fullName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            school: {
              is: {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      });
    }

    const where = whereClauses.length > 0 ? { AND: whereClauses } : undefined;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: adminUserListSelect,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }

  async getUserQuestionnaire(userId: string) {
    const [user, schools] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          schoolId: true,
          questionnaireResponse: {
            select: {
              submittedAt: true,
              answers: true,
            },
          },
        },
      }),
      this.prisma.school.findMany({
        select: { id: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (!user.questionnaireResponse) {
      return null;
    }

    return {
      submittedAt: user.questionnaireResponse.submittedAt,
      answers: syncQuestionnaireSchoolAnswers(
        user.questionnaireResponse.answers as Record<string, unknown>,
        {
          currentSchoolId: user.schoolId ?? null,
          allowedSchoolIds: schools.map((school) => school.id),
        },
      ),
    };
  }

  async getUserParticipations(
    userId: string,
    query: ListUserParticipationsQueryDto = {},
  ) {
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!userExists) {
      throw new NotFoundException('User not found.');
    }

    const pagination = normalizeAdminListPagination(query);
    const where = { userId };

    const [items, total] = await Promise.all([
      this.prisma.cycleParticipation.findMany({
        where,
        select: {
          cycleId: true,
          status: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.cycleParticipation.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }
}

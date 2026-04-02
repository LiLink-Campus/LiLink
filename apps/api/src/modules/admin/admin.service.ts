import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CyclesService } from '../cycles/cycles.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminSchoolService } from './admin-school.service';
import {
  BatchReviewReportsDto,
  ListAuditLogsQueryDto,
  ListCyclesQueryDto,
  ListReportsQueryDto,
  ListSchoolsQueryDto,
  ListUsersQueryDto,
  RunCycleDto,
  ReorderQuestionsDto,
  ReviewReportDto,
  UpdateUserStatusDto,
  UpsertCycleDto,
  UpsertQuestionDto,
} from './dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cyclesService: CyclesService,
    private readonly adminAuditService: AdminAuditService,
    private readonly adminSchoolService: AdminSchoolService,
  ) {}

  async getOverview() {
    const [schools, cycles, users, questionnaireVersion, reports] =
      await Promise.all([
        this.prisma.school.findMany({
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
        }),
        this.prisma.matchCycle.findMany({
          include: {
            _count: {
              select: {
                participations: true,
                matches: true,
              },
            },
          },
          orderBy: { revealAt: 'desc' },
          take: 6,
        }),
        this.prisma.user.findMany({
          omit: { passwordHash: true },
          include: {
            school: true,
            profile: true,
            questionnaireResponse: true,
            participations: {
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.questionnaireVersion.findFirst({
          where: { isCurrent: true },
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        }),
        this.prisma.report.findMany({
          include: {
            reporter: {
              include: {
                school: true,
              },
            },
            reportedUser: {
              include: {
                school: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return {
      schools,
      cycles,
      users,
      reports,
      questionnaireQuestions:
        questionnaireVersion?.questions.map((question) => ({
          key: question.key,
          prompt: question.prompt,
        })) ?? [],
    };
  }

  async getDashboard() {
    const [
      schools,
      recentCycles,
      openReports,
      openReportCount,
      activeUsers,
      completedQuestionnaires,
    ] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.matchCycle.findMany({
        include: {
          _count: {
            select: {
              participations: true,
              matches: true,
            },
          },
        },
        orderBy: { revealAt: 'desc' },
        take: 6,
      }),
      this.prisma.report.findMany({
        where: { status: 'OPEN' },
        include: {
          reporter: {
            include: {
              school: true,
            },
          },
          reportedUser: {
            include: {
              school: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.report.count({
        where: { status: 'OPEN' },
      }),
      this.prisma.user.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.questionnaireResponse.count({
        where: {
          submittedAt: { not: null },
        },
      }),
    ]);

    return {
      metrics: {
        schools,
        activeUsers,
        completedQuestionnaires,
        openReports: openReportCount,
      },
      recentCycles,
      openReports,
    };
  }

  async getSchools(query: ListSchoolsQueryDto = {}) {
    return this.adminSchoolService.list(query);
  }

  async getCycles(query: ListCyclesQueryDto = {}) {
    if (!this.hasListQuery(query)) {
      return this.prisma.matchCycle.findMany({
        include: {
          _count: {
            select: {
              participations: true,
              matches: true,
            },
          },
        },
        orderBy: { revealAt: 'desc' },
      });
    }

    const pagination = this.normalizePagination(query);
    const search = query.search?.trim();
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { codename: { contains: search, mode: 'insensitive' as const } },
              { notes: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.matchCycle.findMany({
        where,
        include: {
          _count: {
            select: {
              participations: true,
              matches: true,
            },
          },
        },
        orderBy: { revealAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.matchCycle.count({ where }),
    ]);

    return this.buildPageResult(items, total, pagination);
  }

  async getReports(query: ListReportsQueryDto = {}) {
    if (!this.hasListQuery(query)) {
      return this.prisma.report.findMany({
        include: {
          reporter: {
            include: {
              school: true,
            },
          },
          reportedUser: {
            include: {
              school: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const pagination = this.normalizePagination(query);
    const search = query.search?.trim();
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { reason: { contains: search, mode: 'insensitive' as const } },
              { details: { contains: search, mode: 'insensitive' as const } },
              {
                reporter: {
                  email: { contains: search, mode: 'insensitive' as const },
                },
              },
              {
                reportedUser: {
                  email: { contains: search, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          reporter: {
            include: {
              school: true,
            },
          },
          reportedUser: {
            include: {
              school: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);

    return this.buildPageResult(items, total, pagination);
  }

  async getUsers(query: ListUsersQueryDto = {}) {
    if (!this.hasListQuery(query)) {
      return this.prisma.user.findMany({
        omit: { passwordHash: true },
        include: {
          school: true,
          profile: true,
          questionnaireResponse: true,
          participations: {
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const pagination = this.normalizePagination(query);
    const search = query.search?.trim();
    const whereClauses: Prisma.UserWhereInput[] = [];

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
        omit: { passwordHash: true },
        include: {
          school: true,
          profile: true,
          questionnaireResponse: true,
          participations: {
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return this.buildPageResult(items, total, pagination);
  }

  async getAuditLogs(query: ListAuditLogsQueryDto = {}) {
    return this.adminAuditService.listAuditLogs(query);
  }

  async createSchool(
    input: Parameters<AdminSchoolService['create']>[0],
    adminActorId: string,
  ) {
    return this.adminSchoolService.create(input, adminActorId);
  }

  async updateSchool(
    schoolId: string,
    input: Parameters<AdminSchoolService['update']>[1],
    adminActorId: string,
  ) {
    return this.adminSchoolService.update(schoolId, input, adminActorId);
  }

  async deleteSchool(schoolId: string, adminActorId: string) {
    return this.adminSchoolService.delete(schoolId, adminActorId);
  }

  async upsertCycle(input: UpsertCycleDto, adminActorId: string) {
    if (input.cycleId) {
      const cycle = await this.prisma.matchCycle.update({
        where: { id: input.cycleId },
        data: {
          codename: input.codename,
          participationDeadline: new Date(input.participationDeadline),
          revealAt: new Date(input.revealAt),
          status: input.status,
          notes: input.notes,
        },
      });

      await this.adminAuditService.write(adminActorId, 'cycle.updated', {
        cycleId: cycle.id,
        status: cycle.status,
      });

      return cycle;
    }

    const cycle = await this.prisma.matchCycle.create({
      data: {
        codename: input.codename,
        participationDeadline: new Date(input.participationDeadline),
        revealAt: new Date(input.revealAt),
        status: input.status,
        notes: input.notes,
      },
    });

    await this.adminAuditService.write(adminActorId, 'cycle.created', {
      cycleId: cycle.id,
      status: cycle.status,
    });

    return cycle;
  }

  async getCycleDetail(cycleId: string) {
    const cycle = await this.prisma.matchCycle.findUnique({
      where: { id: cycleId },
      include: {
        participations: {
          include: {
            user: {
              omit: { passwordHash: true },
              include: {
                school: true,
                profile: true,
                questionnaireResponse: true,
              },
            },
          },
          orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
        },
        matches: {
          include: {
            participants: {
              include: {
                user: {
                  omit: { passwordHash: true },
                  include: {
                    school: true,
                    profile: true,
                  },
                },
              },
            },
            reports: {
              include: {
                reporter: {
                  include: {
                    school: true,
                  },
                },
                reportedUser: {
                  include: {
                    school: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    const cycleLogs =
      await this.adminAuditService.getRecentAuditLogsByCondition(
        Prisma.sql`"metadata"->>'cycleId' = ${cycleId}`,
        100,
      );

    return {
      cycle,
      summary: {
        participationCount: cycle.participations.length,
        optedInCount: cycle.participations.filter(
          (item) => item.status === 'OPTED_IN',
        ).length,
        matchedPairCount: cycle.matches.length,
        reportedMatchCount: cycle.matches.filter(
          (match) => match.reports.length > 0,
        ).length,
        pendingContactCount: cycle.matches.filter(
          (match) => !match.introducedAt,
        ).length,
      },
      logs: cycleLogs,
    };
  }

  async previewCycle(cycleId: string) {
    return this.cyclesService.previewCycle(cycleId);
  }

  async duplicateCycle(cycleId: string, adminActorId: string) {
    const cycle = await this.prisma.matchCycle.findUnique({
      where: { id: cycleId },
    });

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    const duplicate = await this.prisma.matchCycle.create({
      data: {
        codename: `${cycle.codename}-copy-${Date.now().toString().slice(-4)}`,
        participationDeadline: cycle.participationDeadline,
        revealAt: cycle.revealAt,
        status: 'DRAFT',
        notes: cycle.notes
          ? `${cycle.notes}\n\nDuplicated from ${cycle.codename}.`
          : `Duplicated from ${cycle.codename}.`,
      },
    });

    await this.adminAuditService.write(adminActorId, 'cycle.duplicated', {
      sourceCycleId: cycleId,
      duplicateCycleId: duplicate.id,
    });

    return duplicate;
  }

  async runCycle(input: RunCycleDto, adminActorId: string) {
    return this.cyclesService.runRevealCycle({
      cycleId: input.cycleId,
      force: input.force ?? false,
      adminActorId,
    });
  }

  async getQuestions() {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!version) {
      const created = await this.prisma.questionnaireVersion.create({
        data: {
          title: 'Default Questionnaire',
          isCurrent: true,
        },
        include: { questions: true },
      });
      return created;
    }

    return version;
  }

  async upsertQuestion(input: UpsertQuestionDto, adminActorId: string) {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
    });

    if (!version) {
      throw new NotFoundException('No active questionnaire version found.');
    }

    const normalizedOptions = this.normalizeQuestionOptions(
      input.type,
      input.options,
    );

    if (input.questionId) {
      const question = await this.prisma.question.update({
        where: { id: input.questionId },
        data: {
          key: input.key,
          prompt: input.prompt,
          type: input.type,
          options: normalizedOptions,
          order: input.order,
          weight: input.weight ?? 1,
        },
      });

      await this.adminAuditService.write(adminActorId, 'question.updated', {
        questionId: question.id,
        key: question.key,
        type: question.type,
      });

      return question;
    }

    const question = await this.prisma.question.create({
      data: {
        versionId: version.id,
        key: input.key,
        prompt: input.prompt,
        type: input.type,
        options: normalizedOptions,
        order: input.order,
        weight: input.weight ?? 1,
      },
    });

    await this.adminAuditService.write(adminActorId, 'question.created', {
      questionId: question.id,
      key: question.key,
      type: question.type,
    });

    return question;
  }

  async reorderQuestions(input: ReorderQuestionsDto, adminActorId: string) {
    const questions = await this.prisma.question.findMany({
      where: {
        id: { in: input.questionIds },
      },
    });

    if (questions.length !== input.questionIds.length) {
      throw new NotFoundException('Some questions were not found.');
    }

    await this.prisma.$transaction(
      input.questionIds.map((questionId, index) =>
        this.prisma.question.update({
          where: { id: questionId },
          data: {
            order: index + 1,
          },
        }),
      ),
    );

    await this.adminAuditService.write(adminActorId, 'question.reordered', {
      questionIds: input.questionIds,
    });

    return { ok: true };
  }

  async deleteQuestion(questionId: string, adminActorId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found.');
    }

    await this.prisma.question.delete({ where: { id: questionId } });
    await this.adminAuditService.write(adminActorId, 'question.deleted', {
      questionId,
      key: question.key,
    });
    return { ok: true };
  }

  async getReportContext(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          omit: { passwordHash: true },
          include: {
            school: true,
            profile: true,
          },
        },
        reportedUser: {
          omit: { passwordHash: true },
          include: {
            school: true,
            profile: true,
            reportsReceived: {
              include: {
                reporter: {
                  include: {
                    school: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            reportsFiled: {
              include: {
                reportedUser: {
                  include: {
                    school: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
        match: {
          include: {
            participants: {
              include: {
                user: {
                  omit: { passwordHash: true },
                  include: {
                    school: true,
                    profile: true,
                  },
                },
              },
            },
            reports: {
              include: {
                reporter: true,
                reportedUser: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Report was not found.');
    }

    const [blockState, relatedLogs] = await Promise.all([
      this.prisma.block.findMany({
        where: {
          OR: [
            {
              blockerId: report.reporterId,
              blockedId: report.reportedUserId,
            },
            {
              blockerId: report.reportedUserId,
              blockedId: report.reporterId,
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.adminAuditService.getRecentAuditLogsByCondition(
        Prisma.sql`
          "metadata"->>'reportId' = ${reportId}
          OR "metadata"->>'reportedUserId' = ${report.reportedUserId}
          OR "metadata"->>'userId' = ${report.reportedUserId}
        `,
        120,
      ),
    ]);

    return {
      report,
      riskProfile: {
        reportedUserStatus: report.reportedUser.status,
        receivedReportCount: report.reportedUser.reportsReceived.length,
        filedReportCount: report.reportedUser.reportsFiled.length,
        resolvedReportCount: report.reportedUser.reportsReceived.filter(
          (item) => item.status === 'RESOLVED',
        ).length,
        openReportCount: report.reportedUser.reportsReceived.filter(
          (item) => item.status === 'OPEN',
        ).length,
        mutualBlocks: blockState,
      },
      logs: relatedLogs,
    };
  }

  async batchReviewReports(input: BatchReviewReportsDto, adminActorId: string) {
    const reports = await this.prisma.report.findMany({
      where: {
        id: { in: input.reportIds },
      },
    });

    if (reports.length === 0) {
      throw new NotFoundException('Reports not found.');
    }

    const operations: Prisma.PrismaPromise<unknown>[] = reports.flatMap(
      (report) => {
        const reportOperations: Prisma.PrismaPromise<unknown>[] = [
          this.prisma.report.update({
            where: { id: report.id },
            data: {
              status: input.status,
              adminNotes: input.notes,
              handledAt: new Date(),
            },
          }),
        ];

        if (input.suspendUsers) {
          reportOperations.push(
            this.prisma.user.update({
              where: { id: report.reportedUserId },
              data: { status: 'SUSPENDED' },
            }),
          );
        }

        return reportOperations;
      },
    );

    operations.push(
      this.prisma.auditLog.create({
        data: {
          adminActorId,
          action: 'report.batch_reviewed',
          metadata: {
            reportIds: input.reportIds,
            status: input.status,
            suspendUsers: input.suspendUsers ?? false,
          },
        },
      }),
    );

    await this.prisma.$transaction(operations);

    return {
      ok: true,
      processed: reports.length,
    };
  }

  async reviewReport(
    reportId: string,
    input: ReviewReportDto,
    adminActorId: string,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report was not found.');
    }

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.report.update({
        where: { id: reportId },
        data: {
          status: input.status,
          adminNotes: input.notes,
          handledAt: new Date(),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          adminActorId,
          action: 'report.reviewed',
          metadata: {
            reportId,
            status: input.status,
            suspendUser: input.suspendUser ?? false,
          },
        },
      }),
    ];

    if (input.suspendUser) {
      operations.push(
        this.prisma.user.update({
          where: { id: report.reportedUserId },
          data: { status: 'SUSPENDED' },
        }),
      );
    }

    await this.prisma.$transaction(operations);

    return { ok: true };
  }

  async updateUserStatus(
    userId: string,
    input: UpdateUserStatusDto,
    adminActorId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: input.status,
      },
      omit: { passwordHash: true },
    });

    await this.adminAuditService.write(adminActorId, 'user.status_updated', {
      userId,
      status: input.status,
    });

    return updatedUser;
  }

  private normalizeQuestionOptions(
    questionType: UpsertQuestionDto['type'],
    options?: string[],
  ) {
    if (questionType === 'SHORT_TEXT') {
      return Prisma.JsonNull;
    }

    const normalizedOptions =
      options?.map((option) => option.trim()).filter(Boolean) ?? [];

    if (normalizedOptions.length < 2) {
      throw new BadRequestException(
        'Selectable questions must define at least two options.',
      );
    }

    return normalizedOptions;
  }

  private hasListQuery(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    questionnaire?: string;
    action?: string;
  }) {
    return Boolean(
      query.page ||
      query.pageSize ||
      query.search ||
      query.status ||
      query.questionnaire ||
      query.action,
    );
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

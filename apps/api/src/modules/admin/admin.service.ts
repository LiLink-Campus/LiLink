import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, QuestionType, UserStatus } from '../../common/prisma/client';
import * as argon2 from 'argon2';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ensureStickyCycleParticipations } from '../../common/participation/sticky-cycle-participation';
import { parseDateTimeAsChinaStandardOrInstant } from '../../common/time/china-standard-time';
import { env } from '../../config/env';
import { CyclesService } from '../cycles/cycles.service';
import { normalizeQuestionOptions } from '../questionnaire/questionnaire-config';
import { syncQuestionnaireSchoolAnswers } from '../questionnaire/questionnaire-school-sync';
import { AdminAuditService } from './admin-audit.service';
import { AdminSchoolService } from './admin-school.service';
import { generateSeedTestUserPassword } from './seed-test-user-password';
import {
  buildPageResult,
  normalizeAdminListPagination,
} from '../../common/pagination';
import { ADMIN_LIST_UNFILTERED_MAX } from '../../common/validation/input-limits';
import {
  AdminUpdateUserDto,
  BatchReviewReportsDto,
  ListAuditLogsQueryDto,
  ListCycleLogsQueryDto,
  ListCycleMatchesQueryDto,
  ListCycleParticipantsQueryDto,
  ListCyclesQueryDto,
  ListReportsQueryDto,
  ListSchoolsQueryDto,
  ListUserParticipationsQueryDto,
  ListUsersQueryDto,
  RunCycleDto,
  ReorderQuestionsDto,
  ReviewReportDto,
  UpdateUserReferralLimitDto,
  UpdateUserStatusDto,
  UpdateSettingsDto,
  UpsertCycleDto,
  UpsertQuestionDto,
} from './dto';

const adminSchoolNameSelect = {
  name: true,
} satisfies Prisma.SchoolSelect;

const lockedCycleStatuses = ['REVEAL_READY', 'REVEALED'] as const;

type QuestionnaireRevisionQuestion = {
  key: string;
  prompt: string;
  description: string | null;
  type: QuestionType;
  required: boolean;
  selectionLimit: number | null;
  options: Prisma.InputJsonValue | typeof Prisma.DbNull;
  order: number;
  weight: number;
};

type CurrentQuestionnaireForMutation = {
  id: string;
  title: string;
  description: string | null;
  questions: Array<{
    id: string;
    key: string;
    prompt: string;
    description: string | null;
    type: QuestionType;
    required: boolean;
    selectionLimit: number | null;
    options: Prisma.JsonValue | null;
    order: number;
    weight: number;
  }>;
};

function toNullableJsonInput(value: Prisma.JsonValue | null) {
  return value == null
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue | typeof Prisma.DbNull);
}

function isLockedCycleStatus(status: string) {
  return lockedCycleStatuses.includes(
    status as (typeof lockedCycleStatuses)[number],
  );
}

const adminUserProfileSelect = {
  fullName: true,
  headline: true,
  bio: true,
  schoolYear: true,
  programName: true,
} satisfies Prisma.UserProfileSelect;

const adminUserListSelect = {
  id: true,
  email: true,
  status: true,
  displayName: true,
  isTest: true,
  createdAt: true,
  nonEduReferralLimit: true,
  nonEduReferralUses: true,
  school: {
    select: adminSchoolNameSelect,
  },
  profile: {
    select: adminUserProfileSelect,
  },
  questionnaireResponse: {
    select: {
      submittedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

const adminReportListSelect = {
  id: true,
  matchId: true,
  reason: true,
  details: true,
  status: true,
  adminNotes: true,
  handledAt: true,
  createdBlock: true,
  createdAt: true,
  reporter: {
    select: {
      email: true,
      displayName: true,
      school: {
        select: adminSchoolNameSelect,
      },
    },
  },
  reportedUser: {
    select: {
      email: true,
      displayName: true,
      school: {
        select: adminSchoolNameSelect,
      },
    },
  },
} satisfies Prisma.ReportSelect;

const MATCHABLE_CYCLE_PARTICIPATION_WHERE = {
  status: 'OPTED_IN' as const,
  intent: { not: null },
  user: {
    status: 'ACTIVE' as const,
  },
} satisfies Prisma.CycleParticipationWhereInput;

type DashboardSnapshotPort = Pick<
  DashboardSnapshotService,
  'syncCycleSnapshots' | 'syncMatchSnapshots' | 'syncUserMatchSnapshots'
>;

const defaultDashboardSnapshotPort: DashboardSnapshotPort = {
  syncCycleSnapshots() {
    return Promise.resolve();
  },
  syncMatchSnapshots() {
    return Promise.resolve();
  },
  syncUserMatchSnapshots() {
    return Promise.resolve();
  },
};

@Injectable()
export class AdminService {
  private readonly dashboardSnapshotService: DashboardSnapshotPort;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cyclesService: CyclesService,
    private readonly adminAuditService: AdminAuditService,
    private readonly adminSchoolService: AdminSchoolService,
    @Optional() dashboardSnapshotService?: DashboardSnapshotService,
  ) {
    this.dashboardSnapshotService =
      dashboardSnapshotService ?? defaultDashboardSnapshotPort;
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
              participations: {
                where: MATCHABLE_CYCLE_PARTICIPATION_WHERE,
              },
              matches: true,
            },
          },
        },
        orderBy: { revealAt: 'desc' },
        take: 6,
      }),
      this.prisma.report.findMany({
        where: { status: 'OPEN' },
        select: adminReportListSelect,
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
    const matchableParticipationCountFilter = {
      participations: {
        where: MATCHABLE_CYCLE_PARTICIPATION_WHERE,
      },
      matches: true,
    };

    if (!this.hasListQuery(query)) {
      return this.prisma.matchCycle.findMany({
        include: {
          _count: {
            select: matchableParticipationCountFilter,
          },
        },
        orderBy: { revealAt: 'desc' },
        take: ADMIN_LIST_UNFILTERED_MAX,
      });
    }

    const pagination = normalizeAdminListPagination(query);
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
            select: matchableParticipationCountFilter,
          },
        },
        orderBy: { revealAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.matchCycle.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }

  async getReports(query: ListReportsQueryDto = {}) {
    if (!this.hasListQuery(query)) {
      return this.prisma.report.findMany({
        select: adminReportListSelect,
        orderBy: { createdAt: 'desc' },
        take: ADMIN_LIST_UNFILTERED_MAX,
      });
    }

    const pagination = normalizeAdminListPagination(query);
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
        select: adminReportListSelect,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }

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
    if (!this.hasListQuery(query)) {
      return this.prisma.user.findMany({
        select: adminUserListSelect,
        orderBy: { createdAt: 'desc' },
        take: ADMIN_LIST_UNFILTERED_MAX,
      });
    }

    const pagination = normalizeAdminListPagination(query);
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

  async mergeSchools(
    sourceSchoolId: string,
    targetSchoolId: string,
    adminActorId: string,
  ) {
    return this.adminSchoolService.merge(
      sourceSchoolId,
      targetSchoolId,
      adminActorId,
    );
  }

  private parseCycleDateTime(value: string) {
    try {
      return parseDateTimeAsChinaStandardOrInstant(value);
    } catch {
      throw new BadRequestException('Invalid cycle datetime.');
    }
  }

  async upsertCycle(input: UpsertCycleDto, adminActorId: string) {
    const participationDeadline = this.parseCycleDateTime(
      input.participationDeadline,
    );
    const revealAt = this.parseCycleDateTime(input.revealAt);

    if ((input.status as string) === 'PREPARING') {
      throw new BadRequestException(
        'PREPARING is an internal cycle state and cannot be set manually.',
      );
    }

    if (!input.cycleId && input.status === 'REVEAL_READY') {
      throw new BadRequestException(
        'REVEAL_READY status must be set by running the cycle preparation flow.',
      );
    }

    if (!input.cycleId && input.status === 'REVEALED') {
      throw new BadRequestException(
        'REVEALED status must be set by running the cycle reveal flow.',
      );
    }

    if (input.cycleId) {
      const existingCycle = await this.prisma.matchCycle.findUnique({
        where: { id: input.cycleId },
        select: { status: true },
      });

      if (!existingCycle) {
        throw new NotFoundException('Cycle not found.');
      }

      if (
        isLockedCycleStatus(existingCycle.status) &&
        input.status !== existingCycle.status
      ) {
        throw new BadRequestException(
          'Prepared or revealed cycles cannot be reopened from the admin form.',
        );
      }

      if (input.status === 'REVEALED' && existingCycle.status !== 'REVEALED') {
        throw new BadRequestException(
          'REVEALED status must be set by running the cycle reveal flow.',
        );
      }

      if (
        input.status === 'REVEAL_READY' &&
        existingCycle.status !== 'REVEAL_READY'
      ) {
        throw new BadRequestException(
          'REVEAL_READY status must be set by running the cycle preparation flow.',
        );
      }

      const cycle = await this.prisma.matchCycle.update({
        where: { id: input.cycleId },
        data: {
          codename: input.codename,
          participationDeadline,
          revealAt,
          status: input.status,
          notes: input.notes,
        },
      });

      await ensureStickyCycleParticipations(this.prisma, cycle);

      await this.adminAuditService.write(adminActorId, 'cycle.updated', {
        cycleId: cycle.id,
        status: cycle.status,
      });

      // Cycle timing/state changed out of band; let the automation tick pick it
      // up on its next run instead of waiting for the idle safety re-check.
      this.cyclesService.invalidateAutomationSchedule();

      return cycle;
    }

    const cycle = await this.prisma.matchCycle.create({
      data: {
        codename: input.codename,
        participationDeadline,
        revealAt,
        status: input.status,
        notes: input.notes,
      },
    });

    await ensureStickyCycleParticipations(this.prisma, cycle);

    await this.adminAuditService.write(adminActorId, 'cycle.created', {
      cycleId: cycle.id,
      status: cycle.status,
    });

    // Cycle timing/state changed out of band; let the automation tick pick it
    // up on its next run instead of waiting for the idle safety re-check.
    this.cyclesService.invalidateAutomationSchedule();

    return cycle;
  }

  async getCycleDetail(cycleId: string) {
    const cycle = await this.prisma.matchCycle.findUnique({
      where: { id: cycleId },
      include: {
        _count: {
          select: {
            participations: true,
            matches: true,
          },
        },
      },
    });

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    const [
      matchableParticipantCount,
      submittedQuestionnaireCount,
      reportedMatchCount,
      pendingContactCount,
    ] = await Promise.all([
      this.prisma.cycleParticipation.count({
        where: {
          cycleId,
          ...MATCHABLE_CYCLE_PARTICIPATION_WHERE,
        },
      }),
      this.prisma.cycleParticipation.count({
        where: {
          cycleId,
          user: {
            questionnaireResponse: {
              is: {
                submittedAt: {
                  not: null,
                },
              },
            },
          },
        },
      }),
      this.prisma.match.count({
        where: {
          cycleId,
          reports: {
            some: {},
          },
        },
      }),
      this.prisma.match.count({
        where: {
          cycleId,
          introducedAt: null,
        },
      }),
    ]);

    return {
      cycle,
      summary: {
        participationCount: cycle._count.participations,
        matchableParticipantCount,
        submittedQuestionnaireCount,
        matchedPairCount: cycle._count.matches,
        reportedMatchCount,
        pendingContactCount,
      },
    };
  }

  async getCycleParticipants(
    cycleId: string,
    query: ListCycleParticipantsQueryDto = {},
  ) {
    await this.assertCycleExists(cycleId);

    const pagination = normalizeAdminListPagination(query);
    const where = {
      cycleId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.cycleParticipation.findMany({
        where,
        select: {
          id: true,
          status: true,
          intent: true,
          optedInAt: true,
          updatedAt: true,
          user: {
            select: adminUserListSelect,
          },
        },
        orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.cycleParticipation.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }

  async getCycleMatches(cycleId: string, query: ListCycleMatchesQueryDto = {}) {
    await this.assertCycleExists(cycleId);

    const pagination = normalizeAdminListPagination(query);
    const where = { cycleId };

    const [items, total] = await Promise.all([
      this.prisma.match.findMany({
        where,
        select: {
          id: true,
          score: true,
          revealedAt: true,
          introducedAt: true,
          participants: {
            select: {
              id: true,
              userId: true,
              position: true,
              contactRequestedAt: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  displayName: true,
                  status: true,
                  school: {
                    select: adminSchoolNameSelect,
                  },
                  profile: {
                    select: adminUserProfileSelect,
                  },
                },
              },
            },
          },
          reports: {
            select: adminReportListSelect,
            orderBy: { createdAt: 'desc' },
          },
          feedback: {
            select: {
              id: true,
              authorUserId: true,
              subjectUserId: true,
              rating: true,
              comment: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
          meetupFeedback: {
            select: {
              id: true,
              sessionId: true,
              authorUserId: true,
              subjectUserId: true,
              personalFitScore: true,
              interactionQualityScore: true,
              safetyBoundaryLevel: true,
              positiveTags: true,
              issueTags: true,
              note: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.match.count({ where }),
    ]);

    return buildPageResult(items, total, pagination);
  }

  async getCycleLogs(cycleId: string, query: ListCycleLogsQueryDto = {}) {
    await this.assertCycleExists(cycleId);

    return this.adminAuditService.listAuditLogsByCondition(
      Prisma.sql`"metadata"->>'cycleId' = ${cycleId}`,
      query,
    );
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
    const result = await this.cyclesService.runRevealCycle({
      cycleId: input.cycleId,
      force: input.force ?? false,
      adminActorId,
    });

    // A manual run mutates cycle state outside the automation tick; reset the
    // cached schedule so the next tick recomputes the next boundary.
    this.cyclesService.invalidateAutomationSchedule();

    return result;
  }

  private cloneQuestionForRevision(
    question: CurrentQuestionnaireForMutation['questions'][number],
  ): QuestionnaireRevisionQuestion {
    return {
      key: question.key,
      prompt: question.prompt,
      description: question.description,
      type: question.type,
      required: question.required,
      selectionLimit: question.selectionLimit,
      options: toNullableJsonInput(question.options),
      order: question.order,
      weight: question.weight,
    };
  }

  private async createQuestionnaireRevision(
    currentVersion: CurrentQuestionnaireForMutation,
    questions: QuestionnaireRevisionQuestion[],
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.questionnaireVersion.updateMany({
          where: {
            id: currentVersion.id,
            isCurrent: true,
          },
          data: {
            isCurrent: false,
          },
        });

        return tx.questionnaireVersion.create({
          data: {
            title: currentVersion.title,
            description: currentVersion.description,
            isCurrent: true,
            questions: {
              create: questions.map((question) => ({
                key: question.key,
                prompt: question.prompt,
                description: question.description,
                type: question.type,
                required: question.required,
                selectionLimit: question.selectionLimit,
                options: question.options,
                order: question.order,
                weight: question.weight,
              })),
            },
          },
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Questionnaire was updated concurrently. Please retry.',
        );
      }

      throw error;
    }
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
      return {
        ...created,
        questions: created.questions.map((question) => ({
          ...question,
          options: normalizeQuestionOptions(question.options),
        })),
      };
    }

    return {
      ...version,
      questions: version.questions.map((question) => ({
        ...question,
        options: normalizeQuestionOptions(question.options),
      })),
    };
  }

  async upsertQuestion(input: UpsertQuestionDto, adminActorId: string) {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('No active questionnaire version found.');
    }

    const normalizedOptions = this.normalizeQuestionOptions(input.options);
    const selectionLimit = this.normalizeSelectionLimit(
      input.type,
      normalizedOptions.length,
      input.selectionLimit,
    );
    const nextQuestionData = {
      key: input.key,
      prompt: input.prompt,
      description: null,
      type: input.type,
      required: true,
      selectionLimit,
      options: normalizedOptions as Prisma.InputJsonValue,
      order: input.order,
      weight: input.weight ?? 1,
    } satisfies QuestionnaireRevisionQuestion;

    if (input.questionId) {
      const existingQuestion = version.questions.find(
        (question) => question.id === input.questionId,
      );

      if (!existingQuestion) {
        throw new NotFoundException('Question not found.');
      }

      if (existingQuestion.key !== input.key) {
        throw new BadRequestException(
          'Question key cannot be changed after creation.',
        );
      }

      const nextVersion = await this.createQuestionnaireRevision(
        version,
        version.questions.map((question) =>
          question.id === input.questionId
            ? {
                ...nextQuestionData,
                description: existingQuestion.description,
                required: existingQuestion.required,
              }
            : this.cloneQuestionForRevision(question),
        ),
      );
      const question = nextVersion.questions.find(
        (candidate) => candidate.key === input.key,
      );

      if (!question) {
        throw new NotFoundException('Question not found after revision.');
      }

      await this.adminAuditService.write(adminActorId, 'question.updated', {
        questionId: question.id,
        key: question.key,
        type: question.type,
      });

      return question;
    }

    if (version.questions.some((question) => question.key === input.key)) {
      throw new BadRequestException(
        `Question key "${input.key}" already exists in the current questionnaire.`,
      );
    }

    const nextVersion = await this.createQuestionnaireRevision(version, [
      ...version.questions.map((question) =>
        this.cloneQuestionForRevision(question),
      ),
      nextQuestionData,
    ]);
    const question = nextVersion.questions.find(
      (candidate) => candidate.key === input.key,
    );

    if (!question) {
      throw new NotFoundException('Question not found after revision.');
    }

    await this.adminAuditService.write(adminActorId, 'question.created', {
      questionId: question.id,
      key: question.key,
      type: question.type,
    });

    return question;
  }

  async reorderQuestions(input: ReorderQuestionsDto, adminActorId: string) {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('No active questionnaire version found.');
    }

    const currentQuestionsById = new Map(
      version.questions.map((question) => [question.id, question]),
    );
    const uniqueQuestionIds = new Set(input.questionIds);

    if (
      input.questionIds.length !== version.questions.length ||
      uniqueQuestionIds.size !== version.questions.length
    ) {
      throw new BadRequestException(
        'Question order must include every current question exactly once.',
      );
    }

    if (
      input.questionIds.some(
        (questionId) => !currentQuestionsById.has(questionId),
      )
    ) {
      throw new NotFoundException('Some questions were not found.');
    }

    await this.createQuestionnaireRevision(
      version,
      input.questionIds.map((questionId, index) => ({
        ...this.cloneQuestionForRevision(currentQuestionsById.get(questionId)!),
        order: index + 1,
      })),
    );

    await this.adminAuditService.write(adminActorId, 'question.reordered', {
      questionIds: input.questionIds,
    });

    return { ok: true };
  }

  async deleteQuestion(questionId: string, adminActorId: string) {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });
    const question = version?.questions.find(
      (candidate) => candidate.id === questionId,
    );

    if (!version || !question) {
      throw new NotFoundException('Question not found.');
    }

    await this.createQuestionnaireRevision(
      version,
      version.questions
        .filter((candidate) => candidate.id !== questionId)
        .map((candidate) => this.cloneQuestionForRevision(candidate)),
    );

    await this.adminAuditService.write(adminActorId, 'question.deleted', {
      questionId,
      key: question.key,
    });
    return { ok: true };
  }

  async getReportContext(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        reporterId: true,
        reportedUserId: true,
        matchId: true,
        reason: true,
        details: true,
        status: true,
        adminNotes: true,
        handledAt: true,
        createdBlock: true,
        createdAt: true,
        reporter: {
          select: {
            id: true,
            email: true,
            displayName: true,
            status: true,
            school: {
              select: adminSchoolNameSelect,
            },
            profile: {
              select: adminUserProfileSelect,
            },
          },
        },
        reportedUser: {
          select: {
            id: true,
            email: true,
            displayName: true,
            status: true,
            school: {
              select: adminSchoolNameSelect,
            },
            profile: {
              select: adminUserProfileSelect,
            },
            reportsReceived: {
              select: {
                ...adminReportListSelect,
                reporter: {
                  select: {
                    email: true,
                    displayName: true,
                    school: {
                      select: adminSchoolNameSelect,
                    },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            reportsFiled: {
              select: {
                ...adminReportListSelect,
                reportedUser: {
                  select: {
                    email: true,
                    displayName: true,
                    school: {
                      select: adminSchoolNameSelect,
                    },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
        match: {
          select: {
            id: true,
            introducedAt: true,
            participants: {
              select: {
                id: true,
                userId: true,
                position: true,
                contactRequestedAt: true,
                user: {
                  select: {
                    id: true,
                    email: true,
                    displayName: true,
                    status: true,
                    school: {
                      select: adminSchoolNameSelect,
                    },
                    profile: {
                      select: adminUserProfileSelect,
                    },
                  },
                },
              },
            },
            reports: {
              select: adminReportListSelect,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Report was not found.');
    }

    const [
      blockState,
      relatedLogs,
      receivedReportCount,
      filedReportCount,
      resolvedReportCount,
      openReportCount,
    ] = await Promise.all([
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
      this.prisma.report.count({
        where: {
          reportedUserId: report.reportedUserId,
        },
      }),
      this.prisma.report.count({
        where: {
          reporterId: report.reportedUserId,
        },
      }),
      this.prisma.report.count({
        where: {
          reportedUserId: report.reportedUserId,
          status: 'RESOLVED',
        },
      }),
      this.prisma.report.count({
        where: {
          reportedUserId: report.reportedUserId,
          status: 'OPEN',
        },
      }),
    ]);

    return {
      report,
      riskProfile: {
        reportedUserStatus: report.reportedUser.status,
        receivedReportCount,
        filedReportCount,
        resolvedReportCount,
        openReportCount,
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

    const affectedMatchIds = Array.from(
      new Set(
        reports
          .map((report) => report.matchId)
          .filter((matchId): matchId is string => Boolean(matchId)),
      ),
    );
    for (const matchId of affectedMatchIds) {
      await this.dashboardSnapshotService.syncMatchSnapshots(matchId);
    }

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

    if (report.matchId) {
      await this.dashboardSnapshotService.syncMatchSnapshots(report.matchId);
    }

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

  async updateUser(
    userId: string,
    input: AdminUpdateUserDto,
    adminActorId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const updateData: Record<string, unknown> = {};
    if (input.displayName !== undefined)
      updateData.displayName = input.displayName;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.schoolId !== undefined)
      updateData.schoolId = input.schoolId || null;

    if (input.email !== undefined) {
      const normalizedEmail = input.email.trim().toLowerCase();
      const existingUser = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException(
          'This email is already in use by another user.',
        );
      }
      updateData.email = normalizedEmail;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No fields to update.');
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id: userId },
        data: updateData,
        omit: { passwordHash: true },
      });

      if (input.schoolId === undefined) {
        return nextUser;
      }

      const response = await tx.questionnaireResponse.findUnique({
        where: { userId },
        select: {
          id: true,
          answers: true,
        },
      });

      if (!response) {
        return nextUser;
      }

      const schools = await tx.school.findMany({
        select: { id: true },
        orderBy: { name: 'asc' },
      });
      const syncedAnswers = syncQuestionnaireSchoolAnswers(
        response.answers as Record<string, unknown>,
        {
          currentSchoolId: nextUser.schoolId ?? null,
          allowedSchoolIds: schools.map((school) => school.id),
        },
      );

      await tx.questionnaireResponse.update({
        where: { id: response.id },
        data: {
          answers: syncedAnswers,
        },
      });

      return nextUser;
    });

    await this.adminAuditService.write(adminActorId, 'user.updated', {
      userId,
      fields: Object.keys(updateData),
    });

    if (
      input.displayName !== undefined ||
      input.email !== undefined ||
      input.schoolId !== undefined
    ) {
      await this.dashboardSnapshotService.syncUserMatchSnapshots(userId);
    }

    return updatedUser;
  }

  async updateUserReferralLimit(
    userId: string,
    input: UpdateUserReferralLimitDto,
    adminActorId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nonEduReferralLimit: true,
        nonEduReferralUses: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nonEduReferralLimit: input.nonEduReferralLimit,
      },
      omit: { passwordHash: true },
    });

    await this.adminAuditService.write(
      adminActorId,
      'user.referral_limit_updated',
      {
        userId,
        previousLimit: user.nonEduReferralLimit,
        nextLimit: input.nonEduReferralLimit,
        nonEduReferralUses: user.nonEduReferralUses,
      },
    );

    return updatedUser;
  }

  private normalizeQuestionOptions(
    inputOptions?: UpsertQuestionDto['options'],
  ) {
    const normalizedOptions = normalizeQuestionOptions(inputOptions ?? []);

    if (normalizedOptions.length < 2) {
      throw new BadRequestException(
        'Selectable questions must define at least two options.',
      );
    }

    return normalizedOptions;
  }

  private normalizeSelectionLimit(
    questionType: UpsertQuestionDto['type'],
    optionCount: number,
    selectionLimit?: number,
  ) {
    if (questionType !== 'MULTI_SELECT') {
      if (selectionLimit != null) {
        throw new BadRequestException(
          'Selection limit is only supported for multi-select questions.',
        );
      }

      return null;
    }

    if (selectionLimit == null) {
      return null;
    }

    if (selectionLimit > optionCount) {
      throw new BadRequestException(
        'Selection limit cannot be greater than the number of options.',
      );
    }

    return selectionLimit;
  }

  private async assertCycleExists(cycleId: string) {
    const cycle = await this.prisma.matchCycle.findUnique({
      where: { id: cycleId },
      select: { id: true },
    });

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }
  }

  private hasListQuery(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    questionnaire?: string;
    userType?: string;
    gender?: string;
    action?: string;
  }) {
    return Boolean(
      query.page ||
      query.pageSize ||
      query.search ||
      query.status ||
      query.questionnaire ||
      query.userType ||
      query.gender ||
      query.action,
    );
  }

  private assertTestUserBulkOpsAllowed() {
    if (env.APP_ENV === 'production') {
      throw new ForbiddenException(
        'Bulk test user seed and delete are disabled in production.',
      );
    }
  }

  async setTestFlag(userId: string, isTest: boolean, adminActorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { isTest },
      });

      if (isTest) {
        await tx.productEvent.deleteMany({ where: { userId } });
        await tx.productEventOutbox.deleteMany({ where: { userId } });
      }
    });

    await this.adminAuditService.write(adminActorId, 'user.test_flag', {
      userId,
      isTest,
    });

    return { ok: true, isTest };
  }

  async deleteAllTestUsers(adminActorId: string) {
    this.assertTestUserBulkOpsAllowed();

    const testUsers = await this.prisma.user.findMany({
      where: { isTest: true },
      select: { id: true, email: true },
    });

    if (testUsers.length === 0) {
      throw new BadRequestException('No test users to delete.');
    }

    const userIds = testUsers.map((u) => u.id);

    const affectedMatchIds = (
      await this.prisma.matchParticipant.findMany({
        where: { userId: { in: userIds } },
        select: { matchId: true },
        distinct: ['matchId'],
      })
    ).map((p) => p.matchId);
    const affectedCycleIds = (
      await this.prisma.match.findMany({
        where: { id: { in: affectedMatchIds } },
        select: { cycleId: true },
        distinct: ['cycleId'],
      })
    ).map((match) => match.cycleId);
    const affectedMeetupSessions = await this.prisma.meetupSession.findMany({
      where: { matchId: { in: affectedMatchIds } },
      select: {
        id: true,
        proposals: { select: { id: true } },
      },
    });
    const affectedMeetupSessionIds = affectedMeetupSessions.map(
      (session) => session.id,
    );
    const affectedMeetupProposalIds = affectedMeetupSessions.flatMap(
      (session) => session.proposals.map((proposal) => proposal.id),
    );
    const productAnalyticsDeleteOr = this.testUserProductAnalyticsDeleteOr({
      userIds,
      matchIds: affectedMatchIds,
      meetupSessionIds: affectedMeetupSessionIds,
      meetupProposalIds: affectedMeetupProposalIds,
    });

    await this.prisma.$transaction([
      this.prisma.report.deleteMany({
        where: { matchId: { in: affectedMatchIds } },
      }),
      this.prisma.matchParticipant.deleteMany({
        where: { matchId: { in: affectedMatchIds } },
      }),
      this.prisma.match.deleteMany({ where: { id: { in: affectedMatchIds } } }),
      this.prisma.cycleParticipation.deleteMany({
        where: { userId: { in: userIds } },
      }),
      this.prisma.report.deleteMany({
        where: {
          OR: [
            { reporterId: { in: userIds } },
            { reportedUserId: { in: userIds } },
          ],
        },
      }),
      this.prisma.block.deleteMany({
        where: {
          OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }],
        },
      }),
      this.prisma.questionnaireResponse.deleteMany({
        where: { userId: { in: userIds } },
      }),
      this.prisma.userProfile.deleteMany({
        where: { userId: { in: userIds } },
      }),
      this.prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } }),
      // Merchant-promotion graph (Restrict FKs) must be cleared before the user
      // rows, in dependency order: Redemption (Restrict on Coupon) -> Coupon
      // (Restrict on User) -> CampaignActivation (Restrict on User).
      // ReferralEvent holds only weak referrer refs (no FK) but is cleared so
      // funnel stats don't count deleted users. referredByUserId is
      // ON DELETE SET NULL and referralCampaignId points at Campaign, so
      // neither needs manual unlinking.
      this.prisma.redemption.deleteMany({ where: { userId: { in: userIds } } }),
      this.prisma.coupon.deleteMany({ where: { userId: { in: userIds } } }),
      this.prisma.campaignActivation.deleteMany({
        where: { userId: { in: userIds } },
      }),
      this.prisma.referralEvent.deleteMany({
        where: { referrerUserId: { in: userIds } },
      }),
      this.prisma.productEvent.deleteMany({ where: productAnalyticsDeleteOr }),
      this.prisma.productEventOutbox.deleteMany({
        where: productAnalyticsDeleteOr,
      }),
      this.prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);

    for (const cycleId of affectedCycleIds) {
      await this.dashboardSnapshotService.syncCycleSnapshots(cycleId);
    }

    await this.adminAuditService.write(adminActorId, 'users.test_deleted', {
      count: testUsers.length,
      emails: testUsers.map((u) => u.email),
    });

    return { ok: true, deletedCount: testUsers.length };
  }

  private testUserProductAnalyticsDeleteOr(input: {
    userIds: string[];
    matchIds: string[];
    meetupSessionIds: string[];
    meetupProposalIds: string[];
  }) {
    const filters: Array<{
      userId?: { in: string[] };
      entityType?: string;
      entityId?: { in: string[] };
    }> = [{ userId: { in: input.userIds } }];
    if (input.matchIds.length > 0) {
      filters.push({
        entityType: 'match',
        entityId: { in: input.matchIds },
      });
    }
    if (input.meetupSessionIds.length > 0) {
      filters.push({
        entityType: 'meetup_session',
        entityId: { in: input.meetupSessionIds },
      });
    }
    if (input.meetupProposalIds.length > 0) {
      filters.push({
        entityType: 'meetup_proposal',
        entityId: { in: input.meetupProposalIds },
      });
    }
    return { OR: filters };
  }

  async seedTestUsers(adminActorId: string) {
    this.assertTestUserBulkOpsAllowed();

    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
    });
    if (!version) {
      throw new BadRequestException(
        'No active questionnaire version. Run seed-defaults first.',
      );
    }

    const cycle = await this.prisma.matchCycle.findFirst({
      where: { status: { in: ['OPEN', 'DRAFT'] } },
      orderBy: { revealAt: 'asc' },
    });
    if (!cycle) {
      throw new BadRequestException(
        'No open or draft cycle found. Create one first.',
      );
    }

    const schools = await this.prisma.school.findMany({
      take: 9,
      orderBy: { name: 'asc' },
      include: {
        domains: {
          orderBy: { domain: 'asc' },
          take: 1,
        },
      },
    });
    if (schools.length < 3) {
      throw new BadRequestException(
        'At least 3 schools needed. Run seed-defaults first.',
      );
    }

    const PASSWORD = generateSeedTestUserPassword();
    const passwordHash = await argon2.hash(PASSWORD);

    const softBase = {
      relationship_intent: '认真稳定的关系',
      pace: '平衡',
      define_relationship_timing: '相处一段时间再确认',
      contact_frequency: '适中',
      weekend: '轻社交',
      communication: '先冷静再沟通',
      repair_style: '先安抚情绪',
      apology_expectation: '后续行动',
      outing_spend_style: '更希望 AA',
      career_relationship_balance: '尽量平衡',
      social_energy: '比较像我',
      emotional_openness: '比较像我',
      space_need: '看情况',
      novelty_need: '比较像我',
      values: ['真诚', '稳定', '责任感', '温柔'],
      green_flags: ['说到做到', '情绪稳定', '边界清楚'],
      red_flag_sensitivity: ['失联', '情绪爆炸', '不尊重边界'],
      support_need: ['陪我聊天', '带我放松', '明确表达在乎'],
      feeling_cared_for: ['记住细节', '稳定陪伴', '尊重我的节奏'],
      ideal_date_style: ['散步聊天', '探店吃饭', '短途出行'],
      shared_growth_topics: ['学业事业', '情绪成熟', '旅行体验'],
      future_picture: ['稳定陪伴', '个人成长', '共同目标'],
      admired_partner_traits: ['温柔耐心', '直接坦诚', '有边界感'],
      small_happiness: ['一起吃饭', '深夜长聊', '分享日常'],
    };
    const allLooks = ['普通人', '小帅/美', '顶帅/美'];

    const namedUsers = [
      {
        email: 'matched.alice@bupt.edu.cn',
        displayName: '演示-Alice',
        fullName: 'Match Demo Alice',
        schoolSlug: 'bupt-qmul-hainan',
        hard: {
          hard_birth_date: '2003-06-15',
          hard_partner_age_min: 20,
          hard_partner_age_max: 35,
          hard_gender: '男',
          hard_partner_genders: ['女'],
          hard_looks: '普通人',
          hard_partner_looks: allLooks,
          hard_height_cm: 178,
          hard_partner_height_min: 150,
          hard_partner_height_max: 185,
          hard_one_liner_intro:
            '工科背景，喜欢徒步与摄影，情绪稳定。（演示账号 Alice）',
        },
      },
      {
        email: 'matched.bob@cuc.edu.cn',
        displayName: '演示-Bob',
        fullName: 'Match Demo Bob',
        schoolSlug: 'cuc-hainan-international',
        hard: {
          hard_birth_date: '2004-03-20',
          hard_partner_age_min: 20,
          hard_partner_age_max: 35,
          hard_gender: '女',
          hard_partner_genders: ['男'],
          hard_looks: '小帅/美',
          hard_partner_looks: allLooks,
          hard_height_cm: 165,
          hard_partner_height_min: 168,
          hard_partner_height_max: 195,
          hard_one_liner_intro:
            '文创方向，读书看电影，希望遇到温柔耐心的人。（演示 Bob）',
        },
      },
      {
        email: 'unmatched.carol@uestc.edu.cn',
        displayName: '演示-Carol',
        fullName: 'Match Demo Carol',
        schoolSlug: 'uestc-glasgow-hainan',
        hard: {
          hard_birth_date: '2002-01-10',
          hard_partner_age_min: 20,
          hard_partner_age_max: 45,
          hard_gender: '女',
          hard_partner_genders: ['女'],
          hard_looks: '普通人',
          hard_partner_looks: allLooks,
          hard_height_cm: 162,
          hard_partner_height_min: 155,
          hard_partner_height_max: 180,
          hard_one_liner_intro:
            '常驻图书馆自习，想找能一起跑步的朋友。（演示 Carol，未匹配示例）',
        },
      },
    ];

    const BULK_COUNT = 27;
    const SOFT_SINGLE_POOLS = {
      relationship_intent: [
        '认真稳定的关系',
        '先认真了解再决定',
        '轻松认识，顺其自然',
      ],
      pace: ['慢热', '平衡', '主动推进'],
      define_relationship_timing: [
        '熟悉后尽快明确',
        '相处一段时间再确认',
        '不急着定义关系',
      ],
      contact_frequency: ['高互动', '适中', '保持留白'],
      weekend: ['出门探索', '轻社交', '安静恢复'],
      communication: ['当场说清楚', '先冷静再沟通', '给彼此缓冲时间'],
      repair_style: ['先讲清楚逻辑', '先安抚情绪', '先给空间再回来聊'],
      apology_expectation: ['及时道歉', '解释清楚', '后续行动'],
      outing_spend_style: [
        '无所谓，看当时和心情',
        '更希望 AA',
        '更能接受对方多出或主动请客',
      ],
      career_relationship_balance: ['感情优先', '尽量平衡', '更看重学业或事业'],
      social_energy: [
        '非常不像我',
        '比较不像我',
        '看情况',
        '比较像我',
        '非常像我',
      ],
      emotional_openness: [
        '非常不像我',
        '比较不像我',
        '看情况',
        '比较像我',
        '非常像我',
      ],
      space_need: [
        '非常不像我',
        '比较不像我',
        '看情况',
        '比较像我',
        '非常像我',
      ],
      novelty_need: [
        '非常不像我',
        '比较不像我',
        '看情况',
        '比较像我',
        '非常像我',
      ],
    };
    const SOFT_MULTI_POOLS = {
      values: [
        '真诚',
        '稳定',
        '责任感',
        '尊重边界',
        '好奇心',
        '上进',
        '温柔',
        '幽默感',
      ],
      green_flags: [
        '说到做到',
        '情绪稳定',
        '边界清楚',
        '愿意表达',
        '有上进心',
        '会照顾人',
        '松弛幽默',
      ],
      red_flag_sensitivity: [
        '冷处理',
        '阴阳怪气',
        '控制欲',
        '失联',
        '迟到失约',
        '情绪爆炸',
        '不尊重边界',
      ],
      support_need: [
        '陪我聊天',
        '给出建议',
        '直接帮我做事',
        '带我放松',
        '给我空间',
        '明确表达在乎',
      ],
      feeling_cared_for: [
        '及时回复',
        '主动约我',
        '记住细节',
        '明确表达喜欢',
        '实际照顾',
        '稳定陪伴',
        '尊重我的节奏',
      ],
      ideal_date_style: [
        '散步聊天',
        '探店吃饭',
        '运动户外',
        '看展看电影',
        '宅家陪伴',
        '短途出行',
        '一起做正事',
      ],
      shared_growth_topics: [
        '学业事业',
        '健身作息',
        '情绪成熟',
        '旅行体验',
        '审美兴趣',
        '社交拓展',
        '财务规划',
      ],
      future_picture: [
        '稳定陪伴',
        '个人成长',
        '经济安全',
        '自由感',
        '家庭连接',
        '新鲜体验',
        '共同目标',
      ],
      admired_partner_traits: [
        '温柔耐心',
        '有主见',
        '自律可靠',
        '直接坦诚',
        '有趣松弛',
        '有边界感',
        '有行动力',
      ],
      small_happiness: [
        '一起吃饭',
        '深夜长聊',
        '散步吹风',
        '一起学习',
        '肢体靠近',
        '分享日常',
        '临时起意的小冒险',
      ],
    };

    const pick = <T>(arr: readonly T[], idx: number): T =>
      arr[idx % arr.length];
    const pickN = <T>(arr: readonly T[], start: number, n: number): T[] =>
      Array.from({ length: n }, (_, off) => arr[(start + off) % arr.length]);

    function buildBulkAnswers(i: number): Record<string, unknown> {
      const soft: Record<string, unknown> = {};
      for (const [key, pool] of Object.entries(SOFT_SINGLE_POOLS)) {
        soft[key] = pick(pool, i);
      }
      for (const [key, pool] of Object.entries(SOFT_MULTI_POOLS)) {
        soft[key] = pickN(pool, i, key === 'values' ? 4 : 3);
      }
      const gender = i % 2 === 0 ? '男' : '女';
      const partnerGenders = gender === '男' ? ['女'] : ['男'];
      soft.hard_birth_date = `${2000 + (i % 6)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
      soft.hard_partner_age_min = 18;
      soft.hard_partner_age_max = 40;
      soft.hard_gender = gender;
      soft.hard_partner_genders = partnerGenders;
      soft.hard_looks = pick(allLooks, i);
      soft.hard_partner_looks = allLooks;
      soft.hard_height_cm = Math.min(230, Math.max(120, 155 + (i % 30)));
      soft.hard_partner_height_min = 120;
      soft.hard_partner_height_max = 230;
      soft.hard_one_liner_intro = pick(
        [
          '理工背景，喜欢夜跑和科幻。',
          '人文方向，常去咖啡馆。',
          '爱好摄影与徒步。',
          '实验课较多也偶尔撸猫。',
          '喜欢爵士乐与独立游戏。',
          '健身和阅读穿插进行。',
        ],
        i,
      );
      return soft;
    }

    const schoolBySlug = new Map(schools.map((s) => [s.slug, s]));
    const schoolList = schools;
    let createdCount = 0;

    const upsertUser = async (input: {
      email: string;
      displayName: string;
      fullName: string;
      schoolId: string | null;
      answers: Record<string, unknown>;
    }) => {
      const now = new Date();
      const user = await this.prisma.user.upsert({
        where: { email: input.email },
        update: {
          passwordHash,
          status: UserStatus.ACTIVE,
          displayName: input.displayName,
          schoolId: input.schoolId,
          isTest: true,
          acceptedTermsAt: now,
          lastActiveAt: now,
        },
        create: {
          email: input.email,
          passwordHash,
          status: UserStatus.ACTIVE,
          displayName: input.displayName,
          schoolId: input.schoolId,
          isTest: true,
          acceptedTermsAt: now,
          lastActiveAt: now,
        },
      });

      await this.prisma.userProfile.upsert({
        where: { userId: user.id },
        update: { fullName: input.fullName },
        create: { userId: user.id, fullName: input.fullName },
      });

      await this.prisma.questionnaireResponse.upsert({
        where: { userId: user.id },
        update: {
          versionId: version.id,
          answers: input.answers as Prisma.InputJsonValue,
          submittedAt: new Date(),
        },
        create: {
          userId: user.id,
          versionId: version.id,
          answers: input.answers as Prisma.InputJsonValue,
          submittedAt: new Date(),
        },
      });

      // Synthetic test users default to BOTH so the test pool always has a
      // bridge intent and matching can run end-to-end without manual UI clicks.
      await this.prisma.cycleParticipation.upsert({
        where: { cycleId_userId: { cycleId: cycle.id, userId: user.id } },
        update: {
          status: 'OPTED_IN',
          intent: 'BOTH',
          optedInAt: new Date(),
        },
        create: {
          cycleId: cycle.id,
          userId: user.id,
          status: 'OPTED_IN',
          intent: 'BOTH',
          optedInAt: new Date(),
        },
      });

      createdCount++;
    };

    for (const named of namedUsers) {
      const school = schoolBySlug.get(named.schoolSlug);
      await upsertUser({
        email: named.email,
        displayName: named.displayName,
        fullName: named.fullName,
        schoolId: school?.id ?? null,
        answers: { ...softBase, ...named.hard },
      });
    }

    for (let i = 0; i < BULK_COUNT; i++) {
      const school = schoolList[i % schoolList.length];
      const domain = school.domains[0]?.domain ?? 'test.edu.cn';
      const n = String(i + 1).padStart(2, '0');
      await upsertUser({
        email: `seed.bulk.${n}@${domain}`,
        displayName: `批量-${n}`,
        fullName: `Seed Bulk User ${i + 1}`,
        schoolId: school.id,
        answers: buildBulkAnswers(i),
      });
    }

    await this.adminAuditService.write(adminActorId, 'users.test_seeded', {
      count: createdCount,
      cycleId: cycle.id,
    });

    return {
      ok: true,
      createdCount,
      cycleId: cycle.id,
      cycleName: cycle.codename,
      password: PASSWORD,
    };
  }

  async getSettings() {
    const rows = await this.prisma.systemSetting.findMany();
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  async updateSettings(input: UpdateSettingsDto, adminActorId: string) {
    const allowedKeys = new Set(['max_registrations']);

    const entries = Object.entries(input).filter(([key]) =>
      allowedKeys.has(key),
    );

    if (entries.length === 0) {
      throw new BadRequestException('No valid settings to update.');
    }

    for (const [key, value] of entries) {
      const numericValue = Number(value);
      if (!Number.isInteger(numericValue) || numericValue < 0) {
        throw new BadRequestException(
          `Setting "${key}" must be a non-negative integer.`,
        );
      }
    }

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: String(value) },
          update: { value: String(value) },
        }),
      ),
    );

    await this.adminAuditService.write(adminActorId, 'settings.updated', {
      changes: Object.fromEntries(entries),
    });

    return this.getSettings();
  }
}

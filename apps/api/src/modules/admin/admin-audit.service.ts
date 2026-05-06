import { Injectable } from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto';

type AuditLogRecord = Prisma.AuditLogGetPayload<{
  include: {
    actor: {
      include: {
        school: true;
      };
    };
    adminActor: true;
  };
}>;

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(query: ListAuditLogsQueryDto = {}) {
    const pagination = this.normalizePagination(query);
    const search = query.search?.trim();

    if (!this.hasListQuery(query)) {
      const logs = await this.prisma.auditLog.findMany({
        include: {
          actor: {
            include: {
              school: true,
            },
          },
          adminActor: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      return logs.map((log) => this.serializeAuditLog(log));
    }

    if (!search) {
      const where = query.action ? { action: query.action } : undefined;
      const [items, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          include: {
            actor: {
              include: {
                school: true,
              },
            },
            adminActor: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: pagination.skip,
          take: pagination.pageSize,
        }),
        this.prisma.auditLog.count({ where }),
      ]);

      return this.buildPageResult(
        items.map((item) => this.serializeAuditLog(item)),
        total,
        pagination,
      );
    }

    const pattern = `%${search}%`;
    const actionFilter = query.action
      ? Prisma.sql`AND a."action" = ${query.action}`
      : Prisma.empty;

    const [idRows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT a."id"
        FROM "AuditLog" a
        LEFT JOIN "User" u ON u."id" = a."actorId"
        LEFT JOIN "AdminOperator" ao ON ao."id" = a."adminActorId"
        WHERE 1 = 1
          ${actionFilter}
          AND (
            a."action" ILIKE ${pattern}
            OR COALESCE(u."email", '') ILIKE ${pattern}
            OR COALESCE(ao."email", '') ILIKE ${pattern}
            OR COALESCE(a."metadata"::text, '') ILIKE ${pattern}
          )
        ORDER BY a."createdAt" DESC
        OFFSET ${pagination.skip}
        LIMIT ${pagination.pageSize}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM "AuditLog" a
        LEFT JOIN "User" u ON u."id" = a."actorId"
        LEFT JOIN "AdminOperator" ao ON ao."id" = a."adminActorId"
        WHERE 1 = 1
          ${actionFilter}
          AND (
            a."action" ILIKE ${pattern}
            OR COALESCE(u."email", '') ILIKE ${pattern}
            OR COALESCE(ao."email", '') ILIKE ${pattern}
            OR COALESCE(a."metadata"::text, '') ILIKE ${pattern}
          )
      `),
    ]);

    const items = await this.loadAuditLogsByIds(idRows.map((row) => row.id));
    const total = Number(totalRows[0]?.total ?? 0);

    return this.buildPageResult(items, total, pagination);
  }

  async getRecentAuditLogsByCondition(condition: Prisma.Sql, take: number) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "AuditLog"
      WHERE (${condition})
      ORDER BY "createdAt" DESC
      LIMIT ${take}
    `);

    return this.loadAuditLogsByIds(rows.map((row) => row.id));
  }

  async listAuditLogsByCondition(
    condition: Prisma.Sql,
    query: { page?: number; pageSize?: number } = {},
  ) {
    const pagination = this.normalizePagination(query);
    const [idRows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "AuditLog"
        WHERE (${condition})
        ORDER BY "createdAt" DESC
        OFFSET ${pagination.skip}
        LIMIT ${pagination.pageSize}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM "AuditLog"
        WHERE (${condition})
      `),
    ]);

    const items = await this.loadAuditLogsByIds(idRows.map((row) => row.id));
    const total = Number(totalRows[0]?.total ?? 0);

    return this.buildPageResult(items, total, pagination);
  }

  async write(
    adminActorId: string,
    action: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({
      data: {
        adminActorId,
        action,
        metadata,
      },
    });
  }

  private async loadAuditLogsByIds(ids: string[]) {
    if (ids.length === 0) {
      return [];
    }

    const logs = await this.prisma.auditLog.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      include: {
        actor: {
          include: {
            school: true,
          },
        },
        adminActor: true,
      },
    });
    const logsById = new Map(logs.map((log) => [log.id, log]));

    return ids
      .map((id) => logsById.get(id))
      .filter((log): log is AuditLogRecord => Boolean(log))
      .map((log) => this.serializeAuditLog(log));
  }

  private serializeAuditLog(log: AuditLogRecord) {
    const actor = log.adminActor
      ? {
          kind: 'admin' as const,
          email: log.adminActor.email,
          displayName: log.adminActor.displayName,
          school: null,
        }
      : log.actor
        ? {
            kind: 'user' as const,
            email: log.actor.email,
            displayName: log.actor.displayName,
            school: log.actor.school
              ? {
                  name: log.actor.school.name,
                }
              : null,
          }
        : null;

    return {
      id: log.id,
      action: log.action,
      createdAt: log.createdAt,
      metadata: log.metadata,
      actor,
    };
  }

  private hasListQuery(query: ListAuditLogsQueryDto) {
    return Boolean(
      query.page || query.pageSize || query.search || query.action,
    );
  }

  private normalizePagination(query: { page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 50);

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

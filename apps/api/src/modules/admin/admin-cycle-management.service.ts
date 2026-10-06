import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseDateTimeAsChinaStandardOrInstant } from '../../common/time/china-standard-time';
import { CyclesService } from '../cycles/cycles.service';
import {
  CYCLE_MANAGEMENT_LOCK,
  WeeklyCycleService,
} from '../cycles/weekly-cycle.service';
import { AdminAuditService } from './admin-audit.service';
import {
  RunCycleDto,
  UpsertCycleDto,
  UpdateWeeklyCycleSettingsDto,
} from './dto';
import { CycleMatchingService } from '../cycles/cycle-matching.service';
const lockedCycleStatuses = ['REVEAL_READY', 'REVEALED'] as const;

function isLockedCycleStatus(status: string) {
  return lockedCycleStatuses.includes(
    status as (typeof lockedCycleStatuses)[number],
  );
}

@Injectable()
export class AdminCycleManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cyclesService: CyclesService,
    private readonly matchingService: CycleMatchingService,
    private readonly adminAuditService: AdminAuditService,
    private readonly weeklyCycleService: WeeklyCycleService,
  ) {}

  private parseCycleDateTime(value: string) {
    try {
      return parseDateTimeAsChinaStandardOrInstant(value);
    } catch {
      throw new BadRequestException('Invalid cycle datetime.');
    }
  }

  getWeeklyCycleSettings() {
    return this.weeklyCycleService.getSettings();
  }

  async updateWeeklyCycleSettings(
    input: UpdateWeeklyCycleSettingsDto,
    adminActorId: string,
  ) {
    const result = await this.weeklyCycleService.updateSettings(
      input,
      adminActorId,
    );
    this.cyclesService.invalidateAutomationSchedule();
    return result;
  }

  async deleteCycle(
    cycleId: string,
    adminActorId: string,
    expectedParticipationCount = 0,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CYCLE_MANAGEMENT_LOCK}::integer)`;
      await tx.$queryRaw`SELECT "id" FROM "MatchCycle" WHERE "id" = ${cycleId} FOR UPDATE`;
      const cycle = await tx.matchCycle.findUnique({
        where: { id: cycleId },
        include: { _count: { select: { participations: true } } },
      });
      if (!cycle) throw new NotFoundException('轮次不存在或已删除。');
      if (cycle._count.participations !== expectedParticipationCount) {
        throw new ConflictException(
          '参与记录数量已变化，请关闭弹窗并刷新轮次后重新确认。',
        );
      }
      const deleted = await tx.matchCycle.deleteMany({
        where: {
          id: cycleId,
          status: 'DRAFT',
          matches: { none: {} },
          dashboardSnapshots: { none: {} },
        },
      });
      if (deleted.count !== 1)
        throw new ConflictException(
          '只能删除尚未生成匹配及结果记录的草稿轮次。',
        );
      await tx.auditLog.create({
        data: {
          adminActorId,
          action: 'cycle.deleted',
          metadata: {
            cycleId,
            codename: cycle.codename,
            deletedParticipationCount: cycle._count.participations,
          },
        },
      });
    });
    this.cyclesService.invalidateAutomationSchedule();
    return { ok: true };
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

      this.cyclesService.invalidateAutomationSchedule();

      await this.adminAuditService.write(adminActorId, 'cycle.updated', {
        cycleId: cycle.id,
        status: cycle.status,
      });

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

    this.cyclesService.invalidateAutomationSchedule();

    await this.adminAuditService.write(adminActorId, 'cycle.created', {
      cycleId: cycle.id,
      status: cycle.status,
    });

    return cycle;
  }

  async previewCycle(cycleId: string, adminActorId: string) {
    const preview = await this.matchingService.previewCycle(cycleId);
    const generatedAt = new Date().toISOString();
    await this.adminAuditService.write(adminActorId, 'cycle.previewed', {
      cycleId,
      generatedAt,
      suggestedPairs: preview.suggestedPairs.length,
      unmatchedUsers: preview.unmatchedUserIds.length,
    });
    return { ...preview, generatedAt };
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
}

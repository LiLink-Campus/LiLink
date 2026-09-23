import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export const WEEKLY_CYCLE_SETTING_KEY = 'weekly-cycle-schedule';
export const CYCLE_MANAGEMENT_LOCK = 70412027;
const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;

type WeeklyCycleSettings = { enabled: boolean; deadlineHours: number };
const DEFAULT_SETTINGS: WeeklyCycleSettings = {
  enabled: false,
  deadlineHours: 2,
};

export function nextWeeklyReveal(now: Date, deadlineHours: number): Date {
  const china = new Date(now.getTime() + 8 * HOUR);
  const days = (2 - china.getUTCDay() + 7) % 7;
  let reveal = Date.UTC(
    china.getUTCFullYear(),
    china.getUTCMonth(),
    china.getUTCDate() + days,
    13,
  );
  if (reveal - deadlineHours * HOUR <= now.getTime()) reveal += WEEK;
  return new Date(reveal);
}

export function weeklyNumber(name: string): number {
  const match = /^第\s*(\d+)\s*周$/.exec(name);
  if (match) {
    const value = Number(match[1]);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }
  const chinese = /^第([一二三四五六七八九十]+)周$/.exec(name)?.[1];
  if (!chinese) return 0;
  const digits = '零一二三四五六七八九';
  if (!chinese.includes('十')) return digits.indexOf(chinese);
  const [tens, units] = chinese.split('十');
  return (
    (tens ? digits.indexOf(tens) : 1) * 10 + (units ? digits.indexOf(units) : 0)
  );
}

@Injectable()
export class WeeklyCycleService {
  constructor(private readonly prisma: PrismaService) {}

  private async readSettings(
    tx: Pick<Prisma.TransactionClient, 'systemSetting'>,
  ) {
    const row = await tx.systemSetting.findUnique({
      where: { key: WEEKLY_CYCLE_SETTING_KEY },
    });
    if (!row) return DEFAULT_SETTINGS;
    const value = JSON.parse(row.value) as WeeklyCycleSettings;
    if (
      typeof value.enabled !== 'boolean' ||
      ![1, 2, 24].includes(value.deadlineHours)
    ) {
      throw new BadRequestException('自动轮次配置无效，请重新保存。');
    }
    return value;
  }

  async getSettings() {
    return this.readSettings(this.prisma);
  }

  async updateSettings(input: WeeklyCycleSettings, adminActorId: string) {
    if (
      typeof input.enabled !== 'boolean' ||
      ![1, 2, 24].includes(input.deadlineHours)
    ) {
      throw new BadRequestException('请选择有效的自动轮次设置。');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CYCLE_MANAGEMENT_LOCK}::integer)`;
      await tx.systemSetting.upsert({
        where: { key: WEEKLY_CYCLE_SETTING_KEY },
        create: { key: WEEKLY_CYCLE_SETTING_KEY, value: JSON.stringify(input) },
        update: { value: JSON.stringify(input) },
      });
      await tx.auditLog.create({
        data: {
          adminActorId,
          action: 'cycle.schedule.updated',
          metadata: input,
        },
      });
      const createdCycle = input.enabled
        ? await this.ensureCycle(tx, input, new Date())
        : null;
      return { ...input, createdCycle };
    });
  }

  async ensureUpcomingCycle(now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CYCLE_MANAGEMENT_LOCK}::integer)`;
      const settings = await this.readSettings(tx);
      return settings.enabled ? this.ensureCycle(tx, settings, now) : null;
    });
  }

  private async ensureCycle(
    tx: Prisma.TransactionClient,
    settings: WeeklyCycleSettings,
    now: Date,
  ) {
    // Finish the current cycle before opening another, including failed preparation.
    const pending = await tx.matchCycle.findFirst({
      where: {
        OR: [
          { status: { in: ['OPEN', 'PREPARING', 'REVEAL_READY'] } },
          { status: 'REVEALED', revealAt: { gt: now } },
        ],
      },
      select: { id: true },
    });
    if (pending) return null;
    const names = await tx.matchCycle.findMany({ select: { codename: true } });
    const number =
      Math.max(0, ...names.map(({ codename }) => weeklyNumber(codename))) + 1;
    const revealAt = nextWeeklyReveal(now, settings.deadlineHours);
    const cycle = await tx.matchCycle.create({
      data: {
        codename: `第${number}周`,
        status: 'OPEN',
        revealAt,
        participationDeadline: new Date(
          revealAt.getTime() - settings.deadlineHours * HOUR,
        ),
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'cycle.auto_created',
        metadata: {
          cycleId: cycle.id,
          codename: cycle.codename,
          revealAt: revealAt.toISOString(),
        },
      },
    });
    return cycle;
  }
}

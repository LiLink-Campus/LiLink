import {
  DASHBOARD_COUPON_READ_TARGET,
  DASHBOARD_COUPON_READ_VERSION,
} from '@lilink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

export const DASHBOARD_COUPON_HREF = '/dashboard/coupons' as const;

export interface DashboardCouponAgendaResponse {
  target: string;
  version: string;
  availableCount: number;
  unreadAvailableCount: number;
  read: boolean;
  readAt: string | null;
  href: typeof DASHBOARD_COUPON_HREF;
}

type CouponReadStatePrisma = Pick<PrismaService, 'coupon' | 'couponReadState'>;

function currentDashboardCouponReadStateWhere(userId: string) {
  return {
    userId_target_version: {
      userId,
      target: DASHBOARD_COUPON_READ_TARGET,
      version: DASHBOARD_COUPON_READ_VERSION,
    },
  };
}

function availableCouponWhere(userId: string, now: Date) {
  return {
    userId,
    status: 'ISSUED' as const,
    totpSecret: { not: null },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

function toDashboardCouponAgenda(input: {
  availableCount: number;
  readState: { readAt: Date } | null;
}): DashboardCouponAgendaResponse {
  const read = input.readState != null;

  return {
    target: DASHBOARD_COUPON_READ_TARGET,
    version: DASHBOARD_COUPON_READ_VERSION,
    availableCount: input.availableCount,
    unreadAvailableCount: read ? 0 : input.availableCount,
    read,
    readAt: input.readState?.readAt.toISOString() ?? null,
    href: DASHBOARD_COUPON_HREF,
  };
}

export async function getDashboardCouponAgenda(
  prisma: CouponReadStatePrisma,
  userId: string,
  now = new Date(),
): Promise<DashboardCouponAgendaResponse> {
  const [availableCount, readState] = await Promise.all([
    prisma.coupon.count({ where: availableCouponWhere(userId, now) }),
    prisma.couponReadState.findUnique({
      where: currentDashboardCouponReadStateWhere(userId),
      select: { readAt: true },
    }),
  ]);

  return toDashboardCouponAgenda({ availableCount, readState });
}

export async function markDashboardCouponAgendaRead(
  prisma: CouponReadStatePrisma,
  userId: string,
  now = new Date(),
): Promise<DashboardCouponAgendaResponse> {
  const availableCount = await prisma.coupon.count({
    where: availableCouponWhere(userId, now),
  });

  if (availableCount === 0) {
    return toDashboardCouponAgenda({ availableCount, readState: null });
  }

  const readState = await prisma.couponReadState.upsert({
    where: currentDashboardCouponReadStateWhere(userId),
    create: {
      userId,
      target: DASHBOARD_COUPON_READ_TARGET,
      version: DASHBOARD_COUPON_READ_VERSION,
      readAt: now,
    },
    update: {},
    select: { readAt: true },
  });

  return toDashboardCouponAgenda({ availableCount, readState });
}

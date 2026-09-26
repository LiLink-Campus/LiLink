import { BadRequestException } from '@nestjs/common';
import {
  type CouponRule,
  effectiveCouponStatus,
  renderBenefitText,
} from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';

export const couponDetails = {
  template: {
    select: {
      title: true,
      benefitType: true,
      faceValue: true,
      rule: true,
      merchant: { select: { name: true } },
    },
  },
  redemption: { select: { redeemedAt: true } },
} satisfies Prisma.CouponInclude;

type Coupon = Prisma.CouponGetPayload<{ include: typeof couponDetails }>;
export type CouponPageStatus = 'available' | 'history';
type CouponCursor = {
  userId: string;
  status: CouponPageStatus;
  issuedAt: string;
  id: string;
};
const PAGE_SIZE = 20;

export function couponView(coupon: Coupon, now: Date) {
  return {
    id: coupon.id,
    status: effectiveCouponStatus(
      { status: coupon.status, expiresAt: coupon.expiresAt },
      now,
    ),
    code: coupon.code,
    merchantName: coupon.template.merchant.name,
    title: coupon.template.title,
    benefitType: coupon.template.benefitType,
    benefitText: renderBenefitText({
      benefitType: coupon.template.benefitType,
      title: coupon.template.title,
      faceValue: coupon.template.faceValue,
      rule: coupon.template.rule as CouponRule | null,
    }),
    faceValue: coupon.template.faceValue,
    issuedAt: coupon.issuedAt.toISOString(),
    expiresAt: coupon.expiresAt?.toISOString() ?? null,
    redeemedAt: coupon.redemption?.redeemedAt.toISOString() ?? null,
  };
}

function decodeCursor(
  raw: unknown,
  userId: string,
  status: CouponPageStatus,
): CouponCursor | null {
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || raw.length > 1024 || !/^[\w-]+$/.test(raw)) {
    throw new BadRequestException('Invalid coupon cursor.');
  }
  try {
    const cursor: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    if (!cursor || typeof cursor !== 'object') throw new Error();
    const value = cursor as Partial<CouponCursor>;
    if (
      value.userId !== userId ||
      value.status !== status ||
      typeof value.id !== 'string' ||
      !value.id ||
      value.id.length > 200 ||
      typeof value.issuedAt !== 'string' ||
      new Date(value.issuedAt).toISOString() !== value.issuedAt
    )
      throw new Error();
    return value as CouponCursor;
  } catch {
    throw new BadRequestException('Invalid coupon cursor.');
  }
}

export async function readCouponPage(
  prisma: Pick<Prisma.TransactionClient, 'coupon'>,
  userId: string,
  rawStatus: unknown,
  rawCursor?: unknown,
  now = new Date(),
) {
  if (rawStatus !== 'available' && rawStatus !== 'history') {
    throw new BadRequestException('Invalid coupon page status.');
  }
  const status = rawStatus;
  const cursor = decodeCursor(rawCursor, userId, status);
  if (cursor) {
    // Validate ownership and immutable ordering fields, not the mutable status:
    // an anchor can expire or be redeemed between page requests.
    const anchor = await prisma.coupon.findFirst({
      where: { id: cursor.id, userId, issuedAt: new Date(cursor.issuedAt) },
      select: { id: true },
    });
    if (!anchor) throw new BadRequestException('Invalid coupon cursor.');
  }
  const available: Prisma.CouponWhereInput = {
    status: 'ISSUED',
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  const partition: Prisma.CouponWhereInput =
    status === 'available'
      ? available
      : {
          OR: [
            { status: { not: 'ISSUED' } },
            { status: 'ISSUED', expiresAt: { lte: now } },
          ],
        };
  // Keyset pagination keeps equal timestamps stable. Eligibility is live on
  // every page; refresh the overview to see newly issued or moved coupons.
  const rows = await prisma.coupon.findMany({
    where: {
      userId,
      AND: [
        partition,
        ...(cursor
          ? [
              {
                OR: [
                  { issuedAt: { lt: new Date(cursor.issuedAt) } },
                  {
                    issuedAt: new Date(cursor.issuedAt),
                    id: { lt: cursor.id },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    include: couponDetails,
  });
  const items = rows.slice(0, PAGE_SIZE);
  const last = items.at(-1);
  return {
    items: items.map((coupon) => couponView(coupon, now)),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? Buffer.from(
            JSON.stringify({
              userId,
              status,
              issuedAt: last.issuedAt.toISOString(),
              id: last.id,
            } satisfies CouponCursor),
          ).toString('base64url')
        : null,
  };
}

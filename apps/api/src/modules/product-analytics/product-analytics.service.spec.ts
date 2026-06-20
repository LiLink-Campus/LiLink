import { BadRequestException, Logger } from '@nestjs/common';
import { ProductAnalyticsService } from './product-analytics.service';

const EVENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const SESSION_ID = '123e4567-e89b-12d3-a456-426614174001';
const COUPON_ID = 'cm00000000000000000000001';
const MATCH_ID = 'cm00000000000000000000004';
const MERCHANT_ID = 'cm00000000000000000000002';
const TEMPLATE_ID = 'cm00000000000000000000003';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ isTest: false }),
    },
    productEvent: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    productEventOutbox: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    redemption: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    matchParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    meetupSession: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    meetupProposal: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function objectContaining<T extends Record<string, unknown>>(value: T): T {
  return expect.objectContaining(value) as T;
}

describe('ProductAnalyticsService', () => {
  it('records an authenticated browser event with sanitized metadata', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    await service.recordBrowserEvent('user-1', {
      eventId: EVENT_ID,
      name: 'coupon_redeem_code_displayed',
      kind: 'footprint',
      route: '/dashboard/coupons',
      surface: 'coupon_redeem_code_dialog',
      sessionId: SESSION_ID,
      metadata: {
        couponStatus: 'ISSUED',
        code: 'SHOULD_NOT_PERSIST',
        totpSecret: 'SHOULD_NOT_PERSIST',
      },
    });

    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: objectContaining({
        eventId: EVENT_ID,
        name: 'coupon_redeem_code_displayed',
        kind: 'FOOTPRINT',
        source: 'WEB',
        userId: 'user-1',
        route: '/dashboard/coupons',
        surface: 'coupon_redeem_code_dialog',
        sessionId: SESSION_ID,
        metadata: { couponStatus: 'ISSUED' },
      }),
    });
  });

  it('excludes test users server-side', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ isTest: true });
    const service = new ProductAnalyticsService(prisma as never);

    const result = await service.recordBrowserEvent('user-test', {
      eventId: EVENT_ID,
      name: 'dashboard_page_viewed',
      kind: 'footprint',
    });

    expect(result).toEqual({
      ok: true,
      recorded: false,
      skipped: 'test-user',
    });
    expect(prisma.productEvent.create).not.toHaveBeenCalled();
  });

  it('omits metadata when no allowlisted metadata remains', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    await service.recordBrowserEvent('user-1', {
      eventId: EVENT_ID,
      name: 'dashboard_page_viewed',
      kind: 'footprint',
    });

    const createCalls = prisma.productEvent.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(createCalls[0]?.[0].data).not.toHaveProperty('metadata');
  });

  it('rejects browser attempts to write outcomes', async () => {
    const service = new ProductAnalyticsService(makePrisma() as never);

    await expect(
      service.recordBrowserEvent('user-1', {
        eventId: EVENT_ID,
        name: 'coupon_redeemed',
        kind: 'intent',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects browser attempts to reserve deterministic outcome event ids', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    await expect(
      service.recordBrowserEvent('user-1', {
        eventId: `coupon_redeemed:${COUPON_ID}`,
        name: 'coupon_page_viewed',
        kind: 'footprint',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.productEvent.create).not.toHaveBeenCalled();
  });

  it('normalizes malicious browser-controlled scalar fields', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    await service.recordBrowserEvent('user-1', {
      eventId: EVENT_ID,
      name: 'coupon_redeem_code_open_clicked',
      kind: 'intent',
      route: '/dashboard/coupons?code=SHOULD_NOT_PERSIST&totp=123456',
      surface: 'coupon card with email person@example.com',
      sessionId: 'note text from user',
      entityType: 'coupon',
      entityId: 'coupon-code-ABC123',
      metadata: {
        couponStatus: 'TOTP_OR_COUPON_CODE',
        availableCouponCount: 1,
      },
    });

    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: objectContaining({
        route: '/dashboard/coupons',
        surface: null,
        sessionId: null,
        entityType: 'coupon',
        entityId: null,
        metadata: { availableCouponCount: 1 },
      }),
    });
  });

  it('drops browser surface values that are not allowlisted for the event', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    await service.recordBrowserEvent('user-1', {
      eventId: EVENT_ID,
      name: 'coupon_page_viewed',
      kind: 'footprint',
      route: '/dashboard/coupons',
      surface: 'library-2f',
      metadata: { availableCouponCount: 1 },
    });

    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: objectContaining({
        name: 'coupon_page_viewed',
        surface: null,
        metadata: { availableCouponCount: 1 },
      }),
    });
  });

  it('drops browser entity attachments that are not allowlisted for the event', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    await service.recordBrowserEvent('user-1', {
      eventId: EVENT_ID,
      name: 'dashboard_page_viewed',
      kind: 'footprint',
      route: '/dashboard',
      surface: 'dashboard_home',
      entityType: 'coupon',
      entityId: COUPON_ID,
      metadata: { availableCouponCount: 1 },
    });

    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: objectContaining({
        name: 'dashboard_page_viewed',
        entityType: null,
        entityId: null,
        metadata: { availableCouponCount: 1 },
      }),
    });
  });

  it('records campus match browser events with match-scoped entities', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    await service.recordBrowserEvent('user-1', {
      eventId: EVENT_ID,
      name: 'match_page_viewed',
      kind: 'footprint',
      route: '/dashboard/match',
      surface: 'match_page',
      entityType: 'match',
      entityId: MATCH_ID,
      metadata: {
        matchId: MATCH_ID,
        matchVisibility: 'VISIBLE',
        introduced: false,
        hasMeetupSession: true,
        availableCouponCount: 1,
      },
    });

    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: objectContaining({
        name: 'match_page_viewed',
        route: '/dashboard/match',
        surface: 'match_page',
        entityType: 'match',
        entityId: MATCH_ID,
        metadata: {
          matchId: MATCH_ID,
          matchVisibility: 'VISIBLE',
          introduced: false,
          hasMeetupSession: true,
        },
      }),
    });
  });

  it('records backend outcomes from the outbox with API source', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);
    prisma.productEventOutbox.findMany.mockResolvedValue([
      {
        id: 'outbox-1',
        eventId: `coupon_redeemed:${COUPON_ID}`,
        name: 'coupon_redeemed',
        eventVersion: 1,
        userId: 'user-1',
        entityType: 'coupon',
        entityId: COUPON_ID,
        metadata: {
          merchantId: MERCHANT_ID,
          couponTemplateId: TEMPLATE_ID,
          couponCode: 'SHOULD_NOT_PERSIST',
        },
        occurredAt: null,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        lastAttemptAt: null,
        nextAttemptAt: null,
        createdAt: new Date('2026-05-29T10:00:00.000Z'),
      },
    ]);

    await service.flushProductEventOutbox({
      eventIds: [`coupon_redeemed:${COUPON_ID}`],
    });

    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: objectContaining({
        eventId: `coupon_redeemed:${COUPON_ID}`,
        name: 'coupon_redeemed',
        kind: 'OUTCOME',
        source: 'API',
        entityId: COUPON_ID,
        metadata: {
          merchantId: MERCHANT_ID,
          couponTemplateId: TEMPLATE_ID,
        },
      }),
    });
  });

  it('enqueues campus match contact outcomes with match-scoped entities', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    await service.enqueueMatchContactRequestedOutcome(prisma, {
      userId: 'user-1',
      matchId: MATCH_ID,
      occurredAt: new Date('2026-05-29T10:00:00.000Z'),
    });

    expect(prisma.productEventOutbox.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventId: `match_contact_requested:${MATCH_ID}`,
          name: 'match_contact_requested',
          userId: 'user-1',
          entityType: 'match',
          entityId: MATCH_ID,
          metadata: { matchId: MATCH_ID },
        }) as object,
      ],
      skipDuplicates: true,
    });
  });

  it('enqueues coupon redeemed outcomes into the product event outbox', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);
    const occurredAt = new Date('2026-05-29T10:00:00.000Z');

    await service.enqueueCouponRedeemedOutcome(prisma, {
      couponId: COUPON_ID,
      couponTemplateId: TEMPLATE_ID,
      merchantId: MERCHANT_ID,
      userId: 'user-1',
      occurredAt,
    });

    expect(prisma.productEventOutbox.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventId: `coupon_redeemed:${COUPON_ID}`,
          name: 'coupon_redeemed',
          userId: 'user-1',
          entityType: 'coupon',
          entityId: COUPON_ID,
          metadata: {
            merchantId: MERCHANT_ID,
            couponTemplateId: TEMPLATE_ID,
          },
          occurredAt,
        }) as object,
      ],
      skipDuplicates: true,
    });
  });

  it('does not enqueue backend outcomes for test users', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ isTest: true });
    const service = new ProductAnalyticsService(prisma as never);
    const occurredAt = new Date('2026-05-29T10:00:00.000Z');

    await expect(
      service.enqueueCouponRedeemedOutcome(prisma, {
        couponId: COUPON_ID,
        couponTemplateId: TEMPLATE_ID,
        merchantId: MERCHANT_ID,
        userId: 'user-test',
        occurredAt,
      }),
    ).resolves.toBe(`coupon_redeemed:${COUPON_ID}`);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-test' },
      select: { isTest: true },
    });
    expect(prisma.productEventOutbox.createMany).not.toHaveBeenCalled();
  });

  it('flushes pending outcome outbox rows idempotently into product events', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);
    const occurredAt = new Date('2026-05-29T10:00:00.000Z');
    prisma.productEventOutbox.findMany.mockResolvedValue([
      {
        id: 'outbox-1',
        eventId: `match_contact_requested:${MATCH_ID}`,
        name: 'match_contact_requested',
        eventVersion: 1,
        userId: 'user-1',
        entityType: 'match',
        entityId: MATCH_ID,
        metadata: { matchId: MATCH_ID },
        occurredAt,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        lastAttemptAt: null,
        nextAttemptAt: null,
        createdAt: occurredAt,
      },
    ]);

    await service.flushProductEventOutbox();

    expect(prisma.productEventOutbox.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'outbox-1',
        status: 'PENDING',
        createdAt: { gte: expect.any(Date) as Date },
      },
      data: expect.objectContaining({
        status: 'PROCESSING',
        attempts: { increment: 1 },
      }) as object,
    });
    expect(prisma.productEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: `match_contact_requested:${MATCH_ID}`,
        name: 'match_contact_requested',
        kind: 'OUTCOME',
        source: 'API',
      }) as object,
    });
    expect(prisma.productEventOutbox.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: expect.objectContaining({
        status: 'RECORDED',
        nextAttemptAt: null,
        errorMessage: null,
      }) as object,
    });
  });

  it('does not select expired outbox rows for flushing', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-30T00:00:00.000Z'));
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    try {
      await service.flushProductEventOutbox();
    } finally {
      jest.useRealTimers();
    }

    expect(prisma.productEventOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: new Date('2026-03-31T00:00:00.000Z') },
        }) as object,
      }),
    );
    expect(prisma.productEvent.create).not.toHaveBeenCalled();
  });

  it('removes legacy test-user outbox rows without recording them', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ isTest: true });
    const service = new ProductAnalyticsService(prisma as never);
    prisma.productEventOutbox.findMany.mockResolvedValue([
      {
        id: 'outbox-test-user',
        eventId: `match_contact_requested:${MATCH_ID}`,
        name: 'match_contact_requested',
        eventVersion: 1,
        userId: 'user-test',
        entityType: 'match',
        entityId: MATCH_ID,
        metadata: { matchId: MATCH_ID },
        occurredAt: new Date('2026-05-29T10:00:00.000Z'),
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        lastAttemptAt: null,
        nextAttemptAt: null,
        createdAt: new Date('2026-05-29T10:00:00.000Z'),
      },
    ]);

    await service.flushProductEventOutbox({
      eventIds: [`match_contact_requested:${MATCH_ID}`],
    });

    expect(prisma.productEvent.create).not.toHaveBeenCalled();
    expect(prisma.productEventOutbox.delete).toHaveBeenCalledWith({
      where: { id: 'outbox-test-user' },
    });
    expect(prisma.productEventOutbox.update).not.toHaveBeenCalled();
  });

  it('reconciles exhausted outbox rows from canonical outcomes', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);
    const redeemedAt = new Date('2026-05-29T10:00:00.000Z');
    prisma.productEventOutbox.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.redemption.findMany.mockResolvedValue([
      {
        couponId: COUPON_ID,
        merchantId: MERCHANT_ID,
        userId: 'user-1',
        redeemedAt,
        coupon: { templateId: TEMPLATE_ID },
      },
    ]);

    await expect(
      service.reconcileRecentOutcomeOutbox(new Date('2026-05-30T00:00:00Z')),
    ).resolves.toEqual({ enqueuedCount: 1 });

    expect(prisma.productEventOutbox.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: `coupon_redeemed:${COUPON_ID}`,
        OR: [
          { status: { in: ['PENDING', 'FAILED', 'EXHAUSTED'] } },
          {
            status: 'PROCESSING',
            lastAttemptAt: { lt: expect.any(Date) as Date },
          },
        ],
      },
      data: expect.objectContaining({
        eventId: `coupon_redeemed:${COUPON_ID}`,
        name: 'coupon_redeemed',
        userId: 'user-1',
        entityType: 'coupon',
        entityId: COUPON_ID,
        metadata: {
          merchantId: MERCHANT_ID,
          couponTemplateId: TEMPLATE_ID,
        },
        occurredAt: redeemedAt,
        status: 'PENDING',
        attempts: 0,
        lastAttemptAt: null,
        nextAttemptAt: null,
        recordedAt: null,
        errorMessage: null,
      }) as object,
    });
    expect(prisma.productEventOutbox.createMany).not.toHaveBeenCalled();
  });

  it('filters test users out of outcome reconciliation queries', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);
    const now = new Date('2026-05-30T00:00:00.000Z');
    const cutoff = new Date('2026-03-31T00:00:00.000Z');

    await expect(service.reconcileRecentOutcomeOutbox(now)).resolves.toEqual({
      enqueuedCount: 0,
    });

    expect(prisma.redemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          redeemedAt: { gte: cutoff },
          coupon: { user: { isTest: false } },
        },
      }),
    );
    expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          contactRequestedAt: { gte: cutoff },
          user: { isTest: false },
        },
      }),
    );
    expect(prisma.meetupSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: { gte: cutoff },
          startedByUser: { isTest: false },
        },
      }),
    );
    expect(prisma.meetupProposal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: { gte: cutoff },
          actorUser: { isTest: false },
        },
      }),
    );
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: { gte: cutoff },
          action: {
            in: ['meetup.options_accepted', 'meetup.final_confirmed'],
          },
          actorId: { not: null },
          actor: { is: { isTest: false } },
        },
      }),
    );
    expect(prisma.productEventOutbox.createMany).not.toHaveBeenCalled();
    expect(prisma.productEventOutbox.updateMany).not.toHaveBeenCalled();
  });

  it('fails outbox rows whose event ids do not match the outcome name', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    prisma.productEventOutbox.findMany.mockResolvedValue([
      {
        id: 'outbox-invalid',
        eventId: `meetup_final_confirmed:${COUPON_ID}`,
        name: 'coupon_redeemed',
        eventVersion: 1,
        userId: 'user-1',
        entityType: 'coupon',
        entityId: COUPON_ID,
        metadata: null,
        occurredAt: null,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 1,
        lastAttemptAt: null,
        nextAttemptAt: null,
        createdAt: new Date('2026-05-29T10:00:00.000Z'),
      },
    ]);

    await service.flushProductEventOutbox({
      eventIds: [`meetup_final_confirmed:${COUPON_ID}`],
    });

    expect(prisma.productEvent.create).not.toHaveBeenCalled();
    expect(prisma.productEventOutbox.update).toHaveBeenCalledWith({
      where: { id: 'outbox-invalid' },
      data: expect.objectContaining({
        status: 'EXHAUSTED',
        nextAttemptAt: null,
        errorMessage: 'Product event id is invalid.',
      }) as object,
    });
    warn.mockRestore();
  });

  it('treats unique collisions as duplicates only when the row matches', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);
    const duplicateError = Object.assign(new Error('duplicate'), {
      code: 'P2002',
    });
    prisma.productEvent.create.mockRejectedValue(duplicateError);
    prisma.productEvent.findUnique.mockResolvedValue({
      eventId: EVENT_ID,
      name: 'coupon_redeem_code_displayed',
      kind: 'FOOTPRINT',
      source: 'WEB',
      eventVersion: 1,
      userId: 'user-1',
      sessionId: SESSION_ID,
      intentId: null,
      correlationId: null,
      route: '/dashboard/coupons',
      surface: 'coupon_redeem_code_dialog',
      entityType: null,
      entityId: null,
      metadata: { couponStatus: 'ISSUED' },
    });

    await expect(
      service.recordBrowserEvent('user-1', {
        eventId: EVENT_ID,
        name: 'coupon_page_viewed',
        kind: 'footprint',
        route: '/dashboard/coupons',
        sessionId: SESSION_ID,
        metadata: { couponStatus: 'ISSUED' },
      }),
    ).rejects.toBe(duplicateError);
  });

  it('keeps matching unique collisions idempotent', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);
    prisma.productEvent.create.mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: 'P2002' }),
    );
    prisma.productEvent.findUnique.mockResolvedValue({
      eventId: EVENT_ID,
      name: 'coupon_redeem_code_displayed',
      kind: 'FOOTPRINT',
      source: 'WEB',
      eventVersion: 1,
      userId: 'user-1',
      sessionId: SESSION_ID,
      intentId: null,
      correlationId: null,
      route: '/dashboard/coupons',
      surface: 'coupon_redeem_code_dialog',
      entityType: null,
      entityId: null,
      metadata: { couponStatus: 'ISSUED' },
    });

    await expect(
      service.recordBrowserEvent('user-1', {
        eventId: EVENT_ID,
        name: 'coupon_redeem_code_displayed',
        kind: 'footprint',
        route: '/dashboard/coupons',
        surface: 'coupon_redeem_code_dialog',
        sessionId: SESSION_ID,
        metadata: { couponStatus: 'ISSUED' },
      }),
    ).resolves.toEqual({
      ok: true,
      recorded: false,
      skipped: 'duplicate',
    });
  });

  it('purges raw events and old outbox rows after 60 days', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);
    const now = new Date('2026-05-29T00:00:00.000Z');

    await service.purgeExpiredRawEvents(now);

    expect(prisma.productEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date('2026-03-30T00:00:00.000Z'),
        },
      },
    });
    expect(prisma.productEventOutbox.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date('2026-03-30T00:00:00.000Z'),
        },
      },
    });
  });

  it('purges product analytics rows for test users', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    await service.purgeEventsForUsers(['user-test']);
    await service.purgeOutboxForUsers(['user-test']);

    expect(prisma.productEvent.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['user-test'] } },
    });
    expect(prisma.productEventOutbox.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['user-test'] } },
    });
  });
});

describe('ProductAnalyticsService outbox flush backstop window', () => {
  it('sweeps on the first tick after boot to drain orphaned rows', async () => {
    const prisma = makePrisma();
    const service = new ProductAnalyticsService(prisma as never);

    await service.handleProductEventOutbox();

    expect(prisma.productEventOutbox.findMany).toHaveBeenCalledTimes(1);
  });

  it('skips the DB sweep once the flush window has lapsed', async () => {
    jest.useFakeTimers();
    try {
      const prisma = makePrisma();
      const service = new ProductAnalyticsService(prisma as never);

      jest.advanceTimersByTime(60 * 60 * 1000);
      await service.handleProductEventOutbox();

      expect(prisma.productEventOutbox.findMany).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reopens the flush window when a new outcome is enqueued', async () => {
    jest.useFakeTimers();
    try {
      const prisma = makePrisma();
      const service = new ProductAnalyticsService(prisma as never);

      jest.advanceTimersByTime(60 * 60 * 1000);
      await service.handleProductEventOutbox();
      expect(prisma.productEventOutbox.findMany).not.toHaveBeenCalled();

      await service.enqueueCouponRedeemedOutcome(prisma as never, {
        couponId: COUPON_ID,
        couponTemplateId: TEMPLATE_ID,
        merchantId: MERCHANT_ID,
        userId: 'user-1',
        occurredAt: new Date(),
      });
      await service.handleProductEventOutbox();

      expect(prisma.productEventOutbox.findMany).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

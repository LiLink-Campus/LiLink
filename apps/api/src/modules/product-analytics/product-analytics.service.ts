import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  getProductEventDefinition,
  sanitizeBrowserProductEventId,
  isBrowserProductEventKind,
  isProductEventName,
  sanitizeProductEventCorrelationId,
  sanitizeProductEventEntityId,
  sanitizeProductEventEntityType,
  sanitizeProductEventMetadata,
  sanitizeProductOutcomeEventId,
  sanitizeProductEventRoute,
  sanitizeProductEventSessionId,
  sanitizeProductEventSurface,
  type ProductEventKind,
  type ProductEventName,
  type ProductEventSource,
} from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isUniqueConstraintError } from '../../common/prisma/errors';
import { CreateProductEventDto } from './dto';

const RAW_EVENT_RETENTION_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_CLIENT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const PRODUCT_EVENT_OUTBOX_FLUSH_BATCH_SIZE = 50;
const PRODUCT_EVENT_OUTBOX_STALE_PROCESSING_MS = 10 * 60 * 1000;
// Backstop flush window. The outbox cron only sweeps the DB while
// Date.now() <= outboxPollUntil; enqueue and FAILED retries push this window
// forward, so an idle cron tick skips the query entirely and lets Neon's
// compute scale to zero. Analytics rows tolerate the resulting minute-scale
// processing lag (their only consumer is the request-driven admin dashboard).
const PRODUCT_EVENT_OUTBOX_FLUSH_GRACE_MS = 15 * 60 * 1000;

type ProductEventOutboxStatusDb =
  | 'PENDING'
  | 'PROCESSING'
  | 'RECORDED'
  | 'FAILED'
  | 'EXHAUSTED';

type ProductEventDelegate = {
  create(args: {
    data: Prisma.ProductEventUncheckedCreateInput;
  }): Promise<unknown>;
  findUnique(args: {
    where: { eventId: string };
    select: Record<string, boolean>;
  }): Promise<Record<string, unknown> | null>;
  deleteMany(args: {
    where: Record<string, unknown>;
  }): Promise<{ count: number }>;
};

type UserDelegate = {
  findUnique(args: {
    where: { id: string };
    select: { isTest: true };
  }): Promise<{ isTest: boolean } | null>;
};

type ProductEventStore = {
  productEvent: ProductEventDelegate;
  user: UserDelegate;
};

type ProductEventOutboxDelegate = {
  createMany(args: {
    data: Prisma.ProductEventOutboxUncheckedCreateInput[];
    skipDuplicates?: boolean;
  }): Promise<{ count: number }>;
};

type ProductEventOutboxStore = {
  productEventOutbox: ProductEventOutboxDelegate;
};

export type ProductOutcomeOutboxStore = ProductEventOutboxStore & {
  user: UserDelegate;
};

type ProductEventOutboxRecoveryDelegate = ProductEventOutboxDelegate & {
  updateMany(args: {
    where: Prisma.ProductEventOutboxWhereInput;
    data: Prisma.ProductEventOutboxUncheckedUpdateManyInput;
  }): Promise<{ count: number }>;
};

type ProductOutcomeRecoveryStore = {
  productEventOutbox: ProductEventOutboxRecoveryDelegate;
};

type RecordProductEventInput = {
  eventId: string;
  name: ProductEventName;
  kind: ProductEventKind;
  source: ProductEventSource;
  userId?: string | null;
  eventVersion?: number;
  sessionId?: string | null;
  intentId?: string | null;
  correlationId?: string | null;
  route?: string | null;
  surface?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: unknown;
  occurredAt?: Date | string | null;
};

type ProductOutcomeInput = Omit<RecordProductEventInput, 'kind' | 'source'>;

type ProductEventKindDb =
  | 'FOOTPRINT'
  | 'INTENT'
  | 'OUTCOME'
  | 'PERFORMANCE'
  | 'FRUSTRATION';

type ProductEventSourceDb = 'WEB' | 'API' | 'SERVER';

type ComparableProductEvent = Pick<
  Prisma.ProductEventUncheckedCreateInput,
  | 'eventId'
  | 'name'
  | 'kind'
  | 'source'
  | 'eventVersion'
  | 'userId'
  | 'sessionId'
  | 'intentId'
  | 'correlationId'
  | 'route'
  | 'surface'
  | 'entityType'
  | 'entityId'
  | 'metadata'
>;

type ProductEventOutboxRecord = {
  id: string;
  eventId: string;
  name: string;
  eventVersion: number;
  userId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Prisma.JsonValue | null;
  occurredAt: Date | null;
  status: ProductEventOutboxStatusDb;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
};

export type CouponRedeemedOutcome = {
  couponId: string;
  couponTemplateId: string;
  merchantId: string;
  userId: string;
  occurredAt: Date;
};

export type MatchContactRequestedOutcome = {
  matchId: string;
  userId: string;
  occurredAt: Date;
};

export type MeetupSessionCreatedOutcome = {
  sessionId: string;
  matchId: string;
  proposalId: string;
  userId: string;
  occurredAt: Date;
};

export type MeetupProposalCreatedOutcome = {
  proposalId: string;
  sessionId: string;
  matchId: string;
  userId: string;
  hasTimeOption: boolean;
  hasLocationOption: boolean;
  timeOptionCount: number;
  locationOptionCount: number;
  proposalScope: string;
  occurredAt: Date;
};

export type MeetupOptionAcceptedOutcome = {
  messageId: string;
  sessionId: string;
  proposalId: string;
  userId: string;
  selectedTime: boolean;
  selectedLocation: boolean;
  occurredAt: Date;
};

export type MeetupFinalConfirmedOutcome = {
  messageId: string;
  sessionId: string;
  userId: string;
  occurredAt: Date;
};

@Injectable()
export class ProductAnalyticsService {
  private readonly logger = new Logger(ProductAnalyticsService.name);
  // Sweep until this epoch-ms; starts open so the first ticks after boot drain
  // any rows orphaned by a restart, then lapses to let Neon sleep when idle.
  private outboxPollUntil = Date.now() + PRODUCT_EVENT_OUTBOX_FLUSH_GRACE_MS;

  constructor(private readonly prisma: PrismaService) {}

  private extendOutboxWindow(until: number) {
    if (until > this.outboxPollUntil) {
      this.outboxPollUntil = until;
    }
  }

  async recordBrowserEvent(userId: string, dto: CreateProductEventDto) {
    if (!isProductEventName(dto.name)) {
      throw new BadRequestException('Unknown product event name.');
    }
    if (!isBrowserProductEventKind(dto.kind)) {
      throw new BadRequestException('Unsupported browser product event kind.');
    }

    const definition = getProductEventDefinition(dto.name);
    if (!definition || !definition.browserWritable) {
      throw new BadRequestException('Product event is not browser-writable.');
    }
    if (definition.kind !== dto.kind) {
      throw new BadRequestException('Product event kind does not match name.');
    }

    return this.recordEvent(this.prisma, {
      eventId: dto.eventId,
      name: dto.name,
      kind: dto.kind,
      source: 'web',
      userId,
      eventVersion: dto.eventVersion,
      sessionId: dto.sessionId,
      intentId: dto.intentId,
      correlationId: dto.correlationId,
      route: dto.route,
      surface: dto.surface,
      entityType: dto.entityType,
      entityId: dto.entityId,
      metadata: dto.metadata,
      occurredAt: dto.occurredAt,
    });
  }

  enqueueCouponRedeemedOutcome(
    store: ProductOutcomeOutboxStore,
    input: CouponRedeemedOutcome,
  ) {
    return this.enqueueOutcome(store, this.buildCouponRedeemedOutcome(input));
  }

  enqueueMatchContactRequestedOutcome(
    store: ProductOutcomeOutboxStore,
    input: MatchContactRequestedOutcome,
  ) {
    return this.enqueueOutcome(
      store,
      this.buildMatchContactRequestedOutcome(input),
    );
  }

  enqueueMeetupSessionCreatedOutcome(
    store: ProductOutcomeOutboxStore,
    input: MeetupSessionCreatedOutcome,
  ) {
    return this.enqueueOutcome(
      store,
      this.buildMeetupSessionCreatedOutcome(input),
    );
  }

  enqueueMeetupProposalCreatedOutcome(
    store: ProductOutcomeOutboxStore,
    input: MeetupProposalCreatedOutcome,
  ) {
    return this.enqueueOutcome(
      store,
      this.buildMeetupProposalCreatedOutcome(input),
    );
  }

  enqueueMeetupOptionAcceptedOutcome(
    store: ProductOutcomeOutboxStore,
    input: MeetupOptionAcceptedOutcome,
  ) {
    return this.enqueueOutcome(
      store,
      this.buildMeetupOptionAcceptedOutcome(input),
    );
  }

  enqueueMeetupFinalConfirmedOutcome(
    store: ProductOutcomeOutboxStore,
    input: MeetupFinalConfirmedOutcome,
  ) {
    return this.enqueueOutcome(
      store,
      this.buildMeetupFinalConfirmedOutcome(input),
    );
  }

  private async recordServerOutcome(
    store: ProductEventStore,
    input: ProductOutcomeInput,
  ) {
    const definition = getProductEventDefinition(input.name);
    if (!definition || definition.kind !== 'outcome') {
      throw new BadRequestException('Product outcome event name is invalid.');
    }

    return this.recordEvent(store, {
      ...input,
      kind: 'outcome',
      source: 'api',
    });
  }

  private buildCouponRedeemedOutcome(
    input: CouponRedeemedOutcome,
  ): ProductOutcomeInput {
    return {
      eventId: productOutcomeEventId.couponRedeemed(input.couponId),
      name: 'coupon_redeemed',
      userId: input.userId,
      entityType: 'coupon',
      entityId: input.couponId,
      metadata: {
        merchantId: input.merchantId,
        couponTemplateId: input.couponTemplateId,
      },
      occurredAt: input.occurredAt,
    };
  }

  private buildMatchContactRequestedOutcome(
    input: MatchContactRequestedOutcome,
  ): ProductOutcomeInput {
    return {
      eventId: productOutcomeEventId.matchContactRequested(input.matchId),
      name: 'match_contact_requested',
      userId: input.userId,
      entityType: 'match',
      entityId: input.matchId,
      metadata: { matchId: input.matchId },
      occurredAt: input.occurredAt,
    };
  }

  private buildMeetupSessionCreatedOutcome(
    input: MeetupSessionCreatedOutcome,
  ): ProductOutcomeInput {
    return {
      eventId: productOutcomeEventId.meetupSessionCreated(input.sessionId),
      name: 'meetup_session_created',
      userId: input.userId,
      entityType: 'meetup_session',
      entityId: input.sessionId,
      metadata: {
        sessionId: input.sessionId,
        matchId: input.matchId,
        proposalId: input.proposalId,
      },
      occurredAt: input.occurredAt,
    };
  }

  private buildMeetupProposalCreatedOutcome(
    input: MeetupProposalCreatedOutcome,
  ): ProductOutcomeInput {
    return {
      eventId: productOutcomeEventId.meetupProposalCreated(input.proposalId),
      name: 'meetup_proposal_created',
      userId: input.userId,
      entityType: 'meetup_proposal',
      entityId: input.proposalId,
      metadata: {
        sessionId: input.sessionId,
        matchId: input.matchId,
        proposalId: input.proposalId,
        hasTimeOption: input.hasTimeOption,
        hasLocationOption: input.hasLocationOption,
        timeOptionCount: input.timeOptionCount,
        locationOptionCount: input.locationOptionCount,
        proposalScope: input.proposalScope,
      },
      occurredAt: input.occurredAt,
    };
  }

  private buildMeetupOptionAcceptedOutcome(
    input: MeetupOptionAcceptedOutcome,
  ): ProductOutcomeInput {
    return {
      eventId: productOutcomeEventId.meetupOptionAccepted(input.messageId),
      name: 'meetup_option_accepted',
      userId: input.userId,
      entityType: 'meetup_session',
      entityId: input.sessionId,
      metadata: {
        sessionId: input.sessionId,
        proposalId: input.proposalId,
        optionKind: acceptedOptionKind({
          selectedTime: input.selectedTime,
          selectedLocation: input.selectedLocation,
        }),
        hasTimeOption: input.selectedTime,
        hasLocationOption: input.selectedLocation,
      },
      occurredAt: input.occurredAt,
    };
  }

  private buildMeetupFinalConfirmedOutcome(
    input: MeetupFinalConfirmedOutcome,
  ): ProductOutcomeInput {
    return {
      eventId: productOutcomeEventId.meetupFinalConfirmed(input.messageId),
      name: 'meetup_final_confirmed',
      userId: input.userId,
      entityType: 'meetup_session',
      entityId: input.sessionId,
      metadata: { sessionId: input.sessionId },
      occurredAt: input.occurredAt,
    };
  }

  // Runs every 5 minutes but only touches the DB while the flush window is open
  // (a recent enqueue or a pending FAILED retry). Idle ticks return without
  // querying so Neon's compute can scale to zero.
  @Cron(CronExpression.EVERY_5_MINUTES, {
    name: 'product-event-outbox-flush',
    waitForCompletion: true,
  })
  async handleProductEventOutbox() {
    if (Date.now() > this.outboxPollUntil) {
      return;
    }

    try {
      await this.flushProductEventOutbox();
    } catch (error) {
      this.logger.error(
        'Failed to flush product analytics outbox.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async flushProductEventOutbox(
    options: { eventIds?: string[]; limit?: number } = {},
  ) {
    const now = new Date();
    const retentionCutoff = new Date(
      now.getTime() - RAW_EVENT_RETENTION_DAYS * MS_PER_DAY,
    );
    const staleProcessingThreshold = new Date(
      now.getTime() - PRODUCT_EVENT_OUTBOX_STALE_PROCESSING_MS,
    );
    const outboxRows = (await this.prisma.productEventOutbox.findMany({
      where: {
        ...(options.eventIds
          ? {
              eventId: {
                in: options.eventIds,
              },
            }
          : {}),
        createdAt: { gte: retentionCutoff },
        OR: [
          { status: 'PENDING' },
          {
            status: 'FAILED',
            nextAttemptAt: { lte: now },
          },
          {
            status: 'PROCESSING',
            lastAttemptAt: { lt: staleProcessingThreshold },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take:
        options.eventIds?.length ??
        options.limit ??
        PRODUCT_EVENT_OUTBOX_FLUSH_BATCH_SIZE,
    })) as ProductEventOutboxRecord[];

    await Promise.all(
      outboxRows.map((outboxRow) => this.processProductEventOutbox(outboxRow)),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'product-event-retention',
    waitForCompletion: true,
  })
  async handleRawEventRetention() {
    try {
      await this.purgeExpiredRawEvents();
    } catch (error) {
      this.logger.error(
        'Failed to purge expired product analytics events.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async purgeExpiredRawEvents(now = new Date()) {
    const cutoff = new Date(
      now.getTime() - RAW_EVENT_RETENTION_DAYS * MS_PER_DAY,
    );
    const result = await this.prisma.productEvent.deleteMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
    });
    await this.prisma.productEventOutbox.deleteMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
    });
    return result;
  }

  @Cron('0 4 * * *', {
    name: 'product-event-outcome-reconciliation',
    waitForCompletion: true,
  })
  async handleOutcomeReconciliation() {
    try {
      await this.reconcileRecentOutcomeOutbox();
    } catch (error) {
      this.logger.error(
        'Failed to reconcile product analytics outcomes.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async reconcileRecentOutcomeOutbox(now = new Date()) {
    const cutoff = new Date(
      now.getTime() - RAW_EVENT_RETENTION_DAYS * MS_PER_DAY,
    );
    let enqueuedCount = 0;

    enqueuedCount += await this.reconcileCouponRedeemedOutcomes(cutoff);
    enqueuedCount += await this.reconcileMatchContactRequestedOutcomes(cutoff);
    enqueuedCount += await this.reconcileMeetupOutcomes(cutoff);

    return { enqueuedCount };
  }

  purgeEventsForUsers(userIds: string[]) {
    if (userIds.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.productEvent.deleteMany({
      where: { userId: { in: userIds } },
    });
  }

  purgeOutboxForUsers(userIds: string[]) {
    if (userIds.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.productEventOutbox.deleteMany({
      where: { userId: { in: userIds } },
    });
  }

  private async recordEvent(
    store: ProductEventStore,
    input: RecordProductEventInput,
  ) {
    const userId = cleanOptionalString(input.userId);
    if (userId) {
      const user = await store.user.findUnique({
        where: { id: userId },
        select: { isTest: true },
      });
      if (!user || user.isTest) {
        return { ok: true, recorded: false, skipped: 'test-user' as const };
      }
    }

    const data = this.buildProductEventData({ ...input, userId });

    try {
      await store.productEvent.create({
        data,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await store.productEvent.findUnique({
          where: { eventId: data.eventId },
          select: {
            eventId: true,
            name: true,
            kind: true,
            source: true,
            eventVersion: true,
            userId: true,
            sessionId: true,
            intentId: true,
            correlationId: true,
            route: true,
            surface: true,
            entityType: true,
            entityId: true,
            metadata: true,
          },
        });
        if (existing && isSameProductEvent(existing, data)) {
          return { ok: true, recorded: false, skipped: 'duplicate' as const };
        }
      }
      throw error;
    }

    return { ok: true, recorded: true };
  }

  private async enqueueOutcome(
    store: ProductOutcomeOutboxStore,
    input: ProductOutcomeInput,
  ) {
    const definition = getProductEventDefinition(input.name);
    if (!definition || definition.kind !== 'outcome') {
      throw new BadRequestException('Product outcome event name is invalid.');
    }

    const data = this.buildProductEventData({
      ...input,
      kind: 'outcome',
      source: 'api',
    });

    if (await this.shouldSkipOutcomeForUser(store, data.userId)) {
      return data.eventId;
    }

    await this.enqueueBuiltOutcome(store, data);

    return data.eventId;
  }

  private enqueueBuiltOutcome(
    store: ProductEventOutboxStore,
    data: Prisma.ProductEventUncheckedCreateInput,
  ) {
    // Keep the backstop window open so the cron sweeps the new row even when the
    // process is otherwise idle.
    this.extendOutboxWindow(Date.now() + PRODUCT_EVENT_OUTBOX_FLUSH_GRACE_MS);

    return store.productEventOutbox.createMany({
      data: [this.productEventOutboxCreateData(data)],
      skipDuplicates: true,
    });
  }

  private async shouldSkipOutcomeForUser(
    store: Pick<ProductOutcomeOutboxStore, 'user'>,
    userId: string | null | undefined,
  ) {
    const cleanedUserId = cleanOptionalString(userId);
    if (!cleanedUserId) return false;

    const user = await store.user.findUnique({
      where: { id: cleanedUserId },
      select: { isTest: true },
    });

    return !user || user.isTest;
  }

  private resetRecoverableOutboxRow(
    store: ProductOutcomeRecoveryStore,
    data: Prisma.ProductEventUncheckedCreateInput,
  ) {
    // Reviving a recoverable row to PENDING re-queues it for the flush cron, so
    // keep the backstop window open just like a fresh enqueue. The daily
    // reconcile runs while compute may have scaled to zero and the gated flush
    // cron skips closed-window ticks; without this the revived row would strand
    // until the next live enqueue or a restart.
    this.extendOutboxWindow(Date.now() + PRODUCT_EVENT_OUTBOX_FLUSH_GRACE_MS);

    return store.productEventOutbox.updateMany({
      where: this.recoverableOutboxWhere(data.eventId),
      data: {
        ...this.productEventOutboxCreateData(data),
        status: 'PENDING',
        attempts: 0,
        lastAttemptAt: null,
        nextAttemptAt: null,
        recordedAt: null,
        errorMessage: null,
      },
    });
  }

  private recoverableOutboxWhere(
    eventId: string,
  ): Prisma.ProductEventOutboxWhereInput {
    return {
      eventId,
      OR: [
        { status: { in: ['PENDING', 'FAILED', 'EXHAUSTED'] } },
        {
          status: 'PROCESSING',
          lastAttemptAt: {
            lt: new Date(Date.now() - PRODUCT_EVENT_OUTBOX_STALE_PROCESSING_MS),
          },
        },
      ],
    };
  }

  private productEventOutboxCreateData(
    data: Prisma.ProductEventUncheckedCreateInput,
  ): Prisma.ProductEventOutboxUncheckedCreateInput {
    return {
      eventId: data.eventId,
      name: data.name,
      eventVersion: data.eventVersion,
      userId: data.userId,
      entityType: data.entityType,
      entityId: data.entityId,
      metadata: data.metadata ?? Prisma.DbNull,
      occurredAt: data.occurredAt,
    };
  }

  private buildProductEventData(input: RecordProductEventInput) {
    const metadata = sanitizeProductEventMetadata(input.name, input.metadata);
    const occurredAt = normalizeOccurredAt(input.occurredAt);
    const eventId =
      input.source === 'web'
        ? sanitizeBrowserProductEventId(input.eventId)
        : sanitizeProductOutcomeEventId(input.eventId, input.name);
    if (!eventId) {
      throw new BadRequestException('Product event id is invalid.');
    }
    const entityType = sanitizeProductEventEntityType(
      input.name,
      input.entityType,
    );
    const data: Prisma.ProductEventUncheckedCreateInput = {
      eventId,
      name: input.name,
      kind: toDbKind(input.kind),
      source: toDbSource(input.source),
      eventVersion: input.eventVersion ?? 1,
      userId: cleanOptionalString(input.userId),
      sessionId: sanitizeProductEventSessionId(input.sessionId),
      intentId: sanitizeProductEventCorrelationId(input.intentId),
      correlationId: sanitizeProductEventCorrelationId(input.correlationId),
      route: sanitizeProductEventRoute(input.route),
      surface: sanitizeProductEventSurface(input.name, input.surface),
      entityType,
      entityId: entityType
        ? sanitizeProductEventEntityId(input.entityId)
        : null,
      occurredAt,
    };
    if (metadata) {
      data.metadata = metadata;
    }
    return data;
  }

  private async processProductEventOutbox(row: ProductEventOutboxRecord) {
    const claimedAt = new Date();
    const claimWhere = this.productEventOutboxClaimWhere(row, claimedAt);
    if (!claimWhere) return;

    const claimResult = await this.prisma.productEventOutbox.updateMany({
      where: claimWhere,
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lastAttemptAt: claimedAt,
        errorMessage: null,
      },
    });
    if (claimResult.count === 0) return;

    try {
      if (!isProductEventName(row.name)) {
        throw new BadRequestException('Product outcome event name is invalid.');
      }
      const recordResult = await this.recordServerOutcome(this.prisma, {
        eventId: row.eventId,
        name: row.name,
        userId: row.userId,
        eventVersion: row.eventVersion,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadata,
        occurredAt: row.occurredAt,
      });
      if (recordResult.skipped === 'test-user') {
        await this.prisma.productEventOutbox.delete({
          where: { id: row.id },
        });
        return;
      }

      await this.prisma.productEventOutbox.update({
        where: { id: row.id },
        data: {
          status: 'RECORDED',
          recordedAt: new Date(),
          nextAttemptAt: null,
          errorMessage: null,
        },
      });
    } catch (error) {
      const nextAttemptNumber = row.attempts + 1;
      const exhausted = nextAttemptNumber >= row.maxAttempts;
      const nextAttemptAt = exhausted
        ? null
        : new Date(Date.now() + nextAttemptNumber * 60 * 1000);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown product analytics outbox error.';

      await this.prisma.productEventOutbox.update({
        where: { id: row.id },
        data: {
          status: exhausted ? 'EXHAUSTED' : 'FAILED',
          nextAttemptAt,
          errorMessage,
        },
      });

      // Keep the backstop window open through the scheduled retry.
      if (nextAttemptAt) {
        this.extendOutboxWindow(
          nextAttemptAt.getTime() + PRODUCT_EVENT_OUTBOX_FLUSH_GRACE_MS,
        );
      }

      this.logger.warn(
        `Product analytics outcome failed for ${row.eventId}: ${errorMessage}`,
      );
    }
  }

  private productEventOutboxClaimWhere(
    row: ProductEventOutboxRecord,
    now: Date,
  ) {
    const retentionCutoff = new Date(
      now.getTime() - RAW_EVENT_RETENTION_DAYS * MS_PER_DAY,
    );
    if (row.status === 'PENDING') {
      return {
        id: row.id,
        status: 'PENDING' as const,
        createdAt: { gte: retentionCutoff },
      };
    }
    if (row.status === 'FAILED') {
      return {
        id: row.id,
        status: 'FAILED' as const,
        createdAt: { gte: retentionCutoff },
        nextAttemptAt: { lte: now },
      };
    }
    if (row.status === 'PROCESSING') {
      return {
        id: row.id,
        status: 'PROCESSING' as const,
        createdAt: { gte: retentionCutoff },
        lastAttemptAt: {
          lt: new Date(
            now.getTime() - PRODUCT_EVENT_OUTBOX_STALE_PROCESSING_MS,
          ),
        },
      };
    }
    return null;
  }

  private async reconcileCouponRedeemedOutcomes(cutoff: Date) {
    const rows = await this.prisma.redemption.findMany({
      where: {
        redeemedAt: { gte: cutoff },
        coupon: { user: { isTest: false } },
      },
      select: {
        couponId: true,
        merchantId: true,
        userId: true,
        redeemedAt: true,
        coupon: { select: { templateId: true } },
      },
    });

    let enqueuedCount = 0;
    for (const row of rows) {
      enqueuedCount += await this.reconcileCouponRedeemedOutcome({
        couponId: row.couponId,
        couponTemplateId: row.coupon.templateId,
        merchantId: row.merchantId,
        userId: row.userId,
        occurredAt: row.redeemedAt,
      });
    }
    return enqueuedCount;
  }

  private async reconcileMatchContactRequestedOutcomes(cutoff: Date) {
    const rows = await this.prisma.matchParticipant.findMany({
      where: {
        contactRequestedAt: { gte: cutoff },
        user: { isTest: false },
      },
      select: {
        matchId: true,
        userId: true,
        contactRequestedAt: true,
      },
    });

    let enqueuedCount = 0;
    for (const row of rows) {
      if (!row.contactRequestedAt) continue;
      enqueuedCount += await this.reconcileMatchContactRequestedOutcome({
        matchId: row.matchId,
        userId: row.userId,
        occurredAt: row.contactRequestedAt,
      });
    }
    return enqueuedCount;
  }

  private async reconcileMeetupOutcomes(cutoff: Date) {
    let enqueuedCount = 0;

    const sessions = await this.prisma.meetupSession.findMany({
      where: {
        createdAt: { gte: cutoff },
        startedByUser: { isTest: false },
      },
      select: {
        id: true,
        matchId: true,
        startedByUserId: true,
        createdAt: true,
        proposals: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    for (const session of sessions) {
      const proposalId = session.proposals[0]?.id;
      if (!proposalId) continue;
      enqueuedCount += await this.reconcileMeetupSessionCreatedOutcome({
        sessionId: session.id,
        matchId: session.matchId,
        proposalId,
        userId: session.startedByUserId,
        occurredAt: session.createdAt,
      });
    }

    const proposals = await this.prisma.meetupProposal.findMany({
      where: {
        createdAt: { gte: cutoff },
        actorUser: { isTest: false },
      },
      select: {
        id: true,
        sessionId: true,
        actorUserId: true,
        scope: true,
        createdAt: true,
        session: { select: { matchId: true } },
        options: { select: { kind: true } },
      },
    });
    for (const proposal of proposals) {
      const optionSummary = meetupProposalOptionSummary(proposal.options);
      enqueuedCount += await this.reconcileMeetupProposalCreatedOutcome({
        proposalId: proposal.id,
        sessionId: proposal.sessionId,
        matchId: proposal.session.matchId,
        userId: proposal.actorUserId,
        ...optionSummary,
        proposalScope: proposal.scope,
        occurredAt: proposal.createdAt,
      });
    }

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: cutoff },
        action: { in: ['meetup.options_accepted', 'meetup.final_confirmed'] },
        actorId: { not: null },
        actor: { is: { isTest: false } },
      },
      select: {
        action: true,
        actorId: true,
        metadata: true,
        createdAt: true,
      },
    });
    for (const auditLog of auditLogs) {
      if (!auditLog.actorId || !isPlainRecord(auditLog.metadata)) continue;
      const sessionId = readStringField(auditLog.metadata, 'sessionId');
      const messageId = readStringField(auditLog.metadata, 'messageId');
      if (!sessionId || !messageId) continue;

      if (auditLog.action === 'meetup.final_confirmed') {
        enqueuedCount += await this.reconcileMeetupFinalConfirmedOutcome({
          messageId,
          sessionId,
          userId: auditLog.actorId,
          occurredAt: auditLog.createdAt,
        });
        continue;
      }

      const proposalId = readStringField(auditLog.metadata, 'proposalId');
      if (!proposalId) continue;
      enqueuedCount += await this.reconcileMeetupOptionAcceptedOutcome({
        messageId,
        sessionId,
        proposalId,
        userId: auditLog.actorId,
        selectedTime: Boolean(
          readStringField(auditLog.metadata, 'timeOptionId'),
        ),
        selectedLocation: Boolean(
          readStringField(auditLog.metadata, 'locationOptionId'),
        ),
        occurredAt: auditLog.createdAt,
      });
    }

    return enqueuedCount;
  }

  private reconcileCouponRedeemedOutcome(input: CouponRedeemedOutcome) {
    return this.reconcileOutcome(this.buildCouponRedeemedOutcome(input));
  }

  private reconcileMatchContactRequestedOutcome(
    input: MatchContactRequestedOutcome,
  ) {
    return this.reconcileOutcome(this.buildMatchContactRequestedOutcome(input));
  }

  private reconcileMeetupSessionCreatedOutcome(
    input: MeetupSessionCreatedOutcome,
  ) {
    return this.reconcileOutcome(this.buildMeetupSessionCreatedOutcome(input));
  }

  private reconcileMeetupProposalCreatedOutcome(
    input: MeetupProposalCreatedOutcome,
  ) {
    return this.reconcileOutcome(this.buildMeetupProposalCreatedOutcome(input));
  }

  private reconcileMeetupOptionAcceptedOutcome(
    input: MeetupOptionAcceptedOutcome,
  ) {
    return this.reconcileOutcome(this.buildMeetupOptionAcceptedOutcome(input));
  }

  private reconcileMeetupFinalConfirmedOutcome(
    input: MeetupFinalConfirmedOutcome,
  ) {
    return this.reconcileOutcome(this.buildMeetupFinalConfirmedOutcome(input));
  }

  private async reconcileOutcome(input: ProductOutcomeInput) {
    const definition = getProductEventDefinition(input.name);
    if (!definition || definition.kind !== 'outcome') {
      throw new BadRequestException('Product outcome event name is invalid.');
    }

    const data = this.buildProductEventData({
      ...input,
      kind: 'outcome',
      source: 'api',
    });

    if (await this.shouldSkipOutcomeForUser(this.prisma, data.userId)) {
      return 0;
    }

    const resetResult = await this.resetRecoverableOutboxRow(this.prisma, data);
    if (resetResult.count > 0) return resetResult.count;

    const createResult = await this.enqueueBuiltOutcome(this.prisma, data);
    return createResult.count;
  }
}

const productOutcomeEventId = {
  couponRedeemed: (couponId: string) => `coupon_redeemed:${couponId}`,
  matchContactRequested: (matchId: string) =>
    `match_contact_requested:${matchId}`,
  meetupSessionCreated: (sessionId: string) =>
    `meetup_session_created:${sessionId}`,
  meetupProposalCreated: (proposalId: string) =>
    `meetup_proposal_created:${proposalId}`,
  meetupOptionAccepted: (messageId: string) =>
    `meetup_option_accepted:${messageId}`,
  meetupFinalConfirmed: (messageId: string) =>
    `meetup_final_confirmed:${messageId}`,
} as const;

function acceptedOptionKind(input: {
  selectedTime: boolean;
  selectedLocation: boolean;
}) {
  if (input.selectedTime && input.selectedLocation) return 'BOTH';
  if (input.selectedTime) return 'TIME';
  if (input.selectedLocation) return 'LOCATION';
  return null;
}

function meetupProposalOptionSummary(options: Array<{ kind: string }>) {
  const timeOptionCount = options.filter(
    (option) => option.kind === 'TIME',
  ).length;
  const locationOptionCount = options.filter(
    (option) => option.kind === 'LOCATION',
  ).length;
  return {
    hasTimeOption: timeOptionCount > 0,
    hasLocationOption: locationOptionCount > 0,
    timeOptionCount,
    locationOptionCount,
  };
}

function cleanOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOccurredAt(value: Date | string | null | undefined) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const maxFuture = Date.now() + MAX_CLIENT_CLOCK_SKEW_MS;
  return date.getTime() > maxFuture ? new Date() : date;
}

function toDbKind(kind: ProductEventKind): ProductEventKindDb {
  return kind.toUpperCase() as ProductEventKindDb;
}

function toDbSource(source: ProductEventSource): ProductEventSourceDb {
  return source.toUpperCase() as ProductEventSourceDb;
}

function isSameProductEvent(
  existing: Record<string, unknown>,
  next: ComparableProductEvent,
) {
  const scalarKeys = [
    'eventId',
    'name',
    'kind',
    'source',
    'eventVersion',
    'userId',
    'sessionId',
    'intentId',
    'correlationId',
    'route',
    'surface',
    'entityType',
    'entityId',
  ] as const;

  for (const key of scalarKeys) {
    if ((existing[key] ?? null) !== (next[key] ?? null)) {
      return false;
    }
  }

  return (
    stableJson(existing.metadata ?? null) === stableJson(next.metadata ?? null)
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

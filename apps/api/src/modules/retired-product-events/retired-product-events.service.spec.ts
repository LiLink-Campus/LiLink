import { RetiredProductEventsService } from './retired-product-events.service';

describe('RetiredProductEventsService', () => {
  it('keeps the 60-day retention boundary for both historical tables', async () => {
    const prisma = {
      productEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      productEventOutbox: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    await new RetiredProductEventsService(prisma as never).purgeExpiredEvents(
      new Date('2026-09-16T00:00:00Z'),
    );
    const expected = {
      where: { createdAt: { lt: new Date('2026-07-18T00:00:00Z') } },
    };
    expect(prisma.productEvent.deleteMany).toHaveBeenCalledWith(expected);
    expect(prisma.productEventOutbox.deleteMany).toHaveBeenCalledWith(expected);
  });
});

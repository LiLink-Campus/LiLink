import { BadRequestException } from '@nestjs/common';
import { CyclesService } from './cycles.service';

describe('CyclesService', () => {
  it('rejects running a cycle before reveal time by default', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          revealAt: new Date(Date.now() + 60_000),
          participations: [],
        }),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
    };
    const service = new CyclesService(prisma as never);

    await expect(service.runRevealCycle()).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows an explicit internal force run before reveal time', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          revealAt: new Date(Date.now() + 60_000),
          participations: [],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'cycle-1', status: 'OPEN' }),
      },
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
    };
    const service = new CyclesService(prisma as never);

    await expect(service.runRevealCycle({ force: true })).resolves.toEqual({
      ok: true,
      message: 'Not enough complete participants to generate matches.',
    });
  });
});

import { BadRequestException } from '@nestjs/common';
import { AccountParticipationService } from './account-participation.service';
import {
  buildQuestionnaireServiceWithSchema,
  buildSubmittedQuestionnaireResponse,
} from '../../../test/fixtures/account/account-questionnaire.fixtures';
describe('AccountParticipationService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('persists the chosen intent and writes it into the audit log on opt-in', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'participation-1',
      status: 'OPTED_IN',
      intent: 'DATE',
    });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', schoolId: 'school-bupt' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        findUnique: jest
          .fn()
          .mockResolvedValue(buildSubmittedQuestionnaireResponse()),
      },
      cycleParticipation: {
        upsert,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      buildQuestionnaireServiceWithSchema({
        questions: [],
        schools: [{ id: 'school-bupt' }],
      }),
    );

    await service.setParticipation('user-1', { optIn: true, intent: 'DATE' });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'OPTED_IN',
          intent: 'DATE',
        }) as object,
        update: expect.objectContaining({
          status: 'OPTED_IN',
          intent: 'DATE',
        }) as object,
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: 'participation.updated',
        metadata: {
          cycleId: 'cycle-1',
          status: 'OPTED_IN',
          intent: 'DATE',
        },
      },
    });
  });
  it('still rejects opt-in switching intent when the saved questionnaire was reset to a draft after the first opt-in', async () => {
    // Defense-in-depth: a user who was already OPTED_IN with a complete
    // questionnaire is allowed to flip intent (DATE -> BOTH etc), but only
    // if the questionnaire is still complete. If admin tooling, a data
    // migration, or a manual reset wipes submittedAt, the next intent
    // change must surface the contract failure instead of silently keeping
    // them in OPTED_IN with unmatchable data.
    const upsert = jest.fn();
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', schoolId: 'school-bupt' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        findUnique: jest.fn().mockResolvedValue({
          ...buildSubmittedQuestionnaireResponse(),
          submittedAt: null,
        }),
      },
      cycleParticipation: { upsert },
    };
    const service = new AccountParticipationService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });
  it('lets a user opt out without requiring a complete questionnaire', async () => {
    // Symmetric to the gate above: if a user somehow ended up OPTED_IN
    // before the questionnaire gate was added, opt-out must still work
    // without any questionnaire lookup so they can leave the cycle.
    const upsert = jest.fn().mockResolvedValue({
      id: 'participation-1',
      status: 'OPTED_OUT',
      intent: null,
    });
    const findUniqueQuestionnaire = jest.fn();
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      questionnaireResponse: { findUnique: findUniqueQuestionnaire },
      cycleParticipation: { upsert },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const service = new AccountParticipationService(
      prisma as never,
      {} as never,
    );

    await service.setParticipation('user-1', { optIn: false });

    expect(findUniqueQuestionnaire).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'OPTED_OUT' }) as object,
      }),
    );
  });
  it('clears intent on opt-out so rejoining requires an explicit fresh choice', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'participation-1',
      status: 'OPTED_OUT',
      intent: null,
    });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      cycleParticipation: {
        upsert,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      {} as never,
    );

    await service.setParticipation('user-1', { optIn: false });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'OPTED_OUT',
          intent: null,
          optedInAt: null,
        }) as object,
        update: expect.objectContaining({
          status: 'OPTED_OUT',
          intent: null,
          optedInAt: null,
        }) as object,
      }),
    );
  });
  it('rejects participation changes once the current cycle is preparing', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'PREPARING',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects participation changes once the current cycle is reveal-ready', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'REVEAL_READY',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

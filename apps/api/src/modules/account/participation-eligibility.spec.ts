import { HARD_MATCH_KEYS } from '@lilink/shared';
import { BadRequestException } from '@nestjs/common';
import { AccountParticipationService } from './account-participation.service';
import {
  buildQuestionnaireServiceWithSchema,
  buildSubmittedHardMatchDraftForm,
  buildSubmittedQuestionnaireResponse,
} from '../../../test/fixtures/account/account-questionnaire.fixtures';
describe('AccountParticipationService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('rejects participation changes after the deadline', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() - 60_000),
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
  it('rejects opt-in without an explicit weekly intent', async () => {
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
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
  it('rejects opt-in when the weekly intent is not one of the allowed values', async () => {
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
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.setParticipation('user-1', {
        optIn: true,
        intent: 'INVALID' as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
  it('rejects opt-in when the account is not ACTIVE', async () => {
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
          .mockResolvedValue({ status: 'SUSPENDED', schoolId: 'school-bupt' }),
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { status: true, schoolId: true },
    });
  });
  it('rejects opt-in when the questionnaire has not been submitted yet', async () => {
    const upsert = jest.fn();
    const findUniqueResponse = jest.fn().mockResolvedValue(null);
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
        findUnique: findUniqueResponse,
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUniqueResponse).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        versionId: true,
        answers: true,
        draftAnswers: true,
        submittedAt: true,
        user: {
          select: {
            vipActivations: { select: { expiresAt: true, revokedAt: true } },
          },
        },
      },
    });
    expect(upsert).not.toHaveBeenCalled();
  });
  it('rejects opt-in when the saved questionnaire only has a draft (submittedAt is null)', async () => {
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
      cycleParticipation: {
        upsert,
      },
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
  it('rejects opt-in when the submitted answers no longer parse as valid hard-match data', async () => {
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
          // Legacy / corrupted record: submittedAt is set but the hard-match
          // payload is missing required keys.
          versionId: 'q-test',
          answers: { [HARD_MATCH_KEYS.gender]: '男' },
          submittedAt: new Date('2026-04-01T00:00:00.000Z'),
        }),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      buildQuestionnaireServiceWithSchema({
        questions: [],
        schools: [{ id: 'school-bupt' }],
      }),
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });
  it('rejects opt-in when an unsaved draft has emptied a required soft question', async () => {
    const upsert = jest.fn();
    const questionnaireService = buildQuestionnaireServiceWithSchema({
      questions: [
        {
          key: 'value-1',
          prompt: 'How important is honesty?',
          type: 'SINGLE_SELECT',
          required: true,
          options: [{ value: 'low' }, { value: 'high' }],
        },
      ],
      schools: [{ id: 'school-bupt' }],
    });
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
        findUnique: jest.fn().mockResolvedValue(
          buildSubmittedQuestionnaireResponse({
            answers: { ['value-1']: 'high' },
            // Draft cleared the required soft question after the original
            // submission. The user-facing progress bar drops below 100% but
            // submittedAt remains non-null.
            draftAnswers: {
              softAnswers: {},
              hardMatchForm: buildSubmittedHardMatchDraftForm(),
              displayName: 'User',
            },
          }),
        ),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      questionnaireService,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toMatchObject({
      message:
        'Your questionnaire has unsaved incomplete changes. Please finish or discard the draft before opting in.',
    });
    expect(upsert).not.toHaveBeenCalled();
  });
  it('rejects opt-in when an unsaved draft clears a required hard-match field', async () => {
    const upsert = jest.fn();
    const questionnaireService = buildQuestionnaireServiceWithSchema({
      questions: [
        {
          key: 'value-1',
          prompt: 'How important is honesty?',
          type: 'SINGLE_SELECT',
          required: true,
          options: [{ value: 'low' }, { value: 'high' }],
        },
      ],
      schools: [{ id: 'school-bupt' }],
    });
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
        findUnique: jest.fn().mockResolvedValue(
          buildSubmittedQuestionnaireResponse({
            answers: { ['value-1']: 'high' },
            draftAnswers: {
              softAnswers: { ['value-1']: 'high' },
              hardMatchForm: buildSubmittedHardMatchDraftForm({
                gender: '',
              }),
              displayName: 'User',
            },
          }),
        ),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountParticipationService(
      prisma as never,
      questionnaireService,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toMatchObject({
      message:
        'Your questionnaire has unsaved incomplete changes. Please finish or discard the draft before opting in.',
    });
    expect(upsert).not.toHaveBeenCalled();
  });
  it('requires an actual submission even when a stored draft looks complete', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'participation-1',
      status: 'OPTED_IN',
      intent: 'BOTH',
    });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const questionnaireService = buildQuestionnaireServiceWithSchema({
      questions: [
        {
          key: 'value-1',
          prompt: 'How important is honesty?',
          type: 'SINGLE_SELECT',
          required: true,
          options: [{ value: 'low' }, { value: 'high' }],
        },
      ],
      schools: [{ id: 'school-bupt' }],
    });
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
        findUnique: jest.fn().mockResolvedValue(
          buildSubmittedQuestionnaireResponse({
            answers: { ['value-1']: 'high' },
            draftAnswers: {
              softAnswers: { ['value-1']: 'low' },
              hardMatchForm: buildSubmittedHardMatchDraftForm(),
              displayName: 'User',
            },
          }),
        ),
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
      questionnaireService,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });
});

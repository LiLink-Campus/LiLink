import { HARD_MATCH_KEYS } from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { AccountQuestionnaireService } from './account-questionnaire.service';
import { createDashboardSnapshotServiceMock } from '../../../test/fixtures/account/account-snapshot.fixtures';
describe('AccountQuestionnaireService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('submits a complete questionnaire and clears any draft payload', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'response-1' });
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const transaction = jest
      .fn()
      .mockImplementation((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      );
    const validateAnswers = jest.fn().mockReturnValue({
      [HARD_MATCH_KEYS.school]: 'school-bupt',
      current_question: 'kept',
    });
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'kept',
    });
    const service = new AccountQuestionnaireService(
      {
        $transaction: transaction,
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            displayName: null,
            school: {
              id: 'school-bupt',
              name: '北京邮电大学玛丽女王海南学院',
            },
          }),
          update: userUpdate,
        },
        questionnaireResponse: {
          upsert,
        },
      } as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-1',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              type: 'SINGLE_SELECT',
              required: true,
              options: null,
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
            { id: 'school-cuc', name: '中国传媒大学海南国际学院' },
          ],
        }),
        validateAnswers,
        sanitizeStoredAnswers,
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        versionId: 'version-1',
        displayName: '测试昵称',
        answers: {
          current_question: 'kept',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '5',
          birthDay: '10',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '女',
          partnerGenders: ['男'],
          looks: '5',
          partnerLooks: ['5', '6', '7', '8', '9', '10'],
          heightCm: '165',
          weightKg: '65',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).resolves.toMatchObject({
      saveState: 'SUBMITTED',
      hasDraft: false,
    });

    expect(validateAnswers).toHaveBeenCalledWith(
      [
        {
          key: 'current_question',
          prompt: 'Current question',
          type: 'SINGLE_SELECT',
          required: true,
          options: null,
        },
      ],
      expect.objectContaining({
        current_question: 'kept',
        [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
        [HARD_MATCH_KEYS.school]: 'school-bupt',
        [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-cuc'],
      }),
      ['school-bupt', 'school-cuc'],
    );
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: '测试昵称' },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({
          answers: {
            [HARD_MATCH_KEYS.school]: 'school-bupt',
            current_question: 'kept',
          },
          draftAnswers: Prisma.DbNull,
          submittedAt: expect.any(Date) as Date,
        }) as object,
        update: expect.objectContaining({
          answers: {
            [HARD_MATCH_KEYS.school]: 'school-bupt',
            current_question: 'kept',
          },
          draftAnswers: Prisma.DbNull,
          submittedAt: expect.any(Date) as Date,
        }) as object,
      }),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(sanitizeStoredAnswers).toHaveBeenCalledWith(
      [
        {
          key: 'current_question',
          prompt: 'Current question',
          type: 'SINGLE_SELECT',
          required: true,
          options: null,
        },
      ],
      {
        current_question: 'kept',
      },
    );
  });
  it('skips rewriting the user row when the nickname is unchanged', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'response-1' });
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const transaction: jest.MockedFunction<
      (operations: Promise<unknown>[]) => Promise<unknown[]>
    > = jest
      .fn()
      .mockImplementation((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      );
    const validateAnswers = jest.fn().mockReturnValue({
      [HARD_MATCH_KEYS.school]: 'school-bupt',
      current_question: 'kept',
    });
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'kept',
    });
    const service = new AccountQuestionnaireService(
      {
        $transaction: transaction,
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            displayName: '测试昵称',
            school: {
              id: 'school-bupt',
              name: '北京邮电大学玛丽女王海南学院',
            },
          }),
          update: userUpdate,
        },
        questionnaireResponse: {
          upsert,
        },
      } as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-1',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              type: 'SINGLE_SELECT',
              required: true,
              options: null,
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
            { id: 'school-cuc', name: '中国传媒大学海南国际学院' },
          ],
        }),
        validateAnswers,
        sanitizeStoredAnswers,
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        versionId: 'version-1',
        displayName: '测试昵称',
        answers: {
          current_question: 'kept',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '5',
          birthDay: '10',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '女',
          partnerGenders: ['男'],
          looks: '5',
          partnerLooks: ['5', '6', '7', '8', '9', '10'],
          heightCm: '165',
          weightKg: '65',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).resolves.toMatchObject({
      saveState: 'SUBMITTED',
      hasDraft: false,
    });

    expect(userUpdate).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
    const submittedOperations = transaction.mock.calls[0]?.[0];
    expect(submittedOperations).toBeDefined();
    // upsert + the hard-match signature JSONB merge (no user row rewrite).
    expect(submittedOperations).toHaveLength(2);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

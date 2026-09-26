import { Prisma } from '../../common/prisma/client';
import { AccountQuestionnaireService } from './account-questionnaire.service';
import { createDashboardSnapshotServiceMock } from '../../../test/fixtures/account/account-snapshot.fixtures';
describe('AccountQuestionnaireService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('stores an incomplete questionnaire as a draft without replacing the submitted answers', async () => {
    const upsert: jest.MockedFunction<
      (
        args: Prisma.QuestionnaireResponseUpsertArgs,
      ) => Promise<{ id: string; submittedAt: Date }>
    > = jest.fn().mockResolvedValue({
      id: 'response-1',
      submittedAt: new Date('2026-04-10T08:00:00.000Z'),
    });
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const validateAnswers = jest.fn();
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'partial-answer',
    });
    const service = new AccountQuestionnaireService(
      {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            displayName: 'Draft User',
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
        displayName: 'Draft User',
        answers: {
          current_question: 'partial-answer',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '',
          birthDay: '',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '女',
          partnerGenders: ['男'],
          looks: '5',
          partnerLooks: ['5', '6', '7', '8', '9', '10'],
          heightCm: '',
          weightKg: '65',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).resolves.toEqual({
      saveState: 'DRAFT',
      questionnaireSubmittedAt: '2026-04-10T08:00:00.000Z',
      hasDraft: true,
    });

    expect(validateAnswers).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
    const draftUpsertArgs = upsert.mock.calls[0]?.[0];
    expect(draftUpsertArgs).toBeDefined();
    expect(draftUpsertArgs?.where).toEqual({ userId: 'user-1' });
    expect(draftUpsertArgs?.create.answers).toEqual({});

    const createdDraftPayload = draftUpsertArgs?.create.draftAnswers as Record<
      string,
      unknown
    >;
    expect(createdDraftPayload.displayName).toBe('Draft User');
    expect(createdDraftPayload.softAnswers).toEqual({
      current_question: 'partial-answer',
    });
    expect(createdDraftPayload.hardMatchForm).toMatchObject({
      birthYear: '2000',
      birthMonth: '',
      birthDay: '',
      heightCm: '',
      weightKg: '65',
      oneLinerIntro: '喜欢散步。',
    });

    const updatedDraftPayload = draftUpsertArgs?.update.draftAnswers as Record<
      string,
      unknown
    >;
    expect(updatedDraftPayload.displayName).toBe('Draft User');
  });
  it('updates the nickname and draft together when saving an incomplete questionnaire', async () => {
    const upsert: jest.MockedFunction<
      (
        args: Prisma.QuestionnaireResponseUpsertArgs,
      ) => Promise<{ id: string; submittedAt: Date }>
    > = jest.fn().mockResolvedValue({
      id: 'response-1',
      submittedAt: new Date('2026-04-10T08:00:00.000Z'),
    });
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const transaction = jest
      .fn()
      .mockImplementation(
        (
          callback: (tx: {
            user: { update: typeof userUpdate };
            questionnaireResponse: { upsert: typeof upsert };
          }) => Promise<unknown>,
        ) =>
          callback({
            user: { update: userUpdate },
            questionnaireResponse: { upsert },
          }),
      );
    const validateAnswers = jest.fn();
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'partial-answer',
    });
    const service = new AccountQuestionnaireService(
      {
        $transaction: transaction,
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            displayName: '旧昵称',
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
        displayName: '新昵称',
        answers: {
          current_question: 'partial-answer',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '',
          birthDay: '',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '女',
          partnerGenders: ['男'],
          looks: '5',
          partnerLooks: ['5', '6', '7', '8', '9', '10'],
          heightCm: '',
          weightKg: '65',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).resolves.toEqual({
      saveState: 'DRAFT',
      questionnaireSubmittedAt: '2026-04-10T08:00:00.000Z',
      hasDraft: true,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(validateAnswers).not.toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: '新昵称' },
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    const draftUpsertArgs = upsert.mock.calls[0]?.[0];
    expect(draftUpsertArgs).toBeDefined();
    expect(draftUpsertArgs?.where).toEqual({ userId: 'user-1' });

    const updatedDraftPayload = draftUpsertArgs?.update.draftAnswers as Record<
      string,
      unknown
    >;
    expect(updatedDraftPayload.displayName).toBe('新昵称');
  });
  it('skips rewriting the user row on draft saves when the nickname is unchanged', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'response-1',
      submittedAt: new Date('2026-04-10T08:00:00.000Z'),
    });
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const validateAnswers = jest.fn();
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'partial-answer',
    });
    const service = new AccountQuestionnaireService(
      {
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
          current_question: 'partial-answer',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '',
          birthDay: '',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '女',
          partnerGenders: ['男'],
          looks: '5',
          partnerLooks: ['5', '6', '7', '8', '9', '10'],
          heightCm: '',
          weightKg: '65',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).resolves.toEqual({
      saveState: 'DRAFT',
      questionnaireSubmittedAt: '2026-04-10T08:00:00.000Z',
      hasDraft: true,
    });

    expect(userUpdate).not.toHaveBeenCalled();
    expect(validateAnswers).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

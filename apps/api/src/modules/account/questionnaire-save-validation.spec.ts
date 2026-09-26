import { BadRequestException } from '@nestjs/common';
import { AccountQuestionnaireService } from './account-questionnaire.service';
import { createDashboardSnapshotServiceMock } from '../../../test/fixtures/account/account-snapshot.fixtures';
describe('AccountQuestionnaireService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('rejects invalid hard-match values instead of silently saving a draft', async () => {
    const upsert = jest.fn();
    const userUpdate = jest.fn();
    const validateAnswers = jest.fn();
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'partial-answer',
    });
    const service = new AccountQuestionnaireService(
      {
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
          current_question: 'partial-answer',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '5',
          birthDay: '10',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '未知性别',
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
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(validateAnswers).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
  it('rejects questionnaire saves when the current user has no recognized school', async () => {
    const validateAnswers = jest.fn();
    const upsert = jest.fn();
    const service = new AccountQuestionnaireService(
      {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            school: null,
          }),
        },
        questionnaireResponse: {
          upsert,
        },
      } as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-1',
          questions: [],
          schools: [],
        }),
        validateAnswers,
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        versionId: 'version-1',
        answers: {},
        hardMatchForm: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(validateAnswers).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});

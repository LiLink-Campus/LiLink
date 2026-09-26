import { HARD_MATCH_KEYS } from '@lilink/shared';
import {
  buildConfirmedHardMatchSignatures,
  buildSubmittedQuestionnaireResponse,
} from '../../../test/fixtures/account/account-questionnaire.fixtures';
import { AccountQuestionnaireService } from './account-questionnaire.service';
import { createDashboardSnapshotServiceMock } from '../../../test/fixtures/account/account-snapshot.fixtures';
describe('AccountQuestionnaireService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('filters stale questionnaire answers down to the current questionnaire keys', async () => {
    const service = new AccountQuestionnaireService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            schoolId: 'school-cuc',
          }),
        },
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue({
            versionId: 'version-current',
            answers: {
              ...buildSubmittedQuestionnaireResponse().answers,
              current_question: 'kept',
              removed_question: 'dropped',
              [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
              [HARD_MATCH_KEYS.school]: 'school-bupt',
              [HARD_MATCH_KEYS.excludedPartnerSchools]: [
                'school-bupt',
                'school-deleted',
              ],
              [HARD_MATCH_KEYS.oneLinerIntro]:
                '测试用一句话介绍，用于回归问卷过滤。',
            },
            acknowledgedQuestionnaireVersionId: null,
            acknowledgedQuestionnaireKeys: null,
            acknowledgedHardMatchSignatures:
              buildConfirmedHardMatchSignatures(),
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            version: {
              questions: [
                {
                  key: 'current_question',
                  prompt: 'Current question',
                  description: null,
                  type: 'SINGLE_SELECT',
                  required: true,
                  selectionLimit: null,
                  options: null,
                },
              ],
            },
          }),
        },
      } as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-current',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              description: null,
              type: 'SINGLE_SELECT',
              required: true,
              selectionLimit: null,
              options: null,
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
            { id: 'school-cuc', name: '中国传媒大学海南国际学院' },
          ],
        }),
        sanitizeStoredAnswers: jest.fn().mockReturnValue({
          current_question: 'kept',
        }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const result = await service.getQuestionnaire('user-1');

    expect(result).toMatchObject({
      versionId: 'version-current',
      currentVersionId: 'version-current',
      answers: {
        current_question: 'kept',
        [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
        [HARD_MATCH_KEYS.school]: 'school-cuc',
        [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-bupt'],
        [HARD_MATCH_KEYS.oneLinerIntro]: '测试用一句话介绍，用于回归问卷过滤。',
      },
      submittedAt: '2026-04-18T12:00:00.000Z',
      draft: null,
      attention: {
        currentVersionId: 'version-current',
        acknowledgedKeys: [],
        pendingUpdatedKeys: [],
        missingRequiredKeys: [],
        pendingKeys: [],
        items: [],
      },
    });
    expect(result!.answers).not.toHaveProperty('removed_question');
  });
  it('marks current-version questionnaire additions as pending account-level attention', async () => {
    const service = new AccountQuestionnaireService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            schoolId: 'school-bupt',
          }),
        },
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue({
            versionId: 'version-current',
            answers: {
              ...buildSubmittedQuestionnaireResponse().answers,
              current_question: 'kept',
              [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
              [HARD_MATCH_KEYS.school]: 'school-bupt',
              [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢徒步。',
            },
            acknowledgedQuestionnaireVersionId: null,
            acknowledgedQuestionnaireKeys: null,
            acknowledgedHardMatchSignatures:
              buildConfirmedHardMatchSignatures(),
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            version: {
              questions: [
                {
                  key: 'current_question',
                  prompt: 'Current question',
                  description: null,
                  type: 'SINGLE_SELECT',
                  required: true,
                  selectionLimit: null,
                  options: [{ value: 'kept', label: 'Kept' }],
                },
              ],
            },
          }),
        },
      } as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-current',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              description: null,
              type: 'SINGLE_SELECT',
              required: true,
              selectionLimit: null,
              options: [{ value: 'kept', label: 'Kept' }],
            },
            {
              key: 'new_question',
              prompt: 'New question',
              description: null,
              type: 'SINGLE_SELECT',
              required: true,
              selectionLimit: null,
              options: [{ value: 'new', label: 'New' }],
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
          ],
        }),
        sanitizeStoredAnswers: jest.fn().mockReturnValue({
          current_question: 'kept',
        }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(service.getQuestionnaire('user-1')).resolves.toMatchObject({
      versionId: 'version-current',
      currentVersionId: 'version-current',
      attention: {
        currentVersionId: 'version-current',
        acknowledgedKeys: [],
        pendingUpdatedKeys: [],
        missingRequiredKeys: ['new_question'],
        pendingKeys: ['new_question'],
        items: [
          {
            key: 'new_question',
            prompt: 'New question',
            updated: false,
            missingRequired: true,
            acknowledged: true,
          },
        ],
      },
    });
  });
});

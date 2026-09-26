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
  it('does not request attention for retired nationality or language fields', async () => {
    const legacyAnswers = { ...buildSubmittedQuestionnaireResponse().answers };
    delete legacyAnswers[HARD_MATCH_KEYS.partnerLanguages];

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
              ...legacyAnswers,
              current_question: 'kept',
            },
            acknowledgedQuestionnaireVersionId: null,
            acknowledgedQuestionnaireKeys: null,
            acknowledgedHardMatchSignatures: buildConfirmedHardMatchSignatures([
              HARD_MATCH_KEYS.partnerLanguages,
            ]),
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
      attention: {
        pendingUpdatedKeys: [],
        missingRequiredKeys: [],
        pendingKeys: [],
        items: [],
      },
    });
  });
  it('flags stale-signature enum fields and unconfirmed empty weights', async () => {
    const service = new AccountQuestionnaireService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            schoolId: 'school-bupt',
            vipActivations: [
              { expiresAt: new Date(Date.now() + 60000), revokedAt: null },
            ],
          }),
        },
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue({
            versionId: 'version-current',
            answers: {
              ...buildSubmittedQuestionnaireResponse().answers,
              [HARD_MATCH_KEYS.weightKg]: null,
              current_question: 'kept',
            },
            acknowledgedQuestionnaireVersionId: 'version-current',
            acknowledgedQuestionnaireKeys: ['current_question'],
            // Confirmed EXCEPT: looks carries a stale signature, and the empty
            // weights were never explicitly confirmed.
            acknowledgedHardMatchSignatures: {
              ...buildConfirmedHardMatchSignatures([
                HARD_MATCH_KEYS.weightKg,
                HARD_MATCH_KEYS.partnerWeightMin,
                HARD_MATCH_KEYS.partnerWeightMax,
              ]),
              [HARD_MATCH_KEYS.looks]: 'v1:stale-signature',
            },
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
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
          ],
        }),
        sanitizeStoredAnswers: jest
          .fn()
          .mockReturnValue({ current_question: 'kept' }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const result = (await service.getQuestionnaire('user-1')) as {
      attention: { pendingUpdatedKeys: string[] };
    };
    const pending = result.attention.pendingUpdatedKeys;

    expect(pending).toEqual(
      expect.arrayContaining([
        HARD_MATCH_KEYS.looks,
        HARD_MATCH_KEYS.weightKg,
        HARD_MATCH_KEYS.partnerWeightMin,
        HARD_MATCH_KEYS.partnerWeightMax,
      ]),
    );
    // Confirmed enum fields and the unchanged soft question stay quiet.
    expect(pending).not.toContain(HARD_MATCH_KEYS.gender);
    expect(pending).not.toContain('current_question');
  });
  it('clears the weight nudge once the empty weight is acknowledged', async () => {
    const service = new AccountQuestionnaireService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({ schoolId: 'school-bupt' }),
        },
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue({
            versionId: 'version-current',
            answers: {
              ...buildSubmittedQuestionnaireResponse().answers,
              current_question: 'kept',
            },
            acknowledgedQuestionnaireVersionId: 'version-current',
            acknowledgedQuestionnaireKeys: ['current_question'],
            // Fully confirmed, including explicit empty-weight acknowledgement.
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
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
          ],
        }),
        sanitizeStoredAnswers: jest
          .fn()
          .mockReturnValue({ current_question: 'kept' }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const result = (await service.getQuestionnaire('user-1')) as {
      attention: { pendingUpdatedKeys: string[] };
    };

    expect(result.attention.pendingUpdatedKeys).not.toContain(
      HARD_MATCH_KEYS.partnerWeightMin,
    );
    expect(result.attention.pendingUpdatedKeys).not.toContain(
      HARD_MATCH_KEYS.looks,
    );
  });
  it('persists questionnaire attention acknowledgement keys per current version', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        acknowledgedQuestionnaireKeys: [
          'existing_question',
          'new_question',
          HARD_MATCH_KEYS.partnerLooks,
        ],
      },
    ]);
    const findUnique = jest.fn();
    const service = new AccountQuestionnaireService(
      {
        $queryRaw: queryRaw,
        questionnaireResponse: {
          findUnique,
        },
      } as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-current',
          questions: [{ key: 'existing_question' }, { key: 'new_question' }],
        }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.acknowledgeQuestionnaireItems('user-1', {
        versionId: 'version-current',
        keys: [
          'new_question',
          HARD_MATCH_KEYS.partnerLooks,
          'new_question',
          ' ',
        ],
      }),
    ).resolves.toEqual({
      currentVersionId: 'version-current',
      acknowledgedKeys: [
        'existing_question',
        'new_question',
        HARD_MATCH_KEYS.partnerLooks,
      ],
    });

    expect(findUnique).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [queryTemplate] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(Array.from(queryTemplate).join('')).toContain(
      'UPDATE "QuestionnaireResponse" AS response',
    );
  });
});

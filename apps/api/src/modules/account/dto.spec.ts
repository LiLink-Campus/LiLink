import { validate } from 'class-validator';
import {
  AcknowledgeQuestionnaireItemsDto,
  ContactMethodDto,
  ReportMatchDto,
  SaveQuestionnaireDto,
  UpdateContactPreferencesDto,
  UpdateProfileDto,
} from './dto';
import { DISPLAY_NAME_MAX_LENGTH } from '../../common/validation/display-name';
import {
  CONTACT_METHOD_VALUE_MAX_LENGTH,
  PROFILE_ARRAY_ITEM_MAX_LENGTH,
  PROFILE_ARRAY_MAX_ITEMS,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_FULL_NAME_MAX_LENGTH,
  QUESTIONNAIRE_ACKNOWLEDGEMENT_KEY_MAX_LENGTH,
  QUESTIONNAIRE_ACKNOWLEDGEMENT_KEYS_MAX_ITEMS,
  REPORT_DETAILS_MAX_LENGTH,
} from '../../common/validation/input-limits';

describe('account DTOs', () => {
  it('rejects display names longer than the shared account limit', async () => {
    const longDisplayName = 'A'.repeat(DISPLAY_NAME_MAX_LENGTH + 1);
    const profileDto = Object.assign(new UpdateProfileDto(), {
      displayName: longDisplayName,
    });
    const questionnaireDto = Object.assign(new SaveQuestionnaireDto(), {
      answers: {},
      hardMatchForm: {},
      displayName: longDisplayName,
    });

    await expect(validate(profileDto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'displayName' }),
      ]),
    );
    await expect(validate(questionnaireDto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'displayName' }),
      ]),
    );
  });

  it('rejects null profile display names when the field is present', async () => {
    const profileDto = Object.assign(new UpdateProfileDto(), {
      displayName: null,
    });

    await expect(validate(profileDto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'displayName' }),
      ]),
    );
  });

  it('rejects oversized profile text and list fields', async () => {
    const profileDto = Object.assign(new UpdateProfileDto(), {
      fullName: 'A'.repeat(PROFILE_FULL_NAME_MAX_LENGTH + 1),
      bio: 'B'.repeat(PROFILE_BIO_MAX_LENGTH + 1),
      languages: Array.from(
        { length: PROFILE_ARRAY_MAX_ITEMS + 1 },
        () => '中文',
      ),
      interests: ['C'.repeat(PROFILE_ARRAY_ITEM_MAX_LENGTH + 1)],
    });

    await expect(validate(profileDto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'fullName' }),
        expect.objectContaining({ property: 'bio' }),
        expect.objectContaining({ property: 'languages' }),
        expect.objectContaining({ property: 'interests' }),
      ]),
    );
  });

  it('rejects oversized contact, report, and acknowledgement inputs', async () => {
    const method = Object.assign(new ContactMethodDto(), {
      type: 'WECHAT',
      value: 'W'.repeat(CONTACT_METHOD_VALUE_MAX_LENGTH + 1),
    });
    const contactDto = Object.assign(new UpdateContactPreferencesDto(), {
      preferredContactChannel: 'WECHAT',
      methods: [method],
    });
    const reportDto = Object.assign(new ReportMatchDto(), {
      reason: '其他',
      details: 'D'.repeat(REPORT_DETAILS_MAX_LENGTH + 1),
    });
    const acknowledgementDto = Object.assign(
      new AcknowledgeQuestionnaireItemsDto(),
      {
        versionId: 'version-current',
        keys: [
          ...Array.from(
            { length: QUESTIONNAIRE_ACKNOWLEDGEMENT_KEYS_MAX_ITEMS + 1 },
            (_, index) => `question-${index}`,
          ),
          'K'.repeat(QUESTIONNAIRE_ACKNOWLEDGEMENT_KEY_MAX_LENGTH + 1),
        ],
      },
    );

    await expect(validate(contactDto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'methods' }),
      ]),
    );
    await expect(validate(reportDto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'details' }),
      ]),
    );
    await expect(validate(acknowledgementDto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'keys' })]),
    );
  });
});

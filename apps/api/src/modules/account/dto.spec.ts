import { validate } from 'class-validator';
import { SaveQuestionnaireDto, UpdateProfileDto } from './dto';
import { DISPLAY_NAME_MAX_LENGTH } from '../../common/validation/display-name';

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
});

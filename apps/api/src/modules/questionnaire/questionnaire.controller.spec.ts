import { QuestionnaireController } from './questionnaire.controller';
import type { QuestionnaireService } from './questionnaire.service';

describe('QuestionnaireController', () => {
  it('returns the current questionnaire version from QuestionnaireService', async () => {
    const current = { version: 3, questions: [] };
    const questionnaireService = {
      getCurrentVersion: jest
        .fn<QuestionnaireService['getCurrentVersion']>()
        .mockResolvedValue(current as never),
    } satisfies Pick<QuestionnaireService, 'getCurrentVersion'>;
    const controller = new QuestionnaireController(
      questionnaireService as never,
    );

    await expect(controller.getCurrent()).resolves.toBe(current);
    expect(questionnaireService.getCurrentVersion).toHaveBeenCalledWith();
  });
});

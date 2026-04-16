import { HARD_MATCH_KEYS } from '@lilink/shared';
import { syncQuestionnaireSchoolAnswers } from './questionnaire-school-sync';

describe('questionnaire-school-sync', () => {
  it('dedupes excluded partner school ids after a merge rewrite', () => {
    expect(
      syncQuestionnaireSchoolAnswers(
        {
          [HARD_MATCH_KEYS.school]: 'school-source',
          [HARD_MATCH_KEYS.excludedPartnerSchools]: [
            'school-source',
            'school-target',
            'school-third',
          ],
        },
        {
          currentSchoolId: 'school-target',
          allowedSchoolIds: ['school-target', 'school-third'],
          rewrittenSchoolIds: {
            'school-source': 'school-target',
          },
        },
      ),
    ).toEqual({
      [HARD_MATCH_KEYS.school]: 'school-target',
      [HARD_MATCH_KEYS.excludedPartnerSchools]: [
        'school-target',
        'school-third',
      ],
    });
  });
});

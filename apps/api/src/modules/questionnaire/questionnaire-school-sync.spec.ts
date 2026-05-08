import { HARD_MATCH_KEYS } from '@lilink/shared';
import {
  syncExcludedPartnerSchoolPreferences,
  syncQuestionnaireSchoolAnswers,
} from './questionnaire-school-sync';

describe('syncExcludedPartnerSchoolPreferences', () => {
  it('rewrites excluded partner school ids before allowed-school filtering', () => {
    expect(
      syncExcludedPartnerSchoolPreferences(
        {
          excludedPartnerSchools: ['legacy-campus', 'keep-campus'],
          excludedPartnerSchoolGenders: [],
        },
        {
          allowedSchoolIds: ['merged-campus', 'keep-campus'],
          rewrittenSchoolIds: { 'legacy-campus': 'merged-campus' },
        },
      ),
    ).toEqual({
      excludedPartnerSchools: ['merged-campus', 'keep-campus'],
      excludedPartnerSchoolGenders: [],
    });
  });

  it('rewrites schoolId values inside gender exclusions when campuses are merged', () => {
    expect(
      syncExcludedPartnerSchoolPreferences(
        {
          excludedPartnerSchools: [],
          excludedPartnerSchoolGenders: [
            { schoolId: 'legacy-campus', genders: ['女'] },
          ],
        },
        {
          allowedSchoolIds: ['merged-campus'],
          rewrittenSchoolIds: { 'legacy-campus': 'merged-campus' },
        },
      ),
    ).toEqual({
      excludedPartnerSchools: [],
      excludedPartnerSchoolGenders: [
        { schoolId: 'merged-campus', genders: ['女'] },
      ],
    });
  });

  it('ignores null and primitive gender exclusion entries without throwing', () => {
    expect(
      syncExcludedPartnerSchoolPreferences(
        {
          excludedPartnerSchools: [],
          excludedPartnerSchoolGenders: [
            null,
            'not-an-object',
            { schoolId: 'campus-a', genders: ['男'] },
          ],
        },
        { allowedSchoolIds: ['campus-a'] },
      ),
    ).toEqual({
      excludedPartnerSchools: [],
      excludedPartnerSchoolGenders: [{ schoolId: 'campus-a', genders: ['男'] }],
    });
  });
});

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

  it('rewrites school-specific gender exclusions during a merge', () => {
    expect(
      syncQuestionnaireSchoolAnswers(
        {
          [HARD_MATCH_KEYS.school]: 'school-source',
          [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [
            {
              schoolId: 'school-source',
              genders: ['男'],
            },
            {
              schoolId: 'school-third',
              genders: ['女'],
            },
            {
              schoolId: 'school-dropped',
              genders: ['非二元'],
            },
          ],
        },
        {
          currentSchoolId: 'school-target',
          allowedSchoolIds: ['school-target', 'school-third'],
          rewrittenSchoolIds: {
            'school-source': 'school-target',
            'school-dropped': null,
          },
        },
      ),
    ).toEqual({
      [HARD_MATCH_KEYS.school]: 'school-target',
      [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [
        {
          schoolId: 'school-target',
          genders: ['男'],
        },
        {
          schoolId: 'school-third',
          genders: ['女'],
        },
      ],
    });
  });
});

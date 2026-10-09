import {
  HARD_MATCH_GENDERS,
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
  parseHardMatchAnswers,
} from '@lilink/shared';
import { BadRequestException } from '@nestjs/common';
import {
  createEmptyHardMatchDraftForm,
  buildHardMatchAnswerRecordFromFormInput,
  normalizeHardMatchAnswers,
  sanitizeHardMatchDraftForm,
} from './hard-match';

describe('hard-match helpers', () => {
  const allowedSchoolIds = [
    'school-bupt',
    'school-cuc',
    'school-uestc',
  ] as const;
  const validAnswers = {
    [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
    [HARD_MATCH_KEYS.partnerAgeMin]: 18,
    [HARD_MATCH_KEYS.partnerAgeMax]: 30,
    [HARD_MATCH_KEYS.gender]: '男',
    [HARD_MATCH_KEYS.partnerGenders]: [...HARD_MATCH_GENDERS],
    [HARD_MATCH_KEYS.nationality]: '中国',
    [HARD_MATCH_KEYS.partnerNationalities]: [],
    [HARD_MATCH_KEYS.languages]: ['中文'],
    [HARD_MATCH_KEYS.partnerLanguages]: [],
    [HARD_MATCH_KEYS.looks]: '5',
    [HARD_MATCH_KEYS.partnerLooks]: [...HARD_MATCH_LOOKS],
    [HARD_MATCH_KEYS.heightCm]: 175,
    [HARD_MATCH_KEYS.partnerHeightMin]: 150,
    [HARD_MATCH_KEYS.partnerHeightMax]: 190,
    [HARD_MATCH_KEYS.weightKg]: 65,
    [HARD_MATCH_KEYS.partnerWeightMin]: null,
    [HARD_MATCH_KEYS.partnerWeightMax]: null,
    [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢读书跑步，期待认真相处。',
    [HARD_MATCH_KEYS.school]: 'school-bupt',
    [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-cuc'],
    [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [],
  } as const;

  it('accepts numeric looks and unrestricted preferences using numeric values only', () => {
    const answers = {
      ...validAnswers,
      [HARD_MATCH_KEYS.looks]: '9',
      [HARD_MATCH_KEYS.partnerLooks]: [...HARD_MATCH_LOOKS],
    };
    expect(
      normalizeHardMatchAnswers(answers, allowedSchoolIds)[
        HARD_MATCH_KEYS.partnerLooks
      ],
    ).toEqual([...HARD_MATCH_LOOKS]);
    expect(
      sanitizeHardMatchDraftForm(
        {
          ...createEmptyHardMatchDraftForm(),
          looks: '9',
          partnerLooks: [...HARD_MATCH_LOOKS],
        },
        allowedSchoolIds,
      ).partnerLooks,
    ).toEqual([...HARD_MATCH_LOOKS]);
  });

  it('rejects obsolete looks and clears them from drafts', () => {
    const legacy = { ...validAnswers, [HARD_MATCH_KEYS.looks]: '普通人' };
    expect(parseHardMatchAnswers(legacy)).toBeNull();
    expect(() => normalizeHardMatchAnswers(legacy, allowedSchoolIds)).toThrow();
    expect(
      sanitizeHardMatchDraftForm(
        { ...createEmptyHardMatchDraftForm(), looks: '普通人' },
        allowedSchoolIds,
      ).looks,
    ).toBe('');
  });

  it('round-trips optional lifestyle filters and rejects invalid choices', () => {
    const extra = {
      [HARD_MATCH_KEYS.partnerSmokingStatus]: ['不吸烟', '偶尔吸烟'],
      [HARD_MATCH_KEYS.partnerDrinkingFrequency]: ['不饮酒'],
      [HARD_MATCH_KEYS.partnerExerciseFrequency]: ['每周 3–4 次'],
    };
    expect(
      normalizeHardMatchAnswers(
        { ...validAnswers, ...extra },
        allowedSchoolIds,
      ),
    ).toMatchObject(extra);
    expect(
      sanitizeHardMatchDraftForm(
        {
          partnerSmokingStatus: ['不吸烟'],
          partnerDrinkingFrequency: ['不饮酒'],
          partnerExerciseFrequency: ['每周 3–4 次'],
        },
        allowedSchoolIds,
      ),
    ).toMatchObject({
      partnerSmokingStatus: ['不吸烟'],
      partnerDrinkingFrequency: ['不饮酒'],
      partnerExerciseFrequency: ['每周 3–4 次'],
    });
    expect(() =>
      normalizeHardMatchAnswers(
        {
          ...validAnswers,
          [HARD_MATCH_KEYS.partnerSmokingStatus]: ['invalid'],
        },
        allowedSchoolIds,
      ),
    ).toThrow(BadRequestException);
    const form = {
      ...createEmptyHardMatchDraftForm(),
      birthYear: '2000',
      birthMonth: '5',
      birthDay: '10',
      gender: '男',
      partnerGenders: ['男'],
      looks: '7',
      heightCm: '175',
      weightKg: '65',
      oneLinerIntro: '喜欢读书',
      partnerSmokingStatus: ['不吸烟'],
      partnerDrinkingFrequency: ['不饮酒'],
      partnerExerciseFrequency: ['每周 3–4 次'],
    };
    const saved = buildHardMatchAnswerRecordFromFormInput(
      form,
      'school-bupt',
      allowedSchoolIds,
    );
    expect(saved[HARD_MATCH_KEYS.partnerSmokingStatus]).toEqual(['不吸烟']);
    expect(saved[HARD_MATCH_KEYS.partnerDrinkingFrequency]).toEqual(['不饮酒']);
    expect(saved[HARD_MATCH_KEYS.partnerExerciseFrequency]).toEqual([
      '每周 3–4 次',
    ]);
    expect(saved[HARD_MATCH_KEYS.partnerLooks]).toEqual([...HARD_MATCH_LOOKS]);
  });

  it('normalizes a complete hard-match answer set', () => {
    expect(normalizeHardMatchAnswers(validAnswers, allowedSchoolIds)).toEqual({
      [HARD_MATCH_KEYS.partnerSmokingStatus]: [],
      [HARD_MATCH_KEYS.partnerDrinkingFrequency]: [],
      [HARD_MATCH_KEYS.partnerExerciseFrequency]: [],
      [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
      [HARD_MATCH_KEYS.partnerAgeMin]: 18,
      [HARD_MATCH_KEYS.partnerAgeMax]: 30,
      [HARD_MATCH_KEYS.gender]: '男',
      [HARD_MATCH_KEYS.partnerGenders]: ['男', '女', '非二元'],
      [HARD_MATCH_KEYS.nationality]: '中国',
      [HARD_MATCH_KEYS.partnerNationalities]: [],
      [HARD_MATCH_KEYS.languages]: ['中文'],
      [HARD_MATCH_KEYS.partnerLanguages]: [],
      [HARD_MATCH_KEYS.looks]: '5',
      [HARD_MATCH_KEYS.partnerLooks]: [...HARD_MATCH_LOOKS],
      [HARD_MATCH_KEYS.heightCm]: 175,
      [HARD_MATCH_KEYS.partnerHeightMin]: 150,
      [HARD_MATCH_KEYS.partnerHeightMax]: 190,
      [HARD_MATCH_KEYS.weightKg]: 65,
      [HARD_MATCH_KEYS.partnerWeightMin]: null,
      [HARD_MATCH_KEYS.partnerWeightMax]: null,
      [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢读书跑步，期待认真相处。',
      [HARD_MATCH_KEYS.school]: 'school-bupt',
      [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-cuc'],
      [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [],
    });
  });

  it('defaults retired nationality and language fields and optional weight preferences', () => {
    const legacyAnswers: Record<string, unknown> = { ...validAnswers };
    delete legacyAnswers[HARD_MATCH_KEYS.nationality];
    delete legacyAnswers[HARD_MATCH_KEYS.partnerNationalities];
    delete legacyAnswers[HARD_MATCH_KEYS.languages];
    delete legacyAnswers[HARD_MATCH_KEYS.partnerLanguages];
    delete legacyAnswers[HARD_MATCH_KEYS.partnerWeightMin];
    delete legacyAnswers[HARD_MATCH_KEYS.partnerWeightMax];

    expect(normalizeHardMatchAnswers(legacyAnswers, allowedSchoolIds)).toEqual({
      ...normalizeHardMatchAnswers(validAnswers, allowedSchoolIds),
      [HARD_MATCH_KEYS.nationality]: '中国',
      [HARD_MATCH_KEYS.partnerNationalities]: [],
      [HARD_MATCH_KEYS.languages]: ['中文'],
      [HARD_MATCH_KEYS.partnerLanguages]: [],
      [HARD_MATCH_KEYS.weightKg]: 65,
      [HARD_MATCH_KEYS.partnerWeightMin]: null,
      [HARD_MATCH_KEYS.partnerWeightMax]: null,
    });
  });

  it.each([undefined, null, ''])(
    'requires own weight even for previously optional answers (%s)',
    (weight) => {
      expect(() =>
        normalizeHardMatchAnswers(
          { ...validAnswers, [HARD_MATCH_KEYS.weightKg]: weight },
          allowedSchoolIds,
        ),
      ).toThrow('体重');
    },
  );

  it('clears invalid numeric draft text instead of truncating it', () => {
    const emptyDraft = createEmptyHardMatchDraftForm();

    expect(
      sanitizeHardMatchDraftForm(
        {
          partnerAgeMin: '18abc',
          partnerAgeMax: '30.5',
          heightCm: '175cm',
          partnerHeightMin: '150kg',
          partnerHeightMax: '190.5',
          weightKg: '65kg',
          partnerWeightMin: '50abc',
          partnerWeightMax: '80.5',
        },
        allowedSchoolIds,
      ),
    ).toMatchObject({
      partnerAgeMin: emptyDraft.partnerAgeMin,
      partnerAgeMax: emptyDraft.partnerAgeMax,
      heightCm: emptyDraft.heightCm,
      partnerHeightMin: emptyDraft.partnerHeightMin,
      partnerHeightMax: emptyDraft.partnerHeightMax,
      weightKg: '',
      partnerWeightMin: '',
      partnerWeightMax: '',
    });
  });

  it('requires a nonblank one-line intro for complete submissions', () => {
    expect(() =>
      normalizeHardMatchAnswers(
        { ...validAnswers, [HARD_MATCH_KEYS.oneLinerIntro]: '   ' },
        allowedSchoolIds,
      ),
    ).toThrow('一句话介绍');
    expect(
      sanitizeHardMatchDraftForm(
        { ...createEmptyHardMatchDraftForm(), oneLinerIntro: '' },
        allowedSchoolIds,
      ).oneLinerIntro,
    ).toBe('');
  });

  it('rejects questionnaire saves with a school id outside the active school list', () => {
    expect(() =>
      normalizeHardMatchAnswers(
        {
          ...validAnswers,
          [HARD_MATCH_KEYS.school]: 'school-missing',
        },
        allowedSchoolIds,
      ),
    ).toThrow(BadRequestException);
  });
});

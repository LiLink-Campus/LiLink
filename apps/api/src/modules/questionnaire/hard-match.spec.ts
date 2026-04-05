import { BadRequestException } from '@nestjs/common';
import {
  HARD_MATCH_GENDERS,
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
  areHardMatchAnswersCompatible,
  normalizeHardMatchAnswers,
  tryReadHardMatchAnswers,
} from './hard-match';

describe('hard-match helpers', () => {
  const validAnswers = {
    [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
    [HARD_MATCH_KEYS.partnerAgeMin]: 18,
    [HARD_MATCH_KEYS.partnerAgeMax]: 30,
    [HARD_MATCH_KEYS.gender]: '男',
    [HARD_MATCH_KEYS.partnerGenders]: [...HARD_MATCH_GENDERS],
    [HARD_MATCH_KEYS.looks]: '普通人',
    [HARD_MATCH_KEYS.partnerLooks]: [...HARD_MATCH_LOOKS],
    [HARD_MATCH_KEYS.heightCm]: 175,
    [HARD_MATCH_KEYS.partnerHeightMin]: 150,
    [HARD_MATCH_KEYS.partnerHeightMax]: 190,
    [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢读书跑步，期待认真相处。',
  } as const;

  it('normalizes a complete hard-match answer set', () => {
    expect(normalizeHardMatchAnswers(validAnswers)).toEqual({
      [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
      [HARD_MATCH_KEYS.partnerAgeMin]: 18,
      [HARD_MATCH_KEYS.partnerAgeMax]: 30,
      [HARD_MATCH_KEYS.gender]: '男',
      [HARD_MATCH_KEYS.partnerGenders]: ['男', '女', '非二元'],
      [HARD_MATCH_KEYS.looks]: '普通人',
      [HARD_MATCH_KEYS.partnerLooks]: ['普通人', '小帅/美', '顶帅/美'],
      [HARD_MATCH_KEYS.heightCm]: 175,
      [HARD_MATCH_KEYS.partnerHeightMin]: 150,
      [HARD_MATCH_KEYS.partnerHeightMax]: 190,
      [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢读书跑步，期待认真相处。',
    });
  });

  it('returns null when a stored hard-match answer set is incomplete', () => {
    expect(
      tryReadHardMatchAnswers({
        [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
      }),
    ).toBeNull();
  });

  it('rejects questionnaire saves without a one-line intro', () => {
    expect(() =>
      normalizeHardMatchAnswers({
        ...validAnswers,
        [HARD_MATCH_KEYS.oneLinerIntro]: '   ',
      }),
    ).toThrow(BadRequestException);
  });

  it('applies age, height, and mutual preference hard filters', () => {
    const left = tryReadHardMatchAnswers(validAnswers)!;
    const rightAnswers = {
      [HARD_MATCH_KEYS.birthDate]: '2001-07-12',
      [HARD_MATCH_KEYS.partnerAgeMin]: 18,
      [HARD_MATCH_KEYS.partnerAgeMax]: 35,
      [HARD_MATCH_KEYS.gender]: '女',
      [HARD_MATCH_KEYS.partnerGenders]: ['男'],
      [HARD_MATCH_KEYS.looks]: '小帅/美',
      [HARD_MATCH_KEYS.partnerLooks]: ['普通人', '小帅/美'],
      [HARD_MATCH_KEYS.heightCm]: 165,
      [HARD_MATCH_KEYS.partnerHeightMin]: 170,
      [HARD_MATCH_KEYS.partnerHeightMax]: 195,
      [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢画画，常在图书馆自习。',
    } as const;
    const right = tryReadHardMatchAnswers(rightAnswers)!;

    expect(
      areHardMatchAnswersCompatible(
        left,
        right,
        new Date('2026-05-20T00:00:00.000Z'),
      ),
    ).toBe(true);

    const mismatchedRight = tryReadHardMatchAnswers({
      ...rightAnswers,
      [HARD_MATCH_KEYS.partnerGenders]: ['非二元'],
    })!;

    expect(
      areHardMatchAnswersCompatible(
        left,
        mismatchedRight,
        new Date('2026-05-20T00:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('rejects when height is out of partner range', () => {
    const left = tryReadHardMatchAnswers(validAnswers)!;
    const tooTallRight = tryReadHardMatchAnswers({
      ...validAnswers,
      [HARD_MATCH_KEYS.gender]: '女',
      [HARD_MATCH_KEYS.partnerGenders]: ['男'],
      [HARD_MATCH_KEYS.heightCm]: 200,
      [HARD_MATCH_KEYS.partnerHeightMin]: 180,
      [HARD_MATCH_KEYS.partnerHeightMax]: 210,
    })!;

    expect(
      areHardMatchAnswersCompatible(
        left,
        tooTallRight,
        new Date('2026-05-20T00:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

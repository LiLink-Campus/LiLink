import { HARD_MATCH_KEYS } from '@lilink/shared';
import {
  addGender,
  emptyGenderBuckets,
  genderKey,
  resolveHardGender,
} from './gender';

const submitted = new Date('2026-05-10T00:00:00.000Z');

describe('resolveHardGender', () => {
  it('reads 男/女/非二元 from a submitted questionnaire', () => {
    expect(
      resolveHardGender({
        submittedAt: submitted,
        answers: { [HARD_MATCH_KEYS.gender]: '男' },
      }),
    ).toBe('男');
  });

  it('returns null when not submitted', () => {
    expect(
      resolveHardGender({
        submittedAt: null,
        answers: { [HARD_MATCH_KEYS.gender]: '男' },
      }),
    ).toBeNull();
  });

  it('returns null for missing/invalid answers', () => {
    expect(resolveHardGender(null)).toBeNull();
    expect(
      resolveHardGender({ submittedAt: submitted, answers: null }),
    ).toBeNull();
    expect(
      resolveHardGender({ submittedAt: submitted, answers: { other: 'x' } }),
    ).toBeNull();
  });
});

describe('genderKey + addGender', () => {
  it('maps raw labels to keys, else unknown', () => {
    expect(genderKey('男')).toBe('male');
    expect(genderKey('女')).toBe('female');
    expect(genderKey('非二元')).toBe('nonBinary');
    expect(genderKey(null)).toBe('unknown');
    expect(genderKey('其他')).toBe('unknown');
  });

  it('accumulates into buckets', () => {
    const b = emptyGenderBuckets();
    addGender(b, '男');
    addGender(b, '男');
    addGender(b, null);
    expect(b).toEqual({ male: 2, female: 0, nonBinary: 0, unknown: 1 });
  });
});

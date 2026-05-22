import {
  computeOptionSetSignature,
  currentHardMatchConfirmSignature,
  hardMatchFieldHasValue,
  hardMatchFieldSignature,
  hardMatchSignatureFieldKeys,
  HARD_MATCH_KEYS,
  HARD_MATCH_WEIGHT_ACK,
} from '@lilink/shared';

describe('hard-match option-set signatures', () => {
  it('is order-insensitive and stable for the same set', () => {
    expect(computeOptionSetSignature(['a', 'b', 'c'])).toBe(
      computeOptionSetSignature(['c', 'a', 'b']),
    );
    expect(computeOptionSetSignature(['a', 'a', 'b'])).toBe(
      computeOptionSetSignature(['a', 'b']),
    );
  });

  it('changes when an option is added', () => {
    expect(computeOptionSetSignature(['a', 'b'])).not.toBe(
      computeOptionSetSignature(['a', 'b', 'c']),
    );
  });

  it('returns a signature for enum keys and null for non-enum keys', () => {
    expect(typeof hardMatchFieldSignature(HARD_MATCH_KEYS.looks)).toBe(
      'string',
    );
    expect(
      typeof hardMatchFieldSignature(HARD_MATCH_KEYS.partnerLanguages),
    ).toBe('string');
    expect(hardMatchFieldSignature(HARD_MATCH_KEYS.heightCm)).toBeNull();
    expect(hardMatchSignatureFieldKeys()).toContain(
      HARD_MATCH_KEYS.partnerGenders,
    );
  });

  it('treats empty string / null / empty array as no value', () => {
    expect(hardMatchFieldHasValue(null)).toBe(false);
    expect(hardMatchFieldHasValue('')).toBe(false);
    expect(hardMatchFieldHasValue([])).toBe(false);
    expect(hardMatchFieldHasValue(['男'])).toBe(true);
    expect(hardMatchFieldHasValue('男')).toBe(true);
    expect(hardMatchFieldHasValue(170)).toBe(true);
  });

  it('maps confirm signature by field kind', () => {
    expect(currentHardMatchConfirmSignature(HARD_MATCH_KEYS.looks)).toBe(
      hardMatchFieldSignature(HARD_MATCH_KEYS.looks),
    );
    expect(
      currentHardMatchConfirmSignature(HARD_MATCH_KEYS.partnerWeightMin),
    ).toBe(HARD_MATCH_WEIGHT_ACK);
    expect(
      currentHardMatchConfirmSignature(HARD_MATCH_KEYS.oneLinerIntro),
    ).toBeNull();
  });
});

export const HARD_MATCH_GENDERS = ['男', '女', '非二元'] as const;
export const HARD_MATCH_LOOKS = ['普通人', '小帅/美', '顶帅/美'] as const;

export const HARD_MATCH_HEIGHT_MIN_CM = 120;
export const HARD_MATCH_HEIGHT_MAX_CM = 230;

export const HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH = 200;

export const HARD_MATCH_KEYS = {
  birthDate: 'hard_birth_date',
  partnerAgeMin: 'hard_partner_age_min',
  partnerAgeMax: 'hard_partner_age_max',
  gender: 'hard_gender',
  partnerGenders: 'hard_partner_genders',
  looks: 'hard_looks',
  partnerLooks: 'hard_partner_looks',
  heightCm: 'hard_height_cm',
  partnerHeightMin: 'hard_partner_height_min',
  partnerHeightMax: 'hard_partner_height_max',
  oneLinerIntro: 'hard_one_liner_intro',
} as const;

export type HardMatchGender = (typeof HARD_MATCH_GENDERS)[number];
export type HardMatchLooks = (typeof HARD_MATCH_LOOKS)[number];
export type HardMatchKey =
  (typeof HARD_MATCH_KEYS)[keyof typeof HARD_MATCH_KEYS];

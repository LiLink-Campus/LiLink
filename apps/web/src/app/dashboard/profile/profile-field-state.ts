import { isLifestyleQuestion, VIP_FILTER_KEYS } from "@lilink/shared";
import {
  AGE_OPTIONS,
  HEIGHT_OPTIONS,
  WEIGHT_OPTIONS,
  HARD_MATCH_KEYS,
  buildDayOptions,
  hardMatchAttentionFields,
  type HardMatchFormState,
} from "@lilink/shared";
import type { ValuePickerOption } from "../_components/ValuePicker";
import type { Question } from "../_lib/types";
import { softQuestionAnswerIsComplete } from "@lilink/shared";

function numericOptions(
  values: ReadonlyArray<number | string>,
  formatter?: (value: number | string) => string
): ValuePickerOption[] {
  return values.map((raw) => {
    const valueText = String(raw);
    return {
      value: valueText,
      label: formatter ? formatter(raw) : valueText,
    };
  });
}

export const AGE_VALUE_OPTIONS = numericOptions(AGE_OPTIONS);
export const HEIGHT_VALUE_OPTIONS = numericOptions(HEIGHT_OPTIONS);
export const WEIGHT_VALUE_OPTIONS = [...numericOptions(WEIGHT_OPTIONS, (weight) => `${weight} kg`)];
export const PARTNER_WEIGHT_VALUE_OPTIONS = [
  { value: "", label: "不限" },
  ...numericOptions(WEIGHT_OPTIONS, (weight) => `${weight} kg`),
];

export const LOOKS_DESCRIPTIONS: Record<number, string> = {
  1: "1–3分：五官存在明显硬伤，如面部不流畅、不对称等。这个分数段更多被认为是对自己不够上心，不注重打扮。",
  2: "1–3分：五官存在明显硬伤，如面部不流畅、不对称等。这个分数段更多被认为是对自己不够上心，不注重打扮。",
  3: "1–3分：五官存在明显硬伤，如面部不流畅、不对称等。这个分数段更多被认为是对自己不够上心，不注重打扮。",
  4: "4分：普通路人水平，五官没有明显缺陷，但缺乏亮点，容易给人‘好人卡’的感觉。",
  5: "5分：路人缘不错的类型，第一眼看上去很舒服，说不上惊艳，但绝对不讨厌。",
  6: "6分：班花级别，身高、五官或身材中至少有一项比较突出，在校园中不缺男生表白。",
  7: "7分：校花或校园女神级别，在普通人中非常亮眼，风格、审美和穿搭基本没有毛病。",
  8: "8分：模特水准，辨识度很高，能够通过颜值变现，在社交媒体上拥有较高人气。",
  9: "9分：颜值天花板，通常是娱乐圈或时尚圈的明星，如杨幂、迪丽热巴等，其精致度和氛围感是普通人无法企及的。",
  10: "10分：无人可及",
};

export type ProfileTab = "self" | "partner" | "values";

export const PROFILE_TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: "self", label: "关于你" },
  { id: "partner", label: "希望遇见谁" },
  { id: "values", label: "价值观" },
];

export const HARD_MATCH_FIELD_KEY_GROUPS = {
  birthDate: [HARD_MATCH_KEYS.birthDate],
  gender: [HARD_MATCH_KEYS.gender],
  nationality: [HARD_MATCH_KEYS.nationality],
  languages: [HARD_MATCH_KEYS.languages],
  looks: [HARD_MATCH_KEYS.looks],
  heightCm: [HARD_MATCH_KEYS.heightCm],
  weightKg: [HARD_MATCH_KEYS.weightKg],
  partnerAge: [HARD_MATCH_KEYS.partnerAgeMin, HARD_MATCH_KEYS.partnerAgeMax],
  partnerGenders: [HARD_MATCH_KEYS.partnerGenders],
  partnerNationalities: [HARD_MATCH_KEYS.partnerNationalities],
  partnerLanguages: [HARD_MATCH_KEYS.partnerLanguages],
  partnerLooks: [HARD_MATCH_KEYS.partnerLooks],
  partnerHeight: [HARD_MATCH_KEYS.partnerHeightMin, HARD_MATCH_KEYS.partnerHeightMax],
  partnerWeight: [HARD_MATCH_KEYS.partnerWeightMin, HARD_MATCH_KEYS.partnerWeightMax],
  excludedPartnerSchools: [
    HARD_MATCH_KEYS.excludedPartnerSchools,
    HARD_MATCH_KEYS.excludedPartnerSchoolGenders,
  ],
} as const;

function numericFormValueIsComplete(value: string) {
  return value.trim().length > 0 && Number.isFinite(Number(value));
}

function numericRangeFormValueIsComplete(min: string, max: string) {
  return (
    numericFormValueIsComplete(min) && numericFormValueIsComplete(max) && Number(min) <= Number(max)
  );
}

export function hardMatchFieldIsComplete(key: string, hardMatchForm: HardMatchFormState) {
  switch (key) {
    case HARD_MATCH_KEYS.birthDate:
      return (
        hardMatchForm.birthYear.trim().length > 0 &&
        hardMatchForm.birthMonth.trim().length > 0 &&
        hardMatchForm.birthDay.trim().length > 0 &&
        buildDayOptions(hardMatchForm.birthYear, hardMatchForm.birthMonth).includes(
          Number(hardMatchForm.birthDay)
        )
      );
    case HARD_MATCH_KEYS.gender:
      return hardMatchForm.gender.trim().length > 0;
    case HARD_MATCH_KEYS.nationality:
      return hardMatchForm.nationality.trim().length > 0;
    case HARD_MATCH_KEYS.languages:
      return hardMatchForm.languages.length > 0;
    case HARD_MATCH_KEYS.looks:
      return hardMatchForm.looks.trim().length > 0;
    case HARD_MATCH_KEYS.heightCm:
      return numericFormValueIsComplete(hardMatchForm.heightCm);
    case HARD_MATCH_KEYS.weightKg:
      return numericFormValueIsComplete(hardMatchForm.weightKg);
    case HARD_MATCH_KEYS.oneLinerIntro:
      return true;
    case HARD_MATCH_KEYS.partnerAgeMin:
    case HARD_MATCH_KEYS.partnerAgeMax:
      return numericRangeFormValueIsComplete(
        hardMatchForm.partnerAgeMin,
        hardMatchForm.partnerAgeMax
      );
    case HARD_MATCH_KEYS.partnerGenders:
      return hardMatchForm.partnerGenders.length > 0;
    case HARD_MATCH_KEYS.partnerNationalities:
    case HARD_MATCH_KEYS.partnerLanguages:
      return true;
    case HARD_MATCH_KEYS.partnerLooks:
      return hardMatchForm.partnerLooks.length > 0;
    case HARD_MATCH_KEYS.partnerHeightMin:
    case HARD_MATCH_KEYS.partnerHeightMax:
      return numericRangeFormValueIsComplete(
        hardMatchForm.partnerHeightMin,
        hardMatchForm.partnerHeightMax
      );
    case HARD_MATCH_KEYS.partnerWeightMin:
    case HARD_MATCH_KEYS.partnerWeightMax:
    case HARD_MATCH_KEYS.excludedPartnerSchools:
    case HARD_MATCH_KEYS.excludedPartnerSchoolGenders:
      return true;
    default:
      return true;
  }
}

export function incompleteProfileTargets({
  displayName,
  hardMatchForm,
  questions,
  answers,
  vipActive,
}: {
  displayName: string;
  hardMatchForm: HardMatchFormState;
  questions: Question[];
  answers: Record<string, unknown>;
  vipActive: boolean;
}): { key: string; tab: ProfileTab }[] {
  const incompleteTargets: { key: string; tab: ProfileTab }[] = [];
  if (displayName.trim().length < 2) incompleteTargets.push({ key: "nickname", tab: "self" });
  if (!hardMatchForm.oneLinerIntro.trim())
    incompleteTargets.push({ key: HARD_MATCH_KEYS.oneLinerIntro, tab: "self" });
  const incompleteGroups = new Set<string>();
  for (const field of hardMatchAttentionFields()) {
    if (!vipActive && VIP_FILTER_KEYS.includes(field.key)) continue;
    if (!field.required || hardMatchFieldIsComplete(field.key, hardMatchForm)) continue;
    const group =
      Object.entries(HARD_MATCH_FIELD_KEY_GROUPS).find(([, keys]) =>
        (keys as readonly string[]).includes(field.key)
      )?.[0] ?? field.key;
    if (incompleteGroups.has(group)) continue;
    incompleteGroups.add(group);
    incompleteTargets.push({ key: field.key, tab: field.tab });
  }
  for (const question of questions) {
    if (!softQuestionAnswerIsComplete(question, answers[question.key]))
      incompleteTargets.push({
        key: question.key,
        tab: isLifestyleQuestion(question.key) ? "self" : "values",
      });
  }
  return incompleteTargets;
}

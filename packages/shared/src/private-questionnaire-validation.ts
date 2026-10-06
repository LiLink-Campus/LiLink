import type {
  QuestionnairePayload,
  QuestionnaireAttentionPayload,
  SavedQuestionnairePayload,
} from "./questionnaire-types";
import {
  isObject,
  isString,
  isBoolean,
  isCount,
  isDate,
  nullable,
  arrayOf,
  oneOf,
  fields,
} from "./private-contract-values";

export function isQuestionnaireAttention(value: unknown): value is QuestionnaireAttentionPayload {
  return (
    isObject(value) &&
    isString(value.currentVersionId) &&
    fields(
      value,
      ["acknowledgedKeys", "pendingUpdatedKeys", "missingRequiredKeys", "pendingKeys"],
      (item) => arrayOf(item, isString)
    ) &&
    arrayOf(
      value.items,
      (item) =>
        isObject(item) &&
        fields(item, ["key", "prompt"], isString) &&
        fields(item, ["updated", "missingRequired", "acknowledged"], isBoolean)
    )
  );
}
export function isQuestionnaire(value: unknown): value is QuestionnairePayload {
  return (
    isObject(value) &&
    isString(value.id) &&
    arrayOf(
      value.questions,
      (question) =>
        isObject(question) &&
        fields(question, ["id", "key", "prompt"], isString) &&
        oneOf(question.type, ["SCALE", "SINGLE_SELECT", "MULTI_SELECT"]) &&
        (question.required === undefined || isBoolean(question.required)) &&
        (question.selectionLimit === undefined || nullable(question.selectionLimit, isCount)) &&
        (question.options === undefined ||
          arrayOf(
            question.options,
            (option) => isObject(option) && fields(option, ["value", "label"], isString)
          ))
    ) &&
    arrayOf(value.schools, (school) => isObject(school) && fields(school, ["id", "name"], isString))
  );
}
function isHardMatchForm(value: unknown) {
  return (
    isObject(value) &&
    fields(
      value,
      [
        "birthYear",
        "birthMonth",
        "birthDay",
        "partnerAgeMin",
        "partnerAgeMax",
        "gender",
        "nationality",
        "looks",
        "heightCm",
        "partnerHeightMin",
        "partnerHeightMax",
        "weightKg",
        "partnerWeightMin",
        "partnerWeightMax",
        "oneLinerIntro",
      ],
      isString
    ) &&
    fields(
      value,
      [
        "partnerGenders",
        "partnerNationalities",
        "languages",
        "partnerLanguages",
        "partnerLooks",
        "excludedPartnerSchools",
      ],
      (item) => arrayOf(item, isString)
    ) &&
    ["partnerSmokingStatus", "partnerDrinkingFrequency", "partnerExerciseFrequency"].every(
      (key) => value[key] === undefined || arrayOf(value[key], isString)
    ) &&
    arrayOf(
      value.excludedPartnerSchoolGenders,
      (entry) => isObject(entry) && isString(entry.schoolId) && arrayOf(entry.genders, isString)
    )
  );
}
export function isSavedQuestionnaire(value: unknown): value is SavedQuestionnairePayload {
  return (
    value === null ||
    (isObject(value) &&
      isString(value.versionId) &&
      nullable(value.currentVersionId, isString) &&
      isObject(value.answers) &&
      nullable(value.submittedAt, isDate) &&
      (value.vipFiltersActive === undefined || isBoolean(value.vipFiltersActive)) &&
      nullable(value.attention, isQuestionnaireAttention) &&
      nullable(
        value.draft,
        (draft) =>
          isObject(draft) &&
          isObject(draft.softAnswers) &&
          isHardMatchForm(draft.hardMatchForm) &&
          isString(draft.displayName)
      ))
  );
}

import {
  HARD_MATCH_KEYS,
  HARD_MATCH_WEIGHT_ACK,
  HARD_MATCH_WEIGHT_KEYS,
  hardMatchFieldSignature,
  hardMatchSignatureFieldKeys,
} from '@lilink/shared';
import { QuestionnaireService } from '../../../src/modules/questionnaire/questionnaire.service';
export function buildConfirmedHardMatchSignatures(
  exclude: readonly string[] = [],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const key of hardMatchSignatureFieldKeys()) {
    if (exclude.includes(key)) continue;
    const sig = hardMatchFieldSignature(key);
    if (sig) map[key] = sig;
  }
  for (const key of HARD_MATCH_WEIGHT_KEYS) {
    if (exclude.includes(key)) continue;
    map[key] = HARD_MATCH_WEIGHT_ACK;
  }
  return map;
}
export function buildQuestionnaireServiceWithSchema(payload: {
  id?: string;
  questions: Array<{
    key: string;
    prompt: string;
    type: 'SINGLE_SELECT' | 'MULTI_SELECT' | 'SCALE';
    required: boolean;
    options?: Array<{ value: string; label?: string }>;
    selectionLimit?: number | null;
  }>;
  schools: Array<{ id: string; name?: string }>;
}) {
  const service = new QuestionnaireService({} as never);
  const questionnairePayload = {
    id: payload.id ?? 'q-test',
    questions: payload.questions.map((q, index) => ({
      id: `${q.key}-id`,
      versionId: payload.id ?? 'q-test',
      key: q.key,
      prompt: q.prompt,
      description: null,
      type: q.type,
      weight: 1,
      order: index,
      required: q.required,
      selectionLimit: q.selectionLimit ?? null,
      options: (q.options ?? []).map((o) => ({
        value: o.value,
        label: o.label ?? o.value,
      })),
    })),
    schools: payload.schools.map((s) => ({
      id: s.id,
      name: s.name ?? s.id,
    })),
  };
  jest
    .spyOn(service, 'getCurrentVersion')
    .mockResolvedValue(questionnairePayload as never);
  return service;
}
export function buildSubmittedQuestionnaireResponse(
  overrides: Partial<{
    answers: Record<string, unknown>;
    draftAnswers: Record<string, unknown> | null;
    submittedAt: Date;
  }> = {},
) {
  return {
    versionId: 'q-test',
    version: { isCurrent: true },
    answers: {
      [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
      [HARD_MATCH_KEYS.partnerAgeMin]: 18,
      [HARD_MATCH_KEYS.partnerAgeMax]: 30,
      [HARD_MATCH_KEYS.gender]: '男',
      [HARD_MATCH_KEYS.partnerGenders]: ['女'],
      [HARD_MATCH_KEYS.nationality]: '中国',
      [HARD_MATCH_KEYS.partnerNationalities]: [],
      [HARD_MATCH_KEYS.languages]: ['中文'],
      [HARD_MATCH_KEYS.partnerLanguages]: [],
      [HARD_MATCH_KEYS.looks]: '5',
      [HARD_MATCH_KEYS.partnerLooks]: ['5', '6', '7', '8', '9', '10'],
      [HARD_MATCH_KEYS.heightCm]: 175,
      [HARD_MATCH_KEYS.partnerHeightMin]: 150,
      [HARD_MATCH_KEYS.partnerHeightMax]: 195,
      [HARD_MATCH_KEYS.weightKg]: 65,
      [HARD_MATCH_KEYS.partnerWeightMin]: null,
      [HARD_MATCH_KEYS.partnerWeightMax]: null,
      [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢徒步。',
      [HARD_MATCH_KEYS.school]: 'school-bupt',
      [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
      [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [],
      ...(overrides.answers ?? {}),
    },
    draftAnswers:
      overrides.draftAnswers === undefined ? null : overrides.draftAnswers,
    submittedAt: overrides.submittedAt ?? new Date('2026-04-01T00:00:00.000Z'),
  };
}
export function buildSubmittedHardMatchDraftForm(
  overrides: Record<string, unknown> = {},
) {
  // Numeric fields are stored as strings in the draft so they round-trip
  // through readAllowedNumberString / readRequiredIntegerInput unchanged.
  return {
    birthYear: '2000',
    birthMonth: '05',
    birthDay: '10',
    partnerAgeMin: '18',
    partnerAgeMax: '30',
    gender: '男',
    partnerGenders: ['女'],
    nationality: '中国',
    partnerNationalities: ['中国'],
    languages: ['中文'],
    partnerLanguages: ['中文'],
    looks: '5',
    partnerLooks: ['5', '6', '7', '8', '9', '10'],
    heightCm: '175',
    weightKg: '65',
    partnerHeightMin: '150',
    partnerHeightMax: '195',
    oneLinerIntro: '喜欢徒步。',
    ...overrides,
  };
}

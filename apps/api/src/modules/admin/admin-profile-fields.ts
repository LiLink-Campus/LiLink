import {
  HARD_MATCH_KEYS as K,
  hardMatchAttentionFields,
  isLifestyleQuestion,
} from '@lilink/shared';

interface CurrentQuestion {
  key: string;
  prompt: string;
  options: unknown;
}
export interface AdminProfileField {
  key: string;
  label: string;
  section: 'self' | 'partner' | 'values';
  options?: unknown;
  emptyLabel: string;
}

// Compose the same current field definitions used by the profile form.
export function adminProfileFields(
  questions: CurrentQuestion[],
): AdminProfileField[] {
  const fields: AdminProfileField[] = [
    {
      key: K.oneLinerIntro,
      label: '一句话介绍',
      section: 'self',
      emptyLabel: '未填写',
    },
    { key: K.school, label: '学校', section: 'self', emptyLabel: '未填写' },
    ...hardMatchAttentionFields().map((field) => ({
      key: field.key,
      label: field.label,
      section: field.tab,
      emptyLabel: field.required ? '未填写' : '不限',
    })),
  ];
  for (const question of questions) {
    if (question.key.startsWith('hard_')) continue;
    fields.push({
      key: question.key,
      label: question.prompt,
      options: question.options,
      section: isLifestyleQuestion(question.key) ? 'self' : 'values',
      emptyLabel: '未填写',
    });
  }
  for (const [key, source] of [
    [K.partnerSmokingStatus, 'smoking_status'],
    [K.partnerDrinkingFrequency, 'drinking_frequency'],
    [K.partnerExerciseFrequency, 'exercise_frequency'],
  ] as const) {
    const question = questions.find((item) => item.key === source);
    if (question)
      fields.push({
        key,
        label: `希望对方${question.prompt}`,
        options: question.options,
        section: 'partner',
        emptyLabel: '不限',
      });
  }
  return fields;
}

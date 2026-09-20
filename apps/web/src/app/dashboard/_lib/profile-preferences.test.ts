import { describe, expect, it } from 'vitest';
import { LIFESTYLE_QUESTIONS } from '@lilink/shared';
import { hardMatchFormFromAnswers } from '../../../lib/hard-match';
import { profileAttentionTabForKey } from './profile-attention';
import { computeQuestionnaireProgress } from './progress';
import type { Question } from './types';

const questions: Question[] = LIFESTYLE_QUESTIONS.map(q => ({ id: q.key, key: q.key, prompt: q.prompt, type: 'SINGLE_SELECT', options: q.options.map(label => ({ label, value: label })) }));
const answers = Object.fromEntries(questions.map(q => [q.key, q.options![0].value]));
const form = { ...hardMatchFormFromAnswers(undefined, []), birthYear: '2000', birthMonth: '1', birthDay: '1', gender: '女', partnerGenders: ['男'], looks: '5', heightCm: '165', weightKg: '55', partnerHeightMin: '', partnerHeightMax: '', oneLinerIntro: '喜欢一起散步。' };

function progress(vipFiltersActive: boolean, softAnswers = answers) {
  return computeQuestionnaireProgress({
    questions,
    schools: [],
    fallbackDisplayName: '测试同学',
    savedQuestionnaire: {
      vipFiltersActive,
      versionId: 'fixture',
      currentVersionId: 'fixture',
      answers: {},
      submittedAt: null,
      draft: { softAnswers, hardMatchForm: form, displayName: '测试同学' },
      attention: null,
    },
  });
}

describe('profile lifestyle and VIP completion', () => {
  it('locates missing lifestyle answers in About You', () => {
    for (const question of questions) expect(profileAttentionTabForKey(question.key, questions)).toBe('self');
    expect(progress(false, {}).profileReady).toBe(false);
  });
  it('does not require free users to answer locked premium questions', () => {
    expect(progress(false).profileReady).toBe(true);
    expect(progress(true).profileReady).toBe(false);
  });
  it('includes the new lifestyle questions in home completion without counting locked filters as missing', () => {
    expect(progress(false).percent).toBe(100);
    for (const question of questions) {
      const partialAnswers = { ...answers };
      delete partialAnswers[question.key];
      expect(progress(false, partialAnswers).percent).toBeLessThan(100);
    }
  });
});

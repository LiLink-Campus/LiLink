import { QuestionType } from '../../common/prisma/client';
import {
  normalizeQuestionAnswer,
  normalizeQuestionOptions,
  normalizeQuestionReasonRules,
  renderReasonTemplate,
} from './questionnaire-config';

describe('questionnaire-config', () => {
  it('upgrades legacy string options into value-label objects', () => {
    expect(normalizeQuestionOptions(['慢热', '主动推进'])).toEqual([
      { value: '慢热', label: '慢热' },
      { value: '主动推进', label: '主动推进' },
    ]);
  });

  it('normalizes stored labels into stable option values', () => {
    expect(
      normalizeQuestionAnswer(
        {
          prompt: 'Pace',
          type: QuestionType.SINGLE_SELECT,
          options: [
            { value: 'slow_burn', label: '慢热' },
            { value: 'proactive', label: '主动推进' },
          ],
        },
        '慢热',
      ),
    ).toBe('slow_burn');
  });

  it('parses reason rules and renders template placeholders', () => {
    const rules = normalizeQuestionReasonRules([
      {
        type: 'MULTI_OVERLAP',
        template: '你们都把 {{labels_2}} 放在重要位置。',
        priority: 4,
        minOverlap: 1,
        maxLabels: 2,
      },
    ]);

    expect(rules).toEqual([
      {
        type: 'MULTI_OVERLAP',
        template: '你们都把 {{labels_2}} 放在重要位置。',
        priority: 4,
        minOverlap: 1,
        maxLabels: 2,
      },
    ]);
    expect(
      renderReasonTemplate(rules[0].template, {
        labels_2: '真诚、稳定',
      }),
    ).toBe('你们都把 真诚、稳定 放在重要位置。');
  });

  it('rejects multi-select answers that exceed the question limit', () => {
    expect(() =>
      normalizeQuestionAnswer(
        {
          prompt: 'Values',
          type: QuestionType.MULTI_SELECT,
          selectionLimit: 2,
          options: [
            { value: 'honesty', label: '真诚' },
            { value: 'stability', label: '稳定' },
            { value: 'humor', label: '幽默感' },
          ],
        },
        ['真诚', '稳定', '幽默感'],
      ),
    ).toThrow('allows at most 2 selections');
  });

  it('accepts multi-select answers that hit the limit exactly after deduping', () => {
    expect(
      normalizeQuestionAnswer(
        {
          prompt: 'Values',
          type: QuestionType.MULTI_SELECT,
          selectionLimit: 2,
          options: [
            { value: 'honesty', label: '真诚' },
            { value: 'stability', label: '稳定' },
            { value: 'humor', label: '幽默感' },
          ],
        },
        ['真诚', '真诚', '稳定'],
      ),
    ).toEqual(['honesty', 'stability']);
  });

  it('returns null for stale over-limit multi-select answers when invalidAsNull is enabled', () => {
    expect(
      normalizeQuestionAnswer(
        {
          prompt: 'Values',
          type: QuestionType.MULTI_SELECT,
          selectionLimit: 2,
          options: [
            { value: 'honesty', label: '真诚' },
            { value: 'stability', label: '稳定' },
            { value: 'humor', label: '幽默感' },
          ],
        },
        ['真诚', '稳定', '幽默感'],
        { invalidAsNull: true },
      ),
    ).toBeNull();
  });
});

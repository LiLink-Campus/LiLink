import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { QuestionnaireService } from './questionnaire.service';

describe('QuestionnaireService', () => {
  const service = new QuestionnaireService({} as never);

  it('rejects unexpected answer keys', () => {
    expect(() =>
      service.validateAnswers(
        [
          {
            key: 'pace',
            prompt: 'Pace',
            type: QuestionType.SINGLE_SELECT,
            required: true,
            options: ['Slow', 'Fast'],
          },
        ],
        { unknown_key: 'value' },
      ),
    ).toThrow(BadRequestException);
  });

  it('normalizes valid answers', () => {
    expect(
      service.validateAnswers(
        [
          {
            key: 'pace',
            prompt: 'Pace',
            type: QuestionType.SINGLE_SELECT,
            required: true,
            options: ['Slow', 'Fast'],
          },
          {
            key: 'values',
            prompt: 'Values',
            type: QuestionType.MULTI_SELECT,
            required: true,
            options: ['Curiosity', 'Stability', 'Humor'],
          },
          {
            key: 'notes',
            prompt: 'Notes',
            type: QuestionType.SHORT_TEXT,
            required: true,
            options: null,
          },
        ],
        {
          pace: 'Fast',
          values: ['Humor', 'Humor', 'Curiosity'],
          notes: '  hello  ',
        },
      ),
    ).toEqual({
      pace: 'Fast',
      values: ['Humor', 'Curiosity'],
      notes: 'hello',
    });
  });
});

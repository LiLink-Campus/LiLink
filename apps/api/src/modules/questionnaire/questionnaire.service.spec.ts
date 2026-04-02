import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import {
  HARD_MATCH_GENDERS,
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
  HARD_MATCH_RACES,
} from './hard-match';
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
        ],
        {
          [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
          [HARD_MATCH_KEYS.partnerAgeMin]: 18,
          [HARD_MATCH_KEYS.partnerAgeMax]: 30,
          [HARD_MATCH_KEYS.gender]: '男',
          [HARD_MATCH_KEYS.partnerGenders]: [...HARD_MATCH_GENDERS],
          [HARD_MATCH_KEYS.looks]: '普通人',
          [HARD_MATCH_KEYS.partnerLooks]: [...HARD_MATCH_LOOKS],
          [HARD_MATCH_KEYS.race]: '黄种人',
          [HARD_MATCH_KEYS.partnerRaces]: [...HARD_MATCH_RACES],
          pace: 'Fast',
          values: ['Humor', 'Humor', 'Curiosity'],
        },
      ),
    ).toEqual({
      [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
      [HARD_MATCH_KEYS.partnerAgeMin]: 18,
      [HARD_MATCH_KEYS.partnerAgeMax]: 30,
      [HARD_MATCH_KEYS.gender]: '男',
      [HARD_MATCH_KEYS.partnerGenders]: ['男', '女', '非二元'],
      [HARD_MATCH_KEYS.looks]: '普通人',
      [HARD_MATCH_KEYS.partnerLooks]: ['普通人', '小帅/美', '顶帅/美'],
      [HARD_MATCH_KEYS.race]: '黄种人',
      [HARD_MATCH_KEYS.partnerRaces]: ['黄种人', '黑种人', '白种人'],
      pace: 'Fast',
      values: ['Humor', 'Curiosity'],
    });
  });

  it('requires the hard-match answers', () => {
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
        {
          pace: 'Fast',
        },
      ),
    ).toThrow(BadRequestException);
  });
});

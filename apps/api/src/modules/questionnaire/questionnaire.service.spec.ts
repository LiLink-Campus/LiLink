import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import {
  HARD_MATCH_GENDERS,
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
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
            options: [
              { value: 'slow', label: 'Slow' },
              { value: 'fast', label: 'Fast' },
            ],
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
            options: [
              { value: 'slow', label: 'Slow' },
              { value: 'fast', label: 'Fast' },
            ],
          },
          {
            key: 'values',
            prompt: 'Values',
            type: QuestionType.MULTI_SELECT,
            required: true,
            selectionLimit: 3,
            options: [
              { value: 'curiosity', label: 'Curiosity' },
              { value: 'stability', label: 'Stability' },
              { value: 'humor', label: 'Humor' },
            ],
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
          [HARD_MATCH_KEYS.heightCm]: 175,
          [HARD_MATCH_KEYS.partnerHeightMin]: 120,
          [HARD_MATCH_KEYS.partnerHeightMax]: 220,
          [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢读书跑步。',
          pace: 'Fast',
          values: ['Humor', 'humor', 'Curiosity'],
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
      [HARD_MATCH_KEYS.heightCm]: 175,
      [HARD_MATCH_KEYS.partnerHeightMin]: 120,
      [HARD_MATCH_KEYS.partnerHeightMax]: 220,
      [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢读书跑步。',
      pace: 'fast',
      values: ['humor', 'curiosity'],
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
            options: [
              { value: 'slow', label: 'Slow' },
              { value: 'fast', label: 'Fast' },
            ],
          },
        ],
        {
          pace: 'Fast',
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('drops stale saved answers whose options no longer exist', () => {
    expect(
      service.sanitizeStoredAnswers(
        [
          {
            key: 'pace',
            prompt: 'Pace',
            type: QuestionType.SINGLE_SELECT,
            required: true,
            options: [
              { value: 'slow', label: 'Slow' },
              { value: 'balanced', label: 'Balanced' },
            ],
          },
          {
            key: 'values',
            prompt: 'Values',
            type: QuestionType.MULTI_SELECT,
            required: true,
            selectionLimit: 2,
            options: [
              { value: 'curiosity', label: 'Curiosity' },
              { value: 'stability', label: 'Stability' },
            ],
          },
        ],
        {
          pace: 'Fast',
          values: ['Curiosity', 'missing-option'],
        },
      ),
    ).toEqual({
      values: ['curiosity'],
    });
  });

  it('rejects multi-select answers that exceed the configured limit', () => {
    expect(() =>
      service.validateAnswers(
        [
          {
            key: 'values',
            prompt: 'Values',
            type: QuestionType.MULTI_SELECT,
            required: true,
            selectionLimit: 2,
            options: [
              { value: 'curiosity', label: 'Curiosity' },
              { value: 'stability', label: 'Stability' },
              { value: 'humor', label: 'Humor' },
            ],
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
          [HARD_MATCH_KEYS.heightCm]: 175,
          [HARD_MATCH_KEYS.partnerHeightMin]: 120,
          [HARD_MATCH_KEYS.partnerHeightMax]: 220,
          [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢读书跑步。',
          values: ['Curiosity', 'Stability', 'Humor'],
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts a multi-select answer that lands exactly on the configured limit', () => {
    expect(
      service.validateAnswers(
        [
          {
            key: 'values',
            prompt: 'Values',
            type: QuestionType.MULTI_SELECT,
            required: true,
            selectionLimit: 2,
            options: [
              { value: 'curiosity', label: 'Curiosity' },
              { value: 'stability', label: 'Stability' },
              { value: 'humor', label: 'Humor' },
            ],
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
          [HARD_MATCH_KEYS.heightCm]: 175,
          [HARD_MATCH_KEYS.partnerHeightMin]: 120,
          [HARD_MATCH_KEYS.partnerHeightMax]: 220,
          [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢读书跑步。',
          values: ['Curiosity', 'Stability'],
        },
      ),
    ).toMatchObject({
      values: ['curiosity', 'stability'],
    });
  });

  it('drops stale saved multi-select answers when a new limit makes them invalid', () => {
    expect(
      service.sanitizeStoredAnswers(
        [
          {
            key: 'values',
            prompt: 'Values',
            type: QuestionType.MULTI_SELECT,
            required: true,
            selectionLimit: 2,
            options: [
              { value: 'curiosity', label: 'Curiosity' },
              { value: 'stability', label: 'Stability' },
              { value: 'humor', label: 'Humor' },
            ],
          },
        ],
        {
          values: ['Curiosity', 'Stability', 'Humor'],
        },
      ),
    ).toEqual({});
  });
});

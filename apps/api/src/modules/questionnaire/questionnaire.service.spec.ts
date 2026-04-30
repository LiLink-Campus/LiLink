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
  const allowedSchoolIds = ['school-bupt', 'school-cuc'];

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
        allowedSchoolIds,
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
          [HARD_MATCH_KEYS.nationality]: '中国',
          [HARD_MATCH_KEYS.partnerNationalities]: [],
          [HARD_MATCH_KEYS.languages]: ['中文'],
          [HARD_MATCH_KEYS.partnerLanguages]: [],
          [HARD_MATCH_KEYS.looks]: '普通人',
          [HARD_MATCH_KEYS.partnerLooks]: [...HARD_MATCH_LOOKS],
          [HARD_MATCH_KEYS.heightCm]: 175,
          [HARD_MATCH_KEYS.partnerHeightMin]: 120,
          [HARD_MATCH_KEYS.partnerHeightMax]: 220,
          [HARD_MATCH_KEYS.weightKg]: null,
          [HARD_MATCH_KEYS.partnerWeightMin]: null,
          [HARD_MATCH_KEYS.partnerWeightMax]: null,
          [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢读书跑步。',
          [HARD_MATCH_KEYS.school]: 'school-bupt',
          [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-cuc'],
          [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [],
          pace: 'Fast',
          values: ['Humor', 'humor', 'Curiosity'],
        },
        allowedSchoolIds,
      ),
    ).toEqual({
      [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
      [HARD_MATCH_KEYS.partnerAgeMin]: 18,
      [HARD_MATCH_KEYS.partnerAgeMax]: 30,
      [HARD_MATCH_KEYS.gender]: '男',
      [HARD_MATCH_KEYS.partnerGenders]: ['男', '女', '非二元'],
      [HARD_MATCH_KEYS.nationality]: '中国',
      [HARD_MATCH_KEYS.partnerNationalities]: [],
      [HARD_MATCH_KEYS.languages]: ['中文'],
      [HARD_MATCH_KEYS.partnerLanguages]: [],
      [HARD_MATCH_KEYS.looks]: '普通人',
      [HARD_MATCH_KEYS.partnerLooks]: ['普通人', '小帅/美', '顶帅/美'],
      [HARD_MATCH_KEYS.heightCm]: 175,
      [HARD_MATCH_KEYS.partnerHeightMin]: 120,
      [HARD_MATCH_KEYS.partnerHeightMax]: 220,
      [HARD_MATCH_KEYS.weightKg]: null,
      [HARD_MATCH_KEYS.partnerWeightMin]: null,
      [HARD_MATCH_KEYS.partnerWeightMax]: null,
      [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢读书跑步。',
      [HARD_MATCH_KEYS.school]: 'school-bupt',
      [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-cuc'],
      [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [],
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
        allowedSchoolIds,
      ),
    ).toThrow(BadRequestException);
  });

  it('returns the current questionnaire with normalized rules and school options', async () => {
    const prisma = {
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'version-1',
          title: 'Current',
          description: null,
          isCurrent: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          questions: [
            {
              id: 'question-1',
              key: 'pace',
              prompt: 'Pace',
              type: QuestionType.SINGLE_SELECT,
              required: true,
              options: [{ value: 'fast', label: 'Fast' }],
              reasonRules: [
                { type: 'EXACT_MATCH', template: 'same', priority: 3 },
              ],
            },
          ],
        }),
      },
      school: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'school-bupt',
            slug: 'bupt-qmul-hainan',
            name: '北京邮电大学玛丽女王海南学院',
          },
          {
            id: 'school-cuc',
            slug: 'cuc-hainan-international',
            name: '中国传媒大学海南国际学院',
          },
        ]),
      },
    };
    const schoolAwareService = new QuestionnaireService(prisma as never);

    await expect(schoolAwareService.getCurrentVersion()).resolves.toMatchObject(
      {
        id: 'version-1',
        schools: [
          {
            id: 'school-bupt',
            slug: 'bupt-qmul-hainan',
            name: '北京邮电大学',
          },
          {
            id: 'school-cuc',
            slug: 'cuc-hainan-international',
            name: '中国传媒大学',
          },
        ],
        questions: [
          {
            key: 'pace',
            options: [{ value: 'fast', label: 'Fast' }],
            reasonRules: [
              { type: 'EXACT_MATCH', template: 'same', priority: 3 },
            ],
          },
        ],
      },
    );
  });

  it('reuses the cached questionnaire payload within the TTL window', async () => {
    const prisma = {
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'version-1',
          title: 'Current',
          description: null,
          isCurrent: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          questions: [],
        }),
      },
      school: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'school-bupt',
            slug: 'bupt-qmul-hainan',
            name: '北京邮电大学玛丽女王海南学院',
          },
        ]),
      },
    };
    const schoolAwareService = new QuestionnaireService(prisma as never);

    await expect(schoolAwareService.getCurrentVersion()).resolves.toMatchObject(
      {
        id: 'version-1',
        schools: [
          { id: 'school-bupt', slug: 'bupt-qmul-hainan', name: '北京邮电大学' },
        ],
      },
    );
    await expect(schoolAwareService.getCurrentVersion()).resolves.toMatchObject(
      {
        id: 'version-1',
        schools: [
          { id: 'school-bupt', slug: 'bupt-qmul-hainan', name: '北京邮电大学' },
        ],
      },
    );

    expect(prisma.questionnaireVersion.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.school.findMany).toHaveBeenCalledTimes(1);
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
          [HARD_MATCH_KEYS.school]: 'school-bupt',
          [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
          [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [],
          values: ['Curiosity', 'Stability', 'Humor'],
        },
        allowedSchoolIds,
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
          [HARD_MATCH_KEYS.school]: 'school-bupt',
          [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
          [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [],
          values: ['Curiosity', 'Stability'],
        },
        allowedSchoolIds,
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

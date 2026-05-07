import { QuestionType } from '../../common/prisma/client';
import { env } from '../../config/env';
import {
  MatchNarrativeInput,
  MatchNarrativeService,
} from './match-narrative.service';

function createNarrativeInput(): MatchNarrativeInput {
  return {
    score: 88.4,
    intentPair: ['BOTH', 'BOTH'],
    heuristicReasons: ['你们都重视稳定与真诚。'],
    sharedSignals: [
      {
        questionKey: 'values',
        prompt: 'Values',
        type: 'MULTI_OVERLAP',
        weight: 2,
        sharedLabels: ['真诚', '稳定'],
        leftAnswerLabels: ['真诚', '稳定'],
        rightAnswerLabels: ['真诚', '稳定'],
      },
    ],
    participantA: {
      intro: '喜欢读书和散步，也愿意认真沟通。',
      questionnaire: [
        {
          key: 'values',
          prompt: 'Values',
          description: null,
          type: QuestionType.MULTI_SELECT,
          weight: 2,
          answerValues: ['honesty', 'stability'],
          answerLabels: ['真诚', '稳定'],
        },
      ],
    },
    participantB: {
      intro: '平时爱看展，也很看重稳定陪伴。',
      questionnaire: [
        {
          key: 'values',
          prompt: 'Values',
          description: null,
          type: QuestionType.MULTI_SELECT,
          weight: 2,
          answerValues: ['honesty', 'stability'],
          answerLabels: ['真诚', '稳定'],
        },
      ],
    },
  };
}

describe('MatchNarrativeService', () => {
  const originalApiKey = env.DEEPSEEK_API_KEY;
  const originalModel = env.DEEPSEEK_MODEL;
  const fetchMock = jest.fn();
  const detailedReason = [
    '你们都把真诚和稳定放在很重要的位置，也都希望关系里的沟通清楚、节奏自然。',
    '这种一致更像是相处方式上的长期相容，不只是兴趣碰巧重合，所以更容易在建立信任、安排日常陪伴和处理分歧时保持舒服而稳的感觉，也更容易把聊天推进到持续而自然的状态。',
  ].join('');

  beforeAll(() => {
    (global as typeof globalThis & { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;
  });

  beforeEach(() => {
    env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    env.DEEPSEEK_MODEL = 'deepseek-v4-flash';
    fetchMock.mockReset();
  });

  afterAll(() => {
    env.DEEPSEEK_API_KEY = originalApiKey;
    env.DEEPSEEK_MODEL = originalModel;
  });

  it('asks DeepSeek for a detailed and anonymized reason', async () => {
    expect(detailedReason.length).toBeGreaterThanOrEqual(100);

    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reason: detailedReason,
                  conversationTopics: [
                    '最近怎么放松',
                    '理想陪伴节奏',
                    '想坚持的小事',
                  ],
                }),
              },
            },
          ],
        }),
    });

    const service = new MatchNarrativeService();
    const result = await service.generateNarrative(createNarrativeInput());

    expect(result).toEqual({
      reason: detailedReason,
      conversationTopics: ['最近怎么放松', '理想陪伴节奏', '想坚持的小事'],
      source: 'DEEPSEEK',
    });

    const fetchCall = fetchMock.mock.calls[0] as [unknown, unknown] | undefined;
    const fetchPayload = fetchCall?.[1] as {
      body?: string;
      headers?: Record<string, string>;
    };
    const requestBody = JSON.parse(fetchPayload.body ?? '{}') as {
      model: string;
      thinking: { type: string };
      temperature: number;
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = requestBody.messages[0]?.content ?? '';

    expect(fetchPayload.headers?.Authorization).toBe(
      'Bearer test-deepseek-key',
    );
    expect(requestBody.model).toBe('deepseek-v4-flash');
    expect(requestBody.thinking).toEqual({ type: 'disabled' });
    expect(requestBody.temperature).toBe(0.9);
    expect(systemMessage).toContain(
      'Write "reason" in about 100 to 140 Chinese characters, and never return fewer than 100 Chinese characters.',
    );
    expect(systemMessage).toContain(
      'Make the writing feel warm, observant, and human instead of corporate or template-like.',
    );
    expect(systemMessage).toContain(
      'Treat self introductions as private background context only.',
    );
    expect(systemMessage).toContain(
      'Never quote, paraphrase, or reveal concrete details from self introductions.',
    );
  });

  it('redacts key-like upstream error details before logging', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            error: {
              message:
                'Authentication Fails, Your api key: ****4595 is invalid',
              type: 'authentication_error',
              code: 'invalid_request_error',
            },
          }),
        ),
    });

    const service = new MatchNarrativeService();
    const warnSpy = jest
      .spyOn(
        (
          service as unknown as {
            logger: { warn: (message: string) => void };
          }
        ).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    const result = await service.generateNarrative(createNarrativeInput());
    const loggedOutput = warnSpy.mock.calls
      .map(([message]) => String(message))
      .join('\n');

    expect(result.source).toBe('RULES_FALLBACK');
    expect(result.reason.length).toBeGreaterThanOrEqual(100);
    expect(result.reason.length).toBeLessThanOrEqual(180);
    expect(loggedOutput).toContain('authentication_error');
    expect(loggedOutput).toContain('invalid_request_error');
    expect(loggedOutput).toContain('api key: [redacted]');
    expect(loggedOutput).not.toContain('****4595');
  });

  it('keeps fallback conversation topics within the public length limit', async () => {
    env.DEEPSEEK_API_KEY = '';

    const service = new MatchNarrativeService();
    const result = await service.generateNarrative({
      ...createNarrativeInput(),
      sharedSignals: [
        {
          questionKey: 'outing_spend_style',
          prompt: '一起出去玩时，花钱方式你更倾向哪一种？',
          type: 'EXACT_MATCH',
          weight: 2,
          sharedLabels: ['不太希望总是只有我出钱（不强求对方全包）'],
          leftAnswerLabels: ['不太希望总是只有我出钱（不强求对方全包）'],
          rightAnswerLabels: ['不太希望总是只有我出钱（不强求对方全包）'],
        },
        {
          questionKey: 'small_happiness',
          prompt: '你最容易在哪 3 种小事里感到关系感？',
          type: 'MULTI_OVERLAP',
          weight: 1,
          sharedLabels: ['临时起意的小冒险'],
          leftAnswerLabels: ['临时起意的小冒险'],
          rightAnswerLabels: ['临时起意的小冒险'],
        },
      ],
    });

    expect(result.source).toBe('RULES_FALLBACK');
    expect(result.conversationTopics).toHaveLength(3);
    expect(result.conversationTopics.every((topic) => topic.length <= 24)).toBe(
      true,
    );
  });
});

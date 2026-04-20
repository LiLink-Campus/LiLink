import { Injectable, Logger } from '@nestjs/common';
import { type QuestionType } from '@prisma/client';
import { type WeeklyIntent } from '@lilink/shared';
import { z } from 'zod';
import { env } from '../../config/env';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const DEEPSEEK_MAX_ATTEMPTS = 3;
const DEEPSEEK_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);

const matchNarrativeSchema = z.object({
  reason: z.string().trim().min(1, 'Reason must not be empty.'),
  conversationTopics: z
    .array(z.string().trim().min(1, 'Topic must not be empty.'))
    .min(3, 'Conversation topics must contain at least 3 items.')
    .transform((topics) => topics.slice(0, 3)),
});

export type MatchNarrativeQuestionAnswer = {
  key: string;
  prompt: string;
  description: string | null;
  type: QuestionType;
  weight: number;
  answerValues: string[];
  answerLabels: string[];
};

export type MatchNarrativeSignal = {
  questionKey: string;
  prompt: string;
  type: 'EXACT_MATCH' | 'MULTI_OVERLAP';
  weight: number;
  sharedLabels: string[];
  leftAnswerLabels: string[];
  rightAnswerLabels: string[];
};

export type MatchNarrativeParticipant = {
  intro: string;
  questionnaire: MatchNarrativeQuestionAnswer[];
};

export type MatchNarrativeInput = {
  score: number;
  intentPair: [WeeklyIntent, WeeklyIntent];
  heuristicReasons: string[];
  sharedSignals: MatchNarrativeSignal[];
  participantA: MatchNarrativeParticipant;
  participantB: MatchNarrativeParticipant;
};

export type MatchNarrativeResult = {
  reason: string;
  conversationTopics: string[];
  source: 'DEEPSEEK' | 'RULES_FALLBACK';
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureSentence(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  return /[。！？.!?]$/.test(trimmedValue) ? trimmedValue : `${trimmedValue}。`;
}

function normalizeTopic(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[。！？]+$/g, '')
    .trim();
}

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

@Injectable()
export class MatchNarrativeService {
  private readonly logger = new Logger(MatchNarrativeService.name);

  async generateNarrative(
    input: MatchNarrativeInput,
  ): Promise<MatchNarrativeResult> {
    const deepSeekResult = await this.generateWithDeepSeek(input);
    if (deepSeekResult) {
      return deepSeekResult;
    }

    return this.buildFallbackNarrative(input);
  }

  private async generateWithDeepSeek(input: MatchNarrativeInput) {
    const apiKey = env.DEEPSEEK_API_KEY.trim();
    if (!apiKey) {
      this.logger.warn(
        'DEEPSEEK_API_KEY is not configured. Falling back to local match narratives.',
      );
      return null;
    }

    let lastErrorMessage: string | null = null;

    for (
      let attemptNumber = 1;
      attemptNumber <= DEEPSEEK_MAX_ATTEMPTS;
      attemptNumber += 1
    ) {
      try {
        const response = await fetch(DEEPSEEK_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
          body: JSON.stringify({
            model: DEEPSEEK_MODEL,
            temperature: 1,
            max_tokens: 700,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: [
                  'Return json only.',
                  'Write in Simplified Chinese.',
                  'Output schema: {"reason":"...", "conversationTopics":["...", "...", "..."]}.',
                  'The "reason" field must be one natural paragraph instead of a list.',
                  'The "conversationTopics" field must contain exactly three concise conversation starters.',
                  'Base the writing strictly on the provided questionnaire structure, shared signals, and self introductions.',
                  'Do not invent identifying facts such as schools, emails, birthdays, or names.',
                ].join(' '),
              },
              {
                role: 'user',
                content: JSON.stringify({
                  matchContext: {
                    score: input.score,
                    intentPair: input.intentPair,
                    heuristicReasons: input.heuristicReasons,
                    sharedSignals: input.sharedSignals,
                  },
                  participantA: input.participantA,
                  participantB: input.participantB,
                }),
              },
            ],
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          lastErrorMessage = `DeepSeek returned ${response.status}: ${errorBody}`;

          if (
            RETRYABLE_STATUS_CODES.has(response.status) &&
            attemptNumber < DEEPSEEK_MAX_ATTEMPTS
          ) {
            await sleep(attemptNumber * 1_000);
            continue;
          }

          break;
        }

        const completion = (await response.json()) as {
          choices?: Array<{
            finish_reason?: string | null;
            message?: { content?: string | null };
          }>;
        };
        const messageContent =
          completion.choices?.[0]?.message?.content?.trim();

        if (!messageContent) {
          lastErrorMessage =
            'DeepSeek returned an empty response body for match narrative.';

          if (attemptNumber < DEEPSEEK_MAX_ATTEMPTS) {
            await sleep(attemptNumber * 1_000);
            continue;
          }

          break;
        }

        const parsedContent = JSON.parse(messageContent) as unknown;
        const validatedNarrative =
          matchNarrativeSchema.safeParse(parsedContent);

        if (!validatedNarrative.success) {
          lastErrorMessage = `DeepSeek narrative JSON validation failed: ${validatedNarrative.error.message}`;

          if (attemptNumber < DEEPSEEK_MAX_ATTEMPTS) {
            await sleep(attemptNumber * 1_000);
            continue;
          }

          break;
        }

        const normalizedTopics = uniqueNonEmpty(
          validatedNarrative.data.conversationTopics.map(normalizeTopic),
        ).slice(0, 3);

        if (normalizedTopics.length < 3) {
          lastErrorMessage =
            'DeepSeek returned fewer than 3 usable conversation topics.';

          if (attemptNumber < DEEPSEEK_MAX_ATTEMPTS) {
            await sleep(attemptNumber * 1_000);
            continue;
          }

          break;
        }

        return {
          reason: ensureSentence(validatedNarrative.data.reason),
          conversationTopics: normalizedTopics,
          source: 'DEEPSEEK' as const,
        };
      } catch (error) {
        lastErrorMessage =
          error instanceof Error ? error.message : 'Unknown DeepSeek error.';

        if (attemptNumber < DEEPSEEK_MAX_ATTEMPTS) {
          await sleep(attemptNumber * 1_000);
          continue;
        }
      }
    }

    if (lastErrorMessage) {
      this.logger.warn(
        `DeepSeek match narrative failed after retries. Falling back to local copy. ${lastErrorMessage}`,
      );
    }

    return null;
  }

  private buildFallbackNarrative(
    input: MatchNarrativeInput,
  ): MatchNarrativeResult {
    const sentences = uniqueNonEmpty([
      ...input.heuristicReasons.map(ensureSentence),
      this.buildIntroSentence(input),
    ]).filter(Boolean);
    const normalizedSentences =
      sentences.length > 0
        ? sentences.slice(0, 3)
        : ['你们在多项关系判断与日常偏好上呈现出稳定的相容趋势。'];

    const conversationTopics = this.buildFallbackTopics(input);

    return {
      reason: normalizedSentences.join(' '),
      conversationTopics,
      source: 'RULES_FALLBACK',
    };
  }

  private buildIntroSentence(input: MatchNarrativeInput) {
    if (!input.participantA.intro || !input.participantB.intro) {
      return '';
    }

    return '你们的自我介绍都比较具体，说明表达方式偏坦诚，也比较容易从日常兴趣切入聊天。';
  }

  private buildFallbackTopics(input: MatchNarrativeInput) {
    const topics = uniqueNonEmpty([
      ...input.sharedSignals
        .sort(
          (leftSignal, rightSignal) => rightSignal.weight - leftSignal.weight,
        )
        .map((signal) => this.buildTopicFromSignal(signal)),
      ...this.buildIntroTopics(input),
      '最近一次让你觉得很放松的周末通常怎么过',
      '你最近在慢慢坚持的一件事是什么',
      '什么样的聊天节奏会让你觉得相处自然',
    ])
      .map(normalizeTopic)
      .filter(Boolean);

    return topics.slice(0, 3);
  }

  private buildTopicFromSignal(signal: MatchNarrativeSignal) {
    const primaryLabel = signal.sharedLabels[0];

    if (primaryLabel) {
      if (signal.type === 'MULTI_OVERLAP') {
        return `围绕「${primaryLabel}」最近有没有一次印象很深的经历`;
      }

      return `你会怎么把「${primaryLabel}」落到真实相处里`;
    }

    return `你会怎么理解「${signal.prompt}」在关系里的分量`;
  }

  private buildIntroTopics(input: MatchNarrativeInput) {
    if (!input.participantA.intro && !input.participantB.intro) {
      return [];
    }

    return [
      '最近最愿意主动投入时间的一件小事是什么',
      '如果把自己的日常状态讲给新朋友听，你会从哪件事讲起',
    ];
  }
}

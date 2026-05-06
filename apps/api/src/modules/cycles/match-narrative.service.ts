import { Injectable, Logger } from '@nestjs/common';
import { type QuestionType } from '../../common/prisma/client';
import { type WeeklyIntent } from '@lilink/shared';
import { z } from 'zod';
import { env } from '../../config/env';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MAX_ATTEMPTS = 5;
const DEEPSEEK_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const MATCH_REASON_MIN_LENGTH = 100;
const MATCH_REASON_TARGET_MAX_LENGTH = 140;
const MATCH_REASON_MAX_LENGTH = 180;
const MATCH_TOPIC_MAX_LENGTH = 24;
const SAFE_ERROR_DETAIL_MAX_LENGTH = 180;
const DEEPSEEK_TEMPERATURE = 0.9;
const DEFAULT_MATCH_REASON =
  '你们在沟通取向、关系节奏和价值判断上的整体方向比较接近，这意味着彼此在建立信任、理解边界和推进交流时，更容易形成自然、清楚而持续的互动基础，也更容易把后续相处落到舒服、平衡且可继续发展的日常节奏里。';
const DEFAULT_CONVERSATION_TOPICS = [
  '最近一次让你觉得很放松的周末通常怎么过',
  '你最近在慢慢坚持的一件事是什么',
  '什么样的聊天节奏会让你觉得相处自然',
];

const matchNarrativeSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(
      MATCH_REASON_MIN_LENGTH,
      'Reason must be detailed enough for the reveal screen.',
    )
    .max(MATCH_REASON_MAX_LENGTH, 'Reason must stay reasonably compact.'),
  conversationTopics: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Topic must not be empty.')
        .max(MATCH_TOPIC_MAX_LENGTH, 'Topic must stay concise.'),
    )
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

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function ensureSentence(value: string) {
  const trimmedValue = compactWhitespace(value);
  if (!trimmedValue) {
    return '';
  }

  return /[。！？.!?]$/.test(trimmedValue) ? trimmedValue : `${trimmedValue}。`;
}

function normalizeTopic(value: string) {
  return compactWhitespace(
    value
      .replace(/\s+/g, ' ')
      .replace(/[。！？]+$/g, '')
      .trim(),
  );
}

function normalizeTopicWithinLimit(value: string) {
  const normalizedTopic = normalizeTopic(value);
  if (!normalizedTopic) {
    return null;
  }

  return normalizedTopic.length <= MATCH_TOPIC_MAX_LENGTH
    ? normalizedTopic
    : null;
}

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function joinSentences(sentences: string[]) {
  return compactWhitespace(sentences.filter(Boolean).join(' '));
}

function stableSelectionIndex(seed: string, candidateCount: number) {
  if (candidateCount <= 1) {
    return 0;
  }

  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % candidateCount;
}

function pickStableVariant(candidates: string[], seedParts: string[]) {
  if (candidates.length === 0) {
    return '';
  }

  const seed = seedParts.join('|');
  return candidates[stableSelectionIndex(seed, candidates.length)] ?? '';
}

function trimReasonToMaxLength(reason: string) {
  const normalizedReason = compactWhitespace(reason);
  if (normalizedReason.length <= MATCH_REASON_MAX_LENGTH) {
    return normalizedReason;
  }

  const trimmedReason = normalizedReason
    .slice(0, MATCH_REASON_MAX_LENGTH)
    .replace(/[，、；：,.!?！？。]+$/g, '')
    .trim();

  return trimmedReason || normalizedReason.slice(0, MATCH_REASON_MAX_LENGTH);
}

function redactSecretsForLog(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/api key\s*[:=]\s*[^\s,;]+/gi, 'api key: [redacted]')
    .replace(/\*{2,}[A-Za-z0-9_-]+/g, '[redacted]');
}

function truncateForLog(value: string) {
  if (value.length <= SAFE_ERROR_DETAIL_MAX_LENGTH) {
    return value;
  }

  return `${value.slice(0, SAFE_ERROR_DETAIL_MAX_LENGTH).trim()}…`;
}

function summarizeDeepSeekErrorBody(rawBody: string) {
  const normalizedBody = compactWhitespace(rawBody);
  if (!normalizedBody) {
    return 'empty_error_body';
  }

  try {
    const parsedBody = JSON.parse(normalizedBody) as {
      error?: {
        message?: unknown;
        type?: unknown;
        code?: unknown;
      };
    };
    const errorPayload = parsedBody?.error;

    if (errorPayload && typeof errorPayload === 'object') {
      const parts: string[] = [];

      if (typeof errorPayload.type === 'string' && errorPayload.type.trim()) {
        parts.push(errorPayload.type.trim());
      }

      if (typeof errorPayload.code === 'string' && errorPayload.code.trim()) {
        parts.push(errorPayload.code.trim());
      }

      if (
        typeof errorPayload.message === 'string' &&
        errorPayload.message.trim()
      ) {
        parts.push(
          redactSecretsForLog(compactWhitespace(errorPayload.message)),
        );
      }

      if (parts.length > 0) {
        return truncateForLog(parts.join(': '));
      }
    }
  } catch {
    // Ignore malformed upstream bodies and fall back to a redacted plain-text summary.
  }

  return truncateForLog(redactSecretsForLog(normalizedBody));
}

@Injectable()
export class MatchNarrativeService {
  private readonly logger = new Logger(MatchNarrativeService.name);

  async generateNarrative(
    input: MatchNarrativeInput,
  ): Promise<MatchNarrativeResult> {
    const deepSeekResult = await this.tryGenerateNarrative(input);
    if (deepSeekResult) {
      return deepSeekResult;
    }

    return this.buildRulesFallbackNarrative(input);
  }

  async tryGenerateNarrative(input: MatchNarrativeInput) {
    return this.generateWithDeepSeek(input);
  }

  buildDefaultNarrative(): MatchNarrativeResult {
    return {
      reason: DEFAULT_MATCH_REASON,
      conversationTopics: [...DEFAULT_CONVERSATION_TOPICS],
      source: 'RULES_FALLBACK',
    };
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
            model: env.DEEPSEEK_MODEL,
            thinking: { type: 'disabled' },
            temperature: DEEPSEEK_TEMPERATURE,
            max_tokens: 700,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: [
                  'Return json only.',
                  'Write in Simplified Chinese.',
                  'Output schema: {"reason":"...", "conversationTopics":["...", "...", "..."]}.',
                  'The "reason" field must be one anonymized natural paragraph instead of a list.',
                  'Write "reason" in about 100 to 140 Chinese characters, and never return fewer than 100 Chinese characters.',
                  'Keep "reason" detailed enough to explain the match, but still compact enough for the reveal screen.',
                  'Make the writing feel warm, observant, and human instead of corporate or template-like.',
                  'Vary sentence openings, rhythm, and phrasing across matches; avoid repetitive stock transitions.',
                  'Focus on the one or two strongest compatibility angles instead of mechanically listing every overlap.',
                  'The "conversationTopics" field must contain exactly three concise conversation starters.',
                  'Each conversation topic must stay short and generic.',
                  'Base the writing strictly on the provided questionnaire structure, shared signals, and self introductions.',
                  'Treat self introductions as private background context only.',
                  'Never quote, paraphrase, or reveal concrete details from self introductions.',
                  'Do not invent or mention identifying facts such as schools, majors, emails, birthdays, ages, heights, genders, names, schedules, or locations.',
                  'Describe only broad compatibility themes and generic conversation directions.',
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
          lastErrorMessage = `DeepSeek returned ${response.status}: ${summarizeDeepSeekErrorBody(await response.text())}`;

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
          validatedNarrative.data.conversationTopics
            .map(normalizeTopicWithinLimit)
            .filter((topic): topic is string => topic !== null),
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

  private buildRulesFallbackNarrative(
    input: MatchNarrativeInput,
  ): MatchNarrativeResult {
    const strongestSharedLabels = input.sharedSignals
      .flatMap((signal) => signal.sharedLabels)
      .filter(Boolean)
      .slice(0, 3);
    const reasonSeedParts = [
      input.intentPair.join('-'),
      ...input.heuristicReasons,
      ...strongestSharedLabels,
    ];
    const seedSentences = uniqueNonEmpty([
      ...input.heuristicReasons.map(ensureSentence),
      this.buildIntroSentence(input),
      this.buildSharedSignalsSentence(input),
      pickStableVariant(
        [
          '从现有信息看，这种一致更像是相处方式和关系期待上的长期相容，而不只是某一个兴趣点的偶然重合，因此更容易在建立信任、安排日常陪伴和推进交流时保持稳定。',
          '这类重合并不是表面兴趣凑巧相同，更像是相处时会自然站到差不多的频道上，所以后续推进关系时往往没那么费力。',
          '这些共识背后反映出的，其实是你们对关系边界、交流方式和日常节奏的判断比较接近，这会让相处更容易稳下来。',
        ],
        reasonSeedParts,
      ),
      pickStableVariant(
        [
          '如果后续聊天继续围绕这些共同在意的方向展开，你们通常会更容易理解彼此的表达方式，也更容易把互动推进到自然、舒服而不过度暴露隐私的节奏里。',
          '只要后续交流还沿着这些共同关注的点慢慢展开，你们大多会比较容易接住对方的表达，也更容易把关系推进到舒服的步调里。',
          '后面如果从这些相近的判断和偏好聊开，彼此通常更容易接得住话，也更容易把互动落到轻松但持续的日常里。',
        ],
        [...reasonSeedParts, 'closer'],
      ),
    ]).filter(Boolean);
    let reason = '';

    for (const sentence of seedSentences) {
      const nextReason = joinSentences([reason, sentence]);
      reason = nextReason;

      if (reason.length >= MATCH_REASON_MIN_LENGTH) {
        if (reason.length > MATCH_REASON_TARGET_MAX_LENGTH) {
          reason = trimReasonToMaxLength(reason);
        }
        break;
      }
    }

    if (reason.length < MATCH_REASON_MIN_LENGTH) {
      reason = joinSentences([
        reason,
        '整体来看，你们在沟通取向、关系节奏和价值判断上的重合度都比较高，这会让后续相处更容易形成稳定、清楚而有持续性的互动基础。',
      ]);
    }

    reason = ensureSentence(trimReasonToMaxLength(reason));

    const conversationTopics = this.buildFallbackTopics(input);

    return {
      reason,
      conversationTopics,
      source: 'RULES_FALLBACK',
    };
  }

  private buildIntroSentence(input: MatchNarrativeInput) {
    if (!input.participantA.intro || !input.participantB.intro) {
      return '';
    }

    return pickStableVariant(
      [
        '你们的自我介绍都比较具体，说明表达方式偏坦诚，也比较容易从日常兴趣切入聊天。',
        '从自我介绍里能看出来，你们都不是特别敷衍的人，通常更愿意把自己真实的一面慢慢讲出来。',
        '你们在自我介绍里的表达都比较有画面感，这通常意味着聊天时更容易自然地展开，而不是只能停留在客套层面。',
      ],
      [input.participantA.intro, input.participantB.intro],
    );
  }

  private buildSharedSignalsSentence(input: MatchNarrativeInput) {
    const primarySignals = input.sharedSignals
      .map((signal) => signal.sharedLabels[0])
      .filter((label): label is string => Boolean(label))
      .slice(0, 2);

    if (primarySignals.length === 0) {
      return pickStableVariant(
        [
          '你们在多项价值判断和关系偏好上的方向比较接近，因此相互理解和持续交流的空间会更大。',
          '即使不看特别具体的细节，你们在关系里的判断方向也比较一致，这会让相处时的误读少一些。',
          '整体看下来，你们对于亲密关系里什么重要、什么舒服，判断都比较靠近，这种靠近通常比表面共同点更有用。',
        ],
        [input.intentPair.join('-'), String(input.score)],
      );
    }

    return pickStableVariant(
      [
        `你们都比较看重${primarySignals.join('和')}这类核心感受，这意味着在建立信任、理解边界和确认相处节奏时，更容易形成稳定而清楚的共识。`,
        `你们都把${primarySignals.join('和')}放在更靠前的位置，所以很多关于关系怎么往前走的判断，往往更容易站到同一边。`,
        `在你们都在意的东西里，${primarySignals.join('和')}很靠前，这会让很多相处上的分寸感更容易自然对齐。`,
      ],
      primarySignals,
    );
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
      .map(normalizeTopicWithinLimit)
      .filter((topic): topic is string => topic !== null);

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

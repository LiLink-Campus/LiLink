import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';

export const QUESTION_REASON_RULE_TYPES = [
  'EXACT_MATCH',
  'MULTI_OVERLAP',
] as const;

export type QuestionReasonRuleType =
  (typeof QUESTION_REASON_RULE_TYPES)[number];

export type QuestionOption = {
  value: string;
  label: string;
};

export type ExactMatchReasonRule = {
  type: 'EXACT_MATCH';
  template: string;
  priority?: number;
};

export type MultiOverlapReasonRule = {
  type: 'MULTI_OVERLAP';
  template: string;
  priority?: number;
  minOverlap?: number;
  maxLabels?: number;
};

export type QuestionReasonRule = ExactMatchReasonRule | MultiOverlapReasonRule;

type RawQuestionReasonRule = {
  type?: unknown;
  template?: unknown;
  priority?: unknown;
  minOverlap?: unknown;
  maxLabels?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readNonNegativeInteger(value: unknown) {
  if (value == null) {
    return null;
  }

  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new BadRequestException(
      'Reason rule numeric settings must be non-negative integers.',
    );
  }

  return Number(value);
}

export function normalizeQuestionOptions(
  rawOptions: unknown,
): QuestionOption[] {
  if (rawOptions == null) {
    return [];
  }

  if (!Array.isArray(rawOptions)) {
    throw new BadRequestException('Question options must be an array.');
  }

  const normalizedOptions = rawOptions.map((option, index) => {
    if (typeof option === 'string') {
      const normalizedLabel = readTrimmedString(option);
      if (!normalizedLabel) {
        throw new BadRequestException(
          `Question option #${index + 1} must not be empty.`,
        );
      }

      return {
        value: normalizedLabel,
        label: normalizedLabel,
      } satisfies QuestionOption;
    }

    if (!isRecord(option)) {
      throw new BadRequestException(
        `Question option #${index + 1} must be a string or object.`,
      );
    }

    const normalizedLabel = readTrimmedString(option.label);
    if (!normalizedLabel) {
      throw new BadRequestException(
        `Question option #${index + 1} must define a label.`,
      );
    }

    const normalizedValue = readTrimmedString(option.value) ?? normalizedLabel;

    return {
      value: normalizedValue,
      label: normalizedLabel,
    } satisfies QuestionOption;
  });

  const duplicateValues = new Set<string>();
  const seenValues = new Set<string>();

  normalizedOptions.forEach((option) => {
    if (seenValues.has(option.value)) {
      duplicateValues.add(option.value);
      return;
    }

    seenValues.add(option.value);
  });

  if (duplicateValues.size > 0) {
    throw new BadRequestException(
      `Question options contain duplicate values: ${[...duplicateValues].join(', ')}.`,
    );
  }

  return normalizedOptions;
}

export function resolveQuestionOptionValue(
  rawAnswer: string,
  options: QuestionOption[],
) {
  const normalizedAnswer = rawAnswer.trim();
  if (!normalizedAnswer) {
    return null;
  }

  const exactMatch = options.find(
    (option) => option.value === normalizedAnswer,
  );
  if (exactMatch) {
    return exactMatch.value;
  }

  const labelMatches = options.filter(
    (option) => option.label === normalizedAnswer,
  );

  if (labelMatches.length === 1) {
    return labelMatches[0].value;
  }

  return null;
}

export function labelForQuestionValue(
  value: string,
  options: QuestionOption[],
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function normalizeQuestionReasonRules(
  rawRules: unknown,
): QuestionReasonRule[] {
  if (rawRules == null) {
    return [];
  }

  if (!Array.isArray(rawRules)) {
    throw new BadRequestException('Question reason rules must be an array.');
  }

  return rawRules.map((rule, index) => {
    if (!isRecord(rule)) {
      throw new BadRequestException(
        `Reason rule #${index + 1} must be an object.`,
      );
    }

    const rawRule = rule as RawQuestionReasonRule;
    const type = readTrimmedString(rawRule.type);
    const template = readTrimmedString(rawRule.template);

    if (!type || !QUESTION_REASON_RULE_TYPES.includes(type as never)) {
      throw new BadRequestException(
        `Reason rule #${index + 1} has an unsupported type.`,
      );
    }

    if (!template) {
      throw new BadRequestException(
        `Reason rule #${index + 1} must define a template.`,
      );
    }

    const priority = readNonNegativeInteger(rawRule.priority) ?? undefined;

    if (type === 'EXACT_MATCH') {
      return {
        type: 'EXACT_MATCH',
        template,
        priority,
      } satisfies ExactMatchReasonRule;
    }

    return {
      type: 'MULTI_OVERLAP',
      template,
      priority,
      minOverlap: readNonNegativeInteger(rawRule.minOverlap) ?? undefined,
      maxLabels: readNonNegativeInteger(rawRule.maxLabels) ?? undefined,
    } satisfies MultiOverlapReasonRule;
  });
}

export function renderReasonTemplate(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, key: string) => {
      return values[key] == null ? '' : String(values[key]);
    },
  );
}

type NormalizableQuestion = {
  prompt: string;
  type: QuestionType;
  selectionLimit?: number | null;
  options: unknown;
};

export function normalizeQuestionAnswer(
  question: NormalizableQuestion,
  rawAnswer: unknown,
  options: { invalidAsNull?: boolean } = {},
) {
  const availableOptions = normalizeQuestionOptions(question.options);

  if (
    question.type === QuestionType.SINGLE_SELECT ||
    question.type === QuestionType.SCALE
  ) {
    if (typeof rawAnswer !== 'string') {
      if (options.invalidAsNull) {
        return null;
      }

      throw new BadRequestException(
        `Question "${question.prompt}" must be answered with a single option.`,
      );
    }

    const trimmedAnswer = rawAnswer.trim();
    if (!trimmedAnswer) {
      return null;
    }

    const normalizedValue =
      availableOptions.length > 0
        ? resolveQuestionOptionValue(trimmedAnswer, availableOptions)
        : trimmedAnswer;

    if (!normalizedValue) {
      if (options.invalidAsNull) {
        return null;
      }

      throw new BadRequestException(
        `Question "${question.prompt}" contains an invalid option.`,
      );
    }

    return normalizedValue;
  }

  if (question.type === QuestionType.MULTI_SELECT) {
    if (!Array.isArray(rawAnswer)) {
      if (options.invalidAsNull) {
        return null;
      }

      throw new BadRequestException(
        `Question "${question.prompt}" must be answered with a list of options.`,
      );
    }

    const resolvedValues = rawAnswer.map((value) => {
      if (typeof value !== 'string') {
        if (options.invalidAsNull) {
          return null;
        }

        throw new BadRequestException(
          `Question "${question.prompt}" contains an invalid option.`,
        );
      }

      const normalizedValue =
        availableOptions.length > 0
          ? resolveQuestionOptionValue(value, availableOptions)
          : readTrimmedString(value);

      if (!normalizedValue && !options.invalidAsNull) {
        throw new BadRequestException(
          `Question "${question.prompt}" contains an invalid option.`,
        );
      }

      return normalizedValue;
    });

    const normalizedValues = [
      ...new Set(
        resolvedValues.filter((value): value is string => Boolean(value)),
      ),
    ];

    if (normalizedValues.length === 0) {
      return null;
    }

    if (
      question.selectionLimit != null &&
      normalizedValues.length > question.selectionLimit
    ) {
      if (options.invalidAsNull) {
        return null;
      }

      throw new BadRequestException(
        `Question "${question.prompt}" allows at most ${question.selectionLimit} selections.`,
      );
    }

    return normalizedValues;
  }

  if (options.invalidAsNull) {
    return null;
  }

  throw new BadRequestException(
    `Question "${question.prompt}" has an unsupported type.`,
  );
}

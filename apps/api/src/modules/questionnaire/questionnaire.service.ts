import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type QuestionnaireQuestion = {
  key: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  options: Prisma.JsonValue | null;
};

@Injectable()
export class QuestionnaireService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentVersion() {
    const questionnaire = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!questionnaire) {
      throw new NotFoundException(
        'Current questionnaire version is not configured.',
      );
    }

    return questionnaire;
  }

  validateAnswers(
    questions: QuestionnaireQuestion[],
    rawAnswers: Record<string, unknown>,
  ) {
    const normalizedAnswers: Record<string, Prisma.InputJsonValue> = {};
    const questionsByKey = new Map(
      questions.map((question) => [question.key, question]),
    );

    for (const answerKey of Object.keys(rawAnswers)) {
      if (!questionsByKey.has(answerKey)) {
        throw new BadRequestException(
          `Unexpected questionnaire field: ${answerKey}.`,
        );
      }
    }

    for (const question of questions) {
      const rawAnswer = rawAnswers[question.key];

      if (rawAnswer == null) {
        if (question.required) {
          throw new BadRequestException(
            `Question "${question.prompt}" is required.`,
          );
        }

        continue;
      }

      const normalizedAnswer = this.normalizeAnswer(question, rawAnswer);

      if (normalizedAnswer == null) {
        if (question.required) {
          throw new BadRequestException(
            `Question "${question.prompt}" is required.`,
          );
        }

        continue;
      }

      normalizedAnswers[question.key] = normalizedAnswer;
    }

    return normalizedAnswers;
  }

  private normalizeAnswer(
    question: QuestionnaireQuestion,
    rawAnswer: unknown,
  ): Prisma.InputJsonValue | null {
    const availableOptions = this.normalizeOptions(question.options);

    if (
      question.type === QuestionType.SINGLE_SELECT ||
      question.type === QuestionType.SCALE
    ) {
      if (typeof rawAnswer !== 'string') {
        throw new BadRequestException(
          `Question "${question.prompt}" must be answered with a single option.`,
        );
      }

      const normalizedValue = rawAnswer.trim();
      if (!normalizedValue) {
        return null;
      }

      if (
        availableOptions.length > 0 &&
        !availableOptions.includes(normalizedValue)
      ) {
        throw new BadRequestException(
          `Question "${question.prompt}" contains an invalid option.`,
        );
      }

      return normalizedValue;
    }

    if (question.type === QuestionType.MULTI_SELECT) {
      if (!Array.isArray(rawAnswer)) {
        throw new BadRequestException(
          `Question "${question.prompt}" must be answered with a list of options.`,
        );
      }

      const normalizedValues = [
        ...new Set(
          rawAnswer
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ];

      if (normalizedValues.length === 0) {
        return null;
      }

      if (
        availableOptions.length > 0 &&
        normalizedValues.some((value) => !availableOptions.includes(value))
      ) {
        throw new BadRequestException(
          `Question "${question.prompt}" contains an invalid option.`,
        );
      }

      return normalizedValues;
    }

    if (typeof rawAnswer !== 'string') {
      throw new BadRequestException(
        `Question "${question.prompt}" must be answered with text.`,
      );
    }

    const normalizedText = rawAnswer.trim();
    return normalizedText || null;
  }

  private normalizeOptions(options: Prisma.JsonValue | null) {
    if (!Array.isArray(options)) {
      return [];
    }

    return options.filter(
      (option): option is string => typeof option === 'string',
    );
  }
}

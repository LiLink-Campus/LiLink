import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, QuestionType } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';

export type QuestionnaireRevisionQuestion = {
  key: string;
  prompt: string;
  description: string | null;
  type: QuestionType;
  required: boolean;
  selectionLimit: number | null;
  options: Prisma.InputJsonValue | typeof Prisma.DbNull;
  order: number;
  weight: number;
};

export type CurrentQuestionnaireForMutation = {
  id: string;
  title: string;
  description: string | null;
  questions: Array<{
    id: string;
    key: string;
    prompt: string;
    description: string | null;
    type: QuestionType;
    required: boolean;
    selectionLimit: number | null;
    options: Prisma.JsonValue | null;
    order: number;
    weight: number;
  }>;
};

function toNullableJsonInput(value: Prisma.JsonValue | null) {
  return value == null
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue | typeof Prisma.DbNull);
}

@Injectable()
export class AdminQuestionnaireRevisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionnaireService: QuestionnaireService,
  ) {}

  cloneQuestionForRevision(
    question: CurrentQuestionnaireForMutation['questions'][number],
  ): QuestionnaireRevisionQuestion {
    return {
      key: question.key,
      prompt: question.prompt,
      description: question.description,
      type: question.type,
      required: question.required,
      selectionLimit: question.selectionLimit,
      options: toNullableJsonInput(question.options),
      order: question.order,
      weight: question.weight,
    };
  }

  async createQuestionnaireRevision(
    currentVersion: CurrentQuestionnaireForMutation,
    questions: QuestionnaireRevisionQuestion[],
  ) {
    try {
      const revision = await this.prisma.$transaction(async (tx) => {
        await tx.questionnaireVersion.updateMany({
          where: {
            id: currentVersion.id,
            isCurrent: true,
          },
          data: {
            isCurrent: false,
          },
        });

        return tx.questionnaireVersion.create({
          data: {
            title: currentVersion.title,
            description: currentVersion.description,
            isCurrent: true,
            questions: {
              create: questions.map((question) => ({
                key: question.key,
                prompt: question.prompt,
                description: question.description,
                type: question.type,
                required: question.required,
                selectionLimit: question.selectionLimit,
                options: question.options,
                order: question.order,
                weight: question.weight,
              })),
            },
          },
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        });
      });

      // A new revision flips isCurrent, so drop the public questionnaire cache
      // to surface the change immediately instead of waiting out the long TTL.
      this.questionnaireService.invalidateCurrentQuestionnaireCache();

      return revision;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Questionnaire was updated concurrently. Please retry.',
        );
      }

      throw error;
    }
  }
}

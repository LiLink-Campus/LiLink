import { LIFESTYLE_QUESTIONS, isLifestyleQuestion } from '@lilink/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeQuestionOptions } from '../questionnaire/questionnaire-config';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { AdminAuditService } from './admin-audit.service';
import { ReorderQuestionsDto, UpsertQuestionDto } from './dto';
import {
  AdminQuestionnaireRevisionService,
  type QuestionnaireRevisionQuestion,
} from './admin-questionnaire-revision.service';

@Injectable()
export class AdminQuestionnaireService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
    private readonly questionnaireService: QuestionnaireService,
    private readonly publication: AdminQuestionnaireRevisionService,
  ) {}

  async getQuestions() {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!version) {
      const created = await this.prisma.questionnaireVersion.create({
        data: {
          title: 'Default Questionnaire',
          isCurrent: true,
        },
        include: { questions: true },
      });
      this.questionnaireService.invalidateCurrentQuestionnaireCache();
      return {
        ...created,
        questions: created.questions.map((question) => ({
          ...question,
          options: normalizeQuestionOptions(question.options),
        })),
      };
    }

    return {
      ...version,
      questions: version.questions.map((question) => ({
        ...question,
        options: normalizeQuestionOptions(question.options),
      })),
    };
  }

  async upsertQuestion(input: UpsertQuestionDto, adminActorId: string) {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('No active questionnaire version found.');
    }

    const normalizedOptions = this.normalizeQuestionOptions(input.options);
    const selectionLimit = this.normalizeSelectionLimit(
      input.type,
      normalizedOptions.length,
      input.selectionLimit,
    );
    const lifestyle = LIFESTYLE_QUESTIONS.find(
      (question) => question.key === input.key,
    );
    if (
      lifestyle &&
      (input.type !== 'SINGLE_SELECT' ||
        normalizedOptions.length !== lifestyle.options.length ||
        !lifestyle.options.every((value) =>
          normalizedOptions.some((option) => option.value === value),
        ))
    ) {
      throw new BadRequestException(
        '生活习惯题用于匹配筛选，必须保留单选题型及全部标准选项；可修改显示文案。',
      );
    }
    const nextQuestionData = {
      key: input.key,
      prompt: input.prompt,
      description: null,
      type: input.type,
      required: true,
      selectionLimit,
      options: normalizedOptions as Prisma.InputJsonValue,
      order: input.order,
      weight: input.weight ?? 1,
    } satisfies QuestionnaireRevisionQuestion;

    if (input.questionId) {
      const existingQuestion = version.questions.find(
        (question) => question.id === input.questionId,
      );

      if (!existingQuestion) {
        throw new NotFoundException('Question not found.');
      }

      if (existingQuestion.key !== input.key) {
        throw new BadRequestException(
          'Question key cannot be changed after creation.',
        );
      }

      const nextVersion = await this.publication.createQuestionnaireRevision(
        version,
        version.questions.map((question) =>
          question.id === input.questionId
            ? {
                ...nextQuestionData,
                description: existingQuestion.description,
                required: existingQuestion.required,
              }
            : this.publication.cloneQuestionForRevision(question),
        ),
      );
      const question = nextVersion.questions.find(
        (candidate) => candidate.key === input.key,
      );

      if (!question) {
        throw new NotFoundException('Question not found after revision.');
      }

      await this.adminAuditService.write(adminActorId, 'question.updated', {
        questionId: question.id,
        key: question.key,
        type: question.type,
      });

      return question;
    }

    if (version.questions.some((question) => question.key === input.key)) {
      throw new BadRequestException(
        `Question key "${input.key}" already exists in the current questionnaire.`,
      );
    }

    const nextVersion = await this.publication.createQuestionnaireRevision(
      version,
      [
        ...version.questions.map((question) =>
          this.publication.cloneQuestionForRevision(question),
        ),
        nextQuestionData,
      ],
    );
    const question = nextVersion.questions.find(
      (candidate) => candidate.key === input.key,
    );

    if (!question) {
      throw new NotFoundException('Question not found after revision.');
    }

    await this.adminAuditService.write(adminActorId, 'question.created', {
      questionId: question.id,
      key: question.key,
      type: question.type,
    });

    return question;
  }

  async reorderQuestions(input: ReorderQuestionsDto, adminActorId: string) {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('No active questionnaire version found.');
    }

    const currentQuestionsById = new Map(
      version.questions.map((question) => [question.id, question]),
    );
    const uniqueQuestionIds = new Set(input.questionIds);

    if (
      input.questionIds.length !== version.questions.length ||
      uniqueQuestionIds.size !== version.questions.length
    ) {
      throw new BadRequestException(
        'Question order must include every current question exactly once.',
      );
    }

    if (
      input.questionIds.some(
        (questionId) => !currentQuestionsById.has(questionId),
      )
    ) {
      throw new NotFoundException('Some questions were not found.');
    }

    await this.publication.createQuestionnaireRevision(
      version,
      input.questionIds.map((questionId, index) => ({
        ...this.publication.cloneQuestionForRevision(
          currentQuestionsById.get(questionId)!,
        ),
        order: index + 1,
      })),
    );

    await this.adminAuditService.write(adminActorId, 'question.reordered', {
      questionIds: input.questionIds,
    });

    return { ok: true };
  }

  async deleteQuestion(questionId: string, adminActorId: string) {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });
    const question = version?.questions.find(
      (candidate) => candidate.id === questionId,
    );

    if (!version || !question) {
      throw new NotFoundException('Question not found.');
    }

    if (isLifestyleQuestion(question.key)) {
      throw new BadRequestException('生活习惯题用于匹配筛选，不能删除。');
    }

    await this.publication.createQuestionnaireRevision(
      version,
      version.questions
        .filter((candidate) => candidate.id !== questionId)
        .map((candidate) =>
          this.publication.cloneQuestionForRevision(candidate),
        ),
    );

    await this.adminAuditService.write(adminActorId, 'question.deleted', {
      questionId,
      key: question.key,
    });
    return { ok: true };
  }

  private normalizeQuestionOptions(
    inputOptions?: UpsertQuestionDto['options'],
  ) {
    const normalizedOptions = normalizeQuestionOptions(inputOptions ?? []);

    if (normalizedOptions.length < 2) {
      throw new BadRequestException(
        'Selectable questions must define at least two options.',
      );
    }

    return normalizedOptions;
  }

  private normalizeSelectionLimit(
    questionType: UpsertQuestionDto['type'],
    optionCount: number,
    selectionLimit?: number,
  ) {
    if (questionType !== 'MULTI_SELECT') {
      if (selectionLimit != null) {
        throw new BadRequestException(
          'Selection limit is only supported for multi-select questions.',
        );
      }

      return null;
    }

    if (selectionLimit == null) {
      return null;
    }

    if (selectionLimit > optionCount) {
      throw new BadRequestException(
        'Selection limit cannot be greater than the number of options.',
      );
    }

    return selectionLimit;
  }
}

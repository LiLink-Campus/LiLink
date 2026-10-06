import { validateQuestionnaireAnswers } from '../questionnaire/questionnaire.service';
import {
  effectiveMatchingAnswers,
  hasActiveVip,
  HARD_MATCH_KEYS,
  parseHardMatchAnswers,
} from '@lilink/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isWeeklyIntent, type WeeklyIntent } from '@lilink/shared';
import {
  prepareQuestions,
  type EligibleParticipant,
  type PreparedQuestion,
  type QuestionnaireQuestion,
} from './matching.engine';
import { CYCLE_PROCESSING_INCLUDE } from './cycle-processing';

@Injectable()
export class CycleMatchingInputService {
  constructor(private readonly prisma: PrismaService) {}
  loadCycleForProcessing(cycleId: string) {
    return this.prisma.matchCycle.findUnique({
      where: { id: cycleId },
      include: CYCLE_PROCESSING_INCLUDE,
    });
  }

  toEligibleParticipants(
    participations: Array<{
      intent: WeeklyIntent | null;
      user: {
        id: string;
        displayName: string | null;
        school?: { id: string } | null;
        vipActivations?: Array<{
          expiresAt: Date | null;
          revokedAt: Date | null;
        }>;
        questionnaireResponse: {
          versionId?: string | null;
          draftAnswers?: Prisma.JsonValue;
          answers: Prisma.JsonValue;
          submittedAt: Date | null;
        } | null;
      };
    }>,
    questionnaire: { id: string; questions: QuestionnaireQuestion[] },
    allowedSchoolIds: string[],
  ): EligibleParticipant[] {
    return participations
      .map((entry): EligibleParticipant | null => {
        const { user } = entry;
        if (
          !user.questionnaireResponse ||
          user.questionnaireResponse.submittedAt == null ||
          user.questionnaireResponse.versionId !== questionnaire.id ||
          user.questionnaireResponse.draftAnswers != null
        ) {
          return null;
        }

        // Defense in depth — the SQL filter already excludes intent=null,
        // but if anything ever bypasses it (eg. raw queries) we still drop
        // the row instead of silently treating it as compatible with all.
        if (!isWeeklyIntent(entry.intent)) {
          return null;
        }

        const answers: Record<string, unknown> = {
          ...((user.questionnaireResponse.answers ?? {}) as Record<
            string,
            unknown
          >),
          [HARD_MATCH_KEYS.school]: user.school?.id ?? '',
        };
        try {
          validateQuestionnaireAnswers(
            questionnaire.questions,
            answers,
            allowedSchoolIds,
          );
        } catch (error) {
          if (error instanceof BadRequestException) return null;
          throw error;
        }
        const vipActive = hasActiveVip(user.vipActivations);
        const hardMatchAnswers = parseHardMatchAnswers(
          effectiveMatchingAnswers(answers, vipActive),
        );

        if (!hardMatchAnswers) {
          return null;
        }

        return {
          id: user.id,
          displayName: user.displayName,
          questionnaireVersionId: user.questionnaireResponse.versionId ?? null,
          vipActive,
          hardMatchAnswers,
          answers,
          intent: entry.intent,
        };
      })
      .filter(
        (participant): participant is EligibleParticipant =>
          participant !== null,
      );
  }

  async loadQuestionnairesByVersionId(
    participants: EligibleParticipant[],
    currentQuestionnaire?: {
      id: string;
      questions: QuestionnaireQuestion[];
    } | null,
  ) {
    const versionIds = [
      ...new Set(
        participants
          .map((participant) => participant.questionnaireVersionId)
          .filter((versionId): versionId is string => Boolean(versionId)),
      ),
    ];
    const questionnairesByVersionId = new Map<string, PreparedQuestion[]>();

    if (currentQuestionnaire) {
      questionnairesByVersionId.set(
        currentQuestionnaire.id,
        prepareQuestions(currentQuestionnaire.questions),
      );
    }

    const missingVersionIds = versionIds.filter(
      (versionId) => !questionnairesByVersionId.has(versionId),
    );

    if (missingVersionIds.length === 0) {
      return questionnairesByVersionId;
    }

    const questionnaireVersions =
      await this.prisma.questionnaireVersion.findMany({
        where: {
          id: { in: missingVersionIds },
        },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      });

    for (const questionnaireVersion of questionnaireVersions) {
      questionnairesByVersionId.set(
        questionnaireVersion.id,
        prepareQuestions(questionnaireVersion.questions),
      );
    }

    return questionnairesByVersionId;
  }
}

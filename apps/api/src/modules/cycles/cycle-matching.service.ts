import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type EligibleParticipant,
  type PreparedQuestion,
  type QuestionnaireQuestion,
} from './matching.engine';
import { runMatching } from './matching.executor';
import { ACTIVE_OPTED_IN_PARTICIPATION_FILTER } from './cycle-processing';
import { CycleMatchingInputService } from './cycle-matching-input.service';
import { CycleMatchingHistoryService } from './cycle-matching-history.service';
@Injectable()
export class CycleMatchingService {
  private readonly logger = new Logger(CycleMatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly input: CycleMatchingInputService,
    private readonly history: CycleMatchingHistoryService,
  ) {}
  async previewCycle(cycleId: string) {
    const [cycle, questionnaire] = await Promise.all([
      this.prisma.matchCycle.findUnique({
        where: { id: cycleId },
        include: {
          participations: {
            where: ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
            select: {
              intent: true,
              user: {
                select: {
                  id: true,
                  displayName: true,
                  vipActivations: {
                    select: { expiresAt: true, revokedAt: true },
                  },
                  questionnaireResponse: {
                    select: {
                      versionId: true,
                      draftAnswers: true,
                      answers: true,
                      submittedAt: true,
                    },
                  },
                  school: { select: { id: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.questionnaireVersion.findFirst({
        where: { isCurrent: true },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      }),
    ]);

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (!questionnaire) {
      return {
        cycleId,
        message: 'Current questionnaire is not configured.',
        candidates: [],
        suggestedPairs: [],
        unmatchedUserIds: [],
      };
    }

    const participants = this.input.toEligibleParticipants(
      cycle.participations,
      questionnaire,
      (await this.prisma.school.findMany({ select: { id: true } })).map(
        (school) => school.id,
      ),
    );
    const questionnairesByVersionId =
      await this.input.loadQuestionnairesByVersionId(
        participants,
        questionnaire,
      );
    const { candidates, candidateCount, selectedPairs } =
      await this.calculatePairs(
        participants,
        questionnaire.questions,
        cycle.revealAt,
        cycle.id,
        questionnairesByVersionId,
      );
    const matchedUserIds = new Set(
      selectedPairs.flatMap((pair) => [pair.left.id, pair.right.id]),
    );

    return {
      cycleId,
      totalCandidateCount: candidateCount,
      candidates: candidates.slice(0, 20).map((pair) => ({
        leftUserId: pair.left.id,
        rightUserId: pair.right.id,
        leftDisplayName: pair.left.displayName,
        rightDisplayName: pair.right.displayName,
        score: pair.score,
      })),
      suggestedPairs: selectedPairs.map((pair) => ({
        leftUserId: pair.left.id,
        rightUserId: pair.right.id,
        leftDisplayName: pair.left.displayName,
        rightDisplayName: pair.right.displayName,
        score: pair.score,
      })),
      unmatchedUserIds: participants
        .filter((participant) => !matchedUserIds.has(participant.id))
        .map((participant) => participant.id),
    };
  }

  async calculatePairs(
    participants: EligibleParticipant[],
    questions: QuestionnaireQuestion[],
    revealAt: Date,
    currentCycleId?: string,
    questionnairesByVersionId = new Map<string, PreparedQuestion[]>(),
  ) {
    const participantIds = participants.map((participant) => participant.id);
    if (participants.length < 2) {
      return {
        candidateCount: 0,
        candidates: [],
        selectedPairs: [],
      };
    }

    const [
      blocks,
      historicalPairKeys,
      unmatchedStreaks,
      firstCycleParticipantIds,
    ] = await Promise.all([
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: { in: participantIds } },
            { blockedId: { in: participantIds } },
          ],
        },
      }),
      this.history.loadHistoricalPairKeys(participantIds, currentCycleId),
      this.history.loadUnmatchedStreaks(
        participantIds,
        revealAt,
        currentCycleId,
      ),
      this.history.loadFirstCycleParticipantIds(
        participantIds,
        revealAt,
        currentCycleId,
      ),
    ]);
    const blockedPairKeys = new Set(
      blocks.map((block) =>
        this.history.createPairKey(block.blockerId, block.blockedId),
      ),
    );

    const result = await runMatching({
      participants,
      questions,
      revealAt,
      questionnairesByVersionId,
      blockedPairKeys,
      historicalPairKeys,
      unmatchedStreaks,
      firstCycleParticipantIds,
    });
    this.logger.log(
      `Cycle ${currentCycleId ?? 'preview'} matching considered ${participants.length} participant(s), kept ${result.candidateCount} candidate pair(s), selected ${result.selectedPairs.length} pair(s).`,
    );
    return result;
  }
}

import {
  effectiveMatchingAnswers,
  HARD_MATCH_KEYS,
  hasActiveVip,
  isWeeklyIntent,
  parseHardMatchAnswers,
  readQuestionnaireOneLiner,
} from '@lilink/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ActivationService } from '../activation/activation.service';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { ToggleParticipationDto } from './dto';
import { MatchEstimateService } from './match-estimate.service';
import { isRecord } from './questionnaire-draft';

@Injectable()
export class AccountParticipationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionnaireService: QuestionnaireService,
    @Optional() private readonly matchEstimateService?: MatchEstimateService,
    @Optional() private readonly activationService?: ActivationService,
  ) {}
  async setParticipation(userId: string, input: ToggleParticipationDto) {
    const cycle = await this.prisma.matchCycle.findFirst({
      where: { status: { in: ['OPEN', 'PREPARING', 'REVEAL_READY'] } },
      orderBy: { revealAt: 'asc' },
    });

    if (!cycle) {
      throw new NotFoundException('No active cycle is currently available.');
    }

    if (cycle.status !== 'OPEN') {
      throw new BadRequestException(
        'Participation can no longer be changed for the current cycle.',
      );
    }

    if (new Date() >= cycle.participationDeadline) {
      throw new BadRequestException(
        'Participation can no longer be changed after the deadline.',
      );
    }

    if (input.optIn) {
      // Strict contract: opting in MUST come with an intent. The DTO already
      // enforces this, but we re-check here for defense in depth so that any
      // bypass of class-validator still fails loudly.
      if (!isWeeklyIntent(input.intent)) {
        throw new BadRequestException(
          'A weekly intent (FRIEND, DATE, or BOTH) is required when opting into a cycle.',
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { status: true, schoolId: true },
      });

      if (!user) {
        throw new NotFoundException('User not found.');
      }

      if (user.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Suspended or pending accounts cannot opt in to matching.',
        );
      }

      await this.assertQuestionnaireReadyForOptIn(userId, user.schoolId);
    }

    const nextStatus = input.optIn ? 'OPTED_IN' : 'OPTED_OUT';
    const nextIntent = input.optIn ? input.intent : null;

    const participation = await this.prisma.cycleParticipation.upsert({
      where: {
        cycleId_userId: {
          cycleId: cycle.id,
          userId,
        },
      },
      create: {
        cycleId: cycle.id,
        userId,
        status: nextStatus,
        intent: nextIntent,
        optedInAt: input.optIn ? new Date() : null,
      },
      update: {
        status: nextStatus,
        intent: nextIntent,
        optedInAt: input.optIn ? new Date() : null,
      },
    });

    if (input.optIn) {
      // Stable "ever opted in" signal used for merchant-promotion activation
      // gating: written once on the first opt-in and never cleared on opt-out
      // (unlike CycleParticipation.optedInAt). The null guard in updateMany
      // keeps it idempotent across repeated opt-ins.
      await this.prisma.user.updateMany({
        where: { id: userId, firstOptedInAt: null },
        data: { firstOptedInAt: new Date() },
      });
      // Opting in is the second activation signal; try to grant coupons (a
      // no-op until the questionnaire is also submitted; never throws here).
      await this.activationService?.tryGrantCoupons(userId);
    }

    await this.createAuditLog(userId, 'participation.updated', {
      cycleId: cycle.id,
      status: participation.status,
      intent: participation.intent,
    });

    this.matchEstimateService?.invalidatePrecomputedCycle(cycle.id);

    return participation;
  }
  private async assertQuestionnaireReadyForOptIn(
    userId: string,
    schoolId: string | null,
  ) {
    const response = await this.prisma.questionnaireResponse.findUnique({
      where: { userId },
      select: {
        versionId: true,
        answers: true,
        draftAnswers: true,
        submittedAt: true,
        user: {
          select: {
            vipActivations: { select: { expiresAt: true, revokedAt: true } },
          },
        },
      },
    });

    if (!response || response.submittedAt == null) {
      throw new BadRequestException(
        'Submit a complete questionnaire before opting into matching.',
      );
    }

    const currentQuestionnaire =
      await this.questionnaireService.getCurrentVersion();
    if (response.versionId !== currentQuestionnaire.id) {
      throw new BadRequestException(
        'Complete the current questionnaire before opting into matching.',
      );
    }
    this.questionnaireService.validateAnswers(
      currentQuestionnaire.questions,
      {
        ...(isRecord(response.answers) ? response.answers : {}),
        [HARD_MATCH_KEYS.school]: schoolId ?? '',
      },
      currentQuestionnaire.schools.map((school) => school.id),
    );

    const vipActive = hasActiveVip(response.user?.vipActivations);
    const hardMatchAnswers = parseHardMatchAnswers(
      effectiveMatchingAnswers(
        {
          ...((response.answers ?? {}) as Record<string, unknown>),
          [HARD_MATCH_KEYS.school]: schoolId ?? '',
        },
        vipActive,
      ),
    );

    if (!hardMatchAnswers) {
      // `parseHardMatchAnswers` returns null whenever any required hard-match
      // field is missing. The shared `parseHardMatchAnswers` still treats a
      // blank one-liner intro as incomplete, so a profile that is otherwise
      // complete but missing only the intro lands here — surface the intro
      // prompt first. This gate's intro enforcement therefore depends on that
      // shared contract; if `parseHardMatchAnswers` is ever relaxed to accept a
      // blank intro, add an explicit intro check here so opt-in cannot silently
      // proceed without one.
      const intro = readQuestionnaireOneLiner(response.answers);
      if (!intro) {
        throw new BadRequestException(
          'Add a one-line intro on your referral card before opting into matching.',
        );
      }

      throw new BadRequestException(
        'Your questionnaire is missing required fields. Please update your profile before opting into matching.',
      );
    }

    if (response.draftAnswers != null) {
      throw new BadRequestException(
        'Your questionnaire has unsaved incomplete changes. Please finish or discard the draft before opting in.',
      );
    }
  }
  private async createAuditLog(
    actorId: string,
    action: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        metadata,
      },
    });
  }
}

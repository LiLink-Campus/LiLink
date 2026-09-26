import {
  currentHardMatchConfirmSignature,
  HARD_MATCH_WEIGHT_ACK,
  HARD_MATCH_WEIGHT_KEYS,
  hardMatchAttentionKeys,
  hardMatchFieldSignature,
  hardMatchQuestionKeys,
  hardMatchSignatureFieldKeys,
  hasActiveVip,
} from '@lilink/shared';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ActivationService } from '../activation/activation.service';
import {
  buildHardMatchAnswerRecordFromFormInput,
  normalizeHardMatchAnswers,
} from '../questionnaire/hard-match';
import { IncompleteQuestionnaireSubmissionException } from '../questionnaire/incomplete-questionnaire-submission.exception';
import { syncQuestionnaireSchoolAnswers } from '../questionnaire/questionnaire-school-sync';
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { AcknowledgeQuestionnaireItemsDto, SaveQuestionnaireDto } from './dto';
import { MatchEstimateService } from './match-estimate.service';
import {
  hasDisplayNameChange,
  normalizeQuestionnaireDisplayName,
  resolveQuestionnaireSubmissionDisplayName,
} from './profile-display-name';
import {
  buildQuestionnaireAttention,
  normalizeAcknowledgedQuestionnaireKeys,
} from './questionnaire-attention';
import {
  assertKnownQuestionnaireKeys,
  buildQuestionnaireDraftPayload,
  isRecord,
} from './questionnaire-draft';
type QuestionnaireAcknowledgementRow = {
  acknowledgedQuestionnaireKeys: Prisma.JsonValue | null;
};
@Injectable()
export class AccountQuestionnaireService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionnaireService: QuestionnaireService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
    @Optional() private readonly matchEstimateService?: MatchEstimateService,
    @Optional() private readonly activationService?: ActivationService,
  ) {}
  async saveQuestionnaire(userId: string, input: SaveQuestionnaireDto) {
    const [questionnaire, user] = await Promise.all([
      this.questionnaireService.getCurrentVersion(),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          school: { select: { id: true } },
          vipActivations: { select: { expiresAt: true, revokedAt: true } },
        },
      }),
    ]);

    if (input.versionId !== questionnaire.id) {
      throw new BadRequestException(
        'Questionnaire version is outdated. Reload before saving.',
      );
    }

    if (!user.school?.id) {
      throw new BadRequestException(
        'A recognized school is required before saving the questionnaire.',
      );
    }

    assertKnownQuestionnaireKeys(questionnaire.questions, input.answers);

    const allowedSchoolIds = questionnaire.schools.map((school) => school.id);
    const draftPayload = buildQuestionnaireDraftPayload(
      this.questionnaireService.sanitizeStoredAnswers(
        questionnaire.questions,
        input.answers,
      ),
      input.hardMatchForm,
      input.displayName,
      allowedSchoolIds,
    );
    const requestedDisplayName = normalizeQuestionnaireDisplayName(
      input.displayName,
    );
    const submissionDisplayName = resolveQuestionnaireSubmissionDisplayName(
      requestedDisplayName,
      user.displayName,
    );
    const displayNameUpdate =
      requestedDisplayName !== undefined &&
      hasDisplayNameChange(user.displayName, requestedDisplayName)
        ? requestedDisplayName
        : undefined;

    try {
      if (submissionDisplayName.length < 2) {
        throw new IncompleteQuestionnaireSubmissionException(
          'Display name must contain at least 2 characters.',
        );
      }

      const hardMatchAnswers = buildHardMatchAnswerRecordFromFormInput(
        input.hardMatchForm,
        user.school.id,
        allowedSchoolIds,
      );
      const normalizedAnswers = this.questionnaireService.validateAnswers(
        questionnaire.questions,
        {
          ...input.answers,
          ...hardMatchAnswers,
        },
        allowedSchoolIds,
      );
      const acknowledgedQuestionnaireKeys = questionnaire.questions.map(
        (question) => question.key,
      );
      const submittedAt = new Date();

      // Submitting is a conscious pass over the whole profile, so it confirms
      // every enum hard-match field against the current option set AND any
      // empty / "no limit" weight (clearing the weight nudge on save).
      const submittedHardMatchSignatures: Record<string, string> = {};
      for (const key of hardMatchSignatureFieldKeys()) {
        const sig = hardMatchFieldSignature(key);
        if (sig) {
          submittedHardMatchSignatures[key] = sig;
        }
      }
      for (const key of HARD_MATCH_WEIGHT_KEYS) {
        submittedHardMatchSignatures[key] = HARD_MATCH_WEIGHT_ACK;
      }

      const submittedOperations: Prisma.PrismaPromise<unknown>[] = [];

      if (displayNameUpdate !== undefined) {
        submittedOperations.push(
          this.prisma.user.update({
            where: { id: userId },
            data: { displayName: displayNameUpdate },
          }),
        );
      }

      submittedOperations.push(
        this.prisma.questionnaireResponse.upsert({
          where: { userId },
          create: {
            userId,
            versionId: questionnaire.id,
            answers: normalizedAnswers,
            draftAnswers: Prisma.DbNull,
            acknowledgedQuestionnaireVersionId: questionnaire.id,
            acknowledgedQuestionnaireKeys,
            submittedAt,
          },
          update: {
            versionId: questionnaire.id,
            answers: normalizedAnswers,
            draftAnswers: Prisma.DbNull,
            acknowledgedQuestionnaireVersionId: questionnaire.id,
            acknowledgedQuestionnaireKeys,
            submittedAt,
          },
        }),
      );

      // Persist enum + weight signatures via JSONB merge (runs after the
      // upsert in the same transaction).
      submittedOperations.push(
        this.prisma.$executeRaw`
          UPDATE "QuestionnaireResponse"
          SET "acknowledgedHardMatchSignatures" =
            COALESCE("acknowledgedHardMatchSignatures", '{}'::jsonb)
            || ${JSON.stringify(submittedHardMatchSignatures)}::jsonb
          WHERE "userId" = ${userId}
        `,
      );

      await this.prisma.$transaction(submittedOperations);

      this.matchEstimateService?.invalidatePrecomputedCycle();
      // Questionnaire fields are frozen on each match; only an account-name change affects old cards.
      if (displayNameUpdate !== undefined) {
        await this.dashboardSnapshotService.syncUserDisplayNameSnapshots(
          userId,
        );
      }

      // Submitting the questionnaire is one of the two activation signals; try
      // to grant activation-reward coupons (a no-op until the user has also
      // opted in, and self-contained — it never throws into this flow).
      await this.activationService?.tryGrantCoupons(userId);

      return {
        saveState: 'SUBMITTED' as const,
        questionnaireSubmittedAt: submittedAt.toISOString(),
        hasDraft: false,
      };
    } catch (error) {
      if (!(error instanceof IncompleteQuestionnaireSubmissionException)) {
        throw error;
      }

      const draftUpsertArgs = {
        where: { userId },
        create: {
          userId,
          versionId: questionnaire.id,
          answers: {},
          draftAnswers: draftPayload as Prisma.InputJsonValue,
          submittedAt: null,
        },
        update: {
          draftAnswers: draftPayload as Prisma.InputJsonValue,
        },
      };
      const response =
        displayNameUpdate !== undefined
          ? await this.prisma.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: userId },
                data: { displayName: displayNameUpdate },
              });

              return tx.questionnaireResponse.upsert(draftUpsertArgs);
            })
          : await this.prisma.questionnaireResponse.upsert(draftUpsertArgs);

      if (displayNameUpdate !== undefined) {
        await this.dashboardSnapshotService.syncUserDisplayNameSnapshots(
          userId,
        );
      }

      return {
        saveState: 'DRAFT' as const,
        questionnaireSubmittedAt: this.toIsoString(response.submittedAt),
        hasDraft: true,
      };
    }
  }
  async getQuestionnaire(userId: string) {
    const [response, currentQuestionnaire, user] = await Promise.all([
      this.prisma.questionnaireResponse.findUnique({
        where: { userId },
      }),
      this.questionnaireService.getCurrentVersion().catch(() => null),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          schoolId: true,
          vipActivations: { select: { expiresAt: true, revokedAt: true } },
        },
      }),
    ]);

    if (
      !response ||
      !currentQuestionnaire ||
      response.versionId !== currentQuestionnaire.id
    )
      return null;

    const allowedSchoolIds = currentQuestionnaire.schools.map(
      (school) => school.id,
    );
    const schoolAwareAnswers = syncQuestionnaireSchoolAnswers(
      (response.answers ?? {}) as Record<string, unknown>,
      {
        currentSchoolId: user?.schoolId ?? null,
        allowedSchoolIds,
      },
    );
    const filteredAnswers = this.questionnaireService.sanitizeStoredAnswers(
      currentQuestionnaire.questions,
      schoolAwareAnswers,
    );

    try {
      Object.assign(
        filteredAnswers,
        normalizeHardMatchAnswers(schoolAwareAnswers, allowedSchoolIds),
      );
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        throw error;
      }

      for (const hardMatchKey of hardMatchQuestionKeys()) {
        if (
          Object.prototype.hasOwnProperty.call(schoolAwareAnswers, hardMatchKey)
        ) {
          filteredAnswers[hardMatchKey] = schoolAwareAnswers[hardMatchKey];
        }
      }
    }

    return {
      vipFiltersActive: hasActiveVip(user?.vipActivations),
      versionId: response.versionId,
      currentVersionId: currentQuestionnaire.id,
      answers: filteredAnswers,
      submittedAt: this.toIsoString(response.submittedAt),
      draft: isRecord(response.draftAnswers)
        ? buildQuestionnaireDraftPayload(
            this.questionnaireService.sanitizeStoredAnswers(
              currentQuestionnaire.questions,
              isRecord(response.draftAnswers.softAnswers)
                ? response.draftAnswers.softAnswers
                : {},
            ),
            response.draftAnswers.hardMatchForm,
            response.draftAnswers.displayName,
            allowedSchoolIds,
          )
        : null,
      attention: buildQuestionnaireAttention({
        vipActive: hasActiveVip(user?.vipActivations),
        currentVersionId: currentQuestionnaire.id,
        currentQuestions: currentQuestionnaire.questions,
        filteredAnswers,
        acknowledgedVersionId: response.acknowledgedQuestionnaireVersionId,
        acknowledgedKeys: response.acknowledgedQuestionnaireKeys,
        acknowledgedHardMatchSignatures:
          response.acknowledgedHardMatchSignatures,
      }),
    };
  }
  async acknowledgeQuestionnaireItems(
    userId: string,
    input: AcknowledgeQuestionnaireItemsDto,
  ) {
    const currentQuestionnaire =
      await this.questionnaireService.getCurrentVersion();

    if (input.versionId !== currentQuestionnaire.id) {
      throw new BadRequestException('Questionnaire version is outdated.');
    }

    const currentQuestionKeys = new Set([
      ...currentQuestionnaire.questions.map((question) => question.key),
      ...hardMatchAttentionKeys(),
    ]);
    const requestedKeys = [
      ...new Set(
        input.keys.map((key) => key.trim()).filter((key) => key.length > 0),
      ),
    ];

    for (const key of requestedKeys) {
      if (!currentQuestionKeys.has(key)) {
        throw new BadRequestException(
          `Unexpected questionnaire acknowledgement key: ${key}.`,
        );
      }
    }

    if (requestedKeys.length === 0) {
      const response = await this.prisma.questionnaireResponse.findUnique({
        where: { userId },
        select: {
          acknowledgedQuestionnaireVersionId: true,
          acknowledgedQuestionnaireKeys: true,
        },
      });

      return {
        currentVersionId: currentQuestionnaire.id,
        acknowledgedKeys:
          response?.acknowledgedQuestionnaireVersionId ===
          currentQuestionnaire.id
            ? normalizeAcknowledgedQuestionnaireKeys(
                response.acknowledgedQuestionnaireKeys,
              )
            : [],
      };
    }

    // Hard-match keys carry a signature instead of a bare ack flag: enum
    // fields store the current option-set signature, weight fields the
    // empty-ack sentinel. Merged into the JSONB column in the same UPDATE.
    const hardMatchAcks: Record<string, string> = {};
    for (const key of requestedKeys) {
      const sig = currentHardMatchConfirmSignature(key);
      if (sig) {
        hardMatchAcks[key] = sig;
      }
    }

    const updatedRows = await this.prisma.$queryRaw<
      QuestionnaireAcknowledgementRow[]
    >`
      UPDATE "QuestionnaireResponse" AS response
      SET
        "acknowledgedQuestionnaireVersionId" = ${currentQuestionnaire.id},
        "acknowledgedHardMatchSignatures" =
          COALESCE(response."acknowledgedHardMatchSignatures", '{}'::jsonb)
          || ${JSON.stringify(hardMatchAcks)}::jsonb,
        "acknowledgedQuestionnaireKeys" = (
          SELECT COALESCE(
            jsonb_agg(DISTINCT acknowledged_key ORDER BY acknowledged_key),
            '[]'::jsonb
          )
          FROM (
            SELECT jsonb_array_elements_text(
              CASE
                WHEN response."acknowledgedQuestionnaireVersionId" = ${currentQuestionnaire.id}
                  AND jsonb_typeof(response."acknowledgedQuestionnaireKeys") = 'array'
                THEN response."acknowledgedQuestionnaireKeys"
                ELSE '[]'::jsonb
              END
            ) AS acknowledged_key
            UNION
            SELECT unnest(ARRAY[${Prisma.join(requestedKeys)}]::text[]) AS acknowledged_key
          ) AS acknowledged_keys
        )
      WHERE response."userId" = ${userId}
      RETURNING response."acknowledgedQuestionnaireKeys"
    `;

    if (updatedRows.length === 0) {
      return {
        currentVersionId: currentQuestionnaire.id,
        acknowledgedKeys: [],
      };
    }

    return {
      currentVersionId: currentQuestionnaire.id,
      acknowledgedKeys: normalizeAcknowledgedQuestionnaireKeys(
        updatedRows[0].acknowledgedQuestionnaireKeys,
      ),
    };
  }
  private toIsoString(value: Date | null | undefined): string | null {
    return value ? value.toISOString() : null;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { env } from '../../config/env';
import {
  DEFAULT_MEETUP_EXPIRATION_WEEKS,
  DEFAULT_MEETUP_TOLERANCE_MINUTES,
  MAX_MEETUP_EXPIRATION_WEEKS,
  MEETUP_ARCHIVE_AFTER_FINAL_DECISION_MINUTES,
  MIN_MEETUP_EXPIRATION_WEEKS,
  MIN_MEETUP_PROPOSAL_LEAD_MINUTES,
  type MeetupMessageType,
  type MeetupOptionKind,
  type MeetupProposalScope,
  type MeetupProposalStatus,
} from './constants';
import {
  AcceptMeetupOptionsDto,
  CancelMeetupSessionDto,
  CreateMeetupProposalDto,
  RejectMeetupProposalDto,
  ReviseMeetupSessionDto,
  StartMeetupSessionDto,
} from './dto';
import {
  findLocationCandidate,
  locationCandidates,
  type MeetupLocationCandidate,
} from './location-candidates';
import { mapMeetupSessionResponse } from './response-mapper';
import type {
  CountResult,
  MeetupMatchRecord,
  MeetupPrismaClient,
  MeetupProposalRecord,
  MeetupSessionRecord,
  MeetupTransactionClient,
} from './types';

const MEETUP_SESSION_INCLUDE = {
  participants: {
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  },
  currentProposal: {
    include: {
      options: {
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  },
  confirmedTimeOption: true,
  confirmedLocationOption: true,
  messages: {
    include: {
      proposal: {
        include: {
          options: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} as const;

const MATCH_WITH_PARTICIPANTS_INCLUDE = {
  participants: {
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          meetupExpirationWeeks: true,
        },
      },
    },
    orderBy: {
      position: 'asc',
    },
  },
} as const;

const CHINA_STANDARD_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;
const OFFSETLESS_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;
const MEETUP_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;
const MEETUP_REMINDER_BATCH_SIZE = 50;

type NormalizedTimeOptionInput = {
  startsAt: Date;
  endsAt: Date;
  toleranceMinutes: number;
};

type NormalizedLocationOptionInput = {
  locationCandidateId: string;
  candidate: MeetupLocationCandidate;
};

type NormalizedProposalInput = {
  scope: MeetupProposalScope;
  timeOptions: NormalizedTimeOptionInput[];
  locationOptions: NormalizedLocationOptionInput[];
  notePreset?: string;
  noteText?: string;
};

type MeetupReminderCandidate = {
  id: string;
  userId: string;
  responseRequiredAt: Date;
  responseRequiredMessage: {
    type: MeetupMessageType;
  } | null;
  user: {
    email: string;
    displayName: string | null;
  };
  session: {
    id: string;
    matchId: string;
    finalConfirmRequiredByUserId: string | null;
    participants: Array<{
      userId: string;
      user: {
        displayName: string | null;
      };
    }>;
  };
};

type OutboundEmailDedupeRecord = {
  dedupeKey: string;
};

@Injectable()
export class MeetupService {
  private readonly logger = new Logger(MeetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  getLocationCandidates() {
    return locationCandidates.map((candidate) => ({ ...candidate }));
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'meetup-reminder-email',
    waitForCompletion: true,
  })
  async handleMeetupReminderEmailQueue() {
    try {
      await this.queueMeetupReminderEmails();
    } catch (error) {
      this.logger.error(
        'Failed to queue meetup reminder emails.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async queueMeetupReminderEmails() {
    const queuedDedupeKeys = await this.db.$transaction(async (tx) => {
      const now = new Date();
      const threshold = new Date(now.getTime() - MEETUP_REMINDER_DELAY_MS);
      const emails = [];
      let skippedCandidates = 0;

      while (emails.length < MEETUP_REMINDER_BATCH_SIZE) {
        const candidates = (await tx.meetupParticipant.findMany({
          where: {
            turnState: 'REQUIRED',
            responseRequiredAt: {
              lte: threshold,
            },
            session: {
              is: {
                status: 'ACTIVE',
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          },
          select: {
            id: true,
            userId: true,
            responseRequiredAt: true,
            responseRequiredMessage: {
              select: {
                type: true,
              },
            },
            user: {
              select: {
                email: true,
                displayName: true,
              },
            },
            session: {
              select: {
                id: true,
                matchId: true,
                finalConfirmRequiredByUserId: true,
                participants: {
                  select: {
                    userId: true,
                    user: {
                      select: {
                        displayName: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ responseRequiredAt: 'asc' }, { id: 'asc' }],
          skip: skippedCandidates,
          take: MEETUP_REMINDER_BATCH_SIZE,
        })) as MeetupReminderCandidate[];

        if (candidates.length === 0) {
          break;
        }

        const candidateDedupeKeys = candidates.map(
          (candidate) => `meetup-reminder:${candidate.session.id}`,
        );
        const existingEmails = (await tx.outboundEmail.findMany({
          where: {
            dedupeKey: {
              in: candidateDedupeKeys,
            },
          },
          select: {
            dedupeKey: true,
          },
        })) as OutboundEmailDedupeRecord[];
        const existingDedupeKeys = new Set(
          existingEmails.map((email) => email.dedupeKey),
        );

        for (const candidate of candidates) {
          const dedupeKey = `meetup-reminder:${candidate.session.id}`;
          if (existingDedupeKeys.has(dedupeKey)) {
            continue;
          }

          const otherParticipant = candidate.session.participants.find(
            (participant) => participant.userId !== candidate.userId,
          );
          const otherPartyDisplayName =
            otherParticipant?.user.displayName ?? null;
          const otherPartyName = otherPartyDisplayName ?? '对方';
          const actionSentence = this.buildMeetupReminderActionSentence(
            candidate,
            otherPartyName,
          );

          if (!actionSentence) {
            continue;
          }

          emails.push(
            this.mailService.buildMeetupReminderEmail({
              sessionId: candidate.session.id,
              recipientEmail: candidate.user.email,
              recipientDisplayName: candidate.user.displayName,
              otherPartyDisplayName,
              actionSentence,
              directUrl: this.buildMeetupSessionUrl(candidate.session.id),
            }),
          );

          if (emails.length >= MEETUP_REMINDER_BATCH_SIZE) {
            break;
          }
        }

        skippedCandidates += candidates.length;

        if (candidates.length < MEETUP_REMINDER_BATCH_SIZE) {
          break;
        }
      }

      if (emails.length === 0) {
        return [];
      }

      const createdEmails = (await tx.outboundEmail.createManyAndReturn({
        data: emails.slice(0, MEETUP_REMINDER_BATCH_SIZE),
        skipDuplicates: true,
        select: {
          dedupeKey: true,
        },
      })) as OutboundEmailDedupeRecord[];

      return createdEmails.map((email) => email.dedupeKey);
    });

    if (queuedDedupeKeys.length > 0) {
      await this.mailService.flushQueuedEmails({
        dedupeKeys: queuedDedupeKeys,
      });
    }

    return { queuedCount: queuedDedupeKeys.length };
  }

  private buildMeetupReminderActionSentence(
    candidate: MeetupReminderCandidate,
    otherPartyName: string,
  ) {
    switch (candidate.responseRequiredMessage?.type) {
      case 'PROPOSE':
      case 'REVISE_AFTER_LOCK':
        return `${otherPartyName} 已经发出见面提议，正在等你确认。`;
      case 'ACCEPT':
        if (
          candidate.session.finalConfirmRequiredByUserId === candidate.userId
        ) {
          return `${otherPartyName} 已经接受时间和地点，正在等你最终确认。`;
        }
        return `${otherPartyName} 已经接受了部分选项，正在等你继续处理这个破冰会话。`;
      case 'REJECT':
        return `${otherPartyName} 已经拒绝这次见面提议，正在等你调整后重新发出提议。`;
      default:
        return null;
    }
  }

  async getSession(userId: string, sessionId: string) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const session = await this.loadConvergedAuthorizedSession(
        tx,
        userId,
        sessionId,
        now,
      );

      return mapMeetupSessionResponse(session, userId, now);
    });
  }

  async startSession(
    userId: string,
    matchId: string,
    input: StartMeetupSessionDto,
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        const now = new Date();
        const proposalInput = this.normalizeProposalInput(
          this.readProposalObject(input?.proposal),
          now,
        );
        const match = await this.loadMatchOrThrow(tx, matchId);
        const currentMatchParticipant = this.findMatchParticipantForUser(
          match,
          userId,
        );

        if (!currentMatchParticipant) {
          throw new NotFoundException('Match was not found for this user.');
        }

        if (!match.introducedAt) {
          throw new BadRequestException('MEETUP_MATCH_NOT_INTRODUCED');
        }

        if (match.participants.length !== 2) {
          throw new BadRequestException(
            'MEETUP_REQUIRES_EXACTLY_TWO_PARTICIPANTS',
          );
        }

        const existingSession = await tx.meetupSession.findUnique({
          where: { matchId },
          select: { id: true },
        });

        if (existingSession) {
          throw new BadRequestException('MEETUP_SESSION_ALREADY_EXISTS');
        }

        const counterpart = this.findCounterpartMatchParticipant(match, userId);
        if (!counterpart) {
          throw new BadRequestException('MEETUP_COUNTERPART_NOT_FOUND');
        }

        const expiry = await this.readActiveExpiry(tx, match.participants, now);
        const session = (await tx.meetupSession.create({
          data: {
            matchId,
            status: 'ACTIVE',
            startedByUserId: userId,
            lastActiveAt: now,
            effectiveExpirationWeeks: expiry.weeks,
            expiresAt: expiry.expiresAt,
          },
        })) as Pick<MeetupSessionRecord, 'id'>;

        await tx.meetupParticipant.createMany({
          data: match.participants.map((participant) => ({
            sessionId: session.id,
            userId: participant.userId,
            matchParticipantId: participant.id,
            turnState:
              participant.userId === counterpart.userId
                ? 'REQUIRED'
                : 'WAITING',
            responseRequiredAt:
              participant.userId === counterpart.userId ? now : null,
          })),
        });

        const proposal = await this.createProposalRows(tx, {
          sessionId: session.id,
          actorUserId: userId,
          messageType: 'PROPOSE',
          proposalInput,
          now,
        });

        await this.setRequired(
          tx,
          session.id,
          counterpart.userId,
          proposal.messageId,
          now,
        );
        await this.claimSessionUpdate(tx, {
          where: {
            id: session.id,
            status: 'ACTIVE',
            currentProposalId: null,
          },
          data: {
            currentProposalId: proposal.id,
            lastActiveAt: now,
            effectiveExpirationWeeks: expiry.weeks,
            expiresAt: expiry.expiresAt,
          },
        });
        await this.createAuditLog(tx, userId, 'meetup.session_started', {
          sessionId: session.id,
          matchId,
          proposalId: proposal.id,
        });

        const loadedSession = await this.loadSessionOrThrow(tx, session.id);
        return mapMeetupSessionResponse(loadedSession, userId, now);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('MEETUP_SESSION_ALREADY_EXISTS');
      }

      throw error;
    }
  }

  async createProposal(
    userId: string,
    sessionId: string,
    input: CreateMeetupProposalDto,
  ) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const proposalInput = this.normalizeProposalInput(input, now);
      const session = await this.loadConvergedAuthorizedSession(
        tx,
        userId,
        sessionId,
        now,
      );
      const { currentParticipant, counterpart } =
        this.assertSessionParticipants(session, userId);

      this.assertActiveMutationAllowed(session, now);
      if (
        currentParticipant.turnState !== 'REQUIRED' &&
        session.finalConfirmRequiredByUserId !== userId
      ) {
        throw new BadRequestException('MEETUP_TURN_NOT_REQUIRED');
      }

      const expiry = await this.readActiveExpiry(tx, session.participants, now);
      const scopeReset = this.scopeResetData(proposalInput.scope);

      await this.claimSessionUpdate(tx, {
        where: {
          id: session.id,
          status: 'ACTIVE',
          currentProposalId: session.currentProposalId,
          finalConfirmRequiredByUserId: session.finalConfirmRequiredByUserId,
        },
        data: {
          lastActiveAt: now,
        },
      });

      if (session.currentProposalId) {
        await this.supersedePendingProposal(tx, session.currentProposalId, now);
      }

      const proposal = await this.createProposalRows(tx, {
        sessionId,
        actorUserId: userId,
        messageType: 'PROPOSE',
        proposalInput,
        now,
      });

      await this.claimSessionUpdate(tx, {
        where: {
          id: session.id,
          status: 'ACTIVE',
          currentProposalId: session.currentProposalId,
          finalConfirmRequiredByUserId: session.finalConfirmRequiredByUserId,
        },
        data: {
          ...scopeReset,
          currentProposalId: proposal.id,
          finalConfirmRequiredByUserId: null,
          lastActiveAt: now,
          effectiveExpirationWeeks: expiry.weeks,
          expiresAt: expiry.expiresAt,
        },
      });
      await this.setRequired(
        tx,
        session.id,
        counterpart.userId,
        proposal.messageId,
        now,
      );
      await this.createAuditLog(tx, userId, 'meetup.proposal_created', {
        sessionId,
        proposalId: proposal.id,
      });

      const loadedSession = await this.loadSessionOrThrow(tx, sessionId);
      return mapMeetupSessionResponse(loadedSession, userId, now);
    });
  }

  async acceptOptions(
    userId: string,
    sessionId: string,
    input: AcceptMeetupOptionsDto,
  ) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const session = await this.loadConvergedAuthorizedSession(
        tx,
        userId,
        sessionId,
        now,
      );
      const { currentParticipant } = this.assertSessionParticipants(
        session,
        userId,
      );
      const proposal = this.assertCurrentPendingProposal(session);

      this.assertActiveMutationAllowed(session, now);
      if (session.finalConfirmRequiredByUserId) {
        throw new BadRequestException('MEETUP_AWAITING_FINAL_CONFIRMATION');
      }
      if (currentParticipant.turnState !== 'REQUIRED') {
        throw new BadRequestException('MEETUP_TURN_NOT_REQUIRED');
      }
      if (proposal.actorUserId === userId) {
        throw new BadRequestException('MEETUP_CANNOT_ACCEPT_OWN_PROPOSAL');
      }
      if (!input.timeOptionId && !input.locationOptionId) {
        throw new BadRequestException('MEETUP_ACCEPT_REQUIRES_OPTION');
      }

      const selectedTime = input.timeOptionId
        ? this.findProposalOption(proposal, input.timeOptionId, 'TIME')
        : null;
      const selectedLocation = input.locationOptionId
        ? this.findProposalOption(proposal, input.locationOptionId, 'LOCATION')
        : null;

      if (input.timeOptionId && !selectedTime) {
        throw new BadRequestException('MEETUP_TIME_OPTION_NOT_IN_PROPOSAL');
      }
      if (input.locationOptionId && !selectedLocation) {
        throw new BadRequestException('MEETUP_LOCATION_OPTION_NOT_IN_PROPOSAL');
      }
      if (selectedTime?.startsAt && selectedTime.startsAt <= now) {
        throw new BadRequestException('MEETUP_CONFIRMED_TIME_ALREADY_STARTED');
      }

      const nextTimeOptionId =
        selectedTime?.id ?? session.confirmedTimeOptionId;
      const nextLocationOptionId =
        selectedLocation?.id ?? session.confirmedLocationOptionId;
      const nextConfirmedTime =
        selectedTime ?? session.confirmedTimeOption ?? null;

      if (
        nextTimeOptionId &&
        nextLocationOptionId &&
        (!nextConfirmedTime?.startsAt || nextConfirmedTime.startsAt <= now)
      ) {
        throw new BadRequestException('MEETUP_CONFIRMED_TIME_ALREADY_STARTED');
      }

      const message = (await tx.meetupMessage.create({
        data: {
          sessionId,
          actorUserId: userId,
          type: 'ACCEPT',
          notePreset: this.normalizeOptionalText(input.notePreset),
          noteText: this.normalizeOptionalText(input.noteText),
        },
      })) as { id: string };

      await this.applyAcceptOptionStatusChanges(tx, proposal, {
        selectedTimeOptionId: selectedTime?.id ?? null,
        selectedLocationOptionId: selectedLocation?.id ?? null,
      });

      const completePlan = Boolean(nextTimeOptionId && nextLocationOptionId);
      const nextProposalStatus: MeetupProposalStatus = completePlan
        ? 'CONFIRMED'
        : 'PARTIALLY_ACCEPTED';
      const expiry = await this.readActiveExpiry(tx, session.participants, now);

      await this.claimProposalUpdate(tx, {
        where: {
          id: proposal.id,
          status: 'PENDING',
        },
        data: {
          status: nextProposalStatus,
        },
      });
      await this.claimSessionUpdate(tx, {
        where: {
          id: session.id,
          status: 'ACTIVE',
          currentProposalId: proposal.id,
          finalConfirmRequiredByUserId: null,
        },
        data: {
          confirmedTimeOptionId: nextTimeOptionId,
          confirmedLocationOptionId: nextLocationOptionId,
          currentProposalId: null,
          finalConfirmRequiredByUserId: completePlan
            ? proposal.actorUserId
            : null,
          lastActiveAt: now,
          effectiveExpirationWeeks: expiry.weeks,
          expiresAt: expiry.expiresAt,
        },
      });
      await this.setRequired(
        tx,
        session.id,
        proposal.actorUserId,
        message.id,
        now,
      );
      await this.createAuditLog(tx, userId, 'meetup.options_accepted', {
        sessionId,
        proposalId: proposal.id,
        timeOptionId: selectedTime?.id ?? null,
        locationOptionId: selectedLocation?.id ?? null,
      });

      const loadedSession = await this.loadSessionOrThrow(tx, sessionId);
      return mapMeetupSessionResponse(loadedSession, userId, now);
    });
  }

  async rejectProposal(
    userId: string,
    sessionId: string,
    proposalId: string,
    input: RejectMeetupProposalDto,
  ) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const session = await this.loadConvergedAuthorizedSession(
        tx,
        userId,
        sessionId,
        now,
      );
      const { currentParticipant } = this.assertSessionParticipants(
        session,
        userId,
      );
      const proposal = this.assertCurrentPendingProposal(session);

      this.assertActiveMutationAllowed(session, now);
      if (proposal.id !== proposalId) {
        throw new ConflictException('MEETUP_STALE_PROPOSAL');
      }
      if (session.finalConfirmRequiredByUserId) {
        throw new BadRequestException('MEETUP_AWAITING_FINAL_CONFIRMATION');
      }
      if (currentParticipant.turnState !== 'REQUIRED') {
        throw new BadRequestException('MEETUP_TURN_NOT_REQUIRED');
      }
      if (proposal.actorUserId === userId) {
        throw new BadRequestException('MEETUP_CANNOT_REJECT_OWN_PROPOSAL');
      }

      const message = (await tx.meetupMessage.create({
        data: {
          sessionId,
          actorUserId: userId,
          type: 'REJECT',
          notePreset: this.normalizeOptionalText(input.notePreset),
          noteText: this.normalizeOptionalText(input.noteText),
        },
      })) as { id: string };
      const expiry = await this.readActiveExpiry(tx, session.participants, now);

      await this.claimProposalUpdate(tx, {
        where: {
          id: proposal.id,
          status: 'PENDING',
        },
        data: {
          status: 'REJECTED',
        },
      });
      await tx.meetupOption.updateMany({
        where: {
          proposalId: proposal.id,
          status: 'PENDING',
        },
        data: {
          status: 'REJECTED',
        },
      });
      await this.claimSessionUpdate(tx, {
        where: {
          id: session.id,
          status: 'ACTIVE',
          currentProposalId: proposal.id,
          finalConfirmRequiredByUserId: null,
        },
        data: {
          currentProposalId: null,
          lastActiveAt: now,
          effectiveExpirationWeeks: expiry.weeks,
          expiresAt: expiry.expiresAt,
        },
      });
      await this.setRequired(
        tx,
        session.id,
        proposal.actorUserId,
        message.id,
        now,
      );
      await this.createAuditLog(tx, userId, 'meetup.proposal_rejected', {
        sessionId,
        proposalId: proposal.id,
      });

      const loadedSession = await this.loadSessionOrThrow(tx, sessionId);
      return mapMeetupSessionResponse(loadedSession, userId, now);
    });
  }

  async finalConfirm(userId: string, sessionId: string) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const session = await this.loadConvergedAuthorizedSession(
        tx,
        userId,
        sessionId,
        now,
      );
      this.assertSessionParticipants(session, userId);
      this.assertActiveMutationAllowed(session, now);

      if (session.finalConfirmRequiredByUserId !== userId) {
        throw new BadRequestException('MEETUP_FINAL_CONFIRM_NOT_REQUIRED');
      }
      if (
        !session.confirmedTimeOptionId ||
        !session.confirmedLocationOptionId
      ) {
        throw new BadRequestException('MEETUP_PLAN_INCOMPLETE');
      }
      if (!session.confirmedTimeOption?.startsAt) {
        throw new BadRequestException('MEETUP_CONFIRMED_TIME_NOT_FOUND');
      }
      if (session.confirmedTimeOption.startsAt <= now) {
        throw new BadRequestException('MEETUP_CONFIRMED_TIME_ALREADY_STARTED');
      }

      const expiry = await this.readActiveExpiry(tx, session.participants, now);
      const archiveEligibleAt = this.addMinutes(
        session.confirmedTimeOption.endsAt ??
          session.confirmedTimeOption.startsAt,
        MEETUP_ARCHIVE_AFTER_FINAL_DECISION_MINUTES,
      );
      const message = (await tx.meetupMessage.create({
        data: {
          sessionId,
          actorUserId: userId,
          type: 'FINAL_CONFIRM',
        },
      })) as { id: string };

      await this.claimSessionUpdate(tx, {
        where: {
          id: session.id,
          status: 'ACTIVE',
          currentProposalId: null,
          finalConfirmRequiredByUserId: userId,
        },
        data: {
          status: 'LOCKED',
          lockedAt: now,
          lockVersion: { increment: 1 },
          effectiveExpirationWeeks: expiry.weeks,
          expiresAt: null,
          archiveEligibleAt,
          currentProposalId: null,
          finalConfirmRequiredByUserId: null,
          reopenedFromLockedAt: null,
          reopenedFromLockedStartsAt: null,
          lastActiveAt: now,
        },
      });
      await this.clearTurns(tx, session.id);
      await this.createAuditLog(tx, userId, 'meetup.final_confirmed', {
        sessionId,
        messageId: message.id,
        confirmedTimeOptionId: session.confirmedTimeOptionId,
        confirmedLocationOptionId: session.confirmedLocationOptionId,
      });

      const loadedSession = await this.loadSessionOrThrow(tx, sessionId);
      return mapMeetupSessionResponse(loadedSession, userId, now);
    });
  }

  async reviseAfterLock(
    userId: string,
    sessionId: string,
    input: ReviseMeetupSessionDto,
  ) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const proposalInput = this.normalizeProposalInput(
        this.readProposalObject(input?.proposal),
        now,
      );
      const session = await this.loadConvergedAuthorizedSession(
        tx,
        userId,
        sessionId,
        now,
      );
      const { currentParticipant, counterpart } =
        this.assertSessionParticipants(session, userId);

      if (session.status !== 'LOCKED') {
        throw new BadRequestException('MEETUP_SESSION_NOT_LOCKED');
      }
      if (!session.confirmedTimeOption?.startsAt) {
        throw new BadRequestException('MEETUP_CONFIRMED_TIME_NOT_FOUND');
      }
      if (session.confirmedTimeOption.startsAt <= now) {
        throw new BadRequestException('MEETUP_CONFIRMED_TIME_ALREADY_STARTED');
      }
      if (currentParticipant.revisionUsedAt) {
        throw new BadRequestException('MEETUP_REVISION_ALREADY_USED');
      }

      const expiry = await this.readActiveExpiry(tx, session.participants, now);
      const scopeReset = this.scopeResetData(proposalInput.scope);

      await this.claimSessionUpdate(tx, {
        where: {
          id: session.id,
          status: 'LOCKED',
          currentProposalId: null,
          finalConfirmRequiredByUserId: null,
        },
        data: {
          ...scopeReset,
          status: 'ACTIVE',
          lockedAt: null,
          archiveEligibleAt: null,
          reopenedFromLockedAt: now,
          reopenedFromLockedStartsAt: session.confirmedTimeOption.startsAt,
          finalConfirmRequiredByUserId: null,
          currentProposalId: null,
          lastActiveAt: now,
          effectiveExpirationWeeks: expiry.weeks,
          expiresAt: expiry.expiresAt,
        },
      });
      const participantUpdate = (await tx.meetupParticipant.updateMany({
        where: {
          id: currentParticipant.id,
          revisionUsedAt: null,
        },
        data: {
          revisionUsedAt: now,
        },
      })) as CountResult;

      if (participantUpdate.count === 0) {
        throw new ConflictException('MEETUP_STALE_STATE');
      }

      const proposal = await this.createProposalRows(tx, {
        sessionId,
        actorUserId: userId,
        messageType: 'REVISE_AFTER_LOCK',
        proposalInput,
        now,
      });

      await this.claimSessionUpdate(tx, {
        where: {
          id: session.id,
          status: 'ACTIVE',
          currentProposalId: null,
          finalConfirmRequiredByUserId: null,
        },
        data: {
          currentProposalId: proposal.id,
          lastActiveAt: now,
        },
      });
      await this.setRequired(
        tx,
        session.id,
        counterpart.userId,
        proposal.messageId,
        now,
      );
      await this.createAuditLog(tx, userId, 'meetup.revised_after_lock', {
        sessionId,
        proposalId: proposal.id,
      });

      const loadedSession = await this.loadSessionOrThrow(tx, sessionId);
      return mapMeetupSessionResponse(loadedSession, userId, now);
    });
  }

  async cancel(
    userId: string,
    sessionId: string,
    input: CancelMeetupSessionDto,
  ) {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const session = await this.loadConvergedAuthorizedSession(
        tx,
        userId,
        sessionId,
        now,
      );
      const { currentParticipant } = this.assertSessionParticipants(
        session,
        userId,
      );

      if (session.status !== 'ACTIVE' && session.status !== 'LOCKED') {
        throw new BadRequestException('MEETUP_SESSION_NOT_CANCELABLE');
      }
      this.assertReopenedGuardNotStarted(session, now);
      if (session.status === 'LOCKED') {
        this.assertConfirmedTimeNotStarted(session, now);
      }

      const noteText = this.normalizeOptionalText(input.note);
      await tx.meetupMessage.create({
        data: {
          sessionId,
          actorUserId: userId,
          type: 'CANCEL',
          noteText,
        },
      });

      if (
        (session.status === 'LOCKED' || session.reopenedFromLockedStartsAt) &&
        !currentParticipant.revisionUsedAt
      ) {
        await tx.meetupParticipant.updateMany({
          where: {
            id: currentParticipant.id,
            revisionUsedAt: null,
          },
          data: {
            revisionUsedAt: now,
          },
        });
      }

      if (session.currentProposalId) {
        await this.supersedePendingProposal(tx, session.currentProposalId, now);
      }

      await this.claimSessionUpdate(tx, {
        where: {
          id: session.id,
          status: session.status,
          currentProposalId: session.currentProposalId,
          finalConfirmRequiredByUserId: session.finalConfirmRequiredByUserId,
        },
        data: {
          status: 'CANCELED',
          canceledByUserId: userId,
          cancelReason: 'USER_CANCELED',
          cancelNote: noteText,
          canceledAt: now,
          currentProposalId: null,
          finalConfirmRequiredByUserId: null,
          lastActiveAt: now,
          expiresAt: null,
          archiveEligibleAt: null,
        },
      });
      await this.clearTurns(tx, session.id);
      await this.createAuditLog(tx, userId, 'meetup.canceled', {
        sessionId,
        canceledByUserId: userId,
      });

      const loadedSession = await this.loadSessionOrThrow(tx, sessionId);
      return mapMeetupSessionResponse(loadedSession, userId, now);
    });
  }

  async markSeen(userId: string, sessionId: string) {
    await this.db.$transaction(async (tx) => {
      const now = new Date();
      const session = await this.loadConvergedAuthorizedSession(
        tx,
        userId,
        sessionId,
        now,
      );
      const { currentParticipant } = this.assertSessionParticipants(
        session,
        userId,
      );

      await tx.meetupParticipant.updateMany({
        where: {
          id: currentParticipant.id,
        },
        data: {
          lastSeenAt: now,
        },
      });
      await this.createAuditLog(tx, userId, 'meetup.seen', {
        sessionId,
      });
    });
  }

  private get db(): MeetupPrismaClient {
    return this.prisma as unknown as MeetupPrismaClient;
  }

  private buildMeetupSessionUrl(sessionId: string) {
    const origin = env.CLIENT_ORIGIN[0].replace(/\/+$/, '');
    return `${origin}/dashboard/meetup/${encodeURIComponent(sessionId)}`;
  }

  private async loadMatchOrThrow(
    tx: MeetupTransactionClient,
    matchId: string,
  ): Promise<MeetupMatchRecord> {
    const match = (await tx.match.findUnique({
      where: { id: matchId },
      include: MATCH_WITH_PARTICIPANTS_INCLUDE,
    })) as MeetupMatchRecord | null;

    if (!match) {
      throw new NotFoundException('Match was not found.');
    }

    return match;
  }

  private async loadSessionOrThrow(
    tx: MeetupTransactionClient,
    sessionId: string,
  ): Promise<MeetupSessionRecord> {
    const session = (await tx.meetupSession.findUnique({
      where: { id: sessionId },
      include: MEETUP_SESSION_INCLUDE,
    })) as MeetupSessionRecord | null;

    if (!session) {
      throw new NotFoundException('Meetup session was not found.');
    }

    return session;
  }

  private async loadConvergedAuthorizedSession(
    tx: MeetupTransactionClient,
    userId: string,
    sessionId: string,
    now: Date,
  ): Promise<MeetupSessionRecord> {
    const session = await this.loadSessionOrThrow(tx, sessionId);
    this.assertSessionParticipants(session, userId);
    await this.convergeSessionLifecycle(tx, session, now);

    const reloadedSession = await this.loadSessionOrThrow(tx, sessionId);
    this.assertSessionParticipants(reloadedSession, userId);
    return reloadedSession;
  }

  private assertSessionParticipants(
    session: MeetupSessionRecord,
    userId: string,
  ) {
    if (session.participants.length !== 2) {
      throw new BadRequestException('MEETUP_REQUIRES_EXACTLY_TWO_PARTICIPANTS');
    }

    const currentParticipant = session.participants.find(
      (participant) => participant.userId === userId,
    );

    if (!currentParticipant) {
      throw new NotFoundException(
        'Meetup session was not found for this user.',
      );
    }

    const counterpart = session.participants.find(
      (participant) => participant.userId !== userId,
    );

    if (!counterpart) {
      throw new BadRequestException('MEETUP_COUNTERPART_NOT_FOUND');
    }

    return { currentParticipant, counterpart };
  }

  private findMatchParticipantForUser(
    match: MeetupMatchRecord,
    userId: string,
  ) {
    return (
      match.participants.find((participant) => participant.userId === userId) ??
      null
    );
  }

  private findCounterpartMatchParticipant(
    match: MeetupMatchRecord,
    userId: string,
  ) {
    return (
      match.participants.find((participant) => participant.userId !== userId) ??
      null
    );
  }

  private assertCurrentPendingProposal(
    session: MeetupSessionRecord,
  ): MeetupProposalRecord {
    if (
      !session.currentProposalId ||
      !session.currentProposal ||
      session.currentProposal.id !== session.currentProposalId ||
      session.currentProposal.status !== 'PENDING'
    ) {
      throw new ConflictException('MEETUP_STALE_PROPOSAL');
    }

    return session.currentProposal;
  }

  private assertActiveMutationAllowed(session: MeetupSessionRecord, now: Date) {
    if (session.status !== 'ACTIVE') {
      throw new BadRequestException('MEETUP_SESSION_NOT_ACTIVE');
    }

    if (session.expiresAt && session.expiresAt <= now) {
      throw new BadRequestException('MEETUP_SESSION_EXPIRED');
    }

    this.assertReopenedGuardNotStarted(session, now);
  }

  private assertReopenedGuardNotStarted(
    session: MeetupSessionRecord,
    now: Date,
  ) {
    if (
      session.reopenedFromLockedStartsAt &&
      session.reopenedFromLockedStartsAt <= now
    ) {
      throw new BadRequestException('MEETUP_CONFIRMED_TIME_ALREADY_STARTED');
    }
  }

  private assertConfirmedTimeNotStarted(
    session: MeetupSessionRecord,
    now: Date,
  ) {
    if (!session.confirmedTimeOption?.startsAt) {
      throw new BadRequestException('MEETUP_CONFIRMED_TIME_NOT_FOUND');
    }

    if (session.confirmedTimeOption.startsAt <= now) {
      throw new BadRequestException('MEETUP_CONFIRMED_TIME_ALREADY_STARTED');
    }
  }

  private async createProposalRows(
    tx: MeetupTransactionClient,
    input: {
      sessionId: string;
      actorUserId: string;
      messageType: Extract<MeetupMessageType, 'PROPOSE' | 'REVISE_AFTER_LOCK'>;
      proposalInput: NormalizedProposalInput;
      now: Date;
    },
  ) {
    const message = (await tx.meetupMessage.create({
      data: {
        sessionId: input.sessionId,
        actorUserId: input.actorUserId,
        type: input.messageType,
        notePreset: input.proposalInput.notePreset,
        noteText: input.proposalInput.noteText,
        createdAt: input.now,
      },
    })) as { id: string };
    let proposal: { id: string };
    try {
      proposal = (await tx.meetupProposal.create({
        data: {
          sessionId: input.sessionId,
          messageId: message.id,
          actorUserId: input.actorUserId,
          scope: input.proposalInput.scope,
          status: 'PENDING',
          createdAt: input.now,
        },
      })) as { id: string };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('MEETUP_STALE_PROPOSAL');
      }

      throw error;
    }

    const optionData = this.buildOptionCreateData({
      sessionId: input.sessionId,
      proposalId: proposal.id,
      proposalInput: input.proposalInput,
    });

    if (optionData.length > 0) {
      await tx.meetupOption.createMany({
        data: optionData,
      });
    }

    return {
      id: proposal.id,
      messageId: message.id,
    };
  }

  private buildOptionCreateData(input: {
    sessionId: string;
    proposalId: string;
    proposalInput: NormalizedProposalInput;
  }) {
    return [
      ...input.proposalInput.timeOptions.map((option) => ({
        sessionId: input.sessionId,
        proposalId: input.proposalId,
        kind: 'TIME' as const,
        status: 'PENDING' as const,
        startsAt: option.startsAt,
        endsAt: option.endsAt,
        toleranceMinutes: option.toleranceMinutes,
      })),
      ...input.proposalInput.locationOptions.map((option) => ({
        sessionId: input.sessionId,
        proposalId: input.proposalId,
        kind: 'LOCATION' as const,
        status: 'PENDING' as const,
        locationCandidateId: option.candidate.id,
        placeName: option.candidate.name,
        latitude: option.candidate.latitude,
        longitude: option.candidate.longitude,
      })),
    ];
  }

  private async applyAcceptOptionStatusChanges(
    tx: MeetupTransactionClient,
    proposal: MeetupProposalRecord,
    input: {
      selectedTimeOptionId: string | null;
      selectedLocationOptionId: string | null;
    },
  ) {
    const proposalKinds = new Set(
      proposal.options.map((option) => option.kind),
    );

    for (const kind of ['TIME', 'LOCATION'] as const) {
      const selectedOptionId =
        kind === 'TIME'
          ? input.selectedTimeOptionId
          : input.selectedLocationOptionId;

      if (selectedOptionId) {
        const selectedUpdate = (await tx.meetupOption.updateMany({
          where: {
            id: selectedOptionId,
            proposalId: proposal.id,
            kind,
            status: 'PENDING',
          },
          data: {
            status: 'CONFIRMED',
          },
        })) as CountResult;

        if (selectedUpdate.count === 0) {
          throw new ConflictException('MEETUP_STALE_OPTION');
        }

        await tx.meetupOption.updateMany({
          where: {
            proposalId: proposal.id,
            kind,
            id: {
              not: selectedOptionId,
            },
            status: 'PENDING',
          },
          data: {
            status: 'DISABLED',
          },
        });
        continue;
      }

      if (proposalKinds.has(kind)) {
        await tx.meetupOption.updateMany({
          where: {
            proposalId: proposal.id,
            kind,
            status: 'PENDING',
          },
          data: {
            status: 'DISABLED',
          },
        });
      }
    }
  }

  private findProposalOption(
    proposal: MeetupProposalRecord,
    optionId: string,
    kind: MeetupOptionKind,
  ) {
    return (
      proposal.options.find(
        (option) =>
          option.id === optionId &&
          option.kind === kind &&
          option.status === 'PENDING',
      ) ?? null
    );
  }

  private async supersedePendingProposal(
    tx: MeetupTransactionClient,
    proposalId: string,
    now: Date,
  ) {
    await tx.meetupProposal.updateMany({
      where: {
        id: proposalId,
        status: 'PENDING',
      },
      data: {
        status: 'SUPERSEDED',
        updatedAt: now,
      },
    });
    await tx.meetupOption.updateMany({
      where: {
        proposalId,
        status: 'PENDING',
      },
      data: {
        status: 'DISABLED',
      },
    });
  }

  private async convergeSessionLifecycle(
    tx: MeetupTransactionClient,
    session: MeetupSessionRecord,
    now: Date,
  ) {
    if (
      session.status === 'ACTIVE' &&
      session.expiresAt &&
      session.expiresAt <= now
    ) {
      await this.expireSession(tx, session, now);
      return;
    }

    if (
      session.status === 'LOCKED' &&
      session.archiveEligibleAt &&
      session.archiveEligibleAt <= now
    ) {
      await this.archiveSession(tx, session, now);
    }
  }

  private async expireSession(
    tx: MeetupTransactionClient,
    session: MeetupSessionRecord,
    now: Date,
  ) {
    const result = (await tx.meetupSession.updateMany({
      where: {
        id: session.id,
        status: 'ACTIVE',
        currentProposalId: session.currentProposalId,
        finalConfirmRequiredByUserId: session.finalConfirmRequiredByUserId,
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: 'EXPIRED',
        expiredAt: now,
        currentProposalId: null,
        finalConfirmRequiredByUserId: null,
        lastActiveAt: now,
        expiresAt: null,
        archiveEligibleAt: null,
      },
    })) as CountResult;

    if (result.count === 0) {
      return;
    }

    if (session.currentProposalId) {
      await this.supersedePendingProposal(tx, session.currentProposalId, now);
    }

    await this.clearTurns(tx, session.id);
    await this.createAuditLog(tx, null, 'meetup.expired', {
      sessionId: session.id,
      matchId: session.matchId,
    });
  }

  private async archiveSession(
    tx: MeetupTransactionClient,
    session: MeetupSessionRecord,
    now: Date,
  ) {
    const result = (await tx.meetupSession.updateMany({
      where: {
        id: session.id,
        status: 'LOCKED',
        currentProposalId: session.currentProposalId,
        finalConfirmRequiredByUserId: session.finalConfirmRequiredByUserId,
        archiveEligibleAt: {
          lte: now,
        },
      },
      data: {
        status: 'ARCHIVED',
        archivedAt: now,
        currentProposalId: null,
        finalConfirmRequiredByUserId: null,
        lastActiveAt: now,
      },
    })) as CountResult;

    if (result.count === 0) {
      return;
    }

    await this.clearTurns(tx, session.id);
    await this.createAuditLog(tx, null, 'meetup.archived', {
      sessionId: session.id,
      matchId: session.matchId,
    });
  }

  private async setRequired(
    tx: MeetupTransactionClient,
    sessionId: string,
    requiredUserId: string,
    messageId: string,
    now: Date,
  ) {
    await tx.meetupParticipant.updateMany({
      where: {
        sessionId,
        userId: requiredUserId,
      },
      data: {
        turnState: 'REQUIRED',
        responseRequiredAt: now,
        responseRequiredMessageId: messageId,
      },
    });
    await tx.meetupParticipant.updateMany({
      where: {
        sessionId,
        userId: {
          not: requiredUserId,
        },
      },
      data: {
        turnState: 'WAITING',
        responseRequiredAt: null,
        responseRequiredMessageId: null,
      },
    });
  }

  private async clearTurns(tx: MeetupTransactionClient, sessionId: string) {
    await tx.meetupParticipant.updateMany({
      where: {
        sessionId,
      },
      data: {
        turnState: 'NONE',
        responseRequiredAt: null,
        responseRequiredMessageId: null,
      },
    });
  }

  private async readActiveExpiry(
    tx: MeetupTransactionClient,
    participants: Array<{
      userId: string;
      user?: { meetupExpirationWeeks?: number | null } | null;
    }>,
    now: Date,
  ) {
    const userIds = participants.map((participant) => participant.userId);
    const users = (await tx.user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
      select: {
        id: true,
        meetupExpirationWeeks: true,
      },
    })) as Array<{ id: string; meetupExpirationWeeks?: number | null }>;
    const userWeeksById = new Map(
      users.map((user) => [user.id, user.meetupExpirationWeeks]),
    );
    const participantWeeks = participants.map((participant) =>
      this.normalizeExpirationWeeks(
        userWeeksById.get(participant.userId) ??
          participant.user?.meetupExpirationWeeks,
      ),
    );
    const weeks =
      participantWeeks.length > 0
        ? Math.min(...participantWeeks)
        : DEFAULT_MEETUP_EXPIRATION_WEEKS;

    return {
      weeks,
      expiresAt: this.addWeeks(now, weeks),
    };
  }

  private normalizeExpirationWeeks(value: unknown) {
    if (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= MIN_MEETUP_EXPIRATION_WEEKS &&
      value <= MAX_MEETUP_EXPIRATION_WEEKS
    ) {
      return value;
    }

    return DEFAULT_MEETUP_EXPIRATION_WEEKS;
  }

  private normalizeProposalInput(
    input: CreateMeetupProposalDto,
    now: Date,
  ): NormalizedProposalInput {
    const record = this.readProposalObject(input);
    const scope = record.scope;

    if (
      scope !== 'BOTH' &&
      scope !== 'TIME_ONLY' &&
      scope !== 'LOCATION_ONLY'
    ) {
      throw new BadRequestException('MEETUP_INVALID_PROPOSAL_SCOPE');
    }

    const timeOptions = this.normalizeTimeOptions(record.timeOptions, now);
    const locationOptions = this.normalizeLocationOptions(
      record.locationOptions,
    );

    if (scope === 'BOTH') {
      this.assertOptionCount(timeOptions, 'TIME');
      this.assertOptionCount(locationOptions, 'LOCATION');
    }

    if (scope === 'TIME_ONLY') {
      this.assertOptionCount(timeOptions, 'TIME');
      if (locationOptions.length > 0) {
        throw new BadRequestException(
          'MEETUP_LOCATION_OPTIONS_NOT_ALLOWED_FOR_TIME_ONLY',
        );
      }
    }

    if (scope === 'LOCATION_ONLY') {
      this.assertOptionCount(locationOptions, 'LOCATION');
      if (timeOptions.length > 0) {
        throw new BadRequestException(
          'MEETUP_TIME_OPTIONS_NOT_ALLOWED_FOR_LOCATION_ONLY',
        );
      }
    }

    return {
      scope,
      timeOptions,
      locationOptions,
      notePreset: this.normalizeOptionalText(record.notePreset),
      noteText: this.normalizeOptionalText(record.noteText),
    };
  }

  private readProposalObject(input: unknown): CreateMeetupProposalDto {
    if (!isRecord(input)) {
      throw new BadRequestException('MEETUP_PROPOSAL_REQUIRED');
    }

    return input as unknown as CreateMeetupProposalDto;
  }

  private normalizeTimeOptions(rawOptions: unknown, now: Date) {
    const rawArray = rawOptions === undefined ? [] : rawOptions;
    if (!Array.isArray(rawArray)) {
      throw new BadRequestException('MEETUP_TIME_OPTIONS_INVALID');
    }

    const minimumStartsAt = this.addMinutes(
      now,
      MIN_MEETUP_PROPOSAL_LEAD_MINUTES,
    );
    return rawArray.map((rawOption): NormalizedTimeOptionInput => {
      if (!isRecord(rawOption)) {
        throw new BadRequestException('MEETUP_TIME_OPTION_INVALID');
      }

      const startsAt = this.parseDate(rawOption.startsAt);
      const endsAt = this.parseDate(rawOption.endsAt);
      if (!startsAt || !endsAt) {
        throw new BadRequestException('MEETUP_TIME_OPTION_INVALID');
      }
      if (startsAt >= endsAt) {
        throw new BadRequestException('MEETUP_TIME_OPTION_RANGE_INVALID');
      }
      if (startsAt < minimumStartsAt) {
        throw new BadRequestException('MEETUP_TIME_OPTION_TOO_SOON');
      }

      const toleranceMinutes =
        rawOption.toleranceMinutes === undefined
          ? DEFAULT_MEETUP_TOLERANCE_MINUTES
          : rawOption.toleranceMinutes;

      if (
        typeof toleranceMinutes !== 'number' ||
        !Number.isFinite(toleranceMinutes) ||
        !Number.isInteger(toleranceMinutes) ||
        toleranceMinutes < 0 ||
        toleranceMinutes > 60
      ) {
        throw new BadRequestException('MEETUP_TIME_TOLERANCE_INVALID');
      }

      return {
        startsAt,
        endsAt,
        toleranceMinutes,
      };
    });
  }

  private normalizeLocationOptions(rawOptions: unknown) {
    const rawArray = rawOptions === undefined ? [] : rawOptions;
    if (!Array.isArray(rawArray)) {
      throw new BadRequestException('MEETUP_LOCATION_OPTIONS_INVALID');
    }

    const seenCandidateIds = new Set<string>();
    return rawArray.map((rawOption): NormalizedLocationOptionInput => {
      if (!isRecord(rawOption)) {
        throw new BadRequestException('MEETUP_LOCATION_OPTION_INVALID');
      }

      this.assertNoClientLocationSnapshotFields(rawOption);
      const locationCandidateId = rawOption.locationCandidateId;
      if (
        typeof locationCandidateId !== 'string' ||
        !locationCandidateId.trim()
      ) {
        throw new BadRequestException('MEETUP_LOCATION_CANDIDATE_REQUIRED');
      }

      const normalizedCandidateId = locationCandidateId.trim();
      if (seenCandidateIds.has(normalizedCandidateId)) {
        throw new BadRequestException('MEETUP_LOCATION_CANDIDATE_DUPLICATE');
      }
      seenCandidateIds.add(normalizedCandidateId);

      const candidate = findLocationCandidate(normalizedCandidateId);
      if (!candidate) {
        throw new BadRequestException('MEETUP_LOCATION_CANDIDATE_UNKNOWN');
      }

      return {
        locationCandidateId: normalizedCandidateId,
        candidate,
      };
    });
  }

  private assertNoClientLocationSnapshotFields(
    rawOption: Record<string, unknown>,
  ) {
    const forbiddenFields = [
      'placeName',
      'latitude',
      'longitude',
      'provider',
      'source',
      'externalPlaceId',
    ];
    const submittedForbiddenField = forbiddenFields.find(
      (field) => field in rawOption,
    );

    if (submittedForbiddenField) {
      throw new BadRequestException(
        `MEETUP_LOCATION_FIELD_NOT_ALLOWED:${submittedForbiddenField}`,
      );
    }
  }

  private assertOptionCount(
    options: unknown[],
    kind: Extract<MeetupOptionKind, 'TIME' | 'LOCATION'>,
  ) {
    if (options.length < 2 || options.length > 3) {
      throw new BadRequestException(`MEETUP_${kind}_OPTION_COUNT_INVALID`);
    }
  }

  private scopeResetData(scope: MeetupProposalScope) {
    switch (scope) {
      case 'TIME_ONLY':
        return {
          confirmedTimeOptionId: null,
        };
      case 'LOCATION_ONLY':
        return {
          confirmedLocationOptionId: null,
        };
      case 'BOTH':
        return {
          confirmedTimeOptionId: null,
          confirmedLocationOptionId: null,
        };
    }
  }

  private async claimSessionUpdate(
    tx: MeetupTransactionClient,
    input: { where: Record<string, unknown>; data: Record<string, unknown> },
  ) {
    const result = (await tx.meetupSession.updateMany(input)) as CountResult;
    if (result.count === 0) {
      throw new ConflictException('MEETUP_STALE_STATE');
    }
  }

  private async claimProposalUpdate(
    tx: MeetupTransactionClient,
    input: { where: Record<string, unknown>; data: Record<string, unknown> },
  ) {
    const result = (await tx.meetupProposal.updateMany(input)) as CountResult;
    if (result.count === 0) {
      throw new ConflictException('MEETUP_STALE_PROPOSAL');
    }
  }

  private async createAuditLog(
    tx: MeetupTransactionClient,
    actorId: string | null,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        actorId,
        action,
        metadata,
      },
    });
  }

  private parseDate(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const offsetlessDateTime = OFFSETLESS_DATE_TIME_PATTERN.exec(value);
    if (offsetlessDateTime) {
      return this.parseChinaStandardDateTime(offsetlessDateTime);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseChinaStandardDateTime(match: RegExpExecArray) {
    const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond, rawMs] =
      match;
    const year = Number(rawYear);
    const month = Number(rawMonth);
    const day = Number(rawDay);
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    const second = rawSecond ? Number(rawSecond) : 0;
    const millisecond = rawMs ? Number(rawMs.slice(0, 3).padEnd(3, '0')) : 0;

    if (
      month < 1 ||
      month > 12 ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59
    ) {
      return null;
    }

    const utcMs =
      Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
      CHINA_STANDARD_TIME_OFFSET_MS;
    const roundTrip = new Date(utcMs + CHINA_STANDARD_TIME_OFFSET_MS);

    if (
      roundTrip.getUTCFullYear() !== year ||
      roundTrip.getUTCMonth() + 1 !== month ||
      roundTrip.getUTCDate() !== day ||
      roundTrip.getUTCHours() !== hour ||
      roundTrip.getUTCMinutes() !== minute ||
      roundTrip.getUTCSeconds() !== second ||
      roundTrip.getUTCMilliseconds() !== millisecond
    ) {
      return null;
    }

    return new Date(utcMs);
  }

  private addMinutes(value: Date, minutes: number) {
    return new Date(value.getTime() + minutes * 60 * 1000);
  }

  private addWeeks(value: Date, weeks: number) {
    return new Date(value.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  }

  private normalizeOptionalText(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      isRecord(error) &&
      typeof error.code === 'string' &&
      error.code === 'P2002'
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

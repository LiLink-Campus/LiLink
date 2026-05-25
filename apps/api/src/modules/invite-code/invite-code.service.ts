import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  HARD_MATCH_GENDERS,
  HARD_MATCH_KEYS,
  readSingleChoice,
} from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from '../../common/prisma/errors';
import { clampPositiveInt } from '../../common/pagination';
import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
} from '../../common/validation/input-limits';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_GENERATION_MAX_ATTEMPTS,
  INVITE_CODE_LENGTH,
} from './constants';

export interface InviteCodeStats {
  total: number;
  male: number;
  female: number;
  nonBinary: number;
  unknown: number;
}

interface InviteCodeRecord {
  id: string;
  code: string;
  ownerName: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ListInviteCodesQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'active' | 'inactive';
}

@Injectable()
export class InviteCodeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a recruiter mapping (owner name -> random code). The audit row is
   * written in the same transaction as the insert so we never end up with a
   * created code that has no audit trail. Audit metadata stores only the id,
   * never the private name<->code mapping.
   */
  async createInviteCode(ownerName: string, adminActorId: string) {
    const trimmedName = ownerName.trim();
    if (!trimmedName) {
      throw new BadRequestException('Owner name is required.');
    }

    for (
      let attempt = 0;
      attempt < INVITE_CODE_GENERATION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const code = this.generateCandidateCode();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const created = await tx.inviteCode.create({
            data: { code, ownerName: trimmedName },
          });
          await tx.auditLog.create({
            data: {
              adminActorId,
              action: 'invite_code.create',
              metadata: { inviteCodeId: created.id },
            },
          });
          return this.toInviteCodeView(created);
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    throw new InternalServerErrorException(
      'Failed to generate a unique invite code.',
    );
  }

  async setInviteCodeActive(
    id: string,
    isActive: boolean,
    adminActorId: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.inviteCode.update({
          where: { id },
          data: { isActive },
        });
        await tx.auditLog.create({
          data: {
            adminActorId,
            action: 'invite_code.set_active',
            metadata: { inviteCodeId: id, isActive },
          },
        });
        return this.toInviteCodeView(updated);
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Invite code not found.');
      }
      throw error;
    }
  }

  /**
   * Resolve an invite code supplied at registration. Returns the invite code id
   * for an active code, null when no code was supplied, and throws when a
   * non-empty code does not match an active code. Never exposes the owner.
   */
  async resolveActiveCodeId(raw?: string | null): Promise<string | null> {
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    if (!code) return null;

    const found = await this.prisma.inviteCode.findUnique({ where: { code } });
    if (!found || !found.isActive) {
      throw new BadRequestException('Invite code is invalid or inactive.');
    }
    return found.id;
  }

  async listInviteCodes(query: ListInviteCodesQuery) {
    const page = clampPositiveInt(query.page, 1, ADMIN_LIST_PAGE_MAX);
    const pageSize = clampPositiveInt(
      query.pageSize,
      20,
      ADMIN_LIST_PAGE_SIZE_MAX,
    );
    const skip = (page - 1) * pageSize;

    const where: Prisma.InviteCodeWhereInput = {};
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { ownerName: { contains: search, mode: 'insensitive' } },
        { code: { contains: search.toUpperCase(), mode: 'insensitive' } },
      ];
    }
    if (query.status === 'active') where.isActive = true;
    else if (query.status === 'inactive') where.isActive = false;

    const [codes, total] = await Promise.all([
      this.prisma.inviteCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.inviteCode.count({ where }),
    ]);

    const statsByCode = await this.computeStats(codes.map((code) => code.id));

    return {
      items: codes.map((code) => ({
        ...this.toInviteCodeView(code),
        stats: statsByCode.get(code.id) ?? this.emptyStats(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private generateCandidateCode() {
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
      code += INVITE_CODE_ALPHABET[randomInt(0, INVITE_CODE_ALPHABET.length)];
    }
    return code;
  }

  private toInviteCodeView(record: InviteCodeRecord) {
    return {
      id: record.id,
      code: record.code,
      ownerName: record.ownerName,
      isActive: record.isActive,
      createdAt: record.createdAt,
    };
  }

  private emptyStats(): InviteCodeStats {
    return { total: 0, male: 0, female: 0, nonBinary: 0, unknown: 0 };
  }

  /**
   * Live-derive per-code gender headcounts from the latest submitted
   * questionnaire answer. Test accounts are excluded; unsubmitted/unknown
   * genders fall into the `unknown` bucket.
   */
  private async computeStats(
    inviteCodeIds: string[],
  ): Promise<Map<string, InviteCodeStats>> {
    const result = new Map<string, InviteCodeStats>();
    for (const id of inviteCodeIds) result.set(id, this.emptyStats());
    if (inviteCodeIds.length === 0) return result;

    const users = await this.prisma.user.findMany({
      where: { inviteCodeId: { in: inviteCodeIds }, isTest: false },
      select: {
        inviteCodeId: true,
        questionnaireResponse: {
          select: { submittedAt: true, answers: true },
        },
      },
    });

    for (const user of users) {
      if (!user.inviteCodeId) continue;
      const bucket = result.get(user.inviteCodeId);
      if (!bucket) continue;
      bucket.total += 1;
      switch (this.resolveSubmittedGender(user.questionnaireResponse)) {
        case '男':
          bucket.male += 1;
          break;
        case '女':
          bucket.female += 1;
          break;
        case '非二元':
          bucket.nonBinary += 1;
          break;
        default:
          bucket.unknown += 1;
      }
    }

    return result;
  }

  private resolveSubmittedGender(
    response: { submittedAt: Date | null; answers: Prisma.JsonValue } | null,
  ) {
    if (!response?.submittedAt) return null;
    const answers = response.answers;
    if (
      typeof answers !== 'object' ||
      answers === null ||
      Array.isArray(answers)
    ) {
      return null;
    }
    return readSingleChoice(
      (answers as Record<string, unknown>)[HARD_MATCH_KEYS.gender],
      HARD_MATCH_GENDERS,
    );
  }
}

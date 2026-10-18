import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { EducationStatus } from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isUniqueConstraintError } from '../../common/prisma/errors';
import { MailService } from '../../common/mail/mail.service';
import { SchoolResolverService } from '../../common/schools/school-resolver.service';
import {
  lockSchoolCatalog,
  resolveSchoolEmail,
} from '../../common/schools/school-catalog';
import {
  VerificationCodes,
  type TransactionClient,
} from '../auth/verification-codes';
import { PublicService } from '../public/public.service';

const select = {
  educationVerifiedAt: true,
  educationVerificationMethod: true,
  schoolId: true,
  school: { select: { name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class EducationService {
  private readonly codes: VerificationCodes;
  constructor(
    private readonly prisma: PrismaService,
    mail: MailService,
    private readonly schools: SchoolResolverService,
    private readonly publicService: PublicService,
  ) {
    this.codes = new VerificationCodes(prisma, mail);
  }

  async status(userId: string): Promise<EducationStatus> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select,
    });
    const method = user.educationVerificationMethod;
    return {
      verified: user.educationVerifiedAt !== null,
      verifiedAt: user.educationVerifiedAt?.toISOString() ?? null,
      method:
        method === 'SCHOOL_EMAIL' || method === 'INVITE' || method === 'LEGACY'
          ? method
          : null,
      schoolId: user.schoolId,
      schoolName: user.school?.name ?? null,
    };
  }

  async verifyInvite(userId: string, rawCode: string, schoolId: string) {
    const referralCode = rawCode.trim().toUpperCase();
    await this.prisma.$transaction(async (tx) => {
      await lockSchoolCatalog(tx, 'read');
      const referrer = await tx.user.findUnique({
        where: { referralCode },
        select: { id: true },
      });
      // Deterministic row order also covers cross-invitations and email upgrades.
      const ids = [
        ...new Set([userId, ...(referrer ? [referrer.id] : [])]),
      ].sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR NO KEY UPDATE`,
      );
      const user = await this.activeUser(tx, userId);
      if (user.educationVerifiedAt) return;
      if (!referrer || referrer.id === userId)
        throw new BadRequestException('邀请码无效，请更换邀请码。');
      const school = await tx.school.findUnique({
        where: { id: schoolId },
        select: { id: true },
      });
      if (!school) throw new BadRequestException('请选择有效的认证学校。');
      const debited = await tx.$executeRaw`
        UPDATE "User" SET "nonEduReferralUses" = "nonEduReferralUses" + 1
        WHERE "id" = ${referrer.id} AND "status" = 'ACTIVE' AND "deactivatedAt" IS NULL
          AND "educationVerifiedAt" IS NOT NULL
          AND "nonEduReferralUses" < "nonEduReferralLimit"
      `;
      if (debited !== 1)
        throw new BadRequestException('邀请码无效或教育认证名额已用完。');
      await tx.user.update({
        where: { id: userId },
        data: {
          educationVerifiedAt: new Date(),
          educationVerificationMethod: 'INVITE',
          schoolId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'education.verified',
          metadata: { method: 'INVITE' },
        },
      });
    });
    this.publicService.invalidateLandingCache();
    return this.status(userId);
  }

  async requestEmailCode(userId: string, rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.activeUser(this.prisma, userId);
    if (user.educationVerifiedAt)
      throw new BadRequestException('你已通过教育认证。');
    await this.resolveSchool(email);
    await this.assertEmailAvailable(this.prisma, userId, email);
    const delivery = await this.codes.send(email, `education:${userId}`);
    return { expiresAt: delivery.expiresAt };
  }

  async verifyEmail(userId: string, rawEmail: string, code: string) {
    const email = rawEmail.trim().toLowerCase();
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockSchoolCatalog(tx, 'read');
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
        const user = await this.activeUser(tx, userId);
        if (user.educationVerifiedAt) return;
        // Share the mailbox lock with registration, across both unique columns.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`;
        const school = await resolveSchoolEmail(tx, email);
        if (!school)
          throw new BadRequestException(
            '请使用当前支持的学校邮箱进行教育认证。',
          );
        await this.assertEmailAvailable(tx, userId, email);
        await this.codes.consume(tx, email, `education:${userId}`, code);
        await tx.user.update({
          where: { id: userId },
          data: {
            educationVerifiedAt: new Date(),
            educationVerificationMethod: 'SCHOOL_EMAIL',
            educationEmail: email,
            schoolId: school.schoolId,
            nonEduReferralLimit: Math.max(3, user.nonEduReferralLimit),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: 'education.verified',
            metadata: { method: 'SCHOOL_EMAIL' },
          },
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new BadRequestException('该教育邮箱已被其他账号使用。');
      throw error;
    }
    this.publicService.invalidateLandingCache();
    return this.status(userId);
  }

  private async resolveSchool(email: string) {
    const school = await this.schools.resolveByEmail(email);
    if (!school)
      throw new BadRequestException('请使用当前支持的学校邮箱进行教育认证。');
    return school;
  }

  private async activeUser(
    store: Pick<TransactionClient, 'user'>,
    userId: string,
  ) {
    const user = await store.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE' || user.deactivatedAt)
      throw new UnauthorizedException('账号不可用。');
    return user;
  }

  private async assertEmailAvailable(
    store: Pick<TransactionClient, 'user'>,
    userId: string,
    email: string,
  ) {
    const other = await store.user.findFirst({
      where: {
        id: { not: userId },
        OR: [{ email }, { educationEmail: email }],
      },
      select: { id: true },
    });
    if (other) throw new BadRequestException('该教育邮箱已被其他账号使用。');
  }
}

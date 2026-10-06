import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isRecordNotFoundError } from '../../common/prisma/errors';
import { syncQuestionnaireSchoolAnswers } from '../questionnaire/questionnaire-school-sync';
import { AdminAuditService } from './admin-audit.service';
import {
  AdminUpdateUserDto,
  UpdateUserReferralLimitDto,
  UpdateUserStatusDto,
} from './dto';

@Injectable()
export class AdminUserWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAuditService: AdminAuditService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
  ) {}

  async updateUserStatus(
    userId: string,
    input: UpdateUserStatusDto,
    adminActorId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.deactivatedAt)
      throw new BadRequestException(
        'Deactivated accounts cannot be reactivated or edited.',
      );

    const updatedUser = await this.prisma.user
      .update({
        where: { id: userId, deactivatedAt: null },
        data: {
          status: input.status,
        },
        omit: { passwordHash: true },
      })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) {
          throw new BadRequestException(
            'Deactivated accounts cannot be reactivated or edited.',
          );
        }
        throw error;
      });

    await this.adminAuditService.write(adminActorId, 'user.status_updated', {
      userId,
      status: input.status,
    });

    return updatedUser;
  }

  async updateUser(
    userId: string,
    input: AdminUpdateUserDto,
    adminActorId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.deactivatedAt)
      throw new BadRequestException(
        'Deactivated accounts cannot be reactivated or edited.',
      );

    const updateData: Record<string, unknown> = {};
    if (input.displayName !== undefined)
      updateData.displayName = input.displayName;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.schoolId !== undefined)
      updateData.schoolId = input.schoolId || null;

    if (input.email !== undefined) {
      const normalizedEmail = input.email.trim().toLowerCase();
      const existingUser = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException(
          'This email is already in use by another user.',
        );
      }
      updateData.email = normalizedEmail;
    }

    const profileData: Record<string, string | null> = {};
    for (const field of [
      'headline',
      'bio',
      'schoolYear',
      'programName',
    ] as const) {
      if (input[field] !== undefined) profileData[field] = input[field];
    }
    const updatedFields = [
      ...Object.keys(updateData),
      ...Object.keys(profileData),
    ];
    if (updatedFields.length === 0) {
      throw new BadRequestException('No fields to update.');
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const nextUser = await tx.user
        .update({
          where: { id: userId, deactivatedAt: null },
          data: {
            ...updateData,
            ...(Object.keys(profileData).length > 0
              ? {
                  profile: {
                    upsert: { create: profileData, update: profileData },
                  },
                }
              : {}),
          },
          omit: { passwordHash: true },
        })
        .catch((error: unknown) => {
          if (isRecordNotFoundError(error)) {
            throw new BadRequestException(
              'Deactivated accounts cannot be reactivated or edited.',
            );
          }
          throw error;
        });

      if (input.schoolId === undefined) {
        return nextUser;
      }

      const response = await tx.questionnaireResponse.findUnique({
        where: { userId },
        select: {
          id: true,
          answers: true,
        },
      });

      if (!response) {
        return nextUser;
      }

      const schools = await tx.school.findMany({
        select: { id: true },
        orderBy: { name: 'asc' },
      });
      const syncedAnswers = syncQuestionnaireSchoolAnswers(
        response.answers as Record<string, unknown>,
        {
          currentSchoolId: nextUser.schoolId ?? null,
          allowedSchoolIds: schools.map((school) => school.id),
        },
      );

      await tx.questionnaireResponse.update({
        where: { id: response.id },
        data: {
          answers: syncedAnswers,
        },
      });

      return nextUser;
    });

    await this.adminAuditService.write(adminActorId, 'user.updated', {
      userId,
      fields: updatedFields,
    });

    if (
      input.displayName !== undefined ||
      input.email !== undefined ||
      input.schoolId !== undefined ||
      Object.keys(profileData).length > 0
    ) {
      await this.dashboardSnapshotService.syncUserMatchSnapshots(userId);
    }

    return updatedUser;
  }

  async updateUserReferralLimit(
    userId: string,
    input: UpdateUserReferralLimitDto,
    adminActorId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nonEduReferralLimit: true,
        nonEduReferralUses: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nonEduReferralLimit: input.nonEduReferralLimit,
      },
      omit: { passwordHash: true },
    });

    await this.adminAuditService.write(
      adminActorId,
      'user.referral_limit_updated',
      {
        userId,
        previousLimit: user.nonEduReferralLimit,
        nextLimit: input.nonEduReferralLimit,
        nonEduReferralUses: user.nonEduReferralUses,
      },
    );

    return updatedUser;
  }
}

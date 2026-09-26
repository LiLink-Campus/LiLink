import { normalizeLocale } from '@lilink/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateLocaleDto, UpdateProfileDto } from './dto';
import { normalizeProfileDisplayName } from './profile-display-name';

@Injectable()
export class AccountProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
  ) {}
  async getUserSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return {
      ...user,
      preferredLocale: normalizeLocale(user.preferredLocale),
    };
  }
  async updateLocale(userId: string, input: UpdateLocaleDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { preferredLocale: input.locale },
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
      },
    });

    return {
      ...user,
      preferredLocale: normalizeLocale(user.preferredLocale),
    };
  }
  async updateProfile(userId: string, input: UpdateProfileDto) {
    const { displayName, ...profileFields } = input;
    const normalizedDisplayName =
      displayName !== undefined
        ? normalizeProfileDisplayName(displayName)
        : undefined;

    if (normalizedDisplayName !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { displayName: normalizedDisplayName },
      });
    }

    const hasProfileFields = Object.keys(profileFields).length > 0;

    const profile = hasProfileFields
      ? await this.prisma.userProfile.upsert({
          where: { userId },
          create: { userId, ...profileFields },
          update: profileFields,
        })
      : await this.prisma.userProfile.findUnique({ where: { userId } });

    if (
      normalizedDisplayName !== undefined ||
      profileFields.headline !== undefined
    ) {
      await this.dashboardSnapshotService.syncUserMatchSnapshots(userId);
    }

    return profile;
  }
  async getProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Profile has not been created yet.');
    }

    return profile;
  }
}

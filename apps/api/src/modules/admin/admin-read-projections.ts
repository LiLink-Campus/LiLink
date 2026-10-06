import { Prisma } from '../../common/prisma/client';

export const adminSchoolNameSelect = {
  name: true,
} satisfies Prisma.SchoolSelect;

export const adminUserProfileSelect = {
  fullName: true,
  headline: true,
  bio: true,
  schoolYear: true,
  programName: true,
} satisfies Prisma.UserProfileSelect;

export const adminUserListSelect = {
  id: true,
  email: true,
  status: true,
  displayName: true,
  isTest: true,
  createdAt: true,
  nonEduReferralLimit: true,
  nonEduReferralUses: true,
  school: {
    select: adminSchoolNameSelect,
  },
  profile: {
    select: adminUserProfileSelect,
  },
  questionnaireResponse: {
    select: {
      submittedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

export const adminReportListSelect = {
  id: true,
  matchId: true,
  reason: true,
  details: true,
  status: true,
  adminNotes: true,
  handledAt: true,
  createdBlock: true,
  createdAt: true,
  reporter: {
    select: {
      email: true,
      displayName: true,
      school: {
        select: adminSchoolNameSelect,
      },
    },
  },
  reportedUser: {
    select: {
      email: true,
      displayName: true,
      school: {
        select: adminSchoolNameSelect,
      },
    },
  },
} satisfies Prisma.ReportSelect;

export const MATCHABLE_CYCLE_PARTICIPATION_WHERE = {
  status: 'OPTED_IN' as const,
  intent: { not: null },
  user: {
    status: 'ACTIVE' as const,
    deactivatedAt: null,
  },
} satisfies Prisma.CycleParticipationWhereInput;

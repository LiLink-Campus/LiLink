import type { ReferralMedium, ReferralScene } from "@lilink/shared";
import type { WeeklyIntent } from "../../lib/weekly-intent";

export type AdminSchool = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  domains: Array<{ id: string; domain: string }>;
  _count: {
    users: number;
  };
};

// --- Merchant promotion system (admin views) ---

export type AdminCampaign = {
  id: string;
  name: string;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "ENDED";
  isDefault: boolean;
  startsAt: string | null;
  endsAt: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  templateCount: number;
  activationCount: number;
};

export type AdminCouponTemplate = {
  id: string;
  campaignId: string;
  merchantId: string;
  title: string;
  description: string | null;
  benefitType: string;
  faceValue: number;
  validDays: number | null;
  validUntil: string | null;
  rule: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  merchant?: { id: string; name: string; isActive: boolean };
  couponCount?: number;
};

export type AdminMerchant = {
  id: string;
  name: string;
  contactInfo: string | null;
  promotionBlocks: unknown[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  templateCount: number;
  redemptionCount: number;
};

export type AdminMerchantUser = {
  id: string;
  merchantId: string;
  email: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PromotionFunnelStep = { key: string; count: number };

export type PromotionChannelBreakdownRow = {
  medium: ReferralMedium;
  scene: ReferralScene | null;
  share: number;
  click: number;
};

export type PromotionFunnel = {
  campaignId: string;
  steps: PromotionFunnelStep[];
  byGender: { gender: string; steps: PromotionFunnelStep[] }[];
  conversions: { from: string; to: string; rate: number }[];
  channelBreakdown?: PromotionChannelBreakdownRow[];
};

export type PromotionLeaderboardRow = {
  sourceType: "PERSONAL" | "DEFAULT";
  refLabel: string;
  invited: number;
  registered: number;
  activated: number;
  granted: number;
  redeemed: number;
  byGender: {
    male: number;
    female: number;
    nonBinary: number;
    unknown: number;
  };
};

export type PromotionCouponsRow = {
  merchantId: string;
  merchantName: string;
  granted: number;
  redeemed: number;
};

export type PromotionRedemptionRow = {
  merchantId: string;
  merchantName: string;
  day: string;
  count: number;
  faceValueTotal: number;
};

export type AdminCycle = {
  id: string;
  codename: string;
  participationDeadline: string;
  revealAt: string;
  status: "DRAFT" | "OPEN" | "PREPARING" | "REVEAL_READY" | "REVEALED";
  notes: string | null;
  _count: {
    participations: number;
    matches: number;
  };
};

type AdminQuestionOption = {
  value: string;
  label: string;
};

export type AdminQuestion = {
  id: string;
  key: string;
  prompt: string;
  type: "SINGLE_SELECT" | "MULTI_SELECT" | "SCALE";
  selectionLimit: number | null;
  options: AdminQuestionOption[] | null;
  order: number;
  weight: number;
};

export type AdminUser = {
  id: string;
  email: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  displayName: string | null;
  isTest: boolean;
  createdAt: string;
  school: { name: string } | null;
  profile: {
    fullName: string | null;
    headline: string | null;
    bio: string | null;
    schoolYear: string | null;
    programName: string | null;
  } | null;
  questionnaireResponse: {
    submittedAt: string | null;
  } | null;
};

export type AdminUserDetail = AdminUser & {
  participationCount: number;
  questionnaireAnswerCount: number;
};

export type AdminUserQuestionnaire = {
  submittedAt: string | null;
  answers: Record<string, unknown>;
} | null;

export type AdminUserParticipation = {
  cycleId: string;
  status: "OPTED_IN" | "OPTED_OUT";
};

export type AdminReport = {
  id: string;
  matchId: string | null;
  reason: string;
  details: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  adminNotes: string | null;
  handledAt: string | null;
  createdBlock: boolean;
  createdAt: string;
  reporter: {
    email: string;
    displayName: string | null;
    school: { name: string } | null;
  };
  reportedUser: {
    email: string;
    displayName: string | null;
    school: { name: string } | null;
  };
};

export type AuditLogEntry = {
  id: string;
  action: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  actor: {
    email: string;
    displayName: string | null;
    school: { name: string } | null;
  } | null;
};

export type AdminDashboardData = {
  metrics: {
    schools: number;
    activeUsers: number;
    completedQuestionnaires: number;
    openReports: number;
  };
  recentCycles: AdminCycle[];
  openReports: AdminReport[];
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CycleParticipantDetail = {
  id: string;
  status: "OPTED_IN" | "OPTED_OUT";
  intent: WeeklyIntent | null;
  optedInAt: string | null;
  updatedAt: string;
  user: AdminUser;
};

export type CycleMatchFeedback = {
  id: string;
  authorUserId: string;
  subjectUserId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CycleMatchDetail = {
  id: string;
  score: number;
  revealedAt: string | null;
  introducedAt: string | null;
  participants: Array<{
    id: string;
    userId: string;
    position: number;
    contactRequestedAt: string | null;
    user: Pick<
      AdminUser,
      "id" | "email" | "displayName" | "school" | "profile" | "status"
    >;
  }>;
  reports: AdminReport[];
  feedback: CycleMatchFeedback[];
};

export type AdminCycleDetail = {
  cycle: AdminCycle;
  summary: {
    participationCount: number;
    matchableParticipantCount: number;
    submittedQuestionnaireCount: number;
    matchedPairCount: number;
    reportedMatchCount: number;
    pendingContactCount: number;
  };
};

export type AdminCyclePreview = {
  cycleId: string;
  message?: string;
  totalCandidateCount?: number;
  candidates: Array<{
    leftUserId: string;
    rightUserId: string;
    leftDisplayName: string | null;
    rightDisplayName: string | null;
    score: number;
  }>;
  suggestedPairs: Array<{
    leftUserId: string;
    rightUserId: string;
    leftDisplayName: string | null;
    rightDisplayName: string | null;
    score: number;
  }>;
  unmatchedUserIds: string[];
};

export type AdminReportContext = {
  report: AdminReport & {
    reporter: Pick<
      AdminUser,
      "id" | "email" | "displayName" | "school" | "profile" | "status"
    >;
    reportedUser: Pick<
      AdminUser,
      "id" | "email" | "displayName" | "school" | "profile" | "status"
    > & {
      reportsReceived: AdminReport[];
      reportsFiled: AdminReport[];
    };
    match: {
      id: string;
      introducedAt: string | null;
      participants: Array<{
        id: string;
        userId: string;
        position: number;
        contactRequestedAt: string | null;
        user: Pick<
          AdminUser,
          "id" | "email" | "displayName" | "school" | "profile" | "status"
        >;
      }>;
      reports: AdminReport[];
    } | null;
  };
  riskProfile: {
    reportedUserStatus: AdminUser["status"];
    receivedReportCount: number;
    filedReportCount: number;
    resolvedReportCount: number;
    openReportCount: number;
    mutualBlocks: Array<{
      id: string;
      blockerId: string;
      blockedId: string;
      createdAt: string;
    }>;
  };
  logs: AuditLogEntry[];
};

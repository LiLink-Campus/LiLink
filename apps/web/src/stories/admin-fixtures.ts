import type {
  AdminUserDetail,
  AdminSchool,
  AdminCycle,
  AdminCycleDetail,
  AdminDashboardData,
  AdminReport,
  AdminQuestion,
  AuditLogEntry,
  AdminCampaign,
  AdminMerchant,
  AdminCouponTemplate,
  AdminMerchantUser,
  PromotionFunnel,
} from "@/app/admin/types";
import type {
  SchoolsGenderResponse,
  WeeklyOptinResponse,
  MatchLeaderboardResponse,
} from "@/app/admin/analytics/types";
import { now } from "./site-fixtures";
export const adminUser: AdminUserDetail = {
  id: "user-story",
  email: "linhe@example.test",
  displayName: "林和",
  status: "ACTIVE",
  isTest: true,
  createdAt: now,
  nonEduReferralLimit: 3,
  nonEduReferralUses: 1,
  school: { name: "青禾大学" },
  profile: {
    fullName: "林和",
    headline: "喜欢散步与阅读",
    bio: "合成用户，用于页面验证",
    schoolYear: "大三",
    programName: "计算机科学",
  },
  questionnaireResponse: { submittedAt: now },
  participationCount: 3,
  questionnaireAnswerCount: 12,
};
export const adminSchool: AdminSchool = {
  id: "school-story",
  name: "青禾大学",
  slug: "qinghe",
  description: "合成学校",
  registrationEligible: true,
  domains: [{ id: "domain-story", domain: "qinghe.example.edu" }],
  _count: { users: 24 },
};
export const cycle: AdminCycle = {
  id: "cycle-story",
  codename: "春日相遇",
  participationDeadline: "2030-04-10T12:00:00Z",
  revealAt: "2030-04-12T12:00:00Z",
  status: "OPEN",
  notes: "合成轮次",
  _count: { participations: 24, matches: 0 },
};
export const cycleDetail: AdminCycleDetail = {
  cycle,
  summary: {
    participationCount: 24,
    matchableParticipantCount: 24,
    submittedQuestionnaireCount: 22,
    matchedPairCount: 0,
    reportedMatchCount: 0,
    pendingContactCount: 0,
  },
};
export const report: AdminReport = {
  id: "report-story",
  matchId: "match-story",
  reason: "不友善言行",
  details: "合成举报，供审核界面演示。",
  status: "OPEN",
  adminNotes: null,
  handledAt: null,
  createdBlock: false,
  createdAt: now,
  reporter: adminUser,
  reportedUser: {
    email: "other@example.test",
    displayName: "陈一诺",
    school: { name: "远山大学" },
  },
};
export const audit: AuditLogEntry = {
  id: "audit-story",
  action: "CYCLE_CREATED",
  createdAt: now,
  metadata: { codename: cycle.codename },
  actor: adminUser,
};
export const adminQuestions: AdminQuestion[] = [
  {
    id: "question-story",
    key: "weekend",
    prompt: "周末你更喜欢怎样度过？",
    type: "SINGLE_SELECT",
    selectionLimit: null,
    options: [
      { value: "outside", label: "出门走走" },
      { value: "home", label: "在家休息" },
    ],
    order: 0,
    weight: 1,
  },
];
export const overview: AdminDashboardData = {
  metrics: { schools: 2, activeUsers: 24, completedQuestionnaires: 22, openReports: 1 },
  recentCycles: [cycle],
  openReports: [report],
};
export const campaign: AdminCampaign = {
  id: "campaign-story",
  name: "春日咖啡活动",
  slug: "spring",
  status: "ACTIVE",
  isDefault: true,
  startsAt: "2030-04-01T08:00:00Z",
  endsAt: "2030-05-01T08:00:00Z",
  description: "合成推广活动",
  createdAt: now,
  updatedAt: now,
  templateCount: 1,
  activationCount: 12,
};
export const adminMerchant: AdminMerchant = {
  id: "merchant-story",
  name: "青禾咖啡",
  contactInfo: "clerk@example.test",
  promotionBlocks: [],
  isActive: true,
  createdAt: now,
  updatedAt: now,
  templateCount: 1,
  redemptionCount: 8,
};
export const template: AdminCouponTemplate = {
  id: "template-story",
  campaignId: campaign.id,
  merchantId: adminMerchant.id,
  title: "双人咖啡券",
  description: "满50元减10元",
  benefitType: "FULL_REDUCTION",
  faceValue: 1000,
  validDays: 30,
  validUntil: null,
  rule: {
    version: 1,
    tiers: [{ minSpend: 5000, benefit: { type: "AMOUNT_OFF", amountOff: 1000 } }],
  },
  isActive: true,
  createdAt: now,
  updatedAt: now,
  merchant: adminMerchant,
  couponCount: 12,
};
export const clerk: AdminMerchantUser = {
  id: "clerk-story",
  merchantId: adminMerchant.id,
  email: "clerk@example.test",
  displayName: "店员小禾",
  role: "STAFF",
  isActive: true,
  lastLoginAt: now,
  createdAt: now,
  updatedAt: now,
};
const gender = { male: 10, female: 11, nonBinary: 1, unknown: 2 };
export const schoolGender: SchoolsGenderResponse = {
  schools: [{ schoolId: adminSchool.id, schoolName: adminSchool.name, ...gender, total: 24 }],
  totals: { ...gender, total: 24, submitted: 22 },
  includeTest: false,
};
export const weekly: WeeklyOptinResponse = {
  cycles: [0, 1, 2].map((i) => ({
    cycleId: `cycle-${i}`,
    codename: `春日第${i + 1}轮`,
    revealAt: now,
    status: "REVEALED",
    optedIn: { ...gender, total: 24 },
    femaleShare: gender.female / (gender.male + gender.female),
  })),
  includeTest: false,
};
const leader = {
  userId: adminUser.id,
  displayName: adminUser.displayName,
  email: adminUser.email,
  schoolName: adminSchool.name,
  optInRounds: 3,
  matchedRounds: 2,
  matchRate: 2 / 3,
  currentMatchStreak: 2,
  currentUnmatchedStreak: 0,
};
export const leaderboard: MatchLeaderboardResponse = {
  male: [leader],
  female: [
    { ...leader, userId: "other-story", displayName: "陈一诺", email: "other@example.test" },
  ],
  sort: "matchedRounds",
  order: "desc",
  limit: 10,
  includeTest: false,
};
export const funnel: PromotionFunnel = {
  campaignId: campaign.id,
  steps: ["SHARE", "CLICK", "REGISTER", "ACTIVATE", "GRANT", "REDEEM"].map((key, i) => ({
    key,
    count: 30 - i * 5,
  })),
  byGender: [],
  conversions: [],
  channelBreakdown: [],
};

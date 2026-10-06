import type { ContactChannelType, EditableContactChannelType } from "./contact-channel";
import type { WeeklyIntent } from "./weekly-intent";
import type { SupportedLocale } from "./locale";
import type {
  QuestionnairePayload,
  SavedQuestionnairePayload,
  QuestionnaireAttentionPayload,
} from "./questionnaire-types";
import type { computeQuestionnaireProgress } from "./questionnaire-progress";

export const DashboardHistoryResult = {
  MATCHED: "MATCHED",
  UNMATCHED: "UNMATCHED",
  NOT_PARTICIPATED: "NOT_PARTICIPATED",
} as const;
export type DashboardHistoryResult =
  (typeof DashboardHistoryResult)[keyof typeof DashboardHistoryResult];
export const DashboardHistoryVisibility = {
  VISIBLE: "VISIBLE",
  LIMITED: "LIMITED",
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;
export type DashboardHistoryVisibility =
  (typeof DashboardHistoryVisibility)[keyof typeof DashboardHistoryVisibility];
export const DashboardHistoryLimitedReason = {
  REPORTED: "REPORTED",
  BLOCKED: "BLOCKED",
  ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED",
} as const;
export type DashboardHistoryLimitedReason =
  (typeof DashboardHistoryLimitedReason)[keyof typeof DashboardHistoryLimitedReason];

export type DashboardUser = {
  id: string;
  email: string;
  displayName: string | null;
  preferredLocale: SupportedLocale;
};
export type ContactMethodPayload = { type: EditableContactChannelType; value: string };
export type ContactPreferencesPayload = {
  revision: number;
  email: string;
  preferredContactChannel: ContactChannelType;
  methods: ContactMethodPayload[];
};
export type DashboardPublicContact = { type: ContactChannelType; label: string; value: string };
export type DashboardMatchParticipant = {
  userId: string;
  displayName: string | null;
  introLine: string | null;
  email: string | null;
  contact: DashboardPublicContact | null;
  schoolName: string | null;
  gender: string | null;
  partnerGenders: string[];
  weeklyIntent: WeeklyIntent | null;
};
export type DashboardMatch = {
  id: string;
  score: number;
  introducedAt: string | null;
  reportStatus: "OPEN" | "RESOLVED" | "DISMISSED" | null;
  participants: DashboardMatchParticipant[];
};
export type DashboardHistoryItem = {
  cycleId: string;
  codename: string;
  revealAt: string;
  participationStatus: "OPTED_IN" | "OPTED_OUT";
  result: DashboardHistoryResult;
  visibility: DashboardHistoryVisibility;
  limitedReason: DashboardHistoryLimitedReason | null;
  match: DashboardMatch | null;
};
export type DashboardCurrentCycle = {
  id: string;
  codename: string;
  revealAt: string;
  participationDeadline: string;
  status: "DRAFT" | "OPEN" | "PREPARING" | "REVEAL_READY" | "REVEALED";
  participationStatus: "OPTED_IN" | "OPTED_OUT";
  intent: WeeklyIntent | null;
};
export type DashboardLastRevealedRound = {
  cycleId: string;
  codename: string;
  revealAt: string;
  participationStatus: "OPTED_IN" | "OPTED_OUT";
  matched: boolean;
};
export type CouponAgendaReadState = {
  target: string;
  version: string;
  availableCount: number;
  unreadAvailableCount: number;
  read: boolean;
  readAt: string | null;
  href: "/dashboard/coupons";
};
// Profile metadata remains an opaque legacy JSON object; its dates are projected by the API.
export type DashboardPayload = {
  profile: Record<string, unknown> | null;
  questionnaireSubmittedAt: string | null;
  currentCycle: DashboardCurrentCycle | null;
  lastRevealedRound: DashboardLastRevealedRound | null;
  latestMatch: DashboardMatch | null;
  latestMatchVisibility: DashboardHistoryVisibility | null;
  latestMatchLimitedReason: DashboardHistoryLimitedReason | null;
  recentMatchHistory: DashboardHistoryItem[];
  couponAgenda: CouponAgendaReadState;
};
export type DashboardBootstrapPayload = { user: DashboardUser; dashboard: DashboardPayload };
export type VipStatus = {
  active: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  durationDays: number;
  priceYuan: string;
  advancedFiltersAvailable: boolean;
};
export type HomePageData = DashboardBootstrapPayload & {
  questionnaireProgress: ReturnType<typeof computeQuestionnaireProgress>;
  questionnaireAttention: QuestionnaireAttentionPayload | null;
  contactPreferences: ContactPreferencesPayload;
};
export type ProfilePageData = {
  user: DashboardUser;
  questionnaire: QuestionnairePayload;
  savedQuestionnaire: SavedQuestionnairePayload;
  contactPreferences: ContactPreferencesPayload;
  dashboard: Pick<DashboardPayload, "questionnaireSubmittedAt">;
  vip: VipStatus | null;
};
export type CenterPageData = { user: DashboardUser; vip: VipStatus | null };

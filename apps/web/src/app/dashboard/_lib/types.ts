import type { WeeklyIntent } from "../../../lib/weekly-intent";
import type {
  ContactChannelType,
  EditableContactChannelType,
  SupportedLocale,
} from "@lilink/shared";
import type {
  CouponAgendaReadState,
} from "../../../lib/api";

type DashboardMatchParticipant = {
  userId: string;
  displayName: string | null;
  introLine: string | null;
  email: string | null;
  contact: DashboardPublicContact | null;
  schoolName: string | null;
  gender?: string | null;
  partnerGenders?: string[];
  weeklyIntent?: WeeklyIntent | null;
};

type ContactMethodPayload = {
  type: EditableContactChannelType;
  value: string;
};

export type ContactPreferencesPayload = {
  revision: number;
  email: string;
  preferredContactChannel: ContactChannelType;
  methods: ContactMethodPayload[];
};

type DashboardPublicContact = {
  type: ContactChannelType;
  label: string;
  value: string;
};

export type DashboardMatch = {
  id: string;
  score: number;
  introducedAt: string | null;
  reportStatus: string | null;
  participants: DashboardMatchParticipant[];
};

export type DashboardHistoryItem = {
  cycleId: string;
  codename: string;
  revealAt: string;
  participationStatus: "OPTED_IN" | "OPTED_OUT";
  result: "MATCHED" | "UNMATCHED" | "NOT_PARTICIPATED";
  visibility: "VISIBLE" | "LIMITED" | "NOT_APPLICABLE";
  limitedReason: "REPORTED" | "BLOCKED" | "ACCOUNT_DEACTIVATED" | null;
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

export type DashboardPayload = {
  user?: {
    id: string;
    email: string;
    displayName: string | null;
    preferredLocale: SupportedLocale;
  };
  questionnaireSubmittedAt: string | null;
  currentCycle: DashboardCurrentCycle | null;
  lastRevealedRound: {
    cycleId: string;
    codename: string;
    revealAt: string;
    participationStatus: "OPTED_IN" | "OPTED_OUT";
    matched: boolean;
  } | null;
  latestMatch: DashboardMatch | null;
  latestMatchVisibility: "VISIBLE" | "LIMITED" | null;
  latestMatchLimitedReason: "REPORTED" | "BLOCKED" | "ACCOUNT_DEACTIVATED" | null;
  recentMatchHistory: DashboardHistoryItem[];
  couponAgenda?: CouponAgendaReadState | null;
};

export type DashboardBootstrapPayload = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    preferredLocale: SupportedLocale;
  };
  dashboard: DashboardPayload;
};


export type { Question, QuestionnairePayload, QuestionnaireAttentionItem, QuestionnaireAttentionPayload, SavedQuestionnairePayload } from "@lilink/shared";

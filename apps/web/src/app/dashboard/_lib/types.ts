import type { WeeklyIntent } from "../../../lib/weekly-intent";
import type { SupportedLocale } from "@lilink/shared";
import type {
  MeetupExpirationWeeks,
  MeetupProgressStatus,
  MeetupUserTurnStatus,
} from "../../../lib/api";
import type {
  HardMatchFormState,
  HardMatchSchoolOption,
} from "../../../lib/hard-match";

export type Question = {
  id: string;
  key: string;
  prompt: string;
  type: "SCALE" | "SINGLE_SELECT" | "MULTI_SELECT";
  required?: boolean;
  selectionLimit?: number | null;
  options?: Array<{
    value: string;
    label: string;
  }>;
};

export type DashboardMatchParticipant = {
  userId: string;
  displayName: string | null;
  introLine: string | null;
  email: string | null;
  schoolName: string | null;
  contactRequestedAt: string | null;
};

export type DashboardMatch = {
  id: string;
  score: number;
  reasons: string[];
  reason: string | null;
  conversationTopics: string[];
  introducedAt: string | null;
  currentUserRequestedAt: string | null;
  reportStatus: string | null;
  participants: DashboardMatchParticipant[];
};

export type DashboardHistoryItem = {
  cycleId: string;
  codename: string;
  revealAt: string;
  participationStatus: "OPTED_IN" | "OPTED_OUT";
  result: "MATCHED" | "UNMATCHED" | "NOT_PARTICIPATED";
  // LIMITED hides match details; meetup access uses participant/session policy.
  visibility: "VISIBLE" | "LIMITED" | "NOT_APPLICABLE";
  limitedReason: "REPORTED" | "BLOCKED" | null;
  match: DashboardMatch | null;
};

export type DashboardTask = {
  id: string;
  type: "MEETUP";
  priority: number;
  title: string;
  text: string;
  href: string;
  userTurnStatus: MeetupUserTurnStatus;
  progressStatus: MeetupProgressStatus;
  matchId: string;
  sessionId: string | null;
  updatedAt: string;
};

export type DashboardMeetupSummary = {
  sessionId: string;
  matchId: string;
  status: "ACTIVE" | "LOCKED" | "CANCELED" | "EXPIRED" | "ARCHIVED";
  progressStatus: MeetupProgressStatus;
  href: string;
  confirmedStartsAt: string | null;
  confirmedEndsAt: string | null;
  confirmedPlaceName: string | null;
  canReviseAfterLock: boolean;
  canCancel: boolean;
  terminalText: string | null;
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
    meetupExpirationWeeks: MeetupExpirationWeeks;
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
  // LIMITED does not currently block an existing meetup session by itself.
  latestMatchVisibility: "VISIBLE" | "LIMITED" | null;
  latestMatchLimitedReason: "REPORTED" | "BLOCKED" | null;
  recentMatchHistory: DashboardHistoryItem[];
  tasks?: DashboardTask[];
  meetupSummary?: DashboardMeetupSummary | null;
};

export type DashboardBootstrapPayload = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    preferredLocale: SupportedLocale;
    meetupExpirationWeeks: MeetupExpirationWeeks;
  };
  dashboard: DashboardPayload;
};

export type QuestionnairePayload = {
  id: string;
  questions: Question[];
  schools: HardMatchSchoolOption[];
};

export type QuestionnaireAttentionItem = {
  key: string;
  prompt: string;
  updated: boolean;
  missingRequired: boolean;
  acknowledged: boolean;
};

export type QuestionnaireAttentionPayload = {
  currentVersionId: string;
  acknowledgedKeys: string[];
  pendingUpdatedKeys: string[];
  missingRequiredKeys: string[];
  pendingKeys: string[];
  items: QuestionnaireAttentionItem[];
};

export type SavedQuestionnairePayload = {
  versionId: string;
  currentVersionId: string | null;
  answers: Record<string, unknown>;
  submittedAt: string | null;
  draft: {
    softAnswers: Record<string, unknown>;
    hardMatchForm: HardMatchFormState;
    displayName: string;
  } | null;
  attention: QuestionnaireAttentionPayload | null;
} | null;

import type { WeeklyIntent } from "../../../lib/weekly-intent";
import type { HardMatchSchoolOption } from "../../../lib/hard-match";

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
  visibility: "VISIBLE" | "LIMITED" | "NOT_APPLICABLE";
  limitedReason: "REPORTED" | "BLOCKED" | null;
  match: DashboardMatch | null;
};

export type DashboardPayload = {
  questionnaireSubmittedAt: string | null;
  currentCycle: {
    id: string;
    codename: string;
    revealAt: string;
    participationDeadline: string;
    status: "DRAFT" | "OPEN" | "REVEAL_READY" | "REVEALED";
    participationStatus: "OPTED_IN" | "OPTED_OUT";
    intent: WeeklyIntent | null;
  } | null;
  lastRevealedRound: {
    cycleId: string;
    codename: string;
    revealAt: string;
    participationStatus: "OPTED_IN" | "OPTED_OUT";
    matched: boolean;
  } | null;
  latestMatch: DashboardMatch | null;
  latestMatchVisibility: "VISIBLE" | "LIMITED" | null;
  latestMatchLimitedReason: "REPORTED" | "BLOCKED" | null;
  recentMatchHistory: DashboardHistoryItem[];
};

export type QuestionnairePayload = {
  questions: Question[];
  schools: HardMatchSchoolOption[];
};

export type SavedQuestionnairePayload = {
  answers: Record<string, unknown>;
} | null;

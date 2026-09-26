import type { HardMatchSchoolOption, HardMatchFormState } from "./hard-match-form";

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
  vipFiltersActive?: boolean;
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

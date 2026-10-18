import type { Prisma, QuestionType } from '../../common/prisma/client';
import type { WeeklyIntent, HardMatchAnswers } from '@lilink/shared';
import type { QuestionOption } from '../questionnaire/questionnaire-config';

export type EligibleParticipant = {
  id: string;
  displayName: string | null;
  questionnaireVersionId: string | null;
  vipActive: boolean;
  educationVerified?: boolean;
  hardMatchAnswers: HardMatchAnswers;
  answers: Record<string, unknown>;
  intent: WeeklyIntent;
};

export type CandidatePair = {
  left: EligibleParticipant;
  right: EligibleParticipant;
  rawScore: number;
  score: number;
  matchingWeight: bigint;
};

export type RetentionWeightTiers = {
  priorityUser: bigint;
  vipUser: bigint;
  matchedUser: bigint;
  educationUser: bigint;
};

export type QuestionnaireQuestion = {
  key: string;
  prompt: string;
  description?: string | null;
  type: QuestionType;
  weight: number;
  selectionLimit?: number | null;
  options: Prisma.JsonValue | null;
};

export type PreparedQuestion = Omit<QuestionnaireQuestion, 'options'> & {
  normalizedOptions: QuestionOption[];
};

export type MatchQuestion = QuestionnaireQuestion | PreparedQuestion;

export type ComparableQuestion = {
  key: string;
  order: number;
  type: QuestionType;
  weight: number;
  leftQuestion: PreparedQuestion;
  rightQuestion: PreparedQuestion;
};

export type PairQuestionSet = {
  leftQuestions: PreparedQuestion[];
  rightQuestions: PreparedQuestion[];
  comparableQuestions: ComparableQuestion[];
};

export type MatchScoreBounds = {
  min: number;
  max: number;
};

export type MatchingInput = {
  participants: EligibleParticipant[];
  questions: QuestionnaireQuestion[];
  revealAt: Date;
  questionnairesByVersionId: Map<string, PreparedQuestion[]>;
  blockedPairKeys: Set<string>;
  historicalPairKeys: Set<string>;
  unmatchedStreaks: Map<string, number>;
  firstCycleParticipantIds: Set<string>;
};

export type MatchingResult = {
  candidateCount: number;
  candidates: CandidatePair[];
  selectedPairs: CandidatePair[];
};

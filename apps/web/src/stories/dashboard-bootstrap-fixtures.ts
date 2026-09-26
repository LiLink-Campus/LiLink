import { LIFESTYLE_QUESTIONS } from "@lilink/shared";
import type { HomePageData, ProfilePageData } from "@/app/dashboard/_lib/bootstrap";
import { matchDashboardFixtures as dashboards, matchStoryUser as user } from "@/app/dashboard/match/match.fixtures";
import { contacts, questions, schools, now } from "./site-fixtures";

export const homeProps = {
  initialNowMs: Date.parse(now),
  initialUser: user,
  initialDashboard: dashboards.waitingNoResult,
  questionnairePercent: 100,
  questionnaireSubmitted: true,
  questionnaireMissingOneLinerIntro: false,
  questionnaireEligibleToOptIn: true,
  questionnaireHasIncompleteDraft: false,
  questionnaireAttention: null,
  contactPreferences: contacts,
};
export const profileProps = {
  initialUser: user,
  initialDashboard: { ...dashboards.waitingNoResult, questionnaireSubmittedAt: null },
  initialQuestions: [...questions, ...LIFESTYLE_QUESTIONS.map(question => ({ id: question.key, key: question.key, prompt: question.prompt, type: "SINGLE_SELECT" as const, options: question.options.map(label => ({ label, value: label })) }))],
  initialSchools: schools.schools,
  initialSavedQuestionnaire: null,
  initialContactPreferences: contacts,
};
export const homePageData: HomePageData = {
  user, dashboard: homeProps.initialDashboard, contactPreferences: contacts,
  questionnaireAttention: null,
  questionnaireProgress: {
    percent: 100, confirmedPercent: 100, unconfirmedPercent: 0, unconfirmedCount: 0,
    submitted: true, profileReady: true, missingOneLinerIntro: false,
    eligibleToOptIn: true, hasIncompleteDraft: false,
  },
};
export const profilePageData: ProfilePageData = {
  user, dashboard: profileProps.initialDashboard, contactPreferences: contacts,
  questionnaire: { id: "questionnaire-story-v1", questions: profileProps.initialQuestions, schools: schools.schools },
  savedQuestionnaire: null, vip: null,
};

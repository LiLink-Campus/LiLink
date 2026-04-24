import { redirect } from "next/navigation";
import {
  fetchUserApiServer,
  hasUserSessionCookie,
} from "../../../lib/server-api";
import type { AuthMePayload } from "../../../lib/api";
import type {
  DashboardPayload,
  QuestionnairePayload,
  SavedQuestionnairePayload,
} from "./types";

/**
 * Guard each `/dashboard/*` server page with the same login redirect rule.
 * Returns `void` because `redirect()` throws under the hood when called.
 */
export async function ensureDashboardSession() {
  if (!(await hasUserSessionCookie())) {
    redirect("/login");
  }
}

/**
 * Loader for the hub + intent + match + history pages. They all need the
 * authenticated user identity and the dashboard summary, so we batch them.
 */
export async function loadDashboardCore() {
  await ensureDashboardSession();

  try {
    const [user, dashboard] = await Promise.all([
      fetchUserApiServer<AuthMePayload>("/auth/me"),
      fetchUserApiServer<DashboardPayload>("/me/dashboard"),
    ]);
    return { user, dashboard };
  } catch {
    redirect("/login");
  }
}

/**
 * Loader for the home hub. Pulls the dashboard summary plus the latest
 * questionnaire schema + saved answers so the page can compute a real
 * completion percentage instead of showing a binary "saved / not saved".
 */
export async function loadDashboardHome() {
  await ensureDashboardSession();

  try {
    const [user, dashboard, questionnaire, savedQuestionnaire] =
      await Promise.all([
        fetchUserApiServer<AuthMePayload>("/auth/me"),
        fetchUserApiServer<DashboardPayload>("/me/dashboard"),
        fetchUserApiServer<QuestionnairePayload>("/questionnaire/current"),
        fetchUserApiServer<SavedQuestionnairePayload>(
          "/me/questionnaire",
        ).catch(() => null),
      ]);
    return { user, dashboard, questionnaire, savedQuestionnaire };
  } catch {
    redirect("/login");
  }
}

/**
 * Profile sub-page loader: identity, dashboard summary (for header status),
 * and the questionnaire schema + saved answers.
 */
export async function loadDashboardProfile() {
  await ensureDashboardSession();

  try {
    const [user, dashboard, questionnaire, savedQuestionnaire] =
      await Promise.all([
        fetchUserApiServer<AuthMePayload>("/auth/me"),
        fetchUserApiServer<DashboardPayload>("/me/dashboard"),
        fetchUserApiServer<QuestionnairePayload>("/questionnaire/current"),
        fetchUserApiServer<SavedQuestionnairePayload>(
          "/me/questionnaire",
        ).catch(() => null),
      ]);
    return { user, dashboard, questionnaire, savedQuestionnaire };
  } catch {
    redirect("/login");
  }
}

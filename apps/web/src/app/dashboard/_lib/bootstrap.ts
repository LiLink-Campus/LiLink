import { redirect } from "next/navigation";
import {
  fetchUserApiServer,
  hasUserSessionCookie,
  ServerApiError,
} from "../../../lib/server-api";
import type {
  ContactPreferencesPayload,
  DashboardBootstrapPayload,
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
    const { user, dashboard } =
      await fetchUserApiServer<DashboardBootstrapPayload>("/me/bootstrap");
    return { user, dashboard };
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) redirect("/login");
    throw error;
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
    const [bootstrap, questionnaire, savedQuestionnaire, contactPreferences] =
      await Promise.all([
        fetchUserApiServer<DashboardBootstrapPayload>("/me/bootstrap"),
        fetchUserApiServer<QuestionnairePayload>("/questionnaire/current"),
        fetchUserApiServer<SavedQuestionnairePayload>(
          "/me/questionnaire",
        ),
        fetchUserApiServer<ContactPreferencesPayload>(
          "/me/contact-preferences",
        ),
      ]);
    return {
      user: bootstrap.user,
      dashboard: bootstrap.dashboard,
      questionnaire,
      savedQuestionnaire,
      contactPreferences,
    };
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) redirect("/login");
    throw error;
  }
}

/**
 * Profile sub-page loader: identity, dashboard summary (for header status),
 * and the matching questionnaire schema + saved answers.
 */
export async function loadDashboardProfile() {
  await ensureDashboardSession();

  try {
    const [bootstrap, contactPreferences, questionnaire, savedQuestionnaire] = await Promise.all([
      fetchUserApiServer<DashboardBootstrapPayload>("/me/bootstrap"),
      fetchUserApiServer<ContactPreferencesPayload>("/me/contact-preferences"),
      fetchUserApiServer<QuestionnairePayload>("/questionnaire/current"),
      fetchUserApiServer<SavedQuestionnairePayload>(
        "/me/questionnaire",
      ),
    ]);
    return {
      user: bootstrap.user,
      dashboard: bootstrap.dashboard,
      questionnaire,
      savedQuestionnaire,
      contactPreferences,
    };
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) redirect("/login");
    throw error;
  }
}

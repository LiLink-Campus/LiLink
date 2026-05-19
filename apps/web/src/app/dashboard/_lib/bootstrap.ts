import { redirect } from "next/navigation";
import {
  fetchUserApiServer,
  hasUserSessionCookie,
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
    const [bootstrap, questionnaire, savedQuestionnaire, contactPreferences] =
      await Promise.all([
        fetchUserApiServer<DashboardBootstrapPayload>("/me/bootstrap"),
        fetchUserApiServer<QuestionnairePayload>("/questionnaire/current"),
        fetchUserApiServer<SavedQuestionnairePayload>(
          "/me/questionnaire",
        ).catch(() => null),
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
  } catch {
    redirect("/login");
  }
}

/**
 * Profile sub-page loader: identity, dashboard summary (for header status),
 * and the matching questionnaire schema + saved answers.
 */
export async function loadDashboardProfile() {
  await ensureDashboardSession();

  try {
    const [bootstrap, questionnaire, savedQuestionnaire] = await Promise.all([
      fetchUserApiServer<DashboardBootstrapPayload>("/me/bootstrap"),
      fetchUserApiServer<QuestionnairePayload>("/questionnaire/current"),
      fetchUserApiServer<SavedQuestionnairePayload>(
        "/me/questionnaire",
      ).catch(() => null),
    ]);
    return {
      user: bootstrap.user,
      dashboard: bootstrap.dashboard,
      questionnaire,
      savedQuestionnaire,
    };
  } catch {
    redirect("/login");
  }
}

/**
 * Loader for the "Me" settings page: identity, dashboard summary, saved
 * questionnaire answers (card copy), and contact preferences (referral UX).
 */
export async function loadDashboardMe() {
  await ensureDashboardSession();

  try {
    const [bootstrap, savedQuestionnaire, contactPreferences] = await Promise.all([
      fetchUserApiServer<DashboardBootstrapPayload>("/me/bootstrap"),
      fetchUserApiServer<SavedQuestionnairePayload>("/me/questionnaire").catch(() => null),
      fetchUserApiServer<ContactPreferencesPayload>("/me/contact-preferences"),
    ]);
    return {
      user: bootstrap.user,
      dashboard: bootstrap.dashboard,
      savedQuestionnaire,
      contactPreferences,
    };
  } catch {
    redirect("/login");
  }
}

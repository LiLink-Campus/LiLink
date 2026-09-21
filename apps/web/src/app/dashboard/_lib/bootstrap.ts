import { redirect } from "next/navigation";
import type { VipStatus } from "../vip/vip-client";
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

type QuestionnairePageData = {
  user: DashboardBootstrapPayload["user"];
  questionnaire: QuestionnairePayload;
  savedQuestionnaire: SavedQuestionnairePayload;
  contactPreferences: ContactPreferencesPayload;
};

type HomePageData = QuestionnairePageData & Pick<DashboardBootstrapPayload, "dashboard">;
type ProfilePageData = QuestionnairePageData & {
  dashboard: Pick<DashboardBootstrapPayload["dashboard"], "questionnaireSubmittedAt">;
  vip: VipStatus | null;
};
type CenterPageData = { user: DashboardBootstrapPayload["user"]; vip: VipStatus | null };

async function loadPage<T>(page: "home" | "profile" | "center") {
  await ensureDashboardSession();
  try {
    return await fetchUserApiServer<T>(`/me/page-bootstrap/${page}`);
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) redirect("/login");
    throw error;
  }
}

export function loadDashboardHome() { return loadPage<HomePageData>("home"); }
export function loadDashboardProfile() { return loadPage<ProfilePageData>("profile"); }
export function loadDashboardCenter() { return loadPage<CenterPageData>("center"); }

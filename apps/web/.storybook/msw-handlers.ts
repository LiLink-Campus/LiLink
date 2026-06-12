import { http, HttpResponse } from "msw";
import {
  applyContactSuccessToDashboard,
  applyReportSuccessToDashboard,
} from "../src/app/dashboard/_lib/dashboard-mutations";
import type { DashboardPayload } from "../src/app/dashboard/_lib/types";

const apiBaseUrl = "http://localhost:4000/v1";

type MatchPageHandlerStateOptions = {
  initialDashboard: DashboardPayload;
  currentUserId: string | null;
};

function cloneDashboard(dashboard: DashboardPayload): DashboardPayload {
  return JSON.parse(JSON.stringify(dashboard)) as DashboardPayload;
}

function stringParam(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? "");
  }
  return String(value ?? "");
}

export function createMatchPageHandlerState({
  initialDashboard,
  currentUserId,
}: MatchPageHandlerStateOptions) {
  let dashboard = cloneDashboard(initialDashboard);

  function reset() {
    dashboard = cloneDashboard(initialDashboard);
  }

  return {
    reset,
    handlers: [
      http.get(`${apiBaseUrl}/me/dashboard`, () =>
        HttpResponse.json(cloneDashboard(dashboard)),
      ),
      http.post(`${apiBaseUrl}/me/matches/:matchId/contact`, ({ params }) => {
        const matchId = stringParam(params.matchId);
        dashboard =
          applyContactSuccessToDashboard(dashboard, matchId, currentUserId) ??
          dashboard;

        return HttpResponse.json({ ok: true });
      }),
      http.post(
        `${apiBaseUrl}/me/matches/:matchId/report`,
        ({ params }) => {
          const matchId = stringParam(params.matchId);
          dashboard =
            applyReportSuccessToDashboard(dashboard, matchId) ?? dashboard;

          return HttpResponse.json({ ok: true });
        },
      ),
    ],
  };
}

export const mswHandlers = {
  session: [
    http.get(`${apiBaseUrl}/auth/me`, () =>
      HttpResponse.json({
        id: "storybook-user",
        email: "story@example.edu",
        displayName: "Storybook User",
        preferredLocale: "zh-CN",
        meetupExpirationWeeks: 2,
      }),
    ),
  ],
};

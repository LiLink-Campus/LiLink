import { http, HttpResponse } from "msw";
import {
  applyContactSuccessToDashboard,
  applyFeedbackSuccessToDashboard,
  applyReportSuccessToDashboard,
} from "../src/app/dashboard/_lib/dashboard-mutations";
import type {
  DashboardPayload,
  MatchFeedback,
} from "../src/app/dashboard/_lib/types";

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

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = (await request.json()) as unknown;
    return parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
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
      http.put(
        `${apiBaseUrl}/me/matches/:matchId/feedback`,
        async ({ params, request }) => {
          const matchId = stringParam(params.matchId);
          const body = await readJsonObject(request);
          const comment =
            typeof body.comment === "string" && body.comment.trim()
              ? body.comment.trim()
              : null;
          const feedback = {
            rating: typeof body.rating === "number" ? body.rating : 0,
            comment,
            submittedAt: new Date().toISOString(),
          } satisfies MatchFeedback;

          dashboard =
            applyFeedbackSuccessToDashboard(dashboard, matchId, feedback) ??
            dashboard;

          return HttpResponse.json(feedback);
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

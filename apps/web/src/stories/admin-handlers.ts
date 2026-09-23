import { delay, http, HttpResponse } from "msw";
import { api, json, adminIdentity } from "./site-support";
import * as f from "./admin-fixtures";
import { now } from "./site-fixtures";
export const page = <T>(items: T[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  totalPages: 1,
});

export function userAccountHandlers(initialStatus: typeof f.adminUser.status, failUpdate = false) {
  let status = initialStatus;
  const user = () => ({ ...f.adminUser, status });
  return [
    http.get(`${api}/admin/users`, ({ request }) => {
      const filter = new URL(request.url).searchParams.get("status");
      return HttpResponse.json(page(!filter || filter === status ? [user()] : []));
    }),
    http.get(`${api}/admin/users/:id`, () => HttpResponse.json(user())),
    http.put(`${api}/admin/users/:id/status`, async ({ request }) => {
      const input = (await request.json()) as { status?: string };
      await delay(150);
      if (failUpdate) {
        return HttpResponse.json({ message: "模拟：账号状态更新失败。" }, { status: 500 });
      }
      if (input.status !== "ACTIVE" && input.status !== "SUSPENDED") {
        return HttpResponse.json({ message: "无效的账号操作。" }, { status: 400 });
      }
      status = input.status;
      return HttpResponse.json(user());
    }),
    ...adminHandlers,
  ];
}

export const adminHandlers = [
  json("/admin-session/me", { ok: true, admin: adminIdentity }),
  http.post(`${api}/admin-session/login`, () => HttpResponse.json({ ok: true })),
  json("/admin/dashboard", f.overview),
  json("/admin/schools", page([f.adminSchool])),
  json("/admin/users", page([f.adminUser])),
  json("/admin/users/:id", f.adminUser),
  json("/admin/users/:id/questionnaire", { submittedAt: now, answers: { weekend: "outside" } }),
  json("/admin/users/:id/participations", page([{ cycleId: f.cycle.id, status: "OPTED_IN" }])),
  json("/admin/weekly-cycle-settings", { enabled: false, deadlineHours: 2 }),
  http.put(`${api}/admin/weekly-cycle-settings`, async ({ request }) =>
    HttpResponse.json({ ...(await request.json() as object), createdCycle: null })
  ),
  json("/admin/cycles", page([f.cycle])),
  json("/admin/cycles/:id", f.cycleDetail),
  json(
    "/admin/cycles/:id/participants",
    page([
      {
        id: "participation-story",
        status: "OPTED_IN",
        intent: "BOTH",
        optedInAt: now,
        updatedAt: now,
        user: f.adminUser,
      },
    ])
  ),
  json("/admin/cycles/:id/matches", page([])),
  http.get(`${api}/admin/cycles/:id/preview`, () =>
    HttpResponse.json({
      cycleId: f.cycle.id,
      generatedAt: "2030-04-08T10:15:30.000Z",
      candidates: [],
      suggestedPairs: [],
      unmatchedUserIds: [],
    })
  ),
  json("/admin/questionnaire", {
    id: "questionnaire-story",
    title: "春日问卷",
    description: null,
    questions: f.adminQuestions,
  }),
  json("/admin/reports", page([f.report])),
  json("/admin/reports/:id", {
    report: {
      ...f.report,
      reporter: f.adminUser,
      reportedUser: {
        ...f.adminUser,
        id: "other-story",
        displayName: "陈一诺",
        reportsReceived: [f.report],
        reportsFiled: [],
      },
      match: null,
    },
    riskProfile: {
      reportedUserStatus: "ACTIVE",
      receivedReportCount: 1,
      filedReportCount: 0,
      resolvedReportCount: 0,
      openReportCount: 1,
      mutualBlocks: [],
    },
    logs: [f.audit],
  }),
  json("/admin/audit-logs", page([f.audit])),
  json("/admin/merchants", page([f.adminMerchant])),
  json("/admin/merchants/:id/users", { items: [f.clerk] }),
  json("/admin/campaigns", page([f.campaign])),
  json("/admin/campaigns/:id/templates", { items: [f.template] }),
  json("/admin/analytics/schools-gender", f.schoolGender),
  json("/admin/analytics/weekly-optin", f.weekly),
  json("/admin/analytics/match-leaderboard", f.leaderboard),
  json("/admin/promotion/acquisition", {
    shares: 128, visits: 96, registrations: 38, invitedRegistrations: 30, qualified: 24,
    channels: [
      { channel: "WECHAT_GROUP", shares: 68, visits: 56, registrations: 18, qualified: 12 },
      { channel: "WECHAT_PRIVATE", shares: 42, visits: 30, registrations: 12, qualified: 8 },
      { channel: "COPY_LINK", shares: 18, visits: 10, registrations: 3, qualified: 2 },
      { channel: "DIRECT", shares: 0, visits: 0, registrations: 5, qualified: 2 },
    ],
    referrers: [{ id: "ref-1", name: "林和", registrations: 12, qualified: 8 }, { id: "ref-2", name: "夏宁", registrations: 9, qualified: 6 }],
  }),
  json("/admin/campaigns/:id/results", { recipients: 12, issued: 12, redeemed: 8, expired: 1, templates: [{ title: "双人咖啡券", merchant: "青禾咖啡", issued: 12, redeemed: 8 }] }),
  json("/admin/promotion/funnel", f.funnel),
  json(
    "/admin/promotion/leaderboard",
    page([
      {
        sourceType: "PERSONAL",
        refLabel: "林和",
        invited: 12,
        registered: 10,
        activated: 8,
        granted: 8,
        redeemed: 4,
        byGender: { male: 5, female: 5, nonBinary: 0, unknown: 0 },
      },
    ])
  ),
  json("/admin/promotion/coupons", {
    items: [
      {
        merchantId: f.adminMerchant.id,
        merchantName: f.adminMerchant.name,
        granted: 8,
        redeemed: 4,
      },
    ],
  }),
  json(
    "/admin/promotion/redemptions",
    page([
      {
        merchantId: f.adminMerchant.id,
        merchantName: f.adminMerchant.name,
        day: "2030-04-08",
        count: 4,
        faceValueTotal: 4000,
      },
    ])
  ),
];

export function cycleWorkbenchHandlers() {
  let previewRun = 0;
  const other = { ...f.cycle, id: "cycle-next", codename: "夏日相遇" };
  const cycles = [
    f.cycle,
    other,
    { ...f.cycle, id: "cycle-autumn", codename: "秋日来信", status: "DRAFT" },
    { ...f.cycle, id: "cycle-winter", codename: "冬日回声", status: "REVEALED" },
  ];
  return [
    json("/admin/cycles", page(cycles)),
    http.get(`${api}/admin/cycles/:id`, ({ params }) =>
      HttpResponse.json({
        ...f.cycleDetail,
        summary: { ...f.cycleDetail.summary, matchedPairCount: 1 },
        cycle: cycles.find((cycle) => cycle.id === params.id) ?? f.cycle,
      })
    ),
    http.get(`${api}/admin/cycles/:id/preview`, ({ params }) => {
      previewRun += 1;
      return HttpResponse.json({
        cycleId: params.id,
        generatedAt: previewRun === 1 ? "2030-04-08T10:15:30.000Z" : "2030-04-08T10:16:45.000Z",
        candidates: [],
        unmatchedUserIds: ["unmatched-story"],
        suggestedPairs: [
          {
            leftUserId: "user-story",
            rightUserId: "preview-user",
            leftDisplayName: "林和",
            rightDisplayName: "陈一诺",
            score: 88,
          },
        ],
      });
    }),
    json(
      "/admin/cycles/:id/matches",
      page([
        {
          id: "final-story",
          score: 90,
          revealedAt: null,
          introducedAt: null,
          participants: [
            f.adminUser,
            { ...f.adminUser, id: "final-user", displayName: "周宁" },
          ].map((user, position) => ({
            id: `mp-${position}`,
            userId: user.id,
            user,
            position,
            contactRequestedAt: null,
          })),
          reports: [],
          feedback: [],
          meetupFeedback: [],
        },
      ])
    ),
    ...adminHandlers,
  ];
}

import { matchDashboardFixtures, matchStoryUser } from "../../app/dashboard/match/match.fixtures";
import { referralFixtures } from "../../app/dashboard/referrals/referrals.fixtures";
import type { QuestionnairePayload, SavedQuestionnairePayload } from "../../app/dashboard/_lib/types";
import type { MeetupSessionResponse } from "../api";
import questionnaireJson from "./questionnaire.json";
import schools from "./schools.json";

const questionnaire = questionnaireJson as QuestionnairePayload;
const user = { ...matchStoryUser, displayName: "林和", email: "student@example.com" };
const answers: Record<string, unknown> = {
  hard_birth_date: "2003-05-12", hard_gender: "女", hard_partner_genders: ["男"],
  hard_partner_age_min: 20, hard_partner_age_max: 26, hard_nationality: "中国",
  hard_partner_nationalities: ["中国"], hard_languages: ["中文"], hard_partner_languages: ["中文"],
  hard_looks: "普通人", hard_partner_looks: ["普通人", "小帅/美", "顶帅/美"], hard_height_cm: 165,
  hard_partner_height_min: 160, hard_partner_height_max: 195, hard_weight_kg: 52,
  hard_partner_weight_min: 40, hard_partner_weight_max: 100,
  hard_one_liner_intro: "喜欢校园散步和周末看展，期待认识认真又有趣的你。",
  hard_school: questionnaire.schools[0]?.id, hard_excluded_partner_schools: [], hard_excluded_partner_school_genders: [],
};
for (const q of questionnaire.questions) {
  answers[q.key] = q.type === "MULTI_SELECT" ? (q.options ?? []).slice(0, Math.min(2, q.selectionLimit ?? 2)).map(o => o.value) : q.options?.[0]?.value;
}
const saved: NonNullable<SavedQuestionnairePayload> = {
  versionId: questionnaire.id, currentVersionId: questionnaire.id, answers,
  submittedAt: "2026-09-09T12:00:00Z", draft: null, attention: null,
};
const contacts = { email: user.email, preferredContactChannel: "EMAIL", methods: [] };
const agenda = { availableCount: 0, unreadAvailableCount: 0, read: true, readAt: null, href: "/dashboard/coupons" };

export function previewResponse(path: string, method = "GET", rawBody?: BodyInit | null, state = "introducedContactCompleted"): unknown {
  const key = Object.hasOwn(matchDashboardFixtures, state) ? state as keyof typeof matchDashboardFixtures : "introducedContactCompleted";
  const dashboard = structuredClone(matchDashboardFixtures[key]);
  dashboard.user = user;
  for (const participant of dashboard.latestMatch?.participants ?? []) {
    if (participant.userId !== user.id) { participant.displayName = "陈一诺"; participant.schoolName = "海南比勒费尔德应用科学大学"; }
  }
  const currentCycle = dashboard.currentCycle;
  if (currentCycle) { currentCycle.codename = "秋日来信"; currentCycle.revealAt = "2026-09-15T13:00:00Z"; currentCycle.participationDeadline = "2026-09-14T13:00:00Z"; }
  const body = typeof rawBody === "string" && rawBody ? JSON.parse(rawBody) : {};
  if (path === "/auth/me") return user;
  if (path === "/me/bootstrap") return { user, dashboard };
  if (path === "/me/dashboard") return dashboard;
  if (path === "/questionnaire/current") return questionnaire;
  if (path === "/public/schools") return schools;
  if (path === "/me/questionnaire") return method === "GET" ? saved : { saveState: "SUBMITTED", questionnaireSubmittedAt: saved.submittedAt, hasDraft: false };
  if (path === "/me/questionnaire/acknowledge") return { currentVersionId: questionnaire.id, acknowledgedKeys: Object.keys(answers) };
  if (path === "/me/contact-preferences") return method === "GET" ? contacts : { ...contacts, ...body };
  if (path === "/me/referral") return { ...referralFixtures.eduWithFullQuota, links: referralFixtures.eduWithFullQuota.links.map(link => ({ ...link, url: link.url.replace(":3000", ":3101") })) };
  if (path.startsWith("/me/coupons/read-state")) return agenda;
  if (path === "/me/coupons") return { items: [] };
  if (path === "/me/meetup-location-candidates") return [{ id: "preview-cafe", name: "校园湖畔咖啡馆", latitude: 18.5, longitude: 110.0 }];
  if (path.startsWith("/me/meetup-sessions/") || /^\/me\/matches\/[^/]+\/meetup\/start$/.test(path)) {
    const enabled = { enabled: true, reason: null };
    return {
      id: "meetup-session-story-001", matchId: dashboard.latestMatch?.id ?? "match-story-001", status: "ACTIVE",
      userTurnStatus: "NEEDS_YOUR_RESPONSE", progressStatus: "NOT_STARTED", startedByUserId: user.id,
      counterpartUserId: "story-user-002", counterpartDisplayName: "陈一诺", currentProposalId: null,
      confirmedTimeOptionId: null, confirmedLocationOptionId: null, finalConfirmRequiredByUserId: null,
      lockedAt: null, canceledAt: null, canceledByUserId: null, effectiveExpirationWeeks: 2,
      expiresAt: null, archiveEligibleAt: null, lastActiveAt: "2026-09-09T12:00:00Z",
      currentPlan: { timeOption: null, locationOption: null, startsAt: null, endsAt: null, toleranceMinutes: null, locationCandidateId: null, placeName: null, latitude: null, longitude: null },
      currentPendingProposal: null, participants: [{ userId: user.id, displayName: user.displayName, turnState: "REQUIRED", revisionUsedAt: null, lastSeenAt: null }, { userId: "story-user-002", displayName: "陈一诺", turnState: "WAITING", revisionUsedAt: null, lastSeenAt: null }], messages: [],
      availableActions: { propose: enabled, accept: { ...enabled, requiredOptionKinds: [] }, reject: enabled, finalConfirm: enabled, reviseAfterLock: enabled, cancel: enabled }, currentUserFeedback: null, canSubmitFeedback: false, feedbackEligibleAt: null,
    } satisfies MeetupSessionResponse;
  }
  if (method !== "GET") return { ok: true };
  throw new Error(`此预览暂未配置数据：${path}`);
}

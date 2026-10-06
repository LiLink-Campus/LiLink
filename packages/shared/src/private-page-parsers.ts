import { CONTACT_CHANNEL_TYPES, EDITABLE_CONTACT_CHANNEL_TYPES } from "./contact-channel";
import { WEEKLY_INTENTS } from "./weekly-intent";
import { SUPPORTED_LOCALES } from "./locale";
import {
  DashboardHistoryResult,
  DashboardHistoryVisibility,
  DashboardHistoryLimitedReason,
} from "./private-page-contracts";
import type {
  DashboardMatch,
  DashboardPayload,
  DashboardBootstrapPayload,
  ContactPreferencesPayload,
  HomePageData,
  ProfilePageData,
  CenterPageData,
} from "./private-page-contracts";
import {
  isObject,
  isString,
  isBoolean,
  isNumber,
  isCount,
  isDate,
  nullable,
  arrayOf,
  oneOf,
  fields,
} from "./private-contract-values";
import {
  isQuestionnaire,
  isSavedQuestionnaire,
  isQuestionnaireAttention,
} from "./private-questionnaire-validation";

export class PrivateResponseContractError extends Error {
  constructor() {
    super("服务返回的数据格式异常，请重试。");
    this.name = "PrivateResponseContractError";
  }
}
const participation = (value: unknown) => oneOf(value, ["OPTED_IN", "OPTED_OUT"]);
const visibility = (value: unknown) => oneOf(value, Object.values(DashboardHistoryVisibility));
const reason = (value: unknown) =>
  nullable(value, (item) => oneOf(item, Object.values(DashboardHistoryLimitedReason)));
const intent = (value: unknown) => nullable(value, (item) => oneOf(item, WEEKLY_INTENTS));
function isUser(value: unknown) {
  return (
    isObject(value) &&
    fields(value, ["id", "email"], isString) &&
    nullable(value.displayName, isString) &&
    oneOf(value.preferredLocale, SUPPORTED_LOCALES)
  );
}
function isContact(value: unknown) {
  return (
    isObject(value) &&
    oneOf(value.type, CONTACT_CHANNEL_TYPES) &&
    fields(value, ["label", "value"], isString)
  );
}
export function isDashboardMatch(value: unknown): value is DashboardMatch {
  return (
    isObject(value) &&
    isString(value.id) &&
    isNumber(value.score) &&
    nullable(value.introducedAt, isDate) &&
    nullable(value.reportStatus, (item) => oneOf(item, ["OPEN", "RESOLVED", "DISMISSED"])) &&
    arrayOf(
      value.participants,
      (participant) =>
        isObject(participant) &&
        isString(participant.userId) &&
        fields(participant, ["displayName", "introLine", "email", "schoolName", "gender"], (item) =>
          nullable(item, isString)
        ) &&
        nullable(participant.contact, isContact) &&
        arrayOf(participant.partnerGenders, isString) &&
        intent(participant.weeklyIntent)
    )
  );
}
export function parseDashboardMatch(value: unknown): DashboardMatch {
  if (!isDashboardMatch(value)) throw new PrivateResponseContractError();
  return value;
}
function isAgenda(value: unknown) {
  return (
    isObject(value) &&
    fields(value, ["target", "version"], isString) &&
    fields(value, ["availableCount", "unreadAvailableCount"], isCount) &&
    isBoolean(value.read) &&
    nullable(value.readAt, isDate) &&
    value.href === "/dashboard/coupons"
  );
}
function isDashboard(value: unknown): value is DashboardPayload {
  return (
    isObject(value) &&
    nullable(value.profile, isObject) &&
    nullable(value.questionnaireSubmittedAt, isDate) &&
    nullable(
      value.currentCycle,
      (cycle) =>
        isObject(cycle) &&
        fields(cycle, ["id", "codename"], isString) &&
        fields(cycle, ["revealAt", "participationDeadline"], isDate) &&
        oneOf(cycle.status, ["DRAFT", "OPEN", "PREPARING", "REVEAL_READY", "REVEALED"]) &&
        participation(cycle.participationStatus) &&
        intent(cycle.intent)
    ) &&
    nullable(
      value.lastRevealedRound,
      (round) =>
        isObject(round) &&
        fields(round, ["cycleId", "codename"], isString) &&
        isDate(round.revealAt) &&
        participation(round.participationStatus) &&
        isBoolean(round.matched)
    ) &&
    nullable(value.latestMatch, isDashboardMatch) &&
    nullable(value.latestMatchVisibility, visibility) &&
    reason(value.latestMatchLimitedReason) &&
    arrayOf(
      value.recentMatchHistory,
      (item) =>
        isObject(item) &&
        fields(item, ["cycleId", "codename"], isString) &&
        isDate(item.revealAt) &&
        participation(item.participationStatus) &&
        oneOf(item.result, Object.values(DashboardHistoryResult)) &&
        visibility(item.visibility) &&
        reason(item.limitedReason) &&
        nullable(item.match, isDashboardMatch)
    ) &&
    isAgenda(value.couponAgenda)
  );
}
export function parseDashboard(value: unknown): DashboardPayload {
  if (!isDashboard(value)) throw new PrivateResponseContractError();
  return value;
}
export function parseDashboardBootstrap(value: unknown): DashboardBootstrapPayload {
  if (!isObject(value) || !isUser(value.user) || !isDashboard(value.dashboard))
    throw new PrivateResponseContractError();
  return value as DashboardBootstrapPayload;
}
function isContacts(value: unknown): value is ContactPreferencesPayload {
  return (
    isObject(value) &&
    isCount(value.revision) &&
    isString(value.email) &&
    oneOf(value.preferredContactChannel, CONTACT_CHANNEL_TYPES) &&
    arrayOf(
      value.methods,
      (method) =>
        isObject(method) &&
        oneOf(method.type, EDITABLE_CONTACT_CHANNEL_TYPES) &&
        isString(method.value)
    )
  );
}
export function parseContactPreferences(value: unknown): ContactPreferencesPayload {
  if (!isContacts(value)) throw new PrivateResponseContractError();
  return value;
}
function isVip(value: unknown) {
  return (
    isObject(value) &&
    fields(value, ["active", "advancedFiltersAvailable"], isBoolean) &&
    fields(value, ["activatedAt", "expiresAt"], (item) => nullable(item, isDate)) &&
    isCount(value.durationDays) &&
    isString(value.priceYuan)
  );
}
function isProgress(value: unknown) {
  return (
    isObject(value) &&
    fields(
      value,
      ["percent", "confirmedPercent", "unconfirmedPercent"],
      (item) => isCount(item) && item <= 100
    ) &&
    isCount(value.unconfirmedCount) &&
    fields(
      value,
      [
        "submitted",
        "profileReady",
        "missingOneLinerIntro",
        "eligibleToOptIn",
        "hasIncompleteDraft",
      ],
      isBoolean
    )
  );
}
export function parseHomePage(value: unknown): HomePageData {
  if (
    !isObject(value) ||
    !isUser(value.user) ||
    !isDashboard(value.dashboard) ||
    !isProgress(value.questionnaireProgress) ||
    !nullable(value.questionnaireAttention, isQuestionnaireAttention) ||
    !isContacts(value.contactPreferences)
  )
    throw new PrivateResponseContractError();
  return value as HomePageData;
}
export function parseProfilePage(value: unknown): ProfilePageData {
  if (
    !isObject(value) ||
    !isUser(value.user) ||
    !isQuestionnaire(value.questionnaire) ||
    !isSavedQuestionnaire(value.savedQuestionnaire) ||
    !isContacts(value.contactPreferences) ||
    !isObject(value.dashboard) ||
    !nullable(value.dashboard.questionnaireSubmittedAt, isDate) ||
    !nullable(value.vip, isVip)
  )
    throw new PrivateResponseContractError();
  return value as ProfilePageData;
}
export function parseCenterPage(value: unknown): CenterPageData {
  if (!isObject(value) || !isUser(value.user) || !nullable(value.vip, isVip))
    throw new PrivateResponseContractError();
  return value as CenterPageData;
}
// Keep this registry limited to the private protocols owned by this module.
export function parsePrivateApiResponse(path: string, value: unknown): unknown {
  switch (path.split("?")[0]) {
    case "/me/dashboard":
      return parseDashboard(value);
    case "/me/bootstrap":
      return parseDashboardBootstrap(value);
    case "/me/contact-preferences":
      return parseContactPreferences(value);
    case "/me/page-bootstrap/home":
      return parseHomePage(value);
    case "/me/page-bootstrap/profile":
      return parseProfilePage(value);
    case "/me/page-bootstrap/center":
      return parseCenterPage(value);
    default:
      return value;
  }
}

export function parsePrivateApiBody(path: string, body: string): unknown {
  let value: unknown;
  try {
    value = body.trim() ? JSON.parse(body) : null;
  } catch (error) {
    if (
      [
        "/me/dashboard",
        "/me/bootstrap",
        "/me/contact-preferences",
        "/me/page-bootstrap/home",
        "/me/page-bootstrap/profile",
        "/me/page-bootstrap/center",
      ].includes(path.split("?")[0])
    )
      throw new PrivateResponseContractError();
    throw error;
  }
  return parsePrivateApiResponse(path, value);
}

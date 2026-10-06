import { HARD_MATCH_KEYS } from "@lilink/shared";
import commonStyles from "../admin-common.module.css";
import type { AdminUser } from "../types";
export const adminStyles = [commonStyles];

export const HARD_MATCH_LABELS: Record<string, string> = {
  [HARD_MATCH_KEYS.birthDate]: "出生年月日",
  [HARD_MATCH_KEYS.partnerAgeMin]: "希望对方年龄下限",
  [HARD_MATCH_KEYS.partnerAgeMax]: "希望对方年龄上限",
  [HARD_MATCH_KEYS.gender]: "你的性别",
  [HARD_MATCH_KEYS.partnerGenders]: "希望对方的性别",
  [HARD_MATCH_KEYS.looks]: "颜值自评",
  [HARD_MATCH_KEYS.partnerLooks]: "希望对方的颜值",
  [HARD_MATCH_KEYS.heightCm]: "身高（厘米）",
  [HARD_MATCH_KEYS.partnerHeightMin]: "希望对方身高下限",
  [HARD_MATCH_KEYS.partnerHeightMax]: "希望对方身高上限",
  [HARD_MATCH_KEYS.oneLinerIntro]: "一句话介绍",
  [HARD_MATCH_KEYS.school]: "你的学校",
  [HARD_MATCH_KEYS.excludedPartnerSchools]: "不希望对方的学校",
  [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: "学校内排除的性别",
};

export const HARD_MATCH_KEY_SET = new Set(Object.keys(HARD_MATCH_LABELS));

export const USER_STATUS_LABELS: Record<"ALL" | AdminUser["status"], string> = {
  ALL: "全部",
  ACTIVE: "正常",
  PENDING: "未启用",
  SUSPENDED: "已停用",
};

export const USER_STATUS_DESCRIPTIONS: Record<AdminUser["status"], string> = {
  ACTIVE: "账号可正常登录。注册完成后即为此状态，无需额外激活。",
  PENDING: "账号尚未启用，无法登录。启用后可正常登录。",
  SUSPENDED: "账号已被停用，无法登录或使用用户功能。恢复后可重新登录。",
};

export const USER_STATUS_ACTIONS = {
  ACTIVE: { status: "SUSPENDED", label: "停用账号", message: "账号已停用。" },
  SUSPENDED: { status: "ACTIVE", label: "恢复账号", message: "账号已恢复，可正常登录。" },
  PENDING: { status: "ACTIVE", label: "启用账号", message: "账号已启用，可正常登录。" },
} as const;

export const ADMIN_SCHOOL_LOOKUP_PAGE_SIZE = 50;

export const ADMIN_USERS_PAGE_SIZE = 6;

export type DetailTab = "profile" | "questionnaire" | "cycles";

export function formatAnswer(
  key: string,
  value: unknown,
  schoolNameById: Record<string, string>
): string {
  if (key === HARD_MATCH_KEYS.school && typeof value === "string") {
    return schoolNameById[value] ?? value;
  }

  if (key === HARD_MATCH_KEYS.excludedPartnerSchools && Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? (schoolNameById[item] ?? item) : String(item)))
      .join("、");
  }

  if (key === HARD_MATCH_KEYS.excludedPartnerSchoolGenders && Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return String(item);
        }

        const record = item as {
          schoolId?: unknown;
          genders?: unknown;
        };
        const schoolName =
          typeof record.schoolId === "string"
            ? (schoolNameById[record.schoolId] ?? record.schoolId)
            : "未知学校";
        const genders = Array.isArray(record.genders)
          ? record.genders
              .filter((gender): gender is string => typeof gender === "string")
              .join("、")
          : "";

        return genders ? `${schoolName}（${genders}）` : schoolName;
      })
      .join("；");
  }

  if (Array.isArray(value)) return value.join("、");
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export type EditForm = {
  displayName: string;
  email: string;
  headline: string;
  schoolYear: string;
  programName: string;
  bio: string;
};

export function buildEditForm(user: AdminUser): EditForm {
  return {
    displayName: user.displayName ?? "",
    email: user.email,
    headline: user.profile?.headline ?? "",
    schoolYear: user.profile?.schoolYear ?? "",
    programName: user.profile?.programName ?? "",
    bio: user.profile?.bio ?? "",
  };
}

export function formatNonEduReferralQuota(user: AdminUser) {
  const remaining = Math.max(0, user.nonEduReferralLimit - user.nonEduReferralUses);
  return `已用 ${user.nonEduReferralUses} / 上限 ${user.nonEduReferralLimit} · 剩余 ${remaining}`;
}

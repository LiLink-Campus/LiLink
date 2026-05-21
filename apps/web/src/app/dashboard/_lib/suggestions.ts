import { contactPreferencesAreDefault, type FocusContext } from "./focus";
import type { ContactPreferencesPayload } from "./types";

/**
 * Icon key for a suggestion row. Kept as a string (not a React node) so this
 * module stays pure and trivially testable; the component maps key -> icon.
 */
export type SuggestionIconKey = "clipboard" | "profile";

export type SuggestionId = "PROFILE_OPTIONAL" | "CONTACT_PREFERENCES";

/**
 * A single "建议你做 / Suggested" todo row rendered under the primary
 * DO NOW card. These are gentle, non-blocking nudges — never the one thing
 * the user must do right now (that is the Focus card).
 */
export type Suggestion = {
  id: SuggestionId;
  icon: SuggestionIconKey;
  title: string;
  body: string;
  /** Optional 0–100 completion bar (only PROFILE_OPTIONAL uses it today). */
  progressPercent?: number;
  action: { label: string; href: string };
};

export type SuggestionInputs = {
  /** The kind already shown as the primary Focus card, so we never dupe it. */
  primaryFocusKind: FocusContext["kind"];
  questionnaire: {
    percent: number;
    eligibleToOptIn: boolean;
    hasBlockingAttention: boolean;
  };
  contactPreferences: ContactPreferencesPayload;
};

/**
 * Resolve the ordered list of secondary suggestions for the home page.
 *
 * Each candidate is skipped when it is already the primary Focus, so the
 * same task never appears twice. Order mirrors the reference design:
 * profile polish first, then the contact-channel nudge.
 */
export function resolveSuggestions(inputs: SuggestionInputs): Suggestion[] {
  const { primaryFocusKind, questionnaire, contactPreferences } = inputs;
  const suggestions: Suggestion[] = [];

  // Optional profile polish: already eligible to match, but not yet 100%.
  // When the user is NOT eligible (or has blocking attention), profile work
  // is the primary Focus instead, so we only nudge the optional tail here.
  const profileIsPrimary =
    primaryFocusKind === "QUESTIONNAIRE_INCOMPLETE" ||
    primaryFocusKind === "QUESTIONNAIRE_ATTENTION";
  if (
    !profileIsPrimary &&
    questionnaire.eligibleToOptIn &&
    !questionnaire.hasBlockingAttention &&
    questionnaire.percent < 100
  ) {
    suggestions.push({
      id: "PROFILE_OPTIONAL",
      icon: "clipboard",
      title: "补完匹配资料的可选项",
      body: `当前 ${questionnaire.percent}% 完成，补完后算法的相容度判断会更精准。`,
      progressPercent: questionnaire.percent,
      action: { label: "继续", href: "/dashboard/profile" },
    });
  }

  // Contact-channel nudge: still on the default email-only setup.
  if (
    primaryFocusKind !== "CONTACT_PREFERENCES" &&
    contactPreferencesAreDefault(contactPreferences)
  ) {
    suggestions.push({
      id: "CONTACT_PREFERENCES",
      icon: "profile",
      title: "设置联系方式偏好",
      body: "默认展示注册邮箱。补充微信后，引荐时 TA 更容易找到你。",
      action: { label: "去设置", href: "/dashboard/me" },
    });
  }

  return suggestions;
}

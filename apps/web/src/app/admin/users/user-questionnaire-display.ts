import type { AdminUserQuestionnaire } from "../types";
import { formatAnswer } from "./user-display";

export type ProfileAnswerRow = { key: string; label: string; answer: string };

export function buildProfileAnswerGroups(
  data: NonNullable<AdminUserQuestionnaire>,
  schools: Record<string, string>
) {
  const groups: Record<"self" | "partner" | "values", ProfileAnswerRow[]> = {
    self: [],
    partner: [],
    values: [],
  };
  const answers = data.answers;
  for (const field of data.fields) {
    const { key, label, section, options, emptyLabel } = field;
    const value = answers[key];
    let answer: string;
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
      answer = emptyLabel;
    } else if (Array.isArray(options)) {
      const labels = new Map<string, string>();
      for (const option of options)
        if (
          option &&
          typeof option === "object" &&
          typeof option.value === "string" &&
          typeof option.label === "string"
        )
          labels.set(option.value, option.label);
      answer = (Array.isArray(value) ? value : [value])
        .map((item) => labels.get(String(item)) ?? String(item))
        .join("、");
    } else answer = formatAnswer(key, value, schools);
    groups[section].push({ key, label, answer });
  }
  return groups;
}

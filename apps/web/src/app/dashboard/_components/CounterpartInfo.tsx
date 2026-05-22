import {
  WEEKLY_INTENT_LABELS,
  type WeeklyIntent,
} from "../../../lib/weekly-intent";

type CounterpartInfoProps = {
  gender?: string | null;
  partnerGenders?: string[] | null;
  weeklyIntent?: WeeklyIntent | null;
  compact?: boolean;
};

/**
 * Objective facts about the matched counterpart, shown once a match is
 * revealed (and not LIMITED): their own gender, the partner genders they are
 * looking for, and this round's weekly intent. Renders nothing when none of
 * these are available (e.g. older snapshots before this field existed).
 */
export function CounterpartInfo({
  gender,
  partnerGenders,
  weeklyIntent,
  compact = false,
}: CounterpartInfoProps) {
  const rows: Array<{ label: string; value: string }> = [];

  if (gender && gender.trim().length > 0) {
    rows.push({ label: "对方性别", value: gender });
  }
  if (partnerGenders && partnerGenders.length > 0) {
    rows.push({ label: "期望对象性别", value: partnerGenders.join("、") });
  }
  if (weeklyIntent) {
    rows.push({
      label: "本周意向",
      value: WEEKLY_INTENT_LABELS[weeklyIntent].subtitle,
    });
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        background: "#fdfbfa",
        border: "1px solid #f3e7ea",
        borderRadius: "1rem",
        padding: compact ? "0.85rem 1rem" : "1.1rem 1.25rem",
      }}
    >
      <h3
        style={{
          margin: 0,
          marginBottom: "0.6rem",
          fontSize: "0.95rem",
          color: "#333",
        }}
      >
        对方信息
      </h3>
      <dl
        style={{
          margin: 0,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: "0.4rem",
          columnGap: "0.9rem",
          fontSize: "0.88rem",
        }}
      >
        {rows.map((row) => (
          <div key={row.label} style={{ display: "contents" }}>
            <dt style={{ color: "var(--fg-secondary)" }}>{row.label}</dt>
            <dd style={{ margin: 0, color: "#333", fontWeight: 500 }}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

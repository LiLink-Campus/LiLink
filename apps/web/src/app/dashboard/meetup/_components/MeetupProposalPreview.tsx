import { dcx } from "../../_lib/dashboard-class-names";
import type { ReactNode } from "react";

export type MeetupProposalPreviewEntry = {
  tag: string;
  value: ReactNode;
};

/**
 * Pre-flight summary rendered just above the submit button of a proposal
 * form. Mirrors what the counterpart will see in their notification so
 * users can audit their own message before sending.
 */
export function MeetupProposalPreview({
  entries,
  emptyText = "尚未填写完整内容。",
  label = "对方将收到",
}: {
  entries: MeetupProposalPreviewEntry[];
  emptyText?: string;
  label?: string;
}) {
  const populated = entries.filter((entry) => entry.value !== null && entry.value !== "");

  return (
    <div
      className={dcx("v2-proposal-preview")}
      aria-live="polite"
      aria-label="对方将收到"
    >
      <span className={dcx("v2-proposal-preview-label")}>{label}</span>
      {populated.length === 0 ? (
        <p className={dcx("v2-proposal-preview-empty")}>{emptyText}</p>
      ) : (
        <ul className={dcx("v2-proposal-preview-list")}>
          {populated.map((entry, index) => (
            <li key={`${entry.tag}-${index}`}>
              <span className={dcx("v2-proposal-preview-tag")}>{entry.tag}</span>
              <span>{entry.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

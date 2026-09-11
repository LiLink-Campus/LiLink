import type { MeetupMessage, MeetupSessionResponse } from "../../../../lib/api";

/**
 * The counterpart's rejection note to surface in the re-propose state, or null.
 *
 * Returns a note only when the counterpart's MOST RECENT message is a REJECT, so
 * a later partial-accept or fresh proposal never resurfaces a stale REJECT note
 * (the issue #88 regression). Note text takes precedence over the canned preset.
 */
export function deriveCounterpartRejectNote(
  session: Pick<MeetupSessionResponse, "messages">,
  currentUserId: string,
): string | null {
  const sorted = [...session.messages].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const message: MeetupMessage = sorted[index];
    if (message.actorUserId !== currentUserId) {
      return message.type === "REJECT"
        ? (message.noteText ?? message.notePreset ?? null)
        : null;
    }
  }
  return null;
}

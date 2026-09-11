import type { DashboardHistoryItem } from "../../_lib/types";
import { matchDashboardFixtures, matchStoryUser } from "../match.fixtures";

export function historyCardExamples(userId: string): DashboardHistoryItem[] {
  const sample = matchDashboardFixtures.introducedContactCompleted.latestMatch!;
  const common = { visibility: "NOT_APPLICABLE" as const, limitedReason: null, match: null };
  return [
    { ...common, cycleId: "preview-history-unmatched", codename: "秋日来信", revealAt: "2026-09-08T13:00:00.000Z", participationStatus: "OPTED_IN", result: "UNMATCHED" },
    { cycleId: "preview-history-matched", codename: "九月初见", revealAt: "2026-09-01T13:00:00.000Z", participationStatus: "OPTED_IN", result: "MATCHED", visibility: "VISIBLE", limitedReason: null,
      match: { ...sample, id: "preview-history-match", score: 96, participants: sample.participants.map(person => person.userId === matchStoryUser.id ? { ...person, userId } : { ...person, displayName: "陈一诺", schoolName: "海南比勒费尔德应用科学大学", introLine: "周末喜欢看展和做饭，想找人一起探索城市角落。", contact: { type: "WECHAT" as const, label: "微信号", value: "chenyinuo_29" } }) }
    },
    { ...common, cycleId: "preview-history-skipped", codename: "夏末留白", revealAt: "2026-08-25T13:00:00.000Z", participationStatus: "OPTED_OUT", result: "NOT_PARTICIPATED" },
  ];
}

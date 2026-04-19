import Link from "next/link";
import { loadDashboardCore } from "./_lib/bootstrap";
import { WEEKLY_INTENT_LABELS } from "../../lib/weekly-intent";
import type { DashboardPayload } from "./_lib/types";
import "../protected.css";
import "./dashboard.css";

type HubCardStatus = {
  label: string;
  tone: "default" | "on" | "warn" | "accent";
};

function statusClass(tone: HubCardStatus["tone"]) {
  switch (tone) {
    case "on":
      return "dashboard-hub-card-status is-on";
    case "warn":
      return "dashboard-hub-card-status is-warn";
    case "accent":
      return "dashboard-hub-card-status is-accent";
    default:
      return "dashboard-hub-card-status";
  }
}

function intentStatus(dashboard: DashboardPayload): HubCardStatus {
  const cycle = dashboard.currentCycle;
  if (!cycle) return { label: "本轮未开放", tone: "default" };
  if (cycle.participationStatus === "OPTED_OUT") {
    return { label: "本轮未参与", tone: "default" };
  }
  if (!cycle.intent) {
    return { label: "待选本周意图", tone: "warn" };
  }
  return {
    label: `本周锁定：${WEEKLY_INTENT_LABELS[cycle.intent].primary}`,
    tone: "accent",
  };
}

function matchStatus(dashboard: DashboardPayload): HubCardStatus {
  const currentCycle = dashboard.currentCycle;

  if (dashboard.latestMatchVisibility === "LIMITED") {
    return { label: "本轮已受限", tone: "warn" };
  }
  if (dashboard.latestMatch) {
    return dashboard.latestMatch.introducedAt
      ? { label: "已引荐", tone: "on" }
      : { label: "待引荐", tone: "accent" };
  }
  if (
    currentCycle?.participationStatus === "OPTED_IN" &&
    !currentCycle.intent &&
    (currentCycle.status === "OPEN" || currentCycle.status === "REVEAL_READY")
  ) {
    return { label: "待选本周意图", tone: "warn" };
  }
  if (
    dashboard.lastRevealedRound?.participationStatus === "OPTED_IN" &&
    !dashboard.lastRevealedRound.matched
  ) {
    return { label: "本轮未匹配", tone: "default" };
  }
  if (
    currentCycle?.participationStatus === "OPTED_IN" &&
    (currentCycle.status === "OPEN" || currentCycle.status === "REVEAL_READY")
  ) {
    return { label: "等待揭晓", tone: "accent" };
  }
  return { label: "暂无匹配", tone: "default" };
}

function historyStatus(dashboard: DashboardPayload): HubCardStatus {
  const count = dashboard.recentMatchHistory.length;
  if (count === 0) return { label: "暂无记录", tone: "default" };
  return { label: `最近 ${count} 次`, tone: "default" };
}

function profileStatus(dashboard: DashboardPayload): HubCardStatus {
  return dashboard.questionnaireSubmittedAt
    ? { label: "已保存", tone: "on" }
    : { label: "待完成", tone: "warn" };
}

export default async function DashboardHubPage() {
  const { dashboard } = await loadDashboardCore();
  const hasSavedQuestionnaire = Boolean(dashboard.questionnaireSubmittedAt);

  const cards: Array<{
    href: string;
    title: string;
    summary: string;
    status: HubCardStatus;
  }> = [
    {
      href: "/dashboard/intent",
      title: "本周意图",
      summary:
        "选择 Friend / Date / Both 决定本周参与匹配；每轮重新选一次，可在截止前更换。",
      status: intentStatus(dashboard),
    },
    {
      href: "/dashboard/match",
      title: "本轮匹配",
      summary:
        "查看本轮揭晓的匹配对象、匹配理由与引荐邮件状态；未引荐前不展示对方信息。",
      status: matchStatus(dashboard),
    },
    {
      href: "/dashboard/history",
      title: "历史记录",
      summary: "最近三次匹配的快照；可在每条记录上单独发起联络或举报。",
      status: historyStatus(dashboard),
    },
    {
      href: "/dashboard/profile",
      title: "问卷资料",
      summary:
        "昵称、客观条件、价值观问卷。匹配以你最近一次保存的内容计算。",
      status: profileStatus(dashboard),
    },
  ];

  return (
    <main className="page-shell dashboard-page">
      <header className="content-panel dashboard-panel-wide dashboard-panel-tight">
        <p className="eyebrow">我的匹配</p>
        <h1>欢迎回来</h1>
        <p className="dashboard-lede">
          {hasSavedQuestionnaire
            ? "你已保存问卷资料。下方四个入口分别对应本周意图、本轮匹配、历史记录与问卷资料。"
            : "在「问卷资料」中完成问卷，再到「本周意图」选择参与方式，揭晓后回到「本轮匹配」查看结果。"}
        </p>
      </header>

      <section className="dashboard-panel-wide" aria-label="子页面入口">
        <div className="dashboard-hub-grid">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="dashboard-hub-card"
            >
              <div className="dashboard-hub-card-head">
                <h2 className="dashboard-hub-card-title">{card.title}</h2>
                <span
                  className="dashboard-hub-card-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </div>
              <p className="dashboard-hub-card-summary">{card.summary}</p>
              <span className={statusClass(card.status.tone)}>
                {card.status.label}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

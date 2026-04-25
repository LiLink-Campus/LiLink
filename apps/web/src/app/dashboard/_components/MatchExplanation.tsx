import {
  normalizeConversationTopics,
  normalizeMatchReasons,
} from "../_lib/format";
import { MessageCircleIcon, PeopleIcon, ShieldIcon } from "./icons";

type MatchExplanationProps = {
  note?: string;
  reason?: string | null;
  reasons?: unknown;
  conversationTopics?: unknown;
  emptyReasonFallback?: string;
};

type ReasonHighlight = {
  title: string;
  body: string;
  icon: "message" | "shield" | "people";
  tone: "rose" | "sage" | "sand";
};

const REASON_HIGHLIGHT_RULES: ReadonlyArray<{
  title: string;
  icon: ReasonHighlight["icon"];
  tone: ReasonHighlight["tone"];
  keywords: readonly string[];
}> = [
  {
    title: "沟通节奏一致",
    icon: "message",
    tone: "rose",
    keywords: ["沟通", "分歧", "修复", "表达", "聊天", "联系频率", "冷静"],
  },
  {
    title: "责任感相近",
    icon: "shield",
    tone: "sage",
    keywords: ["责任", "稳定", "上进", "真诚", "温柔", "价值", "说到做到"],
  },
  {
    title: "边界感契合",
    icon: "people",
    tone: "sand",
    keywords: ["边界", "空间", "独处", "尊重", "控制欲"],
  },
  {
    title: "支持方式相近",
    icon: "message",
    tone: "rose",
    keywords: ["支持", "陪我聊天", "建议", "照顾", "在乎", "陪伴"],
  },
  {
    title: "相处底线清楚",
    icon: "shield",
    tone: "sage",
    keywords: ["雷点", "敏感", "失联", "情绪爆炸", "迟到失约"],
  },
  {
    title: "日常节奏合拍",
    icon: "people",
    tone: "sand",
    keywords: ["约会", "周末", "出去玩", "AA", "买单", "小事", "关系感"],
  },
  {
    title: "关系期待接近",
    icon: "shield",
    tone: "sage",
    keywords: ["关系", "期待", "未来", "认真", "新鲜感", "成长"],
  },
];

const FALLBACK_HIGHLIGHTS: ReadonlyArray<ReasonHighlight> = [
  {
    title: "共同点明确",
    body: "",
    icon: "message",
    tone: "rose",
  },
  {
    title: "相处方式接近",
    body: "",
    icon: "shield",
    tone: "sage",
  },
  {
    title: "互动基础稳定",
    body: "",
    icon: "people",
    tone: "sand",
  },
];

function compactReasonText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/\s+([，。；、！？])/g, "$1")
    .replace(/([「“])\s+/g, "$1")
    .replace(/\s+([」”])/g, "$1")
    .trim();
}

function highlightBody(reason: string) {
  const body = compactReasonText(reason)
    .replace(/^你们/, "")
    .replace(/都更接受\s+/g, "都更接受")
    .replace(/都把\s+/g, "都把")
    .replace(/这类相处问题比较敏感。?$/, "这类相处问题保持敏感。");

  if (body.length <= 34) {
    return body;
  }

  return `${body.slice(0, 33)}…`;
}

function buildReasonHighlights(reasons: string[]) {
  const usedTitles = new Set<string>();

  return reasons.slice(0, 3).map((reason, index): ReasonHighlight => {
    const rule = REASON_HIGHLIGHT_RULES.find(
      (candidate) =>
        !usedTitles.has(candidate.title) &&
        candidate.keywords.some((keyword) => reason.includes(keyword)),
    );
    const fallback = FALLBACK_HIGHLIGHTS[index] ?? FALLBACK_HIGHLIGHTS[0];
    const meta = rule ?? fallback;

    usedTitles.add(meta.title);

    return {
      title: meta.title,
      body: highlightBody(reason),
      icon: meta.icon,
      tone: meta.tone,
    };
  });
}

function ReasonHighlightIcon({ icon }: { icon: ReasonHighlight["icon"] }) {
  if (icon === "message") {
    return <MessageCircleIcon />;
  }
  if (icon === "shield") {
    return <ShieldIcon />;
  }
  return <PeopleIcon />;
}

export function MatchExplanation({
  note,
  reason,
  reasons,
  conversationTopics,
  emptyReasonFallback,
}: MatchExplanationProps) {
  const normalizedReasons = normalizeMatchReasons(reasons);
  const highlights = buildReasonHighlights(normalizedReasons);
  const summary = reason?.trim() ?? "";
  const topics = normalizeConversationTopics(conversationTopics);

  if (
    highlights.length === 0 &&
    !summary &&
    !emptyReasonFallback &&
    topics.length === 0
  ) {
    return null;
  }

  return (
    <div className="match-explanation">
      <div className="match-explanation-heading">
        <ShieldIcon />
        <p className="eyebrow">匹配理由</p>
      </div>
      {note ? <p className="app-card-muted match-explanation-note">{note}</p> : null}
      {highlights.length > 0 ? (
        <ul className="match-reason-highlight-list">
          {highlights.map((highlight, index) => (
            <li
              className={`match-reason-highlight is-${highlight.tone}`}
              key={`${index}-${highlight.title}-${highlight.body.slice(0, 24)}`}
            >
              <span className="match-reason-highlight-icon">
                <ReasonHighlightIcon icon={highlight.icon} />
              </span>
              <span className="match-reason-highlight-copy">
                <strong>{highlight.title}</strong>
                <span>{highlight.body}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {summary ? (
        <blockquote className="match-reason-summary">
          <span className="match-reason-quote-mark" aria-hidden="true">
            “
          </span>
          <span>{summary}</span>
        </blockquote>
      ) : null}
      {!summary && highlights.length === 0 && emptyReasonFallback ? (
        <p className="app-card-muted">{emptyReasonFallback}</p>
      ) : null}
      {topics.length > 0 ? (
        <div className="conversation-topic-card">
          <div className="conversation-topic-heading">
            <MessageCircleIcon />
            <p className="eyebrow">聊天话题</p>
          </div>
          <ul className="conversation-topic-list">
            {topics.map((topic, index) => (
              <li key={`${index}-${topic.slice(0, 48)}`}>{topic}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

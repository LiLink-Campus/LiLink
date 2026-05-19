import {
  normalizeConversationTopics,
  normalizeMatchReasons,
} from "../_lib/format";
import { type SupportedLocale } from "@lilink/shared";
import { useLocale } from "../../locale-context";
import { MessageCircleIcon, PeopleIcon, ShieldIcon } from "./icons";

type MatchExplanationProps = {
  note?: string;
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
  titleByLocale: Record<SupportedLocale, string>;
  icon: ReasonHighlight["icon"];
  tone: ReasonHighlight["tone"];
  keywords: readonly string[];
}> = [
  {
    titleByLocale: {
      "zh-CN": "沟通节奏一致",
      "en-US": "Similar Communication Pace",
    },
    icon: "message",
    tone: "rose",
    keywords: ["沟通", "分歧", "修复", "表达", "聊天", "联系频率", "冷静"],
  },
  {
    titleByLocale: {
      "zh-CN": "责任感相近",
      "en-US": "Aligned Reliability",
    },
    icon: "shield",
    tone: "sage",
    keywords: ["责任", "稳定", "上进", "真诚", "温柔", "价值", "说到做到"],
  },
  {
    titleByLocale: {
      "zh-CN": "边界感契合",
      "en-US": "Compatible Boundaries",
    },
    icon: "people",
    tone: "sand",
    keywords: ["边界", "空间", "独处", "尊重", "控制欲"],
  },
  {
    titleByLocale: {
      "zh-CN": "支持方式相近",
      "en-US": "Similar Support Needs",
    },
    icon: "message",
    tone: "rose",
    keywords: ["支持", "陪我聊天", "建议", "照顾", "在乎", "陪伴"],
  },
  {
    titleByLocale: {
      "zh-CN": "相处底线清楚",
      "en-US": "Clear Dealbreakers",
    },
    icon: "shield",
    tone: "sage",
    keywords: ["雷点", "敏感", "失联", "情绪爆炸", "迟到失约"],
  },
  {
    titleByLocale: {
      "zh-CN": "日常节奏合拍",
      "en-US": "Compatible Daily Rhythm",
    },
    icon: "people",
    tone: "sand",
    keywords: ["约会", "周末", "出去玩", "AA", "买单", "小事", "关系感"],
  },
  {
    titleByLocale: {
      "zh-CN": "关系期待接近",
      "en-US": "Similar Relationship Goals",
    },
    icon: "shield",
    tone: "sage",
    keywords: ["关系", "期待", "未来", "认真", "新鲜感", "成长"],
  },
];

const FALLBACK_HIGHLIGHTS: ReadonlyArray<
  Omit<ReasonHighlight, "title"> & {
    titleByLocale: Record<SupportedLocale, string>;
  }
> = [
  {
    titleByLocale: {
      "zh-CN": "共同点明确",
      "en-US": "Clear Common Ground",
    },
    body: "",
    icon: "message",
    tone: "rose",
  },
  {
    titleByLocale: {
      "zh-CN": "相处方式接近",
      "en-US": "Similar Interaction Style",
    },
    body: "",
    icon: "shield",
    tone: "sage",
  },
  {
    titleByLocale: {
      "zh-CN": "互动基础稳定",
      "en-US": "Stable Interaction Base",
    },
    body: "",
    icon: "people",
    tone: "sand",
  },
];

const MATCH_EXPLANATION_COPY: Record<
  SupportedLocale,
  {
    reasonHeading: string;
    topicHeading: string;
  }
> = {
  "zh-CN": {
    reasonHeading: "匹配理由",
    topicHeading: "聊天话题",
  },
  "en-US": {
    reasonHeading: "Match Reasons",
    topicHeading: "Conversation Topics",
  },
};

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

function buildReasonHighlights(reasons: string[], locale: SupportedLocale) {
  const usedTitles = new Set<string>();

  return reasons.slice(0, 3).map((reason, index): ReasonHighlight => {
    const rule = REASON_HIGHLIGHT_RULES.find(
      (candidate) =>
        !usedTitles.has(candidate.titleByLocale[locale]) &&
        candidate.keywords.some((keyword) => reason.includes(keyword)),
    );
    const fallback = FALLBACK_HIGHLIGHTS[index] ?? FALLBACK_HIGHLIGHTS[0];
    const meta = rule ?? fallback;
    const title = meta.titleByLocale[locale];

    usedTitles.add(title);

    return {
      title,
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
  reasons,
  conversationTopics,
  emptyReasonFallback,
}: MatchExplanationProps) {
  const { locale } = useLocale();
  const copy = MATCH_EXPLANATION_COPY[locale];
  const normalizedReasons = normalizeMatchReasons(reasons);
  const highlights = buildReasonHighlights(normalizedReasons, locale);
  const topics = normalizeConversationTopics(conversationTopics);

  if (
    highlights.length === 0 &&
    !emptyReasonFallback &&
    topics.length === 0
  ) {
    return null;
  }

  return (
    <div className="match-explanation">
      <div className="match-explanation-heading">
        <p className="eyebrow">{copy.reasonHeading}</p>
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
      {highlights.length === 0 && emptyReasonFallback ? (
        <p className="app-card-muted">{emptyReasonFallback}</p>
      ) : null}
      {topics.length > 0 ? (
        <div className="conversation-topic-card">
          <div className="conversation-topic-heading">
            <p className="eyebrow">不知道怎么开口？</p>
          </div>
          <ul className="conversation-topic-list">
            {topics.map((topic, index) => (
              <li key={`${index}-${topic.slice(0, 48)}`}>
                {topic}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

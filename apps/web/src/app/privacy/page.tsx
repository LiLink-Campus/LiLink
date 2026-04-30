import { LocalizedText } from "../localized-text";

const PRIVACY_COPY = {
  "zh-CN": {
    title: "隐私原则",
    intro:
      "LiLink 不做公开用户广场。你的邮箱、问卷答案、举报记录和匹配结果都不对其他用户公开，平台只在必要范围内处理这些数据。",
    items: [
      "邮箱只用于身份验证、揭晓通知和联系引荐。",
      "问卷答案只用于匹配和匹配理由生成。",
      "举报和封禁记录只用于安全处理。",
      "不出售数据，不做广告画像。",
    ],
  },
  "en-US": {
    title: "Privacy Principles",
    intro:
      "LiLink does not run a public profile wall. Your email, questionnaire answers, reports, and match results are not public to other users.",
    items: [
      "Email is used for identity verification, reveal notices, and contact introductions.",
      "Questionnaire answers are used for matching and match reasons.",
      "Reports and blocks are used for safety handling.",
      "LiLink does not sell data or build advertising profiles.",
    ],
  },
} as const;

function privacyText(key: "title" | "intro") {
  return (
    <LocalizedText
      zh={PRIVACY_COPY["zh-CN"][key]}
      en={PRIVACY_COPY["en-US"][key]}
    />
  );
}

export default function PrivacyPage() {
  return (
    <main className="page-shell prose-shell">
      <section className="content-panel">
        <p className="eyebrow">Privacy</p>
        <h1>{privacyText("title")}</h1>
        <p>{privacyText("intro")}</p>
        <ul>
          {PRIVACY_COPY["zh-CN"].items.map((item, index) => (
            <li key={item}>
              <LocalizedText
                zh={item}
                en={PRIVACY_COPY["en-US"].items[index]}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

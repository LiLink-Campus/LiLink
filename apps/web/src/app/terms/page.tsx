import { getRequestLocale } from "../../lib/locale";

export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const locale = await getRequestLocale();
  const copy =
    locale === "zh-CN"
      ? {
          title: "用户协议",
          intro:
            "LiLink 面向校园社区提供匹配服务。注册和使用平台前，你需要确认自己使用真实、有效的学校邮箱，并对提交信息的真实性负责。",
          free:
            "当前不向用户收取服务费用；LiLink 以公益为导向运营，欢迎自愿赞助以支持可持续维护。",
          items: [
            "你同意仅将平台用于真实、合法、善意的社交与匹配目的。",
            "你不得冒用他人身份，不得提交骚扰、侮辱、欺骗或其他恶意内容。",
            "平台会在匹配揭晓和你主动请求联系时，按产品规则共享必要联系信息。",
            "若出现举报、风险或安全问题，平台有权限制功能、暂停匹配或封禁账号。",
          ],
        }
      : {
          title: "Terms",
          intro:
            "LiLink provides matching services for campus communities. Before registering and using the platform, you must use a real, valid school email and be responsible for the information you submit.",
          free:
            "LiLink currently does not charge users and is operated as a community project.",
          items: [
            "Use LiLink only for genuine, lawful, and good-faith social matching.",
            "Do not impersonate others or submit harassment, insults, deception, or malicious content.",
            "When matches are revealed or contact is requested, LiLink may share necessary contact information according to product rules.",
            "If reports, risks, or safety issues occur, LiLink may limit features, pause matching, or suspend accounts.",
          ],
        };

  return (
    <main className="page-shell prose-shell">
      <section className="content-panel">
        <p className="eyebrow">Terms</p>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
        <p>{copy.free}</p>
        <ul>
          {copy.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

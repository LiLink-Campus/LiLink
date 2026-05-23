import { Card } from "@/components/ui";
import layoutStyles from "../public-layout.module.css";

export default function TermsPage() {
  return (
    <main className={`${layoutStyles.pageShell} ${layoutStyles.proseShell}`}>
      <Card className={layoutStyles.prosePanel} layout="plain">
        <p className="eyebrow">Terms</p>
        <h1>用户协议</h1>
        <p>
          LiLink 面向校园社区提供匹配服务。注册和使用平台前，你需要确认自己使用真实、有效的学校邮箱，并对提交信息的真实性负责。
        </p>
        <p>
          当前不向用户收取服务费用；LiLink 以公益为导向运营，欢迎自愿赞助以支持可持续维护。
        </p>
        <ul>
          <li>你同意仅将平台用于真实、合法、善意的社交与匹配目的。</li>
          <li>你不得冒用他人身份，不得提交骚扰、侮辱、欺骗或其他恶意内容。</li>
          <li>平台会在匹配揭晓和你主动请求联系时，按产品规则共享必要联系信息。</li>
          <li>若出现举报、风险或安全问题，平台有权限制功能、暂停匹配或封禁账号。</li>
        </ul>
      </Card>
    </main>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { getEligibleSchools } from "../../lib/public-server-api";
import {
  CampusLineart,
  GrassRowIllustration,
} from "../dashboard/_components/illustrations";
import { EligibleSchoolsPanel } from "../eligible-schools-panel";
import { LocalizedText } from "../localized-text";

export const metadata: Metadata = {
  title: "支持的学校 / Supported Schools | LiLink",
  description:
    "LiLink 当前接受注册的学校邮箱后缀列表 / The current list of accepted school email domains.",
};

export const revalidate = 30;

const SCHOOLS_COPY = {
  "zh-CN": {
    title: "当前支持的学校",
    intro:
      "LiLink 目前仅接受 6 所合作高校的学校邮箱注册。下方列表展示学校名称与可识别邮箱后缀。",
    ready: "Ready?",
    ctaTitle: "用学校邮箱开始你的第一次匹配",
    ctaBody:
      "输入你的学校邮箱，我们会在后台帮你识别学校；通过验证码后即可加入下一个轮次。",
    register: "立即注册",
    faq: "查看常见问题",
    grass: "好的关系，源于尊重与真诚",
  },
  "en-US": {
    title: "Supported schools",
    intro:
      "LiLink currently accepts registration from 6 supported universities. The list below shows each school name and accepted email domains.",
    ready: "Ready?",
    ctaTitle: "Start your first match with a school email",
    ctaBody:
      "Enter your school email, complete verification, and join the next round.",
    register: "Register",
    faq: "FAQ",
    grass: "Good relationships start with respect and sincerity",
  },
} as const;

function schoolsText(key: keyof (typeof SCHOOLS_COPY)["zh-CN"]) {
  return (
    <LocalizedText
      zh={SCHOOLS_COPY["zh-CN"][key]}
      en={SCHOOLS_COPY["en-US"][key]}
    />
  );
}

export default async function SchoolsPage() {
  const initialPayload = await getEligibleSchools().catch(() => null);

  return (
    <main>
      <section className="page-hero page-hero-compact is-narrow">
        <div className="page-hero-illustration is-wide" aria-hidden="true">
          <CampusLineart />
        </div>
        <div className="page-hero-content animate-in">
          <p className="eyebrow">Eligible schools</p>
          <h1>{schoolsText("title")}</h1>
          <p>{schoolsText("intro")}</p>
        </div>
      </section>

      <section className="page-shell prose-shell">
        <EligibleSchoolsPanel
          variant="full"
          collapsible={false}
          showSearch
          initialPayload={initialPayload ?? undefined}
          hasInitialError={initialPayload == null}
        />

        <div className="schools-cta">
          <div>
            <p className="eyebrow">{schoolsText("ready")}</p>
            <h2>{schoolsText("ctaTitle")}</h2>
            <p>{schoolsText("ctaBody")}</p>
          </div>
          <div className="schools-cta-actions">
            <Link className="button-primary" href="/register">
              {schoolsText("register")}
            </Link>
            <Link className="button-secondary" href="/faq">
              {schoolsText("faq")}
            </Link>
          </div>
        </div>
      </section>

      <section className="home-grass-line" aria-hidden="true">
        <GrassRowIllustration />
        <span>{schoolsText("grass")}</span>
        <GrassRowIllustration />
      </section>
    </main>
  );
}

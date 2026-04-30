import Link from "next/link";
import type { Metadata } from "next";
import { getEligibleSchools } from "../../lib/public-server-api";
import { getRequestLocale } from "../../lib/locale";
import {
  CampusLineart,
  GrassRowIllustration,
} from "../dashboard/_components/illustrations";
import { EligibleSchoolsPanel } from "../eligible-schools-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return locale === "zh-CN"
    ? {
        title: "支持的学校 | LiLink",
        description:
          "LiLink 当前接受注册的学校邮箱后缀列表，实时同步自合作高校白名单配置。",
      }
    : {
        title: "Supported Schools | LiLink",
        description:
          "The current list of school email domains accepted by LiLink.",
      };
}

export const revalidate = 30;

export default async function SchoolsPage() {
  const locale = await getRequestLocale();
  const copy =
    locale === "zh-CN"
      ? {
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
        }
      : {
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
        };
  const initialPayload = await getEligibleSchools().catch(() => null);

  return (
    <main>
      <section className="page-hero page-hero-compact is-narrow">
        <div className="page-hero-illustration is-wide" aria-hidden="true">
          <CampusLineart />
        </div>
        <div className="page-hero-content animate-in">
          <p className="eyebrow">Eligible schools</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
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
            <p className="eyebrow">{copy.ready}</p>
            <h2>{copy.ctaTitle}</h2>
            <p>{copy.ctaBody}</p>
          </div>
          <div className="schools-cta-actions">
            <Link className="button-primary" href="/register">
              {copy.register}
            </Link>
            <Link className="button-secondary" href="/faq">
              {copy.faq}
            </Link>
          </div>
        </div>
      </section>

      <section className="home-grass-line" aria-hidden="true">
        <GrassRowIllustration />
        <span>{copy.grass}</span>
        <GrassRowIllustration />
      </section>
    </main>
  );
}

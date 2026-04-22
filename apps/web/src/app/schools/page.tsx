import Link from "next/link";
import type { Metadata } from "next";
import { getEligibleSchools } from "../../lib/public-server-api";
import { EligibleSchoolsPanel } from "../eligible-schools-panel";

export const metadata: Metadata = {
  title: "支持的学校 | LiLink",
  description:
    "LiLink 当前接受注册的学校邮箱后缀列表，实时同步自园区白名单配置。",
};

export const revalidate = 30;

export default async function SchoolsPage() {
  const initialPayload = await getEligibleSchools().catch(() => null);

  return (
    <main>
      <section className="page-hero page-hero-compact">
        <div className="page-hero-content">
          <p className="eyebrow">Eligible schools</p>
          <h1>当前支持的学校</h1>
          <p>
            LiLink 仅接受园区白名单学校的邮箱注册。下方列表实时同步自后台配置，
            如果你的学校尚未上线，欢迎在页脚联系我们补录。
          </p>
        </div>
      </section>

      <section className="page-shell prose-shell schools-page">
        <EligibleSchoolsPanel
          variant="full"
          collapsible={false}
          showSearch
          initialPayload={initialPayload ?? undefined}
          hasInitialError={initialPayload == null}
        />

        <div className="schools-cta">
          <div>
            <p className="eyebrow">Ready?</p>
            <h2>用学校邮箱开始你的第一次匹配</h2>
            <p>
              输入你的学校邮箱，我们会在后台帮你识别学校；通过验证码后即可加入下一个轮次。
            </p>
          </div>
          <div className="schools-cta-actions">
            <Link className="button-primary" href="/register">
              立即注册
            </Link>
            <Link className="button-secondary" href="/faq">
              查看常见问题
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

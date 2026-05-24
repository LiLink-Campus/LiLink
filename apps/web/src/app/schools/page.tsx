import { ButtonLink } from "@/components/ui";
import type { Metadata } from "next";
import { getEligibleSchools } from "../../lib/public-server-api";
import {
  CampusLineart,
  GrassRowIllustration,
} from "../dashboard/_components/illustrations";
import { EligibleSchoolsPanel } from "../eligible-schools-panel";
import layoutStyles from "../public-layout.module.css";
import styles from "./schools.module.css";

export const metadata: Metadata = {
  title: "支持的学校 | LiLink",
  description:
    "LiLink 当前接受注册的学校邮箱后缀列表，实时同步自合作高校白名单配置。",
};

export const revalidate = 30;

export default async function SchoolsPage() {
  const initialPayload = await getEligibleSchools().catch(() => null);

  return (
    <main>
      <section
        className={`${layoutStyles.pageHero} ${layoutStyles.pageHeroCompact} ${layoutStyles.narrow}`}
      >
        <div
          className={`${layoutStyles.pageHeroIllustration} ${layoutStyles.wide}`}
          aria-hidden="true"
        >
          <CampusLineart />
        </div>
        <div className={`${layoutStyles.pageHeroContent} animate-in`}>
          <p className="eyebrow">Eligible schools</p>
          <h1>当前支持的学校</h1>
          <p>
            LiLink 仅接受合作高校的学校邮箱注册。下方列表实时同步自后台配置，如果你的学校尚未上线，欢迎在页脚联系我们补录。
          </p>
        </div>
      </section>

      <section className={`${layoutStyles.pageShell} ${layoutStyles.proseShell}`}>
        <EligibleSchoolsPanel
          variant="full"
          collapsible={false}
          showSearch
          initialPayload={initialPayload ?? undefined}
          hasInitialError={initialPayload == null}
        />

        <div className={styles.cta}>
          <div>
            <p className="eyebrow">Ready?</p>
            <h2>用学校邮箱开始你的第一次匹配</h2>
            <p>
              输入你的学校邮箱，我们会在后台帮你识别学校；通过验证码后即可加入下一个轮次。
            </p>
          </div>
          <div className={styles.ctaActions}>
            <ButtonLink href="/register">
              立即注册
            </ButtonLink>
            <ButtonLink variant="secondary" href="/faq">
              查看常见问题
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className={layoutStyles.grassLine} aria-hidden="true">
        <GrassRowIllustration />
        <span>好的关系，源于尊重与真诚</span>
        <GrassRowIllustration />
      </section>
    </main>
  );
}

import type { ReactNode } from "react";
import layoutStyles from "../public-layout.module.css";
import heroStyles from "./public-narrow-page-hero.module.css";

type PublicNarrowPageHeroProps = {
  eyebrow: string;
  title: string;
  description: ReactNode;
  illustration: ReactNode;
  /** Use `landscape` for wide line art such as CampusLineart. */
  illustrationSize?: "default" | "landscape";
};

/** Shared centered hero for FAQ, schools, updates, and similar public pages. */
export function PublicNarrowPageHero({
  eyebrow,
  title,
  description,
  illustration,
  illustrationSize = "default",
}: PublicNarrowPageHeroProps) {
  const illustrationSlotClass =
    illustrationSize === "landscape"
      ? heroStyles.illustrationSlotLandscape
      : heroStyles.illustrationSlot;

  return (
    <section
      className={`${layoutStyles.pageHero} ${layoutStyles.pageHeroCompact} ${layoutStyles.narrow}`}
    >
      <div
        className={`${layoutStyles.pageHeroIllustration} ${illustrationSlotClass}`}
        aria-hidden="true"
      >
        {illustration}
      </div>
      <div className={`${layoutStyles.pageHeroContent} animate-in`}>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}

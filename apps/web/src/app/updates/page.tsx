import type { Metadata } from "next";
import { getDevlogUpdates, getDevlogBaseUrl } from "@/lib/devlog-feed";
import layoutStyles from "../public-layout.module.css";
import styles from "./updates.module.css";
import { MarkUpdatesSeen } from "./mark-seen";

export const metadata: Metadata = {
  title: "产品更新 · LiLink",
  description: "LiLink 的每一次迭代：我们解决了哪些问题，体验有了什么变化。",
};

export const revalidate = 3600;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${y}年${m}月${d}日`;
}

export default async function UpdatesPage() {
  const updates = await getDevlogUpdates();

  return (
    <main>
      <MarkUpdatesSeen latestPublishedAt={updates[0]?.publishedAt ?? null} />
      <section className={layoutStyles.pageHero}>
        <div className={`${layoutStyles.pageHeroContent} animate-in`}>
          <p className="eyebrow">Product updates</p>
          <h1 className="text-balance">产品更新</h1>
          <p>我们解决了哪些问题，体验有了什么变化——每一次迭代都记在这里。</p>
        </div>
      </section>

      <section className={styles.timeline}>
        {updates.length === 0 ? (
          <p className={styles.empty}>
            更新内容暂时无法加载，你可以前往{" "}
            <a
              href={getDevlogBaseUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              devlog
            </a>{" "}
            查看最新动态。
          </p>
        ) : (
          <ol className={styles.list}>
            {updates.map((u) => (
              <li key={u.url}>
                <a
                  className={styles.entry}
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <time className={styles.date} dateTime={u.publishedAt}>
                    {formatDate(u.publishedAt)}
                  </time>
                  <h2 className={styles.title}>{u.title}</h2>
                  <p className={styles.summary}>{u.summary}</p>
                  {u.tags.length > 0 ? (
                    <div className={styles.tags}>
                      {u.tags.map((t) => (
                        <span key={t} className={styles.tag}>
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

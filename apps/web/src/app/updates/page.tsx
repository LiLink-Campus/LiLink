import type { Metadata } from "next";
import {
  getDevlogBaseUrl,
  getDevlogFeed,
  isDevlogFeedTruncated,
} from "@/lib/devlog-feed";
import { PublicNarrowPageHero } from "../_components/PublicNarrowPageHero";
import { ProductUpdatesIllustration } from "../dashboard/_components/illustrations";
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
  const feed = await getDevlogFeed();
  const updates = feed.items;
  const showArchiveLink = isDevlogFeedTruncated(feed);

  return (
    <main>
      <MarkUpdatesSeen latestPublishedAt={feed.latestPublishedAt} />
      <PublicNarrowPageHero
        eyebrow="Product updates"
        title="产品更新"
        description="我们解决了哪些问题，体验有了什么变化——每一次迭代都记在这里。"
        illustration={<ProductUpdatesIllustration />}
      />

      <section className={styles.section}>
        {updates.length === 0 ? (
          <p className={styles.empty}>
            更新列表暂时为空。线上 devlog 需先部署{" "}
            <code>/updates.json</code> 端点；本地开发请在本机运行{" "}
            <code>lilink-devlog</code>（<code>npm run dev</code>，默认{" "}
            <code>127.0.0.1:4321</code>
            ），或设置 <code>DEVLOG_BASE_URL</code>。也可前往{" "}
            <a
              href={getDevlogBaseUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              devlog
            </a>{" "}
            浏览文章。
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
        {showArchiveLink ? (
          <p className={styles.archive}>
            此处展示最近 {updates.length} 条更新（共 {feed.totalPublished}{" "}
            条）。更早的迭代请前往{" "}
            <a
              href={getDevlogBaseUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              devlog 查看全部
            </a>
            。
          </p>
        ) : null}
      </section>
    </main>
  );
}

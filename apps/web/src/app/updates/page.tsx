import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DEVLOG_UPDATES_PAGE_SIZE } from "@/lib/devlog-constants";
import {
  getDevlogBaseUrl,
  getDevlogFeed,
  isDevlogFeedTruncated,
  paginateDevlogItems,
  parseDevlogUpdatesPage,
} from "@/lib/devlog-feed";
import { PublicNarrowPageHero } from "../_components/PublicNarrowPageHero";
import { ProductUpdatesIllustration } from "../dashboard/_components/illustrations";
import styles from "./updates.module.css";
import { MarkUpdatesSeen } from "./mark-seen";
import { UpdatesPagination } from "./updates-pagination";

export const metadata: Metadata = {
  title: "产品更新 · LiLink",
  description: "LiLink 的每一次迭代：我们解决了哪些问题，体验有了什么变化。",
};

type UpdatesPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${y}年${m}月${d}日`;
}

export default async function UpdatesPage({ searchParams }: UpdatesPageProps) {
  const params = await searchParams;
  const requestedPage = parseDevlogUpdatesPage(params.page);
  const feed = await getDevlogFeed();
  const pagination = paginateDevlogItems(
    feed.items,
    requestedPage,
    DEVLOG_UPDATES_PAGE_SIZE,
  );
  if (pagination.page !== requestedPage) {
    // Out-of-range / non-canonical ?page -> redirect to the canonical URL so the
    // address bar matches the page actually rendered instead of silently clamping.
    redirect(
      pagination.page <= 1 ? "/updates" : `/updates?page=${pagination.page}`,
    );
  }
  const updates = pagination.items;
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
        {feed.items.length === 0 ? (
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
          <>
            <ol className={styles.list}>
              {updates.map((u) => (
                <li key={u.url}>
                  <a
                    className={styles.entry}
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${u.title}（在新标签页打开）`}
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
            <UpdatesPagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
            />
          </>
        )}
        {showArchiveLink ? (
          <p className={styles.archive}>
            此处收录最近 {feed.items.length} 条更新（共 {feed.totalPublished}{" "}
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

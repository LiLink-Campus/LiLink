import {
  paginateDevlogItems,
  isDevlogFeedTruncated,
  type DevlogFeed,
} from "@/lib/devlog-feed-utils";
import { DEVLOG_UPDATES_PAGE_SIZE } from "@/lib/devlog-constants";
import { PublicNarrowPageHero } from "../_components/PublicNarrowPageHero";
import { ProductUpdatesIllustration } from "../dashboard/_components/illustrations";
import styles from "./updates.module.css";
import { MarkUpdatesSeen } from "./mark-seen";
import { UpdatesPagination } from "./updates-pagination";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${y}年${m}月${d}日`;
}

export function UpdatesPageView({
  feed,
  page = 1,
  archiveUrl,
  isDev = false,
}: {
  feed: DevlogFeed;
  page?: number;
  archiveUrl: string;
  isDev?: boolean;
}) {
  const pagination = paginateDevlogItems(feed.items, page, DEVLOG_UPDATES_PAGE_SIZE);
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
            最近还没有可展示的更新，去{" "}
            <a href={archiveUrl} target="_blank" rel="noopener noreferrer">
              devlog
            </a>{" "}
            看看我们最新的进展吧。
            {isDev ? (
              <>
                <br />
                <small>
                  开发者提示：线上 devlog 需先部署 <code>/updates.json</code>{" "}
                  端点；本地开发请在本机运行 <code>lilink-devlog</code>（<code>npm run dev</code>
                  ，默认 <code>127.0.0.1:4321</code>），或 设置 <code>DEVLOG_BASE_URL</code>。
                </small>
              </>
            ) : null}
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
            此处收录最近 {feed.items.length} 条更新（共 {feed.totalPublished} 条）。更早的迭代请前往{" "}
            <a href={archiveUrl} target="_blank" rel="noopener noreferrer">
              devlog 查看全部
            </a>
            。
          </p>
        ) : null}
      </section>
    </main>
  );
}

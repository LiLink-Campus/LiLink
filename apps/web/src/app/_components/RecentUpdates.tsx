import type { CSSProperties } from "react";
import Link from "next/link";
import { DEVLOG_UPDATES_HOMEPAGE_COUNT } from "@/lib/devlog-constants";
import type { DevlogUpdate } from "@/lib/devlog-feed";
import { DevlogUpdateNewLabel } from "./DevlogUpdateNewLabel";
import styles from "./recent-updates.module.css";

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : iso;
}

/** Homepage "what's new" strip. Renders nothing when there are no updates. */
export function RecentUpdates({ updates }: { updates: DevlogUpdate[] }) {
  const items = updates.slice(0, DEVLOG_UPDATES_HOMEPAGE_COUNT);
  if (items.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">What&apos;s new</p>
          <h2>最近更新</h2>
        </div>
        <Link href="/updates" className={styles.viewAll}>
          查看全部 →
        </Link>
      </div>
      <div
        className={styles.grid}
        style={{ "--recent-count": String(items.length) } as CSSProperties}
      >
        {items.map((u, i) => (
          <a
            key={u.url}
            className={styles.card}
            href={u.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${u.title}（在新标签页打开）`}
          >
            <span className={styles.date}>
              {formatShortDate(u.publishedAt)}
              {i === 0 ? (
                <DevlogUpdateNewLabel latestPublishedAt={u.publishedAt} />
              ) : null}
            </span>
            <h3 className={styles.cardTitle}>{u.title}</h3>
            <p className={styles.cardSummary}>{u.summary}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

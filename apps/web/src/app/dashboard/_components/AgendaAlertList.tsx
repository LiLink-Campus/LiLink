import Link from "next/link";
import type { AgendaAlert } from "../_lib/agenda";
import { AGENDA_ICONS } from "./agenda-icons";
import styles from "./AgendaAlertList.module.css";

/**
 * The "需要你关注 · NOW" zone: time-sensitive match / meetup prompts. Renders
 * nothing when there is nothing urgent. Each alert is a single tap-through row.
 */
export function AgendaAlertList({ alerts }: { alerts: AgendaAlert[] }) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <section className={styles.now} aria-label="需要你关注">
      <span className={styles.eyebrow}>需要你关注 · NOW</span>
      <ul className={styles.list}>
        {alerts.map((alert) => {
          const Icon = AGENDA_ICONS[alert.icon];
          const toneClass =
            alert.tone === "celebrate"
              ? styles.celebrate
              : alert.tone === "waiting"
                ? styles.waiting
                : styles.attention;
          return (
            <li key={alert.id}>
              <Link className={`${styles.row} ${toneClass}`} href={alert.action.href}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon />
                </span>
                <span className={styles.main}>
                  <span className={styles.title}>{alert.title}</span>
                  <span className={styles.body}>{alert.body}</span>
                </span>
                <span className={styles.cta}>{alert.action.label} →</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

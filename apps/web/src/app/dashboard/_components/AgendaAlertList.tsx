import Link from "next/link";
import type { AgendaAlert } from "../_lib/agenda";
import { AGENDA_ICONS } from "./agenda-icons";

/**
 * The "需要你关注 · NOW" zone: time-sensitive match / meetup prompts. Renders
 * nothing when there is nothing urgent. Each alert is a single tap-through row.
 */
export function AgendaAlertList({ alerts }: { alerts: AgendaAlert[] }) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <section className="v2-now" aria-label="需要你关注">
      <span className="v2-now-eyebrow">需要你关注 · NOW</span>
      <ul className="v2-now-list">
        {alerts.map((alert) => {
          const Icon = AGENDA_ICONS[alert.icon];
          return (
            <li key={alert.id}>
              <Link className={`v2-now-row tone-${alert.tone}`} href={alert.action.href}>
                <span className="v2-now-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="v2-now-main">
                  <span className="v2-now-title">{alert.title}</span>
                  <span className="v2-now-body">{alert.body}</span>
                </span>
                <span className="v2-now-cta">{alert.action.label} →</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

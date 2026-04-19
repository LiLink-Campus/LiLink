"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "总览" },
  { href: "/dashboard/intent", label: "本周意图" },
  { href: "/dashboard/match", label: "本轮匹配" },
  { href: "/dashboard/history", label: "历史记录" },
  { href: "/dashboard/profile", label: "问卷资料" },
];

/**
 * Chip-style breadcrumb shown above each `/dashboard/*` page so users can
 * jump between sibling sub-pages without bouncing back to the hub.
 */
export function SubPageNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="我的匹配子页面导航">
      <ul className="dashboard-subnav">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={
                  isActive
                    ? "dashboard-subnav-link is-active"
                    : "dashboard-subnav-link"
                }
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

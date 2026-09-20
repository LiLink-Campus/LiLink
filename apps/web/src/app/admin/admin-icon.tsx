import type { SVGProps } from "react";

const paths = {
  overview: "M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  leads: "M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12h8M8 16h5",
  schools: "m3 8 9-5 9 5M4 9h16M5 9v11M10 9v11M14 9v11M19 9v11M3 21h18",
  cycles:
    "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M7 3v4M17 3v4M3 11h18",
  questionnaire: "M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h5",
  analytics: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  campaigns: "M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4zM15 7v2M15 12v2M15 17v2",
  merchants:
    "M3 9 5 3h14l2 6M3 9v2a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9H3M5 14v7h14v-7M9 21v-6h6v6",
  promotion: "m3 17 6-6 4 4 8-10M15 5h6v6",
  reports: "m12 3 9 4v5c0 5-9 9-9 9s-9-4-9-9V7zM12 8v5M12 16h.01",
  audit: "M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h8",
  settings:
    "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  external: "M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7",
  logout: "M9 3H3v18h6M8 12h13m-5-5 5 5-5 5",
  refresh: "M20 7a9 9 0 0 0-15-2L3 7M3 3v4h4M4 17a9 9 0 0 0 15 2l2-2M21 21v-4h-4",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0m-1.5 4.5L21 21",
} as const;

export type AdminIconName = keyof typeof paths;

export function AdminIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: AdminIconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}

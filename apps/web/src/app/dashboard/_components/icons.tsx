type IconProps = {
  className?: string;
};

const baseProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M4 11l8-7 8 7" />
      <path d="M5 10v10h4v-6h6v6h4V10" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M12 20.5s-7.5-4.7-7.5-11A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 7.5 3.5c0 6.3-7.5 11-7.5 11z" />
    </svg>
  );
}

export function HistoryIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
      <path d="M3 12a9 9 0 0 1 16-5.6" />
      <path d="M19 4v3h-3" />
    </svg>
  );
}

export function ProfileIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M6 4h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M14 4v6h6" />
      <path d="M9 14h6" />
      <path d="M9 18h4" />
    </svg>
  );
}

export function UserCircleIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M5.5 19a7 7 0 0 1 13 0" />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M19 12H5" />
      <path d="M11 5l-7 7 7 7" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 4 1.5 6 1.5 6h-15s1.5-2 1.5-6" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </svg>
  );
}

export function MessageCircleIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M5 16.5a7.5 7.5 0 1 1 3 2.4L4 20l1-3.5z" />
      <path d="M8.5 11.5h.01" />
      <path d="M12 11.5h.01" />
      <path d="M15.5 11.5h.01" />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M12 3.5 19 6v5.5c0 4.2-2.8 7.2-7 9-4.2-1.8-7-4.8-7-9V6l7-2.5z" />
    </svg>
  );
}

export function PeopleIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="9" cy="10" r="3" />
      <path d="M3 19a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 19a4 4 0 0 1 6.5-3.5" />
    </svg>
  );
}

export function GroupTrioIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="6" cy="9" r="2.5" />
      <circle cx="12" cy="7" r="2.5" />
      <circle cx="18" cy="9" r="2.5" />
      <path d="M2 19a4 4 0 0 1 8 0" />
      <path d="M8 19a4 4 0 0 1 8 0" />
      <path d="M14 19a4 4 0 0 1 8 0" />
    </svg>
  );
}

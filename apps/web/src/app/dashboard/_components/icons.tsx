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

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </svg>
  );
}

export function CircleIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
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

export function MapPinIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M12 22s-7-7.6-7-13a7 7 0 0 1 14 0c0 5.4-7 13-7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function ClipboardIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <rect x="6" y="4" width="12" height="17" rx="2.5" />
      <path d="M9 4V3h6v1" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </svg>
  );
}

export function SparklesIcon({ className }: IconProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M5.6 5.6l2.1 2.1" />
      <path d="M16.3 16.3l2.1 2.1" />
      <path d="M5.6 18.4l2.1-2.1" />
      <path d="M16.3 7.7l2.1-2.1" />
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

export function CopyIcon({ className }: IconProps) {
    return (
        <svg {...baseProps} className={className} aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    );
}

export function LinkIcon({ className }: IconProps) {
    return (
        <svg {...baseProps} className={className} aria-hidden="true">
            <path d="M10 13a4 4 0 0 0 5.7.3l2-2a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
            <path d="M14 11a4 4 0 0 0-5.7-.3l-2 2a4 4 0 0 0 5.7 5.7l1.3-1.3" />
        </svg>
    );
}

export function QrCodeIcon({ className }: IconProps) {
    return (
        <svg {...baseProps} className={className} aria-hidden="true">
            <rect x="4" y="4" width="6" height="6" rx="1" />
            <rect x="14" y="4" width="6" height="6" rx="1" />
            <rect x="4" y="14" width="6" height="6" rx="1" />
            <path d="M14 14h2v2h-2z" />
            <path d="M18 14h2v2h-2z" />
            <path d="M14 18h2v2h-2z" />
            <path d="M18 18h2v2h-2z" />
        </svg>
    );
}

export function ShareIcon({ className }: IconProps) {
    return (
        <svg {...baseProps} className={className} aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5 15.4 17.5" />
            <path d="M15.4 6.5 8.6 10.5" />
        </svg>
    );
}

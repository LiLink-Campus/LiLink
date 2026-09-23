type IconProps = { className?: string };

const strokeProps = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function VipCrown({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" {...strokeProps} aria-hidden="true"><path d="m3 7 5 4 4-7 4 7 5-4-2 11H5L3 7Z" /><path d="M6 21h12" /></svg>;
}

export function PriorityIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 40 40" {...strokeProps} strokeWidth={1.8} aria-hidden="true"><path d="M19 34V9m-10 10L19 9l10 10" /><path d="m32 3 1.1 3.9L37 8l-3.9 1.1L32 13l-1.1-3.9L27 8l3.9-1.1L32 3ZM6 26l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" fill="currentColor" strokeWidth={.6} /></svg>;
}

export function FiltersIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 40 40" {...strokeProps} strokeWidth={1.8} aria-hidden="true"><path d="M4 9h15m8 0h9M4 20h5m8 0h19M4 31h19m8 0h5" /><circle cx="23" cy="9" r="4" /><circle cx="13" cy="20" r="4" /><circle cx="27" cy="31" r="4" /></svg>;
}

export function VipOrbits({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 220 160" {...strokeProps} strokeWidth={.8} aria-hidden="true"><ellipse cx="110" cy="87" rx="112" ry="40" transform="rotate(-35 110 87)" /><ellipse cx="132" cy="102" rx="102" ry="43" transform="rotate(43 132 102)" /></svg>;
}

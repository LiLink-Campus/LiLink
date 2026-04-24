/**
 * Hand-drawn line illustrations used across the LiLink dashboard.
 * They share a consistent stroke language so multiple cards on the same
 * page feel like they belong to one storybook.
 *
 * Conventions:
 *   - All strokes are `currentColor` so the parent class can theme them.
 *   - Default size is 100% of the wrapping element; use a wrapper to size.
 *   - Decorative only: every illustration gets `aria-hidden="true"`.
 */

type IllustrationProps = {
  className?: string;
  title?: string;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function CoffeeCupsIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 80"
      className={className}
      aria-hidden="true"
      role="img"
    >
      {/* Sage cup with tea sprig */}
      <g {...stroke} strokeWidth={1.4}>
        <ellipse cx="34" cy="44" rx="18" ry="4" />
        <path d="M16 44v18a6 6 0 0 0 6 6h24a6 6 0 0 0 6-6V44" />
        <path d="M52 50h6a4 4 0 0 1 0 8h-5" />
        {/* Plant inside */}
        <path d="M30 34c2-6 4-10 4-14" />
        <path d="M34 26c2 2 5 3 8 2" />
        <path d="M30 28c-2 2-5 3-8 2" />
        <path d="M34 18l3 -3" />
        <path d="M34 22l-3 -2" />
      </g>
      {/* White cup with steam */}
      <g {...stroke} strokeWidth={1.4} transform="translate(56,8)">
        <ellipse cx="34" cy="44" rx="18" ry="4" />
        <path d="M16 44v18a6 6 0 0 0 6 6h24a6 6 0 0 0 6-6V44" />
        <path d="M52 50h6a4 4 0 0 1 0 8h-5" />
        {/* Steam */}
        <path d="M28 22c2-4 -2-6 0-10" />
        <path d="M36 22c2-4 -2-6 0-10" />
      </g>
    </svg>
  );
}

export function ThreeChairsIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 140 80"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <g {...stroke} strokeWidth={1.4}>
        {/* Left chair (sage) */}
        <g>
          <path d="M14 26c0-7 5-12 12-12s12 5 12 12" />
          <path d="M14 26h24v18H14z" />
          <path d="M16 44l-2 14" />
          <path d="M36 44l2 14" />
        </g>
        {/* Center chair (cream) */}
        <g transform="translate(46,4)">
          <path d="M14 26c0-7 5-12 12-12s12 5 12 12" />
          <path d="M14 26h24v18H14z" />
          <path d="M16 44l-2 14" />
          <path d="M36 44l2 14" />
        </g>
        {/* Right chair (coral) */}
        <g transform="translate(92,0)">
          <path d="M14 26c0-7 5-12 12-12s12 5 12 12" />
          <path d="M14 26h24v18H14z" />
          <path d="M16 44l-2 14" />
          <path d="M36 44l2 14" />
        </g>
      </g>
    </svg>
  );
}

export function CampusLineart({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 320 100"
      className={className}
      aria-hidden="true"
      role="img"
      preserveAspectRatio="xMidYMax meet"
    >
      <g {...stroke} strokeWidth={1.1}>
        {/* Far trees */}
        <path d="M8 86c4-10 12-10 16 0" />
        <path d="M22 86c5-12 14-12 18 0" />
        {/* Main building cluster */}
        <g transform="translate(48,40)">
          <path d="M0 46h60V8L30 0 0 8z" />
          <path d="M30 0v46" />
          <path d="M22 18h6v8h-6z" />
          <path d="M32 18h6v8h-6z" />
          <path d="M22 30h6v16h-6z" />
          <path d="M32 30h6v16h-6z" />
        </g>
        {/* Tower */}
        <g transform="translate(120,16)">
          <path d="M10 0L0 10v60h20V10z" />
          <path d="M6 16h8v8H6z" />
          <path d="M6 32h8v8H6z" />
          <path d="M6 48h8v8H6z" />
        </g>
        {/* Right wing */}
        <g transform="translate(150,46)">
          <path d="M0 40h70V0L0 12z" />
          <path d="M14 18h6v8h-6z" />
          <path d="M28 18h6v8h-6z" />
          <path d="M42 18h6v8h-6z" />
          <path d="M14 30h6v10h-6z" />
          <path d="M28 30h6v10h-6z" />
          <path d="M42 30h6v10h-6z" />
        </g>
        {/* Right trees */}
        <path d="M232 86c5-12 14-12 18 0" />
        <path d="M250 86c4-10 12-10 16 0" />
        <path d="M270 86c5-14 16-14 20 0" />
        <path d="M292 86c4-10 12-10 16 0" />
        {/* Ground line */}
        <path d="M0 88h320" strokeDasharray="2 4" opacity="0.7" />
        <path d="M0 92h320" />
      </g>
    </svg>
  );
}

export function GrassRowIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 320 24"
      className={className}
      aria-hidden="true"
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      <g {...stroke} strokeWidth={1.1}>
        <path d="M4 20c2-8 4-8 6 0" />
        <path d="M14 20c2-12 5-12 7 0" />
        <path d="M26 20c2-6 4-6 6 0" />
        <path d="M38 20c2-10 5-10 7 0" />
        <path d="M52 20c3-14 7-14 10 0" />
        <path d="M68 20c2-8 4-8 6 0" />
        <path d="M80 20c2-12 5-12 7 0" />
        <path d="M94 20c2-6 4-6 6 0" />
        <path d="M108 20c2-10 5-10 7 0" />
        <path d="M122 20c3-14 7-14 10 0" />
        <path d="M140 20c2-8 4-8 6 0" />
        <path d="M152 20c2-12 5-12 7 0" />
        <path d="M168 20c2-6 4-6 6 0" />
        <path d="M180 20c2-10 5-10 7 0" />
        <path d="M196 20c3-14 7-14 10 0" />
        <path d="M212 20c2-8 4-8 6 0" />
        <path d="M224 20c2-12 5-12 7 0" />
        <path d="M240 20c2-6 4-6 6 0" />
        <path d="M254 20c2-10 5-10 7 0" />
        <path d="M270 20c3-14 7-14 10 0" />
        <path d="M286 20c2-8 4-8 6 0" />
        <path d="M298 20c2-12 5-12 7 0" />
        <path d="M312 20c2-6 4-6 6 0" />
      </g>
    </svg>
  );
}

export function WheatSprigIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 36 48"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <g {...stroke} strokeWidth={1.4}>
        <path d="M18 46V8" />
        <path d="M18 12c-3-2-5-1-6 1c1 2 4 3 6 1" />
        <path d="M18 12c3-2 5-1 6 1c-1 2-4 3-6 1" />
        <path d="M18 18c-3-2-5-1-6 1c1 2 4 3 6 1" />
        <path d="M18 18c3-2 5-1 6 1c-1 2-4 3-6 1" />
        <path d="M18 24c-3-2-5-1-6 1c1 2 4 3 6 1" />
        <path d="M18 24c3-2 5-1 6 1c-1 2-4 3-6 1" />
        <path d="M18 30c-3-2-5-1-6 1c1 2 4 3 6 1" />
        <path d="M18 30c3-2 5-1 6 1c-1 2-4 3-6 1" />
      </g>
    </svg>
  );
}

export function TeaTimeIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 100 80"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <g {...stroke} strokeWidth={1.3}>
        {/* Tray */}
        <ellipse cx="50" cy="68" rx="42" ry="6" />
        {/* Teapot */}
        <g transform="translate(8,28)">
          <path d="M2 30c0-10 8-18 18-18s18 8 18 18" />
          <path d="M2 30h36v8H2z" />
          <path d="M0 30L-2 24" />
          <path d="M38 22c4-2 6 0 8 4" />
          <path d="M14 12V6" />
          <path d="M26 12V6" />
        </g>
        {/* Cup */}
        <g transform="translate(56,40)">
          <path d="M2 6h24v14a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z" />
          <path d="M26 12h4a4 4 0 0 1 0 8h-4" />
          {/* Steam */}
          <path d="M10 -2c2-4 -2-6 0-10" />
          <path d="M18 -2c2-4 -2-6 0-10" />
        </g>
      </g>
    </svg>
  );
}

export function OliveSprigIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <g {...stroke} strokeWidth={1.4}>
        <path d="M3 21c4-4 8-7 18-18" />
        <path d="M9 14c-2-2-1-4 1-4c2 1 2 3 0 5" />
        <path d="M14 9c-2-2-1-4 1-4c2 1 2 3 0 5" />
        <path d="M18 5l1 -2" />
      </g>
    </svg>
  );
}

export function StarSparkleIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <g fill="currentColor">
        <path d="M12 2c.6 4.5 1.5 6 6 7c-4.5 1-5.4 2.5-6 7c-.6-4.5-1.5-6-6-7c4.5-1 5.4-2.5 6-7z" />
      </g>
    </svg>
  );
}


export function MatchAvatarPlaceholder({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      aria-hidden="true"
      role="img"
    >
      <circle cx="48" cy="48" r="46" fill="currentColor" opacity="0.92" />
      <g
        fill="none"
        stroke="#f4f1ea"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M48 70V36" />
        <path d="M48 40c-5-3-8-2-9 1c1 3 6 5 9 2" />
        <path d="M48 40c5-3 8-2 9 1c-1 3-6 5-9 2" />
        <path d="M48 50c-5-3-8-2-9 1c1 3 6 5 9 2" />
        <path d="M48 50c5-3 8-2 9 1c-1 3-6 5-9 2" />
        <path d="M48 60c-5-3-8-2-9 1c1 3 6 5 9 2" />
        <path d="M48 60c5-3 8-2 9 1c-1 3-6 5-9 2" />
      </g>
    </svg>
  );
}

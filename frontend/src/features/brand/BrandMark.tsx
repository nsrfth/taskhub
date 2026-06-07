// v1.38: TaskHub brand mark — the "Quad" lockup (four rounded squares in
// a 2×2 grid; top-right square carries an indigo checkmark). Replaces the
// old single-checkmark glyph everywhere it was used.
//
// Two variants:
//
//   <BrandMark variant="filled" size={28} /> — full standalone tile, used
//     wherever the mark needs its own background (favicon, marketing).
//     The tile is an indigo rounded square; the 4 inner squares are
//     varying-opacity white; the top-right square is pure white with an
//     indigo checkmark on top.
//
//   <BrandMark variant="inset" size={20} />  — just the inner squares +
//     checkmark on a transparent background, so the caller's existing
//     coloured tile (e.g. the sidebar's indigo header circle) acts as the
//     backdrop. Renders white-on-transparent; the checkmark colour is
//     `currentColor` so a dark-mode override is one CSS rule away.

interface Props {
  variant?: 'filled' | 'inset';
  size?: number;
  className?: string;
  // For the filled variant — override the tile background. Default
  // matches the indigo-500 used elsewhere in the app.
  tileFill?: string;
}

export function BrandMark({
  variant = 'inset',
  size = 24,
  className,
  tileFill = '#6366f1',
}: Props): JSX.Element {
  // Both variants share the same 32×32 internal coordinate system so the
  // square positions stay consistent. The viewBox swap controls whether
  // the outer tile is visible.
  const inner = (
    <>
      {/* 2×2 grid: top-left, top-right, bottom-left, bottom-right. The
          top-right is fully opaque white (the "completed" square); the
          others sit at 75% so the diagonal reads as a "quad" rather than
          three siblings. Numbers picked to match the dribbble lockup. */}
      <rect x="6" y="6" width="9" height="9" rx="2" fill="white" fillOpacity="0.75" />
      <rect x="17" y="6" width="9" height="9" rx="2" fill="white" />
      <rect x="6" y="17" width="9" height="9" rx="2" fill="white" fillOpacity="0.75" />
      <rect x="17" y="17" width="9" height="9" rx="2" fill="white" fillOpacity="0.75" />
      {/* Checkmark sits inside the top-right square (centred at 21.5, 10.5)
          and uses the same indigo as the outer tile so it visually
          connects when filled. */}
      <polyline
        points="19 10.5 21 12.3 24 8.7"
        fill="none"
        stroke={variant === 'filled' ? tileFill : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );

  if (variant === 'filled') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 32 32"
        className={className}
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="7" fill={tileFill} />
        {inner}
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
    >
      {inner}
    </svg>
  );
}

// v1.38: Wordmark for the sidebar / login header. Renders "Task" in the
// surrounding text color and "Hub" in the indigo accent — matches the
// dribbble lockup. For Persian (`fa`) we render the localised app name
// unstyled because the two-syllable split doesn't transfer.
export function BrandWordmark({ name }: { name: string }): JSX.Element {
  // If the localised name is exactly "TaskHub" we can split the syllables
  // visually. Any other value (Persian, future locales) renders flat.
  if (name === 'TaskHub') {
    return (
      <span>
        Task<span className="text-indigo-500 dark:text-indigo-400">Hub</span>
      </span>
    );
  }
  return <span>{name}</span>;
}

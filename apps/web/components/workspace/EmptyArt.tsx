/**
 * Empty-state illustrations.
 *
 * Drawn, not imported: an icon pack gives you the same 24px glyph scaled to 96px, which
 * reads as a blown-up icon rather than an illustration. These are small line drawings on
 * a 96×96 grid using `currentColor`, so they inherit the surrounding tone and cannot
 * drift from the palette.
 *
 * Three states, because they mean different things and a single generic image is why
 * empty states get ignored:
 *
 * - **Nothing yet** — first run. Optimistic, points at the action.
 * - **No results** — a filter or query excluded everything. Neutral, offers to clear.
 * - **Failed** — something broke. Flat, never playful; humour at a failure is insulting.
 */

export interface EmptyArtProps {
  readonly className?: string;
}

const FRAME = "0 0 96 96";

/** A blank sheet with a small mark: "nothing here yet". */
export function EmptyBlankArt({ className }: EmptyArtProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox={FRAME}
    >
      <rect height="62" rx="6" width="48" x="20" y="16" />
      <line opacity="0.4" x1="31" x2="57" y1="32" y2="32" />
      <line opacity="0.4" x1="31" x2="57" y1="42" y2="42" />
      <line opacity="0.4" x1="31" x2="48" y1="52" y2="52" />
      {/* The pencil: the action, not the absence. */}
      <path d="M52 74 66 60l7 7-14 14-9 2z" opacity="0.95" />
      <path d="M63 63l7 7" opacity="0.45" />
    </svg>
  );
}

/** A magnifier over a dotted field: "we looked, nothing matched". */
export function EmptyNoResultsArt({ className }: EmptyArtProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox={FRAME}
    >
      <circle cx="42" cy="42" r="24" />
      <line strokeWidth={2} x1="60" x2="76" y1="60" y2="76" />
      {/* Sparse marks inside the lens: the index had content, the query excluded it. */}
      <circle cx="33" cy="36" fill="currentColor" opacity="0.4" r="2" stroke="none" />
      <circle cx="46" cy="43" fill="currentColor" opacity="0.4" r="2" stroke="none" />
      <circle cx="37" cy="50" fill="currentColor" opacity="0.4" r="2" stroke="none" />
    </svg>
  );
}

/** A broken connection: "this did not work". */
export function EmptyFailedArt({ className }: EmptyArtProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox={FRAME}
    >
      <circle cx="48" cy="48" r="30" opacity="0.3" />
      <line strokeWidth={2} x1="37" x2="59" y1="37" y2="59" />
      <line strokeWidth={2} x1="59" x2="37" y1="37" y2="59" />
    </svg>
  );
}

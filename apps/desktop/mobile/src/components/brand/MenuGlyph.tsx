/**
 * The drawer's glyph: three rounded rules of unequal length, left aligned.
 *
 * Not from the icon set, and deliberately so — the stock hamburger is four even bars, and
 * the wordmark above it is already four even letterforms. This reads as a mark rather than
 * a control, which is what the drawer toggle is: the one piece of navigation chrome on an
 * otherwise chrome-free screen.
 *
 * Geometry is in the 24-unit grid the icon set uses, so it aligns with the three-dot menu
 * beside it at the same optical weight.
 */
export function MenuGlyph({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.25"
      viewBox="0 0 24 24"
    >
      <path d="M3 6.5h11" />
      <path d="M3 12h18" />
      <path d="M3 17.5h7" />
    </svg>
  );
}

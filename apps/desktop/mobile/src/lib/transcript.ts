/**
 * The two decisions a chat transcript has to get right.
 *
 * Both are pure so they can be asserted without a DOM: whether the view is at the end, and
 * whether a new message should pull it there. Everything else about virtualizing is the
 * library's job.
 */

/** How close to the end still counts as "following", in CSS pixels. */
export const END_THRESHOLD_PX = 48;

export interface ScrollMetrics {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

export function isAtEnd(metrics: ScrollMetrics, threshold = END_THRESHOLD_PX): boolean {
  const distance = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return distance <= threshold;
}

/**
 * Whether appending a message should scroll.
 *
 * Only when the person was already at the end. Scrolling someone who has deliberately
 * scrolled up to read an earlier answer is the single most annoying thing a chat can do,
 * and it is always implemented as "scroll on every message".
 */
export function shouldFollow(
  previousCount: number,
  nextCount: number,
  atEnd: boolean
): boolean {
  return nextCount > previousCount && atEnd;
}

/**
 * Format a duration in seconds as a human-readable "X min Y secs" string.
 *
 * Convention: "min" / "sec" abbreviations, English pluralization
 * (1 → singular, 2+ → plural). Defensive against non-finite, negative,
 * and fractional inputs by clamping to a non-negative integer.
 */
export function formatDuration(totalSeconds: number): string {
	const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
	if (safe < 60) {
		return `${safe} ${safe === 1 ? "sec" : "secs"}`;
	}
	const minutes = Math.floor(safe / 60);
	const seconds = safe % 60;
	return `${minutes} ${minutes === 1 ? "min" : "mins"} ${seconds} ${seconds === 1 ? "sec" : "secs"}`;
}

/**
 * Format a duration in seconds (decimal) as `m:ss.ms`.
 *  formatTimestamp(0)     → "0:00.00"
 *  formatTimestamp(1.005) → "0:01.00"
 *  formatTimestamp(65.99) → "1:05.99"
 *  formatTimestamp(125.5) → "2:05.50"
 *
 * Designed for timestamps captured from `<video>.currentTime`. Negative or
 * non-finite inputs throw — callers should guard.
 */
export function formatTimestamp(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) {
		throw new Error(`formatTimestamp: invalid seconds ${seconds}`);
	}
	// Convert to centiseconds first (rounded) so floating-point noise like
	// 65.99 → 0.9899999... doesn't truncate to "1:05.98".
	const totalCs = Math.round(seconds * 100);
	const minutes = Math.floor(totalCs / 6000);
	const secs = Math.floor((totalCs % 6000) / 100);
	const cs = totalCs % 100;
	return `${minutes}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

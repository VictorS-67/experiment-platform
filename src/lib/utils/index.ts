export function obtainDate(): string {
	return new Date().toISOString().split('.')[0] + 'Z';
}

/**
 * Deterministic seeded shuffle using a simple hash-based PRNG.
 * Given the same seed, always produces the same permutation.
 * Used for "random-per-participant" stimulus ordering.
 */
export function seededShuffle<T>(items: T[], seed: string): T[] {
	const shuffled = [...items];

	// Simple string hash (djb2)
	let hash = 5381;
	for (let i = 0; i < seed.length; i++) {
		hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
	}

	// Seeded PRNG (mulberry32)
	let state = hash >>> 0;
	function random(): number {
		state |= 0;
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	// Fisher-Yates shuffle with seeded random
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}

	return shuffled;
}

/**
 * Latin square rotation: returns items in an order determined by participantIndex.
 * Each participant sees a different cyclic permutation of the items.
 * For N items, there are N distinct orderings (rows of a latin square).
 */
export function latinSquareOrder<T>(items: T[], participantIndex: number): T[] {
	const n = items.length;
	if (n === 0) return [];
	const offset = ((participantIndex % n) + n) % n; // handle negative indices
	return [...items.slice(offset), ...items.slice(0, offset)];
}

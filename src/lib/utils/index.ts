/**
 * Format a duration in minutes as a human-readable string.
 *  formatDuration(10)  → "10 min"
 *  formatDuration(60)  → "1h"
 *  formatDuration(90)  → "1h 30m"
 *  formatDuration(0)   → "0 min"
 *
 * Replaces the old `Math.max(1, Math.round(min/60)) + 'h'` pattern that
 * misreported any sub-90-minute cooldown as "1h" (B2 in the pilot test).
 */
export function formatDuration(minutes: number): string {
	if (!Number.isFinite(minutes) || minutes < 0) {
		throw new Error(`formatDuration: invalid minutes ${minutes}`);
	}
	const m = Math.round(minutes);
	if (m < 60) return `${m} min`;
	const hours = Math.floor(m / 60);
	const remainder = m % 60;
	return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
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

/**
 * Returns chunks in the order this participant should traverse them, given
 * the configured chunkOrder mode. Mirrors the dispatch in
 * `c/[chunkSlug]/[phaseSlug]/+page.server.ts` for block ordering.
 */
export function resolveChunkOrder<T>(
	chunks: T[],
	mode: 'sequential' | 'latin-square' | 'random-per-participant',
	participantIndex: number,
	participantId: string
): T[] {
	if (chunks.length === 0) return [];
	if (mode === 'latin-square') return latinSquareOrder(chunks, participantIndex);
	if (mode === 'random-per-participant') return seededShuffle(chunks, `${participantId}|chunk-order`);
	return chunks;
}

interface BalancedItem {
	id: string;
	isAnchor?: boolean;
	metadata?: Record<string, unknown>;
}

/**
 * Splits a stimulus pool into C chunks × B blocks, balanced across one or more
 * metadata keys (e.g. emotion, performer_rank). Anchors are replicated once
 * into every chunk and round-robin distributed across that chunk's blocks.
 *
 * Returns a flat array of length C*B; the cell at row-major index c*B + b is
 * the stimulus-id list for chunks[c].blocks[b].
 *
 * The stratum dealing is column-major (cycling chunks before blocks) so each
 * chunk receives every stratum once before any chunk receives a second draw —
 * this keeps stratum counts balanced both across and within chunks.
 */
export function balancedStrataAssign(
	items: BalancedItem[],
	balanceKeys: string[],
	numChunks: number,
	blocksPerChunk: number,
	seed: string
): string[][] {
	if (numChunks < 1 || blocksPerChunk < 1) {
		throw new Error('numChunks and blocksPerChunk must both be >= 1');
	}

	const regulars = items.filter((i) => !i.isAnchor);
	const anchors = items.filter((i) => i.isAnchor);

	const stratumKey = (item: BalancedItem) =>
		balanceKeys.length === 0
			? '_'
			: balanceKeys.map((k) => String(item.metadata?.[k] ?? '')).join('|');

	const strata = new Map<string, BalancedItem[]>();
	for (const item of regulars) {
		const key = stratumKey(item);
		const list = strata.get(key);
		if (list) list.push(item);
		else strata.set(key, [item]);
	}

	const C = numChunks;
	const B = blocksPerChunk;
	const totalCells = C * B;
	const cells: BalancedItem[][] = Array.from({ length: totalCells }, () => []);

	let cursor = 0;
	const sortedKeys = [...strata.keys()].sort();
	for (const key of sortedKeys) {
		const stratum = seededShuffle(strata.get(key)!, `${seed}|stratum|${key}`);
		for (const item of stratum) {
			// Column-major over (chunk, block): cycle chunks fastest so each chunk
			// receives every stratum before any chunk takes a second draw.
			const chunkIdx = cursor % C;
			const blockIdx = Math.floor(cursor / C) % B;
			cells[chunkIdx * B + blockIdx].push(item);
			cursor++;
		}
	}

	if (anchors.length > 0) {
		for (let c = 0; c < C; c++) {
			const chunkAnchors = seededShuffle(anchors, `${seed}|anchor|chunk${c}`);
			for (let i = 0; i < chunkAnchors.length; i++) {
				const blockIdx = i % B;
				cells[c * B + blockIdx].push(chunkAnchors[i]);
			}
		}
	}

	return cells.map((cell, i) =>
		seededShuffle(cell, `${seed}|cell${i}`).map((item) => item.id)
	);
}

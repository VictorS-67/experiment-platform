import { describe, it, expect } from 'vitest';
import { seededShuffle, latinSquareOrder, balancedStrataAssign, formatDuration } from './index';

describe('formatDuration', () => {
	it('renders sub-hour values as minutes', () => {
		expect(formatDuration(0)).toBe('0 min');
		expect(formatDuration(1)).toBe('1 min');
		expect(formatDuration(10)).toBe('10 min');
		expect(formatDuration(59)).toBe('59 min');
	});

	it('renders whole hours without a minute remainder', () => {
		expect(formatDuration(60)).toBe('1h');
		expect(formatDuration(120)).toBe('2h');
		expect(formatDuration(180)).toBe('3h');
	});

	it('renders mixed hours + minutes with a remainder', () => {
		expect(formatDuration(90)).toBe('1h 30m');
		expect(formatDuration(75)).toBe('1h 15m');
		expect(formatDuration(125)).toBe('2h 5m');
	});

	it('rounds non-integer minutes', () => {
		expect(formatDuration(0.4)).toBe('0 min');
		expect(formatDuration(59.6)).toBe('1h');
	});

	it('throws on negative or non-finite values', () => {
		expect(() => formatDuration(-1)).toThrow();
		expect(() => formatDuration(NaN)).toThrow();
		expect(() => formatDuration(Infinity)).toThrow();
	});
});

describe('seededShuffle', () => {
	it('returns same length as input', () => {
		const items = [1, 2, 3, 4, 5];
		const shuffled = seededShuffle(items, 'test-seed');
		expect(shuffled).toHaveLength(5);
	});

	it('contains all original items', () => {
		const items = ['a', 'b', 'c', 'd'];
		const shuffled = seededShuffle(items, 'seed123');
		expect(shuffled.sort()).toEqual(['a', 'b', 'c', 'd']);
	});

	it('is deterministic — same seed produces same order', () => {
		const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const first = seededShuffle(items, 'deterministic');
		const second = seededShuffle(items, 'deterministic');
		expect(first).toEqual(second);
	});

	it('different seeds produce different orders', () => {
		const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const a = seededShuffle(items, 'seed-a');
		const b = seededShuffle(items, 'seed-b');
		// Very unlikely to be identical with 10 items
		expect(a).not.toEqual(b);
	});

	it('does not mutate the original array', () => {
		const items = [1, 2, 3];
		const copy = [...items];
		seededShuffle(items, 'test');
		expect(items).toEqual(copy);
	});

	it('handles empty array', () => {
		const result = seededShuffle([], 'seed');
		expect(result).toEqual([]);
	});

	it('handles single item', () => {
		const result = seededShuffle(['only'], 'seed');
		expect(result).toEqual(['only']);
	});
});

describe('latinSquareOrder', () => {
	const items = ['A', 'B', 'C', 'D'];

	it('returns all items', () => {
		const result = latinSquareOrder(items, 0);
		expect(result.sort()).toEqual(['A', 'B', 'C', 'D']);
	});

	it('index 0 returns original order', () => {
		expect(latinSquareOrder(items, 0)).toEqual(['A', 'B', 'C', 'D']);
	});

	it('index 1 rotates by 1', () => {
		expect(latinSquareOrder(items, 1)).toEqual(['B', 'C', 'D', 'A']);
	});

	it('index 2 rotates by 2', () => {
		expect(latinSquareOrder(items, 2)).toEqual(['C', 'D', 'A', 'B']);
	});

	it('index 3 rotates by 3', () => {
		expect(latinSquareOrder(items, 3)).toEqual(['D', 'A', 'B', 'C']);
	});

	it('wraps around for index >= length', () => {
		expect(latinSquareOrder(items, 4)).toEqual(['A', 'B', 'C', 'D']);
		expect(latinSquareOrder(items, 5)).toEqual(['B', 'C', 'D', 'A']);
	});

	it('handles empty array', () => {
		expect(latinSquareOrder([], 0)).toEqual([]);
	});

	it('handles single item', () => {
		expect(latinSquareOrder(['X'], 0)).toEqual(['X']);
		expect(latinSquareOrder(['X'], 5)).toEqual(['X']);
	});

	it('produces N distinct orderings for N items', () => {
		const orderings = new Set<string>();
		for (let i = 0; i < items.length; i++) {
			orderings.add(JSON.stringify(latinSquareOrder(items, i)));
		}
		expect(orderings.size).toBe(items.length);
	});

	it('each item appears exactly once per column across all rows (latin square property)', () => {
		const n = items.length;
		for (let col = 0; col < n; col++) {
			const columnItems = new Set<string>();
			for (let row = 0; row < n; row++) {
				columnItems.add(latinSquareOrder(items, row)[col]);
			}
			expect(columnItems.size).toBe(n);
		}
	});
});

describe('balancedStrataAssign', () => {
	function makeItems(specs: Array<{ id: string; emotion?: string; rank?: string; isAnchor?: boolean }>) {
		return specs.map((s) => ({
			id: s.id,
			isAnchor: s.isAnchor,
			metadata: { emotion: s.emotion, rank: s.rank }
		}));
	}

	it('returns C*B cells in row-major order', () => {
		const items = makeItems([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
		const cells = balancedStrataAssign(items, [], 2, 2, 'seed');
		expect(cells).toHaveLength(4);
	});

	it('distributes items round-robin when balanceKeys is empty', () => {
		const items = makeItems(
			Array.from({ length: 12 }, (_, i) => ({ id: `s${i}` }))
		);
		const cells = balancedStrataAssign(items, [], 3, 2, 'seed');
		const sizes = cells.map((c) => c.length).sort();
		// 12 / 6 cells = exactly 2 each
		expect(sizes).toEqual([2, 2, 2, 2, 2, 2]);
	});

	it('preserves every regular item exactly once across all cells', () => {
		const items = makeItems(
			Array.from({ length: 17 }, (_, i) => ({ id: `s${i}` }))
		);
		const cells = balancedStrataAssign(items, [], 3, 2, 'seed');
		const allIds = cells.flat().sort();
		expect(allIds).toEqual(items.map((i) => i.id).sort());
	});

	it('balances multi-key strata (4 emotions × 2 ranks)', () => {
		const emotions = ['anger', 'fear', 'joy', 'sadness'];
		const ranks = ['top', 'bot'];
		// 8 strata × 6 items each = 48 items → 6 chunks × 2 blocks = 12 cells, 4 items each
		const items: ReturnType<typeof makeItems> = [];
		for (const e of emotions) {
			for (const r of ranks) {
				for (let n = 0; n < 6; n++) {
					items.push(...makeItems([{ id: `${e}-${r}-${n}`, emotion: e, rank: r }]));
				}
			}
		}
		const cells = balancedStrataAssign(items, ['emotion', 'rank'], 6, 2, 'seed');
		// Every cell should have ~4 items (48/12). Even split here.
		expect(cells.every((c) => c.length === 4)).toBe(true);
		// Each (emotion, rank) stratum should appear with diff ≤ 1 across cells.
		const itemById = new Map(items.map((i) => [i.id, i]));
		for (const e of emotions) {
			for (const r of ranks) {
				const counts = cells.map(
					(cell) =>
						cell.filter((id) => {
							const m = itemById.get(id)!.metadata!;
							return m.emotion === e && m.rank === r;
						}).length
				);
				const max = Math.max(...counts);
				const min = Math.min(...counts);
				expect(max - min).toBeLessThanOrEqual(1);
			}
		}
	});

	it('places each anchor once per chunk, distributed across blocks', () => {
		const items = makeItems([
			...Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, emotion: 'anger' })),
			{ id: 'a1', isAnchor: true },
			{ id: 'a2', isAnchor: true }
		]);
		const C = 3;
		const B = 2;
		const cells = balancedStrataAssign(items, ['emotion'], C, B, 'seed');
		// Each anchor must appear C times total (once per chunk).
		for (const anchorId of ['a1', 'a2']) {
			const occurrences = cells.flat().filter((id) => id === anchorId).length;
			expect(occurrences).toBe(C);
		}
		// Within each chunk, each anchor appears exactly once.
		for (let c = 0; c < C; c++) {
			const chunkIds = cells.slice(c * B, (c + 1) * B).flat();
			expect(chunkIds.filter((id) => id === 'a1')).toHaveLength(1);
			expect(chunkIds.filter((id) => id === 'a2')).toHaveLength(1);
		}
	});

	it('handles B=1 (single block per chunk) without crashing', () => {
		const items = makeItems([
			{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' },
			{ id: 'a1', isAnchor: true }
		]);
		const cells = balancedStrataAssign(items, [], 4, 1, 'seed');
		expect(cells).toHaveLength(4);
		// Anchor lands once per chunk → once in each cell.
		for (const cell of cells) {
			expect(cell.filter((id) => id === 'a1')).toHaveLength(1);
		}
	});

	it('produces deterministic output for the same seed', () => {
		const items = makeItems(
			Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, emotion: i % 2 === 0 ? 'a' : 'b' }))
		);
		const a = balancedStrataAssign(items, ['emotion'], 2, 2, 'seed');
		const b = balancedStrataAssign(items, ['emotion'], 2, 2, 'seed');
		expect(a).toEqual(b);
	});

	it('produces different output for different seeds', () => {
		const items = makeItems(
			Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, emotion: i % 4 === 0 ? 'a' : 'b' }))
		);
		const a = balancedStrataAssign(items, ['emotion'], 2, 2, 'seed-x');
		const b = balancedStrataAssign(items, ['emotion'], 2, 2, 'seed-y');
		expect(a).not.toEqual(b);
	});

	it('throws on invalid C or B', () => {
		expect(() => balancedStrataAssign([], [], 0, 1, 's')).toThrow();
		expect(() => balancedStrataAssign([], [], 1, 0, 's')).toThrow();
	});
});

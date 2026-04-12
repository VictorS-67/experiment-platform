import { describe, it, expect } from 'vitest';
import { seededShuffle, latinSquareOrder } from './index';

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

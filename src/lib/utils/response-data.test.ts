import { describe, it, expect } from 'vitest';
import {
	widgetEntries,
	widgetKeys,
	isAllNullResponse,
	inScopeForChunk,
	isStimulusDoneInChunk
} from './response-data';

describe('widgetEntries / widgetKeys', () => {
	it('strips all `_`-prefixed sentinels', () => {
		const rd = { w1: 'a', w2: null, _chunk: 'chunk-1', _timestamp: '2026-05-01' };
		expect(widgetEntries(rd)).toEqual([
			['w1', 'a'],
			['w2', null]
		]);
		expect(widgetKeys(rd)).toEqual(['w1', 'w2']);
	});

	it('keeps non-prefix keys with underscore inside', () => {
		const rd = { my_widget: 'x', another_one: 1 };
		expect(widgetKeys(rd)).toEqual(['my_widget', 'another_one']);
	});

	it('handles empty objects', () => {
		expect(widgetEntries({})).toEqual([]);
		expect(widgetKeys({})).toEqual([]);
	});
});

describe('isAllNullResponse', () => {
	it('returns true when every widget answer is null', () => {
		expect(isAllNullResponse({ w1: null, w2: null, _chunk: 'chunk-1' })).toBe(true);
	});

	it('returns true when every widget answer is the string "null"', () => {
		expect(isAllNullResponse({ w1: 'null', w2: 'null' })).toBe(true);
	});

	it('returns false when any widget has a real value', () => {
		expect(isAllNullResponse({ w1: 'hello', w2: null })).toBe(false);
	});

	it('returns false when there are no widget answers (only sentinels)', () => {
		// Edge case: shouldn't happen in practice, but guard against
		// reporting an empty-but-tagged response as "skipped".
		expect(isAllNullResponse({ _chunk: 'chunk-1' })).toBe(false);
		expect(isAllNullResponse({})).toBe(false);
	});
});

describe('inScopeForChunk', () => {
	const anchorItem = { isAnchor: true };
	const regularItem = { isAnchor: false };

	const make = (chunk: string | undefined) => ({ response_data: chunk ? { _chunk: chunk } : {} });

	it('returns all responses for non-anchor stimuli', () => {
		const rs = [make('chunk-1'), make('chunk-2'), make(undefined)];
		expect(inScopeForChunk(regularItem, 'chunk-1', rs)).toEqual(rs);
	});

	it('returns all responses on a non-chunked route (chunkSlug undefined)', () => {
		const rs = [make('chunk-1'), make('chunk-2')];
		expect(inScopeForChunk(anchorItem, undefined, rs)).toEqual(rs);
	});

	it('filters anchor responses to only the matching chunk slug', () => {
		const rs = [make('chunk-1'), make('chunk-2'), make('chunk-3')];
		expect(inScopeForChunk(anchorItem, 'chunk-2', rs)).toEqual([rs[1]]);
	});

	it('STRICTLY rejects untagged anchor responses (no legacy tolerance)', () => {
		const rs = [make(undefined), make('chunk-2')];
		// Untagged response NOT credited to chunk-2 — preserves test-retest
		// integrity for legacy data.
		expect(inScopeForChunk(anchorItem, 'chunk-2', rs)).toEqual([rs[1]]);
	});
});

describe('isStimulusDoneInChunk', () => {
	const anchor = { isAnchor: true };
	const regular = { isAnchor: false };

	it('regular stimulus done if any prior response exists', () => {
		expect(isStimulusDoneInChunk(regular, 'chunk-1', [{ response_data: {} }])).toBe(true);
	});

	it('regular stimulus not done with zero responses', () => {
		expect(isStimulusDoneInChunk(regular, 'chunk-1', [])).toBe(false);
	});

	it('anchor done only if a chunk-tagged response exists', () => {
		const rs = [{ response_data: { _chunk: 'chunk-1' } }];
		expect(isStimulusDoneInChunk(anchor, 'chunk-1', rs)).toBe(true);
		expect(isStimulusDoneInChunk(anchor, 'chunk-2', rs)).toBe(false);
	});

	it('anchor on non-chunked route done if ANY response exists', () => {
		expect(isStimulusDoneInChunk(anchor, undefined, [{ response_data: {} }])).toBe(true);
	});
});

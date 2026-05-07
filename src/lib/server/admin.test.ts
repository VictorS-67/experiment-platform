import { describe, it, expect } from 'vitest';
import { computeSessionTimings } from './admin';

/**
 * `computeSessionTimings` was extracted from `getParticipantSessionTimings`
 * in the participant-detail page-load to make it pure (no DB calls). It
 * derives one row per chunk, with start/end/duration/count, from already-
 * fetched response rows. The non-trivial parts:
 *
 *   - Anchor responses are routed by the `_chunk` sentinel (anchors appear
 *     in multiple chunks, so the stimulusId→chunk map is ambiguous for them
 *     and would otherwise misattribute).
 *   - Non-anchor responses are routed by the stimulusId→chunk map.
 *   - Responses whose stimulus is in no chunk are dropped (legacy data).
 *   - Output is sorted by chunk start time.
 */

const config = {
	stimuli: {
		chunking: {
			enabled: true,
			chunks: [
				{
					id: 'c1',
					slug: 'chunk-1',
					label: { en: 'First' },
					blocks: [
						{ id: 'b1', stimulusIds: ['s-only-c1', 's-shared-anchor'] }
					]
				},
				{
					id: 'c2',
					slug: 'chunk-2',
					label: { en: 'Second' },
					blocks: [
						{ id: 'b2', stimulusIds: ['s-only-c2', 's-shared-anchor'] }
					]
				}
			]
		}
	}
};

describe('computeSessionTimings', () => {
	it('returns empty when chunking is disabled or absent', () => {
		expect(computeSessionTimings({}, [])).toEqual([]);
		expect(computeSessionTimings({ stimuli: {} }, [])).toEqual([]);
		expect(computeSessionTimings({ stimuli: { chunking: { enabled: true, chunks: [] } } }, [])).toEqual([]);
	});

	it('aggregates start/end/duration/count for each chunk', () => {
		const out = computeSessionTimings(config, [
			{ stimulusId: 's-only-c1', responseData: {}, createdAt: '2026-01-01T10:00:00.000Z' },
			{ stimulusId: 's-only-c1', responseData: {}, createdAt: '2026-01-01T10:05:00.000Z' },
			{ stimulusId: 's-only-c2', responseData: {}, createdAt: '2026-01-02T14:00:00.000Z' },
			{ stimulusId: 's-only-c2', responseData: {}, createdAt: '2026-01-02T14:30:00.000Z' }
		]);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({
			chunkSlug: 'chunk-1',
			startedAt: '2026-01-01T10:00:00.000Z',
			endedAt: '2026-01-01T10:05:00.000Z',
			durationSeconds: 300,
			responseCount: 2
		});
		expect(out[1]).toMatchObject({
			chunkSlug: 'chunk-2',
			durationSeconds: 1800,
			responseCount: 2
		});
	});

	it('routes anchor responses via the `_chunk` sentinel, not the stimulusId map', () => {
		// `s-shared-anchor` belongs to BOTH chunks. Without the sentinel the
		// stimulusId→chunk map's last-write-wins would misattribute. With it,
		// the response should land in whichever chunk `_chunk` says.
		const out = computeSessionTimings(config, [
			{ stimulusId: 's-shared-anchor', responseData: { _chunk: 'chunk-1' }, createdAt: '2026-01-01T10:00:00.000Z' },
			{ stimulusId: 's-shared-anchor', responseData: { _chunk: 'chunk-2' }, createdAt: '2026-01-02T10:00:00.000Z' }
		]);
		expect(out).toHaveLength(2);
		const c1 = out.find((r) => r.chunkSlug === 'chunk-1')!;
		const c2 = out.find((r) => r.chunkSlug === 'chunk-2')!;
		expect(c1.responseCount).toBe(1);
		expect(c2.responseCount).toBe(1);
	});

	it('ignores `_chunk` sentinel that points to an unknown chunk slug', () => {
		const out = computeSessionTimings(config, [
			{ stimulusId: 's-only-c1', responseData: { _chunk: 'made-up-chunk' }, createdAt: '2026-01-01T10:00:00.000Z' }
		]);
		// Falls back to stimulusId map → chunk-1
		expect(out).toHaveLength(1);
		expect(out[0].chunkSlug).toBe('chunk-1');
	});

	it('drops responses whose stimulus belongs to no chunk', () => {
		const out = computeSessionTimings(config, [
			{ stimulusId: 's-orphan', responseData: {}, createdAt: '2026-01-01T10:00:00.000Z' }
		]);
		expect(out).toEqual([]);
	});

	it('sorts output by chunk start time, not by chunk-config order', () => {
		// Chunk 2 has earlier responses than chunk 1 — should sort first.
		const out = computeSessionTimings(config, [
			{ stimulusId: 's-only-c1', responseData: {}, createdAt: '2026-01-05T10:00:00.000Z' },
			{ stimulusId: 's-only-c2', responseData: {}, createdAt: '2026-01-01T10:00:00.000Z' }
		]);
		expect(out.map((r) => r.chunkSlug)).toEqual(['chunk-2', 'chunk-1']);
	});

	it('preserves chunk labels from config', () => {
		const out = computeSessionTimings(config, [
			{ stimulusId: 's-only-c1', responseData: {}, createdAt: '2026-01-01T10:00:00.000Z' }
		]);
		expect(out[0].chunkLabel).toEqual({ en: 'First' });
	});
});

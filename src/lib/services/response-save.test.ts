import { describe, it, expect } from 'vitest';
import { validateWidgets, buildResponseData, buildSkipResponseData } from './response-save';

const visibleAlways = () => true;
const text = (id: string, required = true) => ({ id, type: 'text', required });
const audio = (id: string, required = true) => ({ id, type: 'audio-recording', required });
const tsRange = (id: string, required = true) => ({ id, type: 'timestamp-range', required });

describe('validateWidgets', () => {
	it('passes when every required+visible widget has a value', () => {
		const widgets = [text('a'), text('b')];
		expect(validateWidgets(widgets, { a: 'x', b: 'y' }, visibleAlways)).toBeNull();
	});

	it('reports first missing required widget', () => {
		const widgets = [text('a'), text('b')];
		const r = validateWidgets(widgets, { a: '', b: 'y' }, visibleAlways);
		expect(r?.kind).toBe('required');
		expect(r?.widget.id).toBe('a');
	});

	it('skips non-required widgets', () => {
		const widgets = [text('a', false)];
		expect(validateWidgets(widgets, {}, visibleAlways)).toBeNull();
	});

	it('skips conditionally-hidden widgets', () => {
		const widgets = [text('a')];
		const isVisible = () => false;
		expect(validateWidgets(widgets, { a: '' }, isVisible)).toBeNull();
	});

	it('whitespace-only string counts as empty', () => {
		expect(validateWidgets([text('a')], { a: '   ' }, visibleAlways)?.kind).toBe('required');
	});

	it('timestamp-range needs both start and end', () => {
		const w = tsRange('ts');
		expect(validateWidgets([w], { ts: ',5' }, visibleAlways)?.kind).toBe('required');
		expect(validateWidgets([w], { ts: '5,' }, visibleAlways)?.kind).toBe('required');
	});

	it('timestamp-range start must be strictly before end', () => {
		const w = tsRange('ts');
		expect(validateWidgets([w], { ts: '5,3' }, visibleAlways)?.kind).toBe('timestamp_order');
		expect(validateWidgets([w], { ts: '5,5' }, visibleAlways)?.kind).toBe('timestamp_order');
		expect(validateWidgets([w], { ts: '3,5' }, visibleAlways)).toBeNull();
	});
});

describe('buildResponseData', () => {
	it('coerces non-empty values to strings', () => {
		const out = buildResponseData([text('a')], { a: 42 }, {}, visibleAlways, null);
		expect(out).toEqual({ a: '42' });
	});

	it('null/empty become null', () => {
		const out = buildResponseData([text('a'), text('b'), text('c')], { a: null, b: '', c: undefined }, {}, visibleAlways, null);
		expect(out).toEqual({ a: null, b: null, c: null });
	});

	it('hidden widgets are null', () => {
		const out = buildResponseData(
			[text('a'), text('b')],
			{ a: 'x', b: 'y' },
			{},
			(w) => w.id === 'a',
			null
		);
		expect(out).toEqual({ a: 'x', b: null });
	});

	it('audio-recording pulls from audioPaths map', () => {
		const out = buildResponseData(
			[audio('rec')],
			{},
			{ rec: 'audio/exp/p/s/rec_1.webm' },
			visibleAlways,
			null
		);
		expect(out).toEqual({ rec: 'audio/exp/p/s/rec_1.webm' });
	});

	it('audio without uploaded path is null', () => {
		const out = buildResponseData([audio('rec')], {}, {}, visibleAlways, null);
		expect(out).toEqual({ rec: null });
	});

	it('timestamp-range collapses comma to dash', () => {
		const out = buildResponseData([tsRange('ts')], { ts: '1.5,3.7' }, {}, visibleAlways, null);
		expect(out).toEqual({ ts: '1.5-3.7' });
	});

	it('timestamp-range with missing parts is null', () => {
		const out = buildResponseData([tsRange('ts')], { ts: '1.5,' }, {}, visibleAlways, null);
		expect(out).toEqual({ ts: null });
	});

	it('adds _chunk sentinel when chunked', () => {
		const out = buildResponseData([text('a')], { a: 'x' }, {}, visibleAlways, 'chunk-1');
		expect(out).toEqual({ a: 'x', _chunk: 'chunk-1' });
	});

	it('omits _chunk when null', () => {
		const out = buildResponseData([text('a')], { a: 'x' }, {}, visibleAlways, null);
		expect(out).not.toHaveProperty('_chunk');
	});
});

describe('buildSkipResponseData', () => {
	it('writes JSON null for every widget', () => {
		const out = buildSkipResponseData([text('a'), audio('b'), tsRange('c')], null);
		expect(out).toEqual({ a: null, b: null, c: null });
	});

	it('preserves _chunk sentinel', () => {
		const out = buildSkipResponseData([text('a')], 'chunk-1');
		expect(out).toEqual({ a: null, _chunk: 'chunk-1' });
	});

	it('handles empty widget list', () => {
		expect(buildSkipResponseData([], null)).toEqual({});
		expect(buildSkipResponseData([], 'chunk-1')).toEqual({ _chunk: 'chunk-1' });
	});
});

import { describe, it, expect } from 'vitest';
import {
	compileFilenamePattern,
	extractMetadata,
	parseCSV,
	globToRegex,
	filenameToId,
	buildStimulusItems
} from './bulk-import';

// --- compileFilenamePattern ---

describe('compileFilenamePattern', () => {
	it('returns null for empty string', () => {
		expect(compileFilenamePattern('')).toBeNull();
		expect(compileFilenamePattern('  ')).toBeNull();
	});

	it('returns null for pattern with no placeholders', () => {
		expect(compileFilenamePattern('hello.mp4')).toBeNull();
	});

	it('parses single placeholder', () => {
		const result = compileFilenamePattern('{emotion}.mp4');
		expect(result).not.toBeNull();
		expect(result!.keys).toEqual(['emotion']);
		expect('anger.mp4').toMatch(result!.regex);
		expect('joy.mp4').toMatch(result!.regex);
		expect('anger.webm').not.toMatch(result!.regex);
	});

	it('parses multiple placeholders with hyphens', () => {
		const result = compileFilenamePattern('{emotion}-{actor}-{take}.mp4');
		expect(result).not.toBeNull();
		expect(result!.keys).toEqual(['emotion', 'actor', 'take']);
		expect('anger-john-1.mp4').toMatch(result!.regex);
		expect('sadness-jane-03.mp4').toMatch(result!.regex);
	});

	it('extracts named groups', () => {
		const result = compileFilenamePattern('{emotion}-{actor}-{take}.mp4');
		const match = 'anger-john-1.mp4'.match(result!.regex);
		expect(match?.groups).toEqual({ emotion: 'anger', actor: 'john', take: '1' });
	});

	it('handles underscores as separators', () => {
		const result = compileFilenamePattern('{category}_{id}.wav');
		expect(result).not.toBeNull();
		expect('music_42.wav').toMatch(result!.regex);
	});

	it('handles dots in pattern', () => {
		const result = compileFilenamePattern('{name}.test.mp4');
		expect(result).not.toBeNull();
		expect('foo.test.mp4').toMatch(result!.regex);
		expect('fooXtest.mp4').not.toMatch(result!.regex);
	});
});

// --- extractMetadata ---

describe('extractMetadata', () => {
	it('returns groups on match', () => {
		const { regex } = compileFilenamePattern('{emotion}-{take}.mp4')!;
		expect(extractMetadata('anger-1.mp4', regex)).toEqual({ emotion: 'anger', take: '1' });
	});

	it('returns null on no match', () => {
		const { regex } = compileFilenamePattern('{emotion}-{take}.mp4')!;
		expect(extractMetadata('no-match-here.webm', regex)).toBeNull();
	});
});

// --- parseCSV ---

describe('parseCSV', () => {
	it('parses simple CSV', () => {
		const result = parseCSV('id,filename,emotion\n1,anger.mp4,anger\n2,joy.mp4,joy');
		expect(result.headers).toEqual(['id', 'filename', 'emotion']);
		expect(result.rows).toHaveLength(2);
		expect(result.rows[0]).toEqual({ id: '1', filename: 'anger.mp4', emotion: 'anger' });
		expect(result.rows[1]).toEqual({ id: '2', filename: 'joy.mp4', emotion: 'joy' });
	});

	it('handles quoted fields with commas', () => {
		const result = parseCSV('name,desc\nfoo,"a,b,c"\nbar,simple');
		expect(result.rows[0]).toEqual({ name: 'foo', desc: 'a,b,c' });
		expect(result.rows[1]).toEqual({ name: 'bar', desc: 'simple' });
	});

	it('handles escaped quotes (double-quote)', () => {
		const result = parseCSV('name,desc\nfoo,"He said ""hello"""\nbar,ok');
		expect(result.rows[0]).toEqual({ name: 'foo', desc: 'He said "hello"' });
	});

	it('handles CRLF line endings', () => {
		const result = parseCSV('a,b\r\n1,2\r\n3,4');
		expect(result.rows).toHaveLength(2);
		expect(result.rows[0]).toEqual({ a: '1', b: '2' });
	});

	it('strips BOM', () => {
		const result = parseCSV('\uFEFFa,b\n1,2');
		expect(result.headers).toEqual(['a', 'b']);
	});

	it('skips empty rows', () => {
		const result = parseCSV('a,b\n1,2\n\n3,4\n');
		expect(result.rows).toHaveLength(2);
	});

	it('handles empty input', () => {
		const result = parseCSV('');
		expect(result.headers).toEqual([]);
		expect(result.rows).toEqual([]);
	});

	it('handles newlines within quoted fields', () => {
		const result = parseCSV('name,desc\nfoo,"line1\nline2"\nbar,ok');
		expect(result.rows[0]).toEqual({ name: 'foo', desc: 'line1\nline2' });
		expect(result.rows).toHaveLength(2);
	});

	it('pads missing columns with empty string', () => {
		const result = parseCSV('a,b,c\n1,2');
		expect(result.rows[0]).toEqual({ a: '1', b: '2', c: '' });
	});
});

// --- globToRegex ---

describe('globToRegex', () => {
	it('converts * wildcard', () => {
		const re = globToRegex('anger-*');
		expect('anger-1.mp4').toMatch(re);
		expect('anger-long-name.mp4').toMatch(re);
		expect('joy-1.mp4').not.toMatch(re);
	});

	it('converts ? wildcard', () => {
		const re = globToRegex('file?.mp4');
		expect('file1.mp4').toMatch(re);
		expect('fileA.mp4').toMatch(re);
		expect('file12.mp4').not.toMatch(re);
	});

	it('is case insensitive', () => {
		const re = globToRegex('Anger-*');
		expect('anger-1.mp4').toMatch(re);
		expect('ANGER-1.MP4').toMatch(re);
	});

	it('escapes special regex chars', () => {
		const re = globToRegex('file[1].mp4');
		expect('file[1].mp4').toMatch(re);
		expect('file1.mp4').not.toMatch(re);
	});

	it('matches full string', () => {
		const re = globToRegex('*.mp4');
		expect('video.mp4').toMatch(re);
		expect('video.mp4.bak').not.toMatch(re);
	});
});

// --- filenameToId ---

describe('filenameToId', () => {
	it('strips extension and lowercases', () => {
		expect(filenameToId('Anger-1.mp4')).toBe('anger-1');
	});

	it('replaces non-alphanumeric with hyphens', () => {
		expect(filenameToId('test anger (1).mp4')).toBe('test-anger-1');
	});

	it('collapses multiple hyphens', () => {
		expect(filenameToId('a---b.mp4')).toBe('a-b');
	});

	it('trims leading/trailing hyphens', () => {
		expect(filenameToId('-start-.mp4')).toBe('start');
	});

	it('handles multiple dots (takes last as extension)', () => {
		expect(filenameToId('file.test.mp4')).toBe('file-test');
	});
});

// --- buildStimulusItems ---

describe('buildStimulusItems', () => {
	it('generates items from filenames', () => {
		const items = buildStimulusItems(['anger-1.mp4', 'joy-2.mp4'], {
			existingFilenames: new Set(),
			existingIds: new Set()
		});
		expect(items).toHaveLength(2);
		expect(items[0]).toEqual({ id: 'anger-1', filename: 'anger-1.mp4', metadata: undefined, duplicate: false });
		expect(items[1]).toEqual({ id: 'joy-2', filename: 'joy-2.mp4', metadata: undefined, duplicate: false });
	});

	it('deduplicates IDs', () => {
		const items = buildStimulusItems(['test.mp4', 'test.webm'], {
			existingFilenames: new Set(),
			existingIds: new Set()
		});
		expect(items[0].id).toBe('test');
		expect(items[1].id).toBe('test-2');
	});

	it('deduplicates against existing IDs', () => {
		const items = buildStimulusItems(['anger-1.mp4'], {
			existingFilenames: new Set(),
			existingIds: new Set(['anger-1'])
		});
		expect(items[0].id).toBe('anger-1-2');
	});

	it('marks duplicates by filename', () => {
		const items = buildStimulusItems(['anger-1.mp4', 'joy-2.mp4'], {
			existingFilenames: new Set(['anger-1.mp4']),
			existingIds: new Set()
		});
		expect(items[0].duplicate).toBe(true);
		expect(items[1].duplicate).toBe(false);
	});

	it('extracts metadata from pattern', () => {
		const { regex } = compileFilenamePattern('{emotion}-{take}.mp4')!;
		const items = buildStimulusItems(['anger-1.mp4', 'joy-2.mp4'], {
			patternRegex: regex,
			existingFilenames: new Set(),
			existingIds: new Set()
		});
		expect(items[0].metadata).toEqual({ emotion: 'anger', take: '1' });
		expect(items[1].metadata).toEqual({ emotion: 'joy', take: '2' });
	});

	it('merges CSV metadata (CSV wins on conflict)', () => {
		const { regex } = compileFilenamePattern('{emotion}-{take}.mp4')!;
		const csvData = new Map([
			['anger-1.mp4', { emotion: 'rage', label: 'Angry clip' }]
		]);
		const items = buildStimulusItems(['anger-1.mp4'], {
			patternRegex: regex,
			csvData,
			existingFilenames: new Set(),
			existingIds: new Set()
		});
		// CSV overrides pattern-extracted "anger" with "rage", adds "label"
		expect(items[0].metadata).toEqual({ emotion: 'rage', take: '1', label: 'Angry clip' });
	});

	it('uses CSV data even without pattern', () => {
		const csvData = new Map([
			['video.mp4', { category: 'test' }]
		]);
		const items = buildStimulusItems(['video.mp4'], {
			csvData,
			existingFilenames: new Set(),
			existingIds: new Set()
		});
		expect(items[0].metadata).toEqual({ category: 'test' });
	});

	it('handles files that do not match pattern', () => {
		const { regex } = compileFilenamePattern('{emotion}-{take}.mp4')!;
		const items = buildStimulusItems(['readme.txt'], {
			patternRegex: regex,
			existingFilenames: new Set(),
			existingIds: new Set()
		});
		expect(items[0].metadata).toBeUndefined();
	});

	it('uses explicit id from idByFilename instead of slugifying', () => {
		const idByFilename = new Map([
			['f_JP_06_anger_1_L.mp4', 's0001'],
			['f_TW_01_fear_2_H.mp4', 's0002']
		]);
		const items = buildStimulusItems(
			['f_JP_06_anger_1_L.mp4', 'f_TW_01_fear_2_H.mp4'],
			{ idByFilename, existingFilenames: new Set(), existingIds: new Set() }
		);
		expect(items.map((i) => i.id)).toEqual(['s0001', 's0002']);
	});

	it('falls back to slugified filename when explicit id is missing or blank', () => {
		const idByFilename = new Map([
			['a.mp4', ''],          // blank → fallback
			['b.mp4', '   '],        // whitespace-only → fallback
			['c.mp4', 's0099']
		]);
		const items = buildStimulusItems(['a.mp4', 'b.mp4', 'c.mp4'], {
			idByFilename,
			existingFilenames: new Set(),
			existingIds: new Set()
		});
		expect(items.map((i) => i.id)).toEqual(['a', 'b', 's0099']);
	});

	it('flags candidates missing from storage when storageFiles is provided', () => {
		const items = buildStimulusItems(['a.mp4', 'b.mp4', 'c.mp4'], {
			storageFiles: new Set(['a.mp4', 'c.mp4']),
			existingFilenames: new Set(),
			existingIds: new Set()
		});
		expect(items[0].missingInStorage).toBe(false);
		expect(items[1].missingInStorage).toBe(true);
		expect(items[2].missingInStorage).toBe(false);
	});

	it('omits missingInStorage entirely when storageFiles is not provided', () => {
		const items = buildStimulusItems(['a.mp4'], {
			existingFilenames: new Set(),
			existingIds: new Set()
		});
		expect(items[0]).not.toHaveProperty('missingInStorage');
	});

	it('flags candidates as anchors when filename is in anchorFilenames set', () => {
		const items = buildStimulusItems(['a.mp4', 'b.mp4', 'c.mp4'], {
			anchorFilenames: new Set(['a.mp4', 'c.mp4']),
			existingFilenames: new Set(),
			existingIds: new Set()
		});
		expect(items[0].isAnchor).toBe(true);
		expect(items[1].isAnchor).toBeUndefined();
		expect(items[2].isAnchor).toBe(true);
	});

	it('still deduplicates against existingIds when explicit id collides', () => {
		const idByFilename = new Map([['x.mp4', 's0001']]);
		const items = buildStimulusItems(['x.mp4'], {
			idByFilename,
			existingFilenames: new Set(),
			existingIds: new Set(['s0001'])
		});
		expect(items[0].id).toBe('s0001-2');
	});
});

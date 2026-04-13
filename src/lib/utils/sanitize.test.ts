import { describe, it, expect } from 'vitest';
import { validateSafeId, sanitizePath } from './sanitize';

describe('validateSafeId', () => {
	it('accepts alphanumeric IDs', () => {
		expect(validateSafeId('widget1')).toBe(true);
		expect(validateSafeId('my-widget')).toBe(true);
		expect(validateSafeId('my_widget')).toBe(true);
		expect(validateSafeId('file.name')).toBe(true);
		expect(validateSafeId('ABC123')).toBe(true);
	});

	it('rejects path traversal characters', () => {
		expect(validateSafeId('..')).toBe(false);
		expect(validateSafeId('../../etc/passwd')).toBe(false);
		expect(validateSafeId('foo/../bar')).toBe(false);
	});

	it('rejects path separators', () => {
		expect(validateSafeId('foo/bar')).toBe(false);
		expect(validateSafeId('foo\\bar')).toBe(false);
	});

	it('rejects empty string', () => {
		expect(validateSafeId('')).toBe(false);
	});

	it('rejects special characters', () => {
		expect(validateSafeId('foo bar')).toBe(false);
		expect(validateSafeId('foo<script>')).toBe(false);
		expect(validateSafeId('foo;rm -rf')).toBe(false);
	});
});

describe('sanitizePath', () => {
	it('removes simple ../ sequences', () => {
		expect(sanitizePath('audio/exp/../secret')).toBe('audio/exp/secret');
	});

	it('removes // sequences', () => {
		expect(sanitizePath('audio//exp//file')).toBe('audio/exp/file');
	});

	it('handles ....// which becomes ../ after one pass', () => {
		// '..../' → first pass removes '..' → '../' → second pass removes '..' → '/'
		expect(sanitizePath('audio/....//secret')).not.toContain('..');
	});

	it('handles deeply nested traversal attempts', () => {
		const result = sanitizePath('audio/exp/......///......///secret');
		expect(result).not.toContain('..');
		expect(result).not.toContain('//');
	});

	it('leaves clean paths unchanged', () => {
		expect(sanitizePath('audio/exp123/participant/file.webm')).toBe('audio/exp123/participant/file.webm');
	});

	it('handles empty string', () => {
		expect(sanitizePath('')).toBe('');
	});
});

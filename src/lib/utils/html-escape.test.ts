import { describe, it, expect } from 'vitest';
import { escapeHtml } from './html-escape';

describe('escapeHtml', () => {
	it('escapes < and >', () => {
		expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
	});

	it('escapes ampersand', () => {
		expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
	});

	it('escapes double quotes', () => {
		expect(escapeHtml('a "b" c')).toBe('a &quot;b&quot; c');
	});

	it('escapes single quotes', () => {
		expect(escapeHtml("a 'b' c")).toBe('a &#39;b&#39; c');
	});

	it('handles empty string', () => {
		expect(escapeHtml('')).toBe('');
	});

	it('passes safe text unchanged', () => {
		expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
	});

	it('handles all special chars together', () => {
		expect(escapeHtml(`<a href="test" onclick='alert(1)'>foo & bar</a>`))
			.toBe('&lt;a href=&quot;test&quot; onclick=&#39;alert(1)&#39;&gt;foo &amp; bar&lt;/a&gt;');
	});
});

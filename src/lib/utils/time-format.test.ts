import { describe, it, expect } from 'vitest';
import { formatTimestamp } from './time-format';

describe('formatTimestamp', () => {
	it('formats whole-number seconds with leading zero', () => {
		expect(formatTimestamp(0)).toBe('0:00.00');
		expect(formatTimestamp(1)).toBe('0:01.00');
		expect(formatTimestamp(59)).toBe('0:59.00');
	});

	it('rolls over at 60 seconds', () => {
		expect(formatTimestamp(60)).toBe('1:00.00');
		expect(formatTimestamp(61)).toBe('1:01.00');
		expect(formatTimestamp(125)).toBe('2:05.00');
	});

	it('formats centiseconds correctly', () => {
		expect(formatTimestamp(1.5)).toBe('0:01.50');
		expect(formatTimestamp(0.05)).toBe('0:00.05');
		expect(formatTimestamp(65.99)).toBe('1:05.99');
		expect(formatTimestamp(125.5)).toBe('2:05.50');
	});

	it('rounds at the centisecond boundary', () => {
		// Sub-centisecond values round to nearest centisecond. Note: classic
		// IEEE-754 quirks (1.005 → 1.00499...) are inherent and acceptable for
		// a UI display where participant resolution is ≥10 ms anyway.
		expect(formatTimestamp(1.004)).toBe('0:01.00');
		expect(formatTimestamp(1.006)).toBe('0:01.01');
		// 1.999 → 200 cs → 2 seconds, 0 cs → "0:02.00"
		expect(formatTimestamp(1.999)).toBe('0:02.00');
	});

	it('throws on negative or non-finite', () => {
		expect(() => formatTimestamp(-1)).toThrow();
		expect(() => formatTimestamp(NaN)).toThrow();
		expect(() => formatTimestamp(Infinity)).toThrow();
	});
});

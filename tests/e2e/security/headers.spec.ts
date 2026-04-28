import { test, expect } from '../fixtures';

test.describe('Security headers (S4)', () => {
	test('dev responses set X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy', async ({
		request
	}) => {
		const res = await request.get('/');
		expect(res.status()).toBe(200);
		const headers = res.headers();
		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
		expect(headers['permissions-policy']).toBe('camera=(), microphone=(self), geolocation=()');
	});

	test('dev does NOT set Strict-Transport-Security (HSTS is https-only)', async ({ request }) => {
		const res = await request.get('/');
		const headers = res.headers();
		expect(headers['strict-transport-security']).toBeUndefined();
	});

	test('admin route responds and carries the same security headers', async ({ request }) => {
		// /admin redirects to /admin/login; follow the redirect.
		const res = await request.get('/admin/login');
		expect(res.status()).toBe(200);
		const headers = res.headers();
		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['x-content-type-options']).toBe('nosniff');
	});
});

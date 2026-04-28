import { test, expect, loginAsAdmin } from '../fixtures';

/**
 * A1.3 / A1.4 — Login edge cases.
 *
 * A1.5 (access-token refresh rotates refresh token) needs clock manipulation
 * or a short-lived token fixture to exercise; deferred per playbook.
 */

test.describe('A1 login edges', () => {
	test('A1.3: Supabase user with no admin_users row is rejected with "no admin access"', async ({
		page,
		ctx
	}) => {
		const email = `a13-${Date.now()}@example.com`;
		const password = `pw-${Date.now()}`;
		const { data: user } = await ctx.supabase.auth.admin.createUser({
			email,
			password,
			email_confirm: true
		});
		// Deliberately NOT inserting into admin_users.

		await page.goto('/admin/login');
		await page.getByLabel(/email/i).fill(email);
		await page.getByLabel(/password/i).fill(password);
		await page.getByRole('button', { name: /sign in/i }).click();

		await expect(page.getByText(/do not have admin access/i)).toBeVisible({ timeout: 5000 });
		// Still on login page.
		await expect(page).toHaveURL(/\/admin\/login/);
		// No admin cookies set.
		const cookies = await page.context().cookies();
		expect(cookies.some((c) => c.name === 'admin_access_token')).toBe(false);
		expect(cookies.some((c) => c.name === 'admin_refresh_token')).toBe(false);

		await ctx.supabase.auth.admin.deleteUser(user.user!.id);
	});

	test('A1.4: logout clears both admin cookies', async ({ page, ctx }) => {
		await loginAsAdmin(page, ctx);
		let cookies = await page.context().cookies();
		expect(cookies.some((c) => c.name === 'admin_access_token')).toBe(true);
		expect(cookies.some((c) => c.name === 'admin_refresh_token')).toBe(true);

		// POST the logout form action — the UI wires "Sign out" to this endpoint.
		const res = await page.request.post('/admin/login?/logout', {
			form: {},
			headers: { Origin: 'http://localhost:5173' }
		});
		expect(res.status()).toBeLessThan(400);

		cookies = await page.context().cookies();
		expect(cookies.some((c) => c.name === 'admin_access_token')).toBe(false);
		expect(cookies.some((c) => c.name === 'admin_refresh_token')).toBe(false);
	});
});

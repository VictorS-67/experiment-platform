import { test, expect, loginAsAdmin } from '../fixtures';

/**
 * A1.5 — Admin access-token refresh + refresh-token rotation.
 *
 * The hook in src/hooks.server.ts attempts `getUser(accessToken)` on every
 * admin request. When that fails (expired or corrupt token), it calls
 * `auth.refreshSession({ refresh_token })`. Supabase has refresh-token
 * rotation enabled (see supabase/config.toml: enable_refresh_token_rotation),
 * so a successful refresh issues a fresh refresh_token AND a fresh access_token.
 *
 * Approach: log in normally, capture both cookies, then poison the
 * access_token cookie so the hook is forced down the refresh path on the
 * next request. Assert both cookies were rotated to new values.
 */

test.describe('A1.5 admin refresh-token rotation', () => {
	test('expired access token triggers refresh; both cookies rotate', async ({ page, ctx }) => {
		await loginAsAdmin(page, ctx);

		const cookiesBefore = await page.context().cookies();
		const accessBefore = cookiesBefore.find((c) => c.name === 'admin_access_token')?.value;
		const refreshBefore = cookiesBefore.find((c) => c.name === 'admin_refresh_token')?.value;
		expect(accessBefore).toBeTruthy();
		expect(refreshBefore).toBeTruthy();

		// Poison the access token so getUser() fails. Keep the refresh token
		// intact so the hook's catch branch can mint a new pair.
		const accessCookie = cookiesBefore.find((c) => c.name === 'admin_access_token')!;
		await page.context().clearCookies({ name: 'admin_access_token' });
		await page.context().addCookies([
			{
				...accessCookie,
				value: 'invalid.jwt.poisoned'
			}
		]);

		// Visit a guarded admin page — the hook must follow the refresh path.
		await page.goto('/admin/experiments');
		// We should land on the experiments list (200), not bounce to login.
		await page.waitForURL(/\/admin\/experiments$/);

		const cookiesAfter = await page.context().cookies();
		const accessAfter = cookiesAfter.find((c) => c.name === 'admin_access_token')?.value;
		const refreshAfter = cookiesAfter.find((c) => c.name === 'admin_refresh_token')?.value;

		expect(accessAfter).toBeTruthy();
		// New access token, not our poison value, not the old one.
		expect(accessAfter).not.toBe('invalid.jwt.poisoned');
		expect(accessAfter).not.toBe(accessBefore);

		// Supabase rotates the refresh token on every successful refresh
		// (enable_refresh_token_rotation = true), so refreshAfter should differ
		// from refreshBefore. The hook also writes whatever Supabase returns,
		// so this is the cleanest check that rotation flowed through.
		expect(refreshAfter).toBeTruthy();
		expect(refreshAfter).not.toBe(refreshBefore);
	});
});

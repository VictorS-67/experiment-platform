import { test as base, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared Playwright fixtures for the experiment-platform E2E suite.
 *
 * These fixtures assume a local Supabase stack is already running (start
 * with `supabase start`). The anon and service-role keys printed by
 * `supabase status` need to be in the environment before Playwright boots —
 * easiest via a `tests/e2e/.env.local` file and `dotenv`, or just exporting
 * them in the shell.
 */

interface TestEnv {
	supabaseUrl: string;
	anonKey: string;
	serviceRoleKey: string;
}

const LOCAL_SUPABASE_HOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)(:|\/|$)/;

function readEnv(): TestEnv {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
	const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !anonKey || !serviceRoleKey) {
		throw new Error(
			'E2E env vars missing — run `supabase status` and export PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY before Playwright.'
		);
	}

	// Safety rail: the E2E suite creates, mutates, and deletes rows using
	// the service role. Running it against a hosted Supabase would scribble
	// all over production data. Require a local URL unless the operator has
	// explicitly opted in via the escape hatch.
	const isLocal = LOCAL_SUPABASE_HOST_RE.test(supabaseUrl);
	if (!isLocal && process.env.E2E_ALLOW_REMOTE !== 'yes-i-know-what-im-doing') {
		throw new Error(
			`Refusing to run E2E suite against non-local Supabase (${supabaseUrl}). ` +
				'Start the local stack with `supabase start` and re-export the env vars, ' +
				'or set E2E_ALLOW_REMOTE="yes-i-know-what-im-doing" if this is genuinely a ' +
				'disposable remote test project.'
		);
	}

	return { supabaseUrl, anonKey, serviceRoleKey };
}

/** Wrapper that provides per-test isolation: unique admin + experiment rows. */
export interface TestContext {
	supabase: SupabaseClient;
	adminEmail: string;
	adminPassword: string;
	adminUserId: string;
	cleanup: () => Promise<void>;
}

export const test = base.extend<{ ctx: TestContext }>({
	ctx: async ({}, use) => {
		const env = readEnv();
		const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		});

		// Unique per-test admin so parallel tests can't trample each other.
		const suffix = Math.random().toString(36).slice(2, 10);
		const adminEmail = `e2e-admin-${suffix}@example.com`;
		const adminPassword = `Test-password-${suffix}-${Date.now()}`;

		const { data: created, error: createErr } = await supabase.auth.admin.createUser({
			email: adminEmail,
			password: adminPassword,
			email_confirm: true
		});
		if (createErr || !created.user) {
			throw new Error(`Failed to create E2E admin: ${createErr?.message ?? 'unknown'}`);
		}
		const adminUserId = created.user.id;
		await supabase.from('admin_users').insert({ user_id: adminUserId, role: 'admin' });

		const createdExperiments: string[] = [];
		const ctx: TestContext = {
			supabase,
			adminEmail,
			adminPassword,
			adminUserId,
			cleanup: async () => {
				if (createdExperiments.length) {
					await supabase.from('experiments').delete().in('id', createdExperiments);
				}
				await supabase.from('admin_users').delete().eq('user_id', adminUserId);
				await supabase.auth.admin.deleteUser(adminUserId);
			}
		};

		await use(ctx);
		await ctx.cleanup();
	}
});

export { expect } from '@playwright/test';

/** Helper: log in as the test admin via the real login form. */
export async function loginAsAdmin(page: Page, ctx: TestContext) {
	await page.goto('/admin/login');
	await page.getByLabel(/email/i).fill(ctx.adminEmail);
	await page.getByLabel(/password/i).fill(ctx.adminPassword);
	await page.getByRole('button', { name: /sign in/i }).click();
	await page.waitForURL(/\/admin\/experiments/);
}

/**
 * Helper: create a fresh experiment via the admin "New" form and wait for the
 * detail-page redirect. Returns the slug used (caller can re-derive the id from
 * `page.url()` if needed). Mirrors the manual flow in real admin onboarding.
 */
export async function createTestExperiment(page: Page, slugPrefix: string, title = 'E2E Test'): Promise<string> {
	await page.goto('/admin/experiments/new');
	const slug = `${slugPrefix}-${Date.now()}`;
	await page.getByLabel(/slug/i).fill(slug);
	await page.getByLabel(/title \(english\)/i).fill(title);
	await page.getByRole('button', { name: /create/i }).click();
	await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);
	return slug;
}

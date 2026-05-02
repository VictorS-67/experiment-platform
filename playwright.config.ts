import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for end-to-end tests against a local Supabase
 * stack.
 *
 * Run:
 *   1. `supabase start` — spins up Postgres + GoTrue + Storage in Docker and
 *      applies every migration in supabase/migrations/
 *   2. `npm run test:e2e` — boots the SvelteKit dev server with env vars
 *      pointing at the local stack, runs the spec suite, then tears down
 *
 * The `webServer` block below handles (2). Running (1) is left to the
 * developer / CI job because `supabase start` has high-latency Docker pulls
 * on the first invocation and Playwright's `webServer.command` doesn't
 * cleanly model that.
 *
 * Env vars read here (set by tests/e2e/setup.ts after `supabase status`):
 *   PUBLIC_SUPABASE_URL        - usually http://127.0.0.1:54321
 *   PUBLIC_SUPABASE_ANON_KEY   - printed by `supabase status`
 *   SUPABASE_SERVICE_ROLE_KEY  - printed by `supabase status`
 */
export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		// scripts/pw.js translates `--slowmo=N` (CLI-style) into PW_SLOWMO so
		// you can run `npm run pw -- --headed --slowmo=200 tests/e2e/...`.
		// Plain `playwright test` ignores this and runs at full speed.
		launchOptions: {
			slowMo: process.env.PW_SLOWMO ? Number(process.env.PW_SLOWMO) : 0
		}
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		stdout: 'pipe',
		stderr: 'pipe'
	}
});

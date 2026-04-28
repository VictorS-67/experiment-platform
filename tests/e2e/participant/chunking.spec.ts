import { test, expect } from '../fixtures';
import { seedExperiment } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import chunkingConfig from '../fixtures/chunking-config.json' with { type: 'json' };
import { latinSquareOrder } from '../../../src/lib/utils';

/**
 * P6 — Chunking. The schema's chunking model has pre-defined chunks that each
 * contain blocks of stimuli. `blockOrder` (latin-square/random/sequential)
 * permutes blocks within a chunk per participant; `withinBlockOrder` permutes
 * stimuli within each block. The playbook's original language ("chunksCount
 * 3, itemsPerChunk 4") doesn't match the actual schema; tests below exercise
 * what the product actually does.
 */

let experimentId: string;
let slug: string;
let supabase: SupabaseClient;

test.beforeAll(async () => {
	supabase = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
	const cfg = JSON.parse(JSON.stringify(chunkingConfig)) as Record<string, unknown>;
	cfg.slug = `${cfg.slug}-${Date.now()}`;
	const seeded = await seedExperiment(cfg, { supabase });
	experimentId = seeded.id;
	slug = seeded.slug;
});

test.afterAll(async () => {
	if (experimentId) await supabase.from('experiments').delete().eq('id', experimentId);
});

test.beforeEach(async () => {
	if (supabase) await supabase.from('rate_limits').delete().eq('endpoint', '/auth');
});

async function registerAndEnterChunk(page: import('@playwright/test').Page) {
	const email = `p6-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
	await page.goto(`/e/${slug}`);
	await page.getByLabel(/email/i).fill(email);
	await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
	await page.getByLabel(/age/i).fill('30');
	await page.getByRole('button', { name: /register/i }).click();
	// For chunked experiments, registration lands on /e/<slug>/c/c1/main.
	await page.waitForURL(/\/e\/.+\/c\/c1\/main/);
	return email;
}

test.describe('P6 chunking', () => {
	test('P6.1: blockOrder=latin-square rotates blocks across participants in a stable way', async ({
		page,
		ctx
	}) => {
		test.setTimeout(60_000);
		// Register 3 participants (one per row in the latin square for chunk 1
		// which has 3 blocks). Each participant's index in the experiment
		// drives their row in the square.
		const blockOrders: string[][] = [];
		for (let i = 0; i < 3; i++) {
			const email = await registerAndEnterChunk(page);
			const { data: p } = await ctx.supabase
				.from('participants')
				.select('id, chunk_assignments')
				.eq('experiment_id', experimentId)
				.eq('email', email)
				.single();
			const assn = (p!.chunk_assignments as Record<string, { blockOrder: string[] }>) ?? {};
			expect(assn.c1?.blockOrder).toBeDefined();
			blockOrders.push(assn.c1.blockOrder);
			// Log out so the next register is a fresh registration.
			await page.context().clearCookies();
		}

		// Strict round-robin: the three participants registered in sequence
		// must hold ranks 0, 1, 2 respectively (ranked by registered_at), so
		// their block orders must match latinSquareOrder(base, 0 / 1 / 2) in
		// registration order. Any drift here means getParticipantIndex is
		// ranking by something other than registration order.
		const base = ['b1', 'b2', 'b3'];
		const joined = blockOrders.map((o) => o.join(','));
		const expected = [0, 1, 2].map((i) => latinSquareOrder(base, i).join(','));
		expect(joined).toEqual(expected);
	});

	test('P6.1-bis: latin-square distributes 9 participants evenly (3 per row)', async ({
		page,
		ctx
	}) => {
		test.setTimeout(120_000);

		// Register 9 participants sequentially. Small delay between registrations
		// so each one gets a distinct `registered_at` (Postgres now() ticks per
		// transaction, but back-to-back registrations can land in the same ms
		// bucket — the server falls back to a tie-break by id which would break
		// strict round-robin).
		const blockOrders: string[][] = [];
		for (let i = 0; i < 9; i++) {
			const email = await registerAndEnterChunk(page);
			const { data: p } = await ctx.supabase
				.from('participants')
				.select('id, chunk_assignments')
				.eq('experiment_id', experimentId)
				.eq('email', email)
				.single();
			const assn = (p!.chunk_assignments as Record<string, { blockOrder: string[] }>) ?? {};
			blockOrders.push(assn.c1.blockOrder);
			await page.context().clearCookies();
			await new Promise((r) => setTimeout(r, 15));
		}

		const base = ['b1', 'b2', 'b3'];
		const rowCounts: Record<string, number> = {};
		for (let i = 0; i < 3; i++) {
			rowCounts[latinSquareOrder(base, i).join(',')] = 0;
		}
		for (const order of blockOrders) {
			const key = order.join(',');
			expect(rowCounts).toHaveProperty(key);
			rowCounts[key]++;
		}
		// Round-robin: each of the 3 rows hit exactly 3 times.
		expect(Object.values(rowCounts).sort()).toEqual([3, 3, 3]);
	});

	test('P6.2: stimulus order within a chunk is stable for the same participant across reloads', async ({
		page
	}) => {
		await registerAndEnterChunk(page);

		// Read the current stimulus sequence from DOM (stimulus nav buttons
		// show the ids / labels in order). The StimulusNav items include
		// per-stimulus labels; we snapshot the sequence.
		async function readOrder(): Promise<string[]> {
			// The stimulus labels are in StimulusNav — easier to grab stimulus
			// content via the rendered StimulusRenderer, which prints the label
			// as text. We fall back to reading the progress bar position +
			// clicking through to each item. Simpler: query the message div
			// that shows the stimulus label.
			await page.waitForSelector('main');
			// The current stimulus renderer shows the label as a heading.
			const visibleNav = await page
				.locator('button[aria-pressed], button[data-stimulus-id]')
				.evaluateAll((els) => els.map((e) => e.getAttribute('data-stimulus-id') ?? e.textContent?.trim() ?? ''));
			if (visibleNav.length) return visibleNav;
			// Fallback: return the label of the currently visible stimulus.
			const labels = await page
				.locator('div[role="img"], h3, p')
				.allTextContents();
			return labels.slice(0, 3);
		}

		const first = await readOrder();
		await page.reload();
		await page.waitForURL(/\/e\/.+\/c\/c1\/main/);
		const second = await readOrder();
		expect(second).toEqual(first);
	});

	test('P6.3: break screen renders when crossing a block boundary inside a chunk', async ({
		page,
		ctx
	}) => {
		test.setTimeout(60_000);

		// Seed a one-off experiment with a breakScreen configured. The main
		// fixture (shared beforeAll) doesn't have one, and break-screen rendering
		// keys off its presence in config.
		const cfg = JSON.parse(JSON.stringify(chunkingConfig)) as Record<string, unknown>;
		cfg.slug = `chunking-break-${Date.now()}`;
		const stimuli = cfg.stimuli as Record<string, unknown>;
		const chunking = stimuli.chunking as Record<string, unknown>;
		chunking.breakScreen = {
			title: { en: 'Take a short break' },
			body: { en: 'Please rest before continuing.' }
		};
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase });

		try {
			const email = `p6-break-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
			await page.goto(`/e/${seeded.slug}`);
			await page.getByLabel(/email/i).fill(email);
			await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
			await page.getByLabel(/age/i).fill('30');
			await page.getByRole('button', { name: /register/i }).click();
			await page.waitForURL(/\/e\/.+\/c\/c1\/main/);

			// Complete the 3 stimuli in block 1. Each stimulus is a likert 1-5;
			// click "1" then the Save button, then the page advances to the next
			// stimulus. On the 3rd Save, the client should detect a block
			// boundary and show the break screen modal (instead of advancing
			// silently to the next stimulus).
			for (let i = 0; i < 3; i++) {
				// Click likert "1" (first button in the scale group).
				await page.getByRole('button', { name: '1', exact: true }).first().click();
				await page.getByRole('button', { name: /^save$/i }).click();
				// Wait for either the next stimulus to render OR the break screen.
				await page.waitForTimeout(150);
			}

			// Break screen modal visible with configured title + body.
			await expect(page.getByRole('heading', { name: /take a short break/i })).toBeVisible({
				timeout: 10_000
			});
			await expect(page.getByText(/please rest before continuing/i)).toBeVisible();

			// Click Continue — modal closes, next block begins.
			await page.getByRole('button', { name: /^continue/i }).click();
			await expect(page.getByRole('heading', { name: /take a short break/i })).toHaveCount(0);
			// We're still on the chunk-main page; URL shouldn't have changed to /c2/.
			expect(page.url()).toMatch(/\/c\/c1\/main/);
		} finally {
			await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
		}
	});

	test('P6.4: withinBlockOrder=random-per-participant shuffles per participant, stable across reloads', async ({
		browser
	}) => {
		test.setTimeout(60_000);

		// The StimulusNav lists all config.stimuli.items in config-order, not the
		// participant's traversal order. To observe the per-participant shuffle
		// we read the currently-rendered stimulus label from #stimulus-player.
		// items[0] = orderedStimulusIds[0], which reflects both the latin-square
		// block rotation and the within-block seeded shuffle.

		async function registerAndReadFirstLabel(): Promise<{
			firstLabel: string;
			close: () => Promise<void>;
		}> {
			const context = await browser.newContext();
			const page = await context.newPage();
			const email = `p6-rand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
			await page.goto(`/e/${slug}`);
			await page.getByLabel(/email/i).fill(email);
			await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
			await page.getByLabel(/age/i).fill('30');
			await page.getByRole('button', { name: /register/i }).click();
			await page.waitForURL(/\/e\/.+\/c\/c1\/main/);
			const label = (
				await page.locator('#stimulus-player p').first().innerText()
			).trim();
			return {
				firstLabel: label,
				close: async () => {
					await page.close();
					await context.close();
				}
			};
		}

		// Participant A — capture first rendered stimulus, then reload to prove
		// stability. random-per-participant seeds on participant.id + blockId,
		// so reloads must return the same item.
		const contextA = await browser.newContext();
		const pageA = await contextA.newPage();
		const emailA = `p6-A-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
		await pageA.goto(`/e/${slug}`);
		await pageA.getByLabel(/email/i).fill(emailA);
		await pageA.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await pageA.getByLabel(/age/i).fill('30');
		await pageA.getByRole('button', { name: /register/i }).click();
		await pageA.waitForURL(/\/e\/.+\/c\/c1\/main/);
		const firstLabelA = (await pageA.locator('#stimulus-player p').first().innerText()).trim();
		expect(firstLabelA.length).toBeGreaterThan(0);

		await pageA.reload();
		await pageA.waitForURL(/\/e\/.+\/c\/c1\/main/);
		const secondLabelA = (
			await pageA.locator('#stimulus-player p').first().innerText()
		).trim();
		expect(secondLabelA).toEqual(firstLabelA);

		// Fresh participant — chunk c1 has 9 stimuli across 3 blocks, so the
		// first-item space is 9 values. With latin-square block rotation +
		// within-block shuffle, <1/9 of fresh participants collide on the same
		// first stimulus. Try up to 5 times.
		const seenLabels: string[] = [firstLabelA];
		let labelB: string | null = null;
		for (let attempt = 0; attempt < 5 && !labelB; attempt++) {
			const r = await registerAndReadFirstLabel();
			seenLabels.push(r.firstLabel);
			if (r.firstLabel !== firstLabelA) labelB = r.firstLabel;
			await r.close();
		}
		expect(
			labelB,
			`Expected a different first-stimulus than A=${firstLabelA} within 5 tries. Saw: ${seenLabels.join(' | ')}`
		).not.toBeNull();

		await pageA.close();
		await contextA.close();
	});

	test('P6.5: re-entering a chunk keeps the same persisted blockOrder (no re-shuffle)', async ({
		page,
		ctx
	}) => {
		const email = await registerAndEnterChunk(page);
		const { data: p1 } = await ctx.supabase
			.from('participants')
			.select('chunk_assignments')
			.eq('experiment_id', experimentId)
			.eq('email', email)
			.single();
		const first = (p1!.chunk_assignments as Record<string, { blockOrder: string[] }>).c1.blockOrder;

		// Reload — server should not re-assign.
		await page.reload();
		await page.waitForURL(/\/e\/.+\/c\/c1\/main/);
		const { data: p2 } = await ctx.supabase
			.from('participants')
			.select('chunk_assignments')
			.eq('experiment_id', experimentId)
			.eq('email', email)
			.single();
		const second = (p2!.chunk_assignments as Record<string, { blockOrder: string[] }>).c1.blockOrder;
		expect(second).toEqual(first);
	});
});

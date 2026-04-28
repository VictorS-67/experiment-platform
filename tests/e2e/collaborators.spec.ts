import { test, expect, loginAsAdmin } from './fixtures';

test.describe('Collaborators (Phase C)', () => {
	test('creator becomes sole owner, can invite by email, and pending-invite claim link is surfaced', async ({ page, ctx }) => {
		await loginAsAdmin(page, ctx);

		// Create a fresh experiment via the admin UI.
		await page.goto('/admin/experiments/new');
		const slug = `e2e-collab-${Date.now()}`;
		await page.getByLabel(/slug/i).fill(slug);
		await page.getByLabel(/title \(english\)/i).fill('Collab Test');
		await page.getByRole('button', { name: /create/i }).click();
		await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);

		// Jump to settings — the CollaboratorsPanel lives there.
		await page.getByRole('link', { name: /settings/i }).first().click();

		// Creator is listed as owner with "(you)" marker.
		await expect(page.getByText(ctx.adminEmail)).toBeVisible();
		await expect(page.getByText(/\(you\)/i)).toBeVisible();

		// Invite a non-existent email → should surface a claim link (no SMTP
		// configured in local Supabase, so emailSent=false and we fall back to
		// the copy-link UX).
		const invitee = `e2e-invitee-${Date.now()}@example.com`;
		await page.getByLabel(/invite by email/i).fill(invitee);
		await page.getByRole('button', { name: /^invite$/i }).click();

		// Either success banner appears with a claim URL, or the row shows up
		// in the "Pending invites" list. Either way, the claim URL contains
		// the `?claim=` param.
		await expect(page.getByText(invitee).first()).toBeVisible();
		// Claim URL is rendered in a readonly <input> inside the success banner.
		// Svelte binds `value={...}` as a property, not an attribute, so we pick
		// the input by its readonly state and read its value.
		const claimInput = page.locator('input[readonly]').first();
		await expect(claimInput).toBeVisible();
		const claimLink = await claimInput.inputValue();
		expect(claimLink).toMatch(/\?claim=[0-9a-f-]{36}/);
	});
});

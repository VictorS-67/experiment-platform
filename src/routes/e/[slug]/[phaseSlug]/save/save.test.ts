import { describe, it, expect } from 'vitest';

/**
 * Tests for the save endpoint validation logic (C2 fix).
 *
 * The actual endpoint uses SvelteKit's RequestHandler which requires
 * full request context. These tests verify the validation logic inline:
 * - stimulus-response phases validate stimulusId against config.stimuli.items
 * - review phases skip stimulus validation (they use response UUIDs)
 * - both phase types validate phaseId and widget keys
 */

type Phase = {
	id: string;
	type?: string;
	responseWidgets?: Array<{ id: string }>;
	reviewConfig?: { responseWidgets?: Array<{ id: string }> };
};

type Config = {
	phases?: Phase[];
	stimuli?: { items?: Array<{ id: string }> };
};

/** Mirrors the validation logic from +server.ts lines 40-62 */
function validateSaveRequest(
	config: Config,
	phaseId: string,
	stimulusId: string,
	responseData: Record<string, unknown>
): { valid: boolean; error?: string } {
	const phase = config?.phases?.find((p) => p.id === phaseId);
	if (!phase) {
		return { valid: false, error: 'Invalid phase' };
	}

	// C2 fix: Review phases use source response UUIDs as stimulusId
	if (phase.type !== 'review') {
		const stimulusExists = config?.stimuli?.items?.some((s) => s.id === stimulusId);
		if (!stimulusExists) {
			return { valid: false, error: 'Invalid stimulus' };
		}
	}

	const phaseWidgets = phase.responseWidgets ?? phase.reviewConfig?.responseWidgets ?? [];
	const widgetIds = new Set(phaseWidgets.map((w) => w.id));
	for (const key of Object.keys(responseData)) {
		if (!widgetIds.has(key)) {
			return { valid: false, error: `Unknown widget: ${key}` };
		}
	}

	return { valid: true };
}

describe('save endpoint validation', () => {
	const baseConfig: Config = {
		phases: [
			{
				id: 'phase-sr',
				type: 'stimulus-response',
				responseWidgets: [{ id: 'w1' }, { id: 'w2' }]
			},
			{
				id: 'phase-review',
				type: 'review',
				reviewConfig: {
					responseWidgets: [{ id: 'rw1' }]
				}
			}
		],
		stimuli: {
			items: [{ id: 'stim-1' }, { id: 'stim-2' }]
		}
	};

	// --- Phase validation ---

	it('rejects unknown phaseId', () => {
		const result = validateSaveRequest(baseConfig, 'nonexistent', 'stim-1', { w1: 'val' });
		expect(result.valid).toBe(false);
		expect(result.error).toBe('Invalid phase');
	});

	// --- C2: stimulus-response vs review ---

	it('rejects unknown stimulusId for stimulus-response phase', () => {
		const result = validateSaveRequest(baseConfig, 'phase-sr', 'nonexistent', { w1: 'val' });
		expect(result.valid).toBe(false);
		expect(result.error).toBe('Invalid stimulus');
	});

	it('accepts valid stimulusId for stimulus-response phase', () => {
		const result = validateSaveRequest(baseConfig, 'phase-sr', 'stim-1', { w1: 'val' });
		expect(result.valid).toBe(true);
	});

	it('accepts response UUID as stimulusId for review phase', () => {
		const responseUUID = '550e8400-e29b-41d4-a716-446655440000';
		const result = validateSaveRequest(baseConfig, 'phase-review', responseUUID, { rw1: 'val' });
		expect(result.valid).toBe(true);
	});

	it('accepts any string as stimulusId for review phase', () => {
		const result = validateSaveRequest(baseConfig, 'phase-review', 'anything-goes-here', { rw1: 'val' });
		expect(result.valid).toBe(true);
	});

	// --- Widget key validation (applies to both types) ---

	it('rejects unknown widget key for stimulus-response phase', () => {
		const result = validateSaveRequest(baseConfig, 'phase-sr', 'stim-1', { unknown: 'val' });
		expect(result.valid).toBe(false);
		expect(result.error).toBe('Unknown widget: unknown');
	});

	it('rejects unknown widget key for review phase', () => {
		const result = validateSaveRequest(baseConfig, 'phase-review', 'some-uuid', { unknown: 'val' });
		expect(result.valid).toBe(false);
		expect(result.error).toBe('Unknown widget: unknown');
	});

	it('validates review phase widget keys from reviewConfig', () => {
		const result = validateSaveRequest(baseConfig, 'phase-review', 'some-uuid', { rw1: 'review comment' });
		expect(result.valid).toBe(true);
	});

	it('accepts empty response data', () => {
		const result = validateSaveRequest(baseConfig, 'phase-sr', 'stim-1', {});
		expect(result.valid).toBe(true);
	});
});

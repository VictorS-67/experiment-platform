import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Integration tests for the /save POST handler.
 *
 * These tests drive the real `POST` export from +server.ts — not a
 * reimplementation — by mocking the three external collaborators it imports
 * (getParticipantByToken, saveResponse, getServerSupabase) via vi.mock.
 *
 * Covers the audit's H6 concern: the prior test file mirrored validation
 * logic inline and therefore could not catch drift between the test and the
 * real handler (and indeed missed a real bug where review phases were having
 * their stimulus IDs validated against the stimulus-items list).
 */

type MockedParticipant = { id: string; experiment_id: string } | null;

let mockParticipant: MockedParticipant = { id: 'p1', experiment_id: 'exp-1' };
let mockExperiment: { id: string; config: Record<string, unknown> } | null = {
	id: 'exp-1',
	config: {
		phases: [
			{
				id: 'phase-sr',
				type: 'stimulus-response',
				responseWidgets: [{ id: 'w1' }, { id: 'w2' }]
			},
			{
				id: 'phase-review',
				type: 'review',
				reviewConfig: { responseWidgets: [{ id: 'rw1' }] }
			}
		],
		stimuli: { items: [{ id: 'stim-1' }, { id: 'stim-2' }] }
	}
};
const savedResponses: Array<Record<string, unknown>> = [];

vi.mock('$lib/server/data', () => ({
	getParticipantByToken: vi.fn(async () => mockParticipant),
	saveResponse: vi.fn(async (experimentId, participantId, phaseId, stimulusId, responseData, responseIndex) => {
		const row = { id: 'resp-' + savedResponses.length, experiment_id: experimentId, participant_id: participantId, phase_id: phaseId, stimulus_id: stimulusId, response_data: responseData, response_index: responseIndex };
		savedResponses.push(row);
		return row;
	})
}));

vi.mock('$lib/server/supabase', () => ({
	getServerSupabase: () => ({
		from: () => ({
			select: () => ({
				eq: () => ({
					eq: () => ({
						single: async () => ({ data: mockExperiment, error: null })
					})
				})
			})
		})
	})
}));

// Imported AFTER vi.mock so the mocks are in place.
const { POST } = await import('./+server');

function makeEvent(body: Record<string, unknown>, overrides: { sessionToken?: string | null; slug?: string } = {}) {
	const request = new Request('http://localhost/e/exp-slug/phase-sr/save', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	return {
		request,
		locals: { sessionToken: overrides.sessionToken === undefined ? 'tok' : overrides.sessionToken, adminUser: null },
		params: { slug: overrides.slug ?? 'exp-slug', phaseSlug: 'phase-sr' }
	} as unknown as Parameters<typeof POST>[0];
}

async function callPOST(event: Parameters<typeof POST>[0]) {
	try {
		const res = await POST(event);
		return { status: res.status, body: await res.json() };
	} catch (err) {
		// SvelteKit's `error(status, msg)` throws an HttpError with `status` +
		// `body.message`. Unwrap to a uniform shape for assertions.
		const e = err as { status?: number; body?: { message?: string } };
		return { status: e.status ?? 500, body: e.body ?? { message: String(err) } };
	}
}

beforeEach(() => {
	mockParticipant = { id: 'p1', experiment_id: 'exp-1' };
	mockExperiment = {
		id: 'exp-1',
		config: {
			phases: [
				{
					id: 'phase-sr',
					type: 'stimulus-response',
					responseWidgets: [{ id: 'w1' }, { id: 'w2' }]
				},
				{
					id: 'phase-review',
					type: 'review',
					reviewConfig: { responseWidgets: [{ id: 'rw1' }] }
				}
			],
			stimuli: { items: [{ id: 'stim-1' }, { id: 'stim-2' }] }
		}
	};
	savedResponses.length = 0;
});

describe('POST /e/[slug]/[phaseSlug]/save', () => {
	it('401 when sessionToken is missing', async () => {
		const res = await callPOST(makeEvent({ phaseId: 'phase-sr', stimulusId: 'stim-1', responseData: { w1: 'x' } }, { sessionToken: null }));
		expect(res.status).toBe(401);
	});

	it('401 when session token does not resolve to a participant', async () => {
		mockParticipant = null;
		const res = await callPOST(makeEvent({ phaseId: 'phase-sr', stimulusId: 'stim-1', responseData: { w1: 'x' } }));
		expect(res.status).toBe(401);
	});

	it('403 when participant belongs to a different experiment', async () => {
		mockParticipant = { id: 'p1', experiment_id: 'different-exp' };
		const res = await callPOST(makeEvent({ phaseId: 'phase-sr', stimulusId: 'stim-1', responseData: { w1: 'x' } }));
		expect(res.status).toBe(403);
	});

	it('400 when phaseId is unknown', async () => {
		const res = await callPOST(makeEvent({ phaseId: 'ghost', stimulusId: 'stim-1', responseData: { w1: 'x' } }));
		expect(res.status).toBe(400);
		expect(res.body.message).toContain('Invalid phase');
	});

	it('400 when stimulusId does not match config.stimuli.items for a stimulus-response phase', async () => {
		const res = await callPOST(makeEvent({ phaseId: 'phase-sr', stimulusId: 'ghost', responseData: { w1: 'x' } }));
		expect(res.status).toBe(400);
		expect(res.body.message).toContain('Invalid stimulus');
	});

	it('accepts an arbitrary UUID as stimulusId for a review phase', async () => {
		const res = await callPOST(makeEvent({
			phaseId: 'phase-review',
			stimulusId: '550e8400-e29b-41d4-a716-446655440000',
			responseData: { rw1: 'nice' }
		}));
		expect(res.status).toBe(200);
		expect(savedResponses).toHaveLength(1);
		expect(savedResponses[0].stimulus_id).toBe('550e8400-e29b-41d4-a716-446655440000');
	});

	it('400 when response_data has a key that is not a declared widget', async () => {
		const res = await callPOST(makeEvent({ phaseId: 'phase-sr', stimulusId: 'stim-1', responseData: { unknown: 'x' } }));
		expect(res.status).toBe(400);
		expect(res.body.message).toContain('Unknown widget: unknown');
	});

	it('saves a valid stimulus-response submission', async () => {
		const res = await callPOST(makeEvent({ phaseId: 'phase-sr', stimulusId: 'stim-2', responseData: { w1: 'hello', w2: 'world' } }));
		expect(res.status).toBe(200);
		expect(savedResponses).toHaveLength(1);
		expect(savedResponses[0]).toMatchObject({
			experiment_id: 'exp-1',
			participant_id: 'p1',
			phase_id: 'phase-sr',
			stimulus_id: 'stim-2',
			response_data: { w1: 'hello', w2: 'world' }
		});
	});

	it('400 when phaseId / stimulusId / responseData are missing', async () => {
		const res = await callPOST(makeEvent({}));
		expect(res.status).toBe(400);
		expect(res.body.message).toContain('Missing required fields');
	});
});

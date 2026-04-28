import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findParticipantByEmail, createParticipant, getParticipantByToken, loadResponses, rotateSessionToken } from '$lib/server/data';
import { getServerSupabase } from '$lib/server/supabase';
import { COOKIE_OPTIONS } from '$lib/server/cookies';
import type { ResponseRecord } from '$lib/services/data';

const PARTICIPANT_COOKIE_OPTIONS = { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 90 }; // 90 days

type ChunkInfo = { slug: string; blocks: Array<{ stimulusIds: string[] }> };
type ChunkingConfig = { enabled?: boolean; chunks?: ChunkInfo[]; minBreakMinutes?: number };

/**
 * Given all responses for a participant, computes the next chunk they should visit.
 * Returns { url, breakRequired: { canStartAt: ISO string } | null } or null if all chunks are done.
 */
function computeNextChunk(
	config: { stimuli?: { chunking?: ChunkingConfig }; phases?: Array<{ slug: string }> },
	responses: ResponseRecord[],
	experimentSlug: string
): { url: string; breakRequired: { canStartAt: string } | null } | null {
	const chunking = config.stimuli?.chunking;
	if (!chunking?.enabled || !chunking.chunks?.length) return null;

	const firstPhaseSlug = config.phases?.[0]?.slug ?? 'survey';

	// Build map: stimulusId → latest created_at
	const respondedAt = new Map<string, string>();
	for (const r of responses) {
		const existing = respondedAt.get(r.stimulus_id);
		if (!existing || r.created_at > existing) respondedAt.set(r.stimulus_id, r.created_at);
	}

	let prevChunkLastResponseAt: string | null = null;

	for (const chunk of chunking.chunks) {
		const allStimuli = chunk.blocks.flatMap((b) => b.stimulusIds);
		const isComplete = allStimuli.length > 0 && allStimuli.every((id) => respondedAt.has(id));

		if (!isComplete) {
			const url = `/e/${experimentSlug}/c/${chunk.slug}/${firstPhaseSlug}`;
			let breakRequired: { canStartAt: string } | null = null;
			if (prevChunkLastResponseAt && chunking.minBreakMinutes) {
				const canStartAt = new Date(prevChunkLastResponseAt).getTime() + chunking.minBreakMinutes * 60 * 1000;
				if (canStartAt > Date.now()) {
					breakRequired = { canStartAt: new Date(canStartAt).toISOString() };
				}
			}
			return { url, breakRequired };
		}

		// Track last response time of this completed chunk
		const timestamps = allStimuli.map((id) => respondedAt.get(id)!).filter(Boolean);
		if (timestamps.length) {
			const last = timestamps.sort().at(-1)!;
			if (!prevChunkLastResponseAt || last > prevChunkLastResponseAt) prevChunkLastResponseAt = last;
		}
	}

	return null; // all chunks complete
}

// POST: login (find existing) or register (create new)
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const body = await request.json();
	const { action } = body;

	// Look up experiment to validate it exists and is active
	const supabase = getServerSupabase();
	const { data: exp } = await supabase
		.from('experiments')
		.select('id, config')
		.eq('slug', params.slug)
		.eq('status', 'active')
		.single();

	if (!exp) {
		error(404, 'Experiment not found');
	}

	const experimentId = exp.id;

	if (action === 'login') {
		const email = (body.email ?? '').trim().toLowerCase();
		if (!email) error(400, 'Email is required');

		const participant = await findParticipantByEmail(experimentId, email);
		if (!participant) {
			// NOTE: returning `{found: false}` here does leak whether the email
			// is registered in this experiment (email-enumeration vulnerability).
			// We accept this trade-off for the research-platform use case:
			// participants are pre-invited and know whether they should register,
			// and the alternative (email-verification tokens on every login) is
			// a much heavier UX. If the threat model changes — e.g. the
			// platform is opened up beyond pre-invited participants — revisit
			// by introducing a token-based login flow.
			return json({ found: false });
		}

		// Rotate session token on every login for security
		const newToken = await rotateSessionToken(participant.id);
		cookies.set('session_token', newToken, PARTICIPANT_COOKIE_OPTIONS);

		// Load existing responses
		const responses = await loadResponses(experimentId, participant.id);

		// Compute next chunk URL + break requirement when chunking is enabled
		const configTyped = exp.config as Parameters<typeof computeNextChunk>[0];
		const nextChunk = computeNextChunk(configTyped, responses, params.slug);
		const chunkingEnabled = !!configTyped.stimuli?.chunking?.enabled && (configTyped.stimuli.chunking.chunks?.length ?? 0) > 0;
		const allChunksComplete = chunkingEnabled && nextChunk === null && responses.length > 0;

		return json({
			found: true,
			participant: {
				id: participant.id,
				email: participant.email,
				registrationData: participant.registration_data,
				registeredAt: participant.registered_at
			},
			responses,
			nextChunkUrl: nextChunk?.url ?? null,
			breakRequired: nextChunk?.breakRequired ?? null,
			allChunksComplete
		});
	}

	if (action === 'register') {
		const email = (body.email ?? '').trim().toLowerCase();
		if (!email) error(400, 'Email is required');

		const registrationData = body.registrationData ?? {};

		// Validate registration data against config fields
		const config = exp.config as { registration?: { fields?: Array<{ id: string; type?: string; required?: boolean; conditionalOn?: { field: string; value: string } }> } };
		if (config?.registration?.fields) {
			for (const field of config.registration.fields) {
				if (!field.required) continue;
				// Email fields are handled separately (not in registrationData)
				if (field.type === 'email') continue;
				// Skip fields hidden by conditional logic
				if (field.conditionalOn) {
					const depValue = registrationData[field.conditionalOn.field];
					if (depValue !== field.conditionalOn.value) continue;
				}
				const value = registrationData[field.id];
				if (value === undefined || value === null || value === '') {
					error(400, `Missing required field: ${field.id}`);
				}
			}
		}

		const participant = await createParticipant(experimentId, email, registrationData);

		// Set session cookie
		cookies.set('session_token', participant.session_token, PARTICIPANT_COOKIE_OPTIONS);

		return json({
			participant: {
				id: participant.id,
				email: participant.email,
				registrationData: participant.registration_data,
				registeredAt: participant.registered_at
			}
		});
	}

	if (action === 'logout') {
		cookies.delete('session_token', { path: '/' });
		return json({ ok: true });
	}

	if (action === 'check') {
		const sessionToken = cookies.get('session_token');
		if (!sessionToken) {
			return json({ authenticated: false });
		}

		const participant = await getParticipantByToken(sessionToken);
		if (!participant || participant.experiment_id !== experimentId) {
			cookies.delete('session_token', { path: '/' });
			return json({ authenticated: false });
		}

		return json({
			authenticated: true,
			participant: {
				id: participant.id,
				email: participant.email,
				registrationData: participant.registration_data,
				registeredAt: participant.registered_at
			}
		});
	}

	error(400, 'Invalid action');
};

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findParticipantByEmail, createParticipant, getParticipantByToken, loadResponses, rotateSessionToken, getParticipantIndex } from '$lib/server/data';
import { getServerSupabase } from '$lib/server/supabase';
import { COOKIE_OPTIONS } from '$lib/server/cookies';
import { resolveParticipantNextChunk, isChunkingEnabled } from '$lib/server/chunk-routing';

const PARTICIPANT_COOKIE_OPTIONS = { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 90 }; // 90 days

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

		// Load existing responses + this participant's registration-rank index for
		// per-participant chunk-order resolution.
		const [responses, participantIndex] = await Promise.all([
			loadResponses(experimentId, participant.id),
			getParticipantIndex(experimentId, participant.id)
		]);

		// Compute next chunk URL + break requirement when chunking is enabled
		const configTyped = exp.config as Parameters<typeof resolveParticipantNextChunk>[0];
		const nextChunk = resolveParticipantNextChunk(configTyped, responses, params.slug, participant.id, participantIndex);
		const allChunksComplete = isChunkingEnabled(configTyped) && nextChunk === null && responses.length > 0;

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

		// Compute first chunk URL using this brand-new participant's index. The
		// participant row is committed before this point, so getParticipantIndex
		// resolves their registration rank correctly.
		const configTyped = exp.config as Parameters<typeof resolveParticipantNextChunk>[0];
		let nextChunkUrl: string | null = null;
		if (isChunkingEnabled(configTyped)) {
			const participantIndex = await getParticipantIndex(experimentId, participant.id);
			const nextChunk = resolveParticipantNextChunk(configTyped, [], params.slug, participant.id, participantIndex);
			nextChunkUrl = nextChunk?.url ?? null;
		}

		return json({
			participant: {
				id: participant.id,
				email: participant.email,
				registrationData: participant.registration_data,
				registeredAt: participant.registered_at
			},
			nextChunkUrl
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

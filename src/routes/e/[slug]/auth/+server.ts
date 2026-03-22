import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findParticipantByEmail, createParticipant, getParticipantByToken, loadResponses } from '$lib/server/data';
import { getServerSupabase } from '$lib/server/supabase';
import { COOKIE_OPTIONS } from '$lib/server/cookies';

const PARTICIPANT_COOKIE_OPTIONS = { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 90 }; // 90 days

// POST: login (find existing) or register (create new)
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const body = await request.json();
	const { action } = body;

	// Look up experiment to validate it exists and is active
	const supabase = getServerSupabase();
	const { data: exp } = await supabase
		.from('experiments')
		.select('id')
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
			return json({ found: false });
		}

		// Set session cookie
		cookies.set('session_token', participant.session_token, PARTICIPANT_COOKIE_OPTIONS);

		// Load existing responses
		const responses = await loadResponses(experimentId, participant.id);

		return json({
			found: true,
			participant: {
				id: participant.id,
				email: participant.email,
				registrationData: participant.registration_data,
				registeredAt: participant.registered_at
			},
			responses
		});
	}

	if (action === 'register') {
		const email = (body.email ?? '').trim().toLowerCase();
		if (!email) error(400, 'Email is required');

		const registrationData = body.registrationData ?? {};

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

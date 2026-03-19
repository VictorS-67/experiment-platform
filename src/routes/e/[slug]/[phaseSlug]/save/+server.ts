import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getParticipantByToken, saveResponse } from '$lib/server/data';
import { getServerSupabase } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.sessionToken) {
		error(401, 'Not authenticated');
	}

	const participant = await getParticipantByToken(locals.sessionToken);
	if (!participant) {
		error(401, 'Invalid session');
	}

	const supabase = getServerSupabase();
	const { data: exp } = await supabase
		.from('experiments')
		.select('id')
		.eq('slug', params.slug)
		.eq('status', 'active')
		.single();

	if (!exp || participant.experiment_id !== exp.id) {
		error(403, 'Access denied');
	}

	const body = await request.json();
	const { phaseId, stimulusId, responseData, responseIndex } = body;

	if (!phaseId || !stimulusId || !responseData) {
		error(400, 'Missing required fields');
	}

	const saved = await saveResponse(
		exp.id,
		participant.id,
		phaseId,
		stimulusId,
		responseData,
		responseIndex ?? 0
	);

	return json(saved);
};

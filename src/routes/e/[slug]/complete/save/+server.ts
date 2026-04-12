import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getParticipantByToken, saveResponse, loadResponses } from '$lib/server/data';
import { getServerSupabase } from '$lib/server/supabase';
import type { ExperimentConfig } from '$lib/config/schema';

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
		.select('id, config')
		.eq('slug', params.slug)
		.eq('status', 'active')
		.single();

	if (!exp || participant.experiment_id !== exp.id) {
		error(403, 'Access denied');
	}

	const config = exp.config as ExperimentConfig;
	const feedbackWidgets = config.completion?.feedbackWidgets ?? [];
	if (feedbackWidgets.length === 0) {
		error(400, 'No feedback widgets configured');
	}

	// Enforce one submission only
	const existing = await loadResponses(exp.id, participant.id, '_completion');
	if (existing.length > 0) {
		error(400, 'Feedback already submitted');
	}

	const body = await request.json();
	const { responseData } = body;
	if (!responseData) {
		error(400, 'Missing responseData');
	}

	// Validate widget keys against configured feedback widgets
	const widgetIds = new Set(feedbackWidgets.map((w) => w.id));
	for (const key of Object.keys(responseData as Record<string, unknown>)) {
		if (!widgetIds.has(key)) {
			error(400, `Unknown widget: ${key}`);
		}
	}

	const saved = await saveResponse(
		exp.id,
		participant.id,
		'_completion',
		'_feedback',
		responseData,
		0
	);

	return json(saved);
};

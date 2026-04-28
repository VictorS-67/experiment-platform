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
		.select('id, config')
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

	// Validate phaseId, stimulusId, and response keys against config
	const config = exp.config as {
		phases?: Array<{ id: string; type?: string; responseWidgets?: Array<{ id: string }>; reviewConfig?: { responseWidgets?: Array<{ id: string }> } }>;
		stimuli?: { items?: Array<{ id: string }> };
	};
	const phase = config?.phases?.find((p) => p.id === phaseId);
	if (!phase) {
		error(400, 'Invalid phase');
	}
	// Review phases use the source-phase response UUID as stimulusId (see
	// CLAUDE.md "Review phases use response UUIDs"), so we skip the
	// stimulus-items existence check for them.
	if (phase.type !== 'review') {
		const stimulusExists = config?.stimuli?.items?.some((s) => s.id === stimulusId);
		if (!stimulusExists) {
			error(400, 'Invalid stimulus');
		}
	}
	const phaseWidgets = phase.responseWidgets ?? phase.reviewConfig?.responseWidgets ?? [];
	const widgetIds = new Set(phaseWidgets.map((w) => w.id));
	for (const key of Object.keys(responseData as Record<string, unknown>)) {
		if (!widgetIds.has(key)) {
			error(400, `Unknown widget: ${key}`);
		}
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

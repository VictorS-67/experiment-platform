import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getParticipantByToken, uploadFile } from '$lib/server/data';
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

	const formData = await request.formData();
	const file = formData.get('file');
	const widgetId = formData.get('widgetId');
	const stimulusId = formData.get('stimulusId');

	if (!(file instanceof File) || !widgetId || !stimulusId) {
		error(400, 'Missing required fields');
	}

	const ext = file.type.includes('mp4') ? 'mp4' : file.type.includes('ogg') ? 'ogg' : 'webm';
	const path = `audio/${exp.id}/${participant.id}/${stimulusId}/${widgetId}_${Date.now()}.${ext}`;

	const savedPath = await uploadFile(
		'experiments',
		path,
		file,
		file.type,
		exp.id
	);

	return json({ path: savedPath });
};

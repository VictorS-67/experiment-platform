import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerSupabase } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');

	const supabase = getServerSupabase();

	const [experimentsResult, participantsResult, responsesResult] = await Promise.all([
		supabase.from('experiments').select('*'),
		supabase.from('participants').select('id, experiment_id, email, registration_data, registered_at'),
		supabase.from('responses').select('*')
	]);

	if (experimentsResult.error) {
		console.error('Backup: failed to fetch experiments:', experimentsResult.error);
		error(500, 'Failed to export experiments');
	}
	if (participantsResult.error) {
		console.error('Backup: failed to fetch participants:', participantsResult.error);
		error(500, 'Failed to export participants');
	}
	if (responsesResult.error) {
		console.error('Backup: failed to fetch responses:', responsesResult.error);
		error(500, 'Failed to export responses');
	}

	const backup = {
		exportedAt: new Date().toISOString(),
		tables: {
			experiments: experimentsResult.data,
			participants: participantsResult.data,
			responses: responsesResult.data
		}
	};

	const dateStr = new Date().toISOString().slice(0, 10);
	const filename = `backup-${dateStr}.json`;

	return new Response(JSON.stringify(backup, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};

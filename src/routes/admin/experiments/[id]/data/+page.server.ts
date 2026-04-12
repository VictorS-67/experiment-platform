import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { getExperiment, getParticipants, deleteParticipants, getExperimentStats, getChunkProgress } from '$lib/server/admin';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');
	const experiment = await getExperiment(params.id);
	if (!experiment) error(404, 'Experiment not found');

	const chunking = (experiment.config as { stimuli?: { chunking?: { enabled?: boolean; chunks?: Array<{ slug: string; blocks: Array<{ stimulusIds: string[] }> }>; minBreakMinutes?: number } } }).stimuli?.chunking;

	const [participants, stats, chunkProgressMap] = await Promise.all([
		getParticipants(params.id),
		getExperimentStats(params.id),
		chunking?.enabled && chunking.chunks?.length
			? getChunkProgress(params.id, chunking.chunks, chunking.minBreakMinutes)
			: Promise.resolve(null)
	]);

	// Serialize Map to plain object for page data
	const chunkProgress = chunkProgressMap
		? Object.fromEntries(chunkProgressMap)
		: null;

	return { experiment, participants, stats, chunkProgress };
};

export const actions: Actions = {
	bulkDelete: async ({ request, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const ids = formData.getAll('participantIds') as string[];
		if (ids.length === 0) return fail(400, { error: 'No participants selected.' });
		try {
			await deleteParticipants(ids);
			return { success: true };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete.' });
		}
	}
};

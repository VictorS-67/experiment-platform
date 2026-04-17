import { getServerSupabase } from './supabase';

export async function listExperiments() {
	const supabase = getServerSupabase();

	const { data: experiments, error } = await supabase
		.from('experiments')
		.select('id, slug, status, config, created_at, updated_at')
		.order('created_at', { ascending: false });

	if (error) { console.error('Failed to list experiments:', error); throw new Error('Failed to list experiments'); }

	// Get participant counts per experiment
	const { data: counts } = await supabase
		.from('participants')
		.select('experiment_id');

	const countMap: Record<string, number> = {};
	if (counts) {
		for (const row of counts) {
			countMap[row.experiment_id] = (countMap[row.experiment_id] || 0) + 1;
		}
	}

	return (experiments || []).map((exp) => ({
		id: exp.id,
		slug: exp.slug,
		status: exp.status,
		title: exp.config?.metadata?.title ?? {},
		description: exp.config?.metadata?.description ?? {},
		participantCount: countMap[exp.id] || 0,
		createdAt: exp.created_at,
		updatedAt: exp.updated_at
	}));
}

export async function getExperiment(id: string) {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('experiments')
		.select('id, slug, status, config, created_at, updated_at')
		.eq('id', id)
		.single();

	if (error || !data) return null;
	return data;
}

export async function createExperiment(slug: string, config: Record<string, unknown>) {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('experiments')
		.insert({ slug, config, status: 'draft' })
		.select('id')
		.single();

	if (error) { console.error('Failed to create experiment:', error); throw new Error('Failed to create experiment'); }
	return data;
}

export async function updateExperiment(
	id: string,
	updates: { config?: Record<string, unknown>; status?: string; slug?: string }
) {
	const supabase = getServerSupabase();
	const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

	if (updates.config !== undefined) updateData.config = updates.config;
	if (updates.status !== undefined) updateData.status = updates.status;
	if (updates.slug !== undefined) updateData.slug = updates.slug;

	const { error } = await supabase
		.from('experiments')
		.update(updateData)
		.eq('id', id);

	if (error) { console.error('Failed to update experiment:', error); throw new Error('Failed to update experiment'); }
}

export async function duplicateExperiment(id: string) {
	const supabase = getServerSupabase();
	const source = await getExperiment(id);
	if (!source) throw new Error('Experiment not found');

	let newSlug = `${source.slug}-copy`;
	let attempt = 1;
	while (true) {
		const { data } = await supabase.from('experiments').select('id').eq('slug', newSlug).maybeSingle();
		if (!data) break;
		attempt++;
		newSlug = `${source.slug}-copy-${attempt}`;
	}

	const newConfig = structuredClone(source.config) as Record<string, unknown>;
	newConfig.slug = newSlug;
	return createExperiment(newSlug, newConfig);
}

export async function deleteExperiment(id: string) {
	const supabase = getServerSupabase();
	const { error } = await supabase
		.from('experiments')
		.delete()
		.eq('id', id);

	if (error) { console.error('Failed to delete experiment:', error); throw new Error('Failed to delete experiment'); }
}

export async function saveConfigVersion(experimentId: string, config: unknown) {
	const supabase = getServerSupabase();
	const { error } = await supabase.rpc('insert_config_version', {
		exp_id: experimentId,
		cfg: config
	});
	if (error) { console.error('Failed to save config version:', error); throw new Error('Failed to save config version'); }
}

/**
 * Atomic "save config" for the admin editor: inserts the next config version
 * AND updates experiments.config in a single transaction (migration 014).
 *
 * If expectedUpdatedAt is provided, the server will reject the save with
 * ConfigConflictError when the experiment row has been updated since then —
 * that's the optimistic-lock check that prevents two admins from silently
 * overwriting each other's edits.
 */
export class ConfigConflictError extends Error {
	constructor() {
		super('Config was modified by another admin since you loaded it.');
		this.name = 'ConfigConflictError';
	}
}

export async function saveConfigWithVersion(
	experimentId: string,
	config: unknown,
	options: { newSlug?: string; expectedUpdatedAt?: string } = {}
): Promise<{ versionNumber: number; updatedAt: string }> {
	const supabase = getServerSupabase();
	const { data, error } = await supabase.rpc('upsert_config_with_version', {
		exp_id: experimentId,
		cfg: config,
		new_slug: options.newSlug ?? null,
		expected_updated_at: options.expectedUpdatedAt ?? null
	});

	if (error) {
		// Postgres error code P0004 → optimistic-lock conflict (see migration 014).
		if ((error as { code?: string }).code === 'P0004') {
			throw new ConfigConflictError();
		}
		console.error('Failed to save config:', error);
		throw new Error('Failed to save config');
	}

	const row = Array.isArray(data) ? data[0] : data;
	if (!row) throw new Error('Failed to save config: empty response');
	return { versionNumber: row.version_number, updatedAt: row.updated_at };
}

export async function listConfigVersions(experimentId: string) {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('experiment_config_versions')
		.select('id, version_number, created_at')
		.eq('experiment_id', experimentId)
		.order('version_number', { ascending: false });

	if (error) { console.error('Failed to list config versions:', error); throw new Error('Failed to list config versions'); }
	return data || [];
}

export async function rollbackToVersion(experimentId: string, versionId: string) {
	const supabase = getServerSupabase();
	const { data: version, error } = await supabase
		.from('experiment_config_versions')
		.select('config')
		.eq('id', versionId)
		.eq('experiment_id', experimentId)
		.single();

	if (error || !version) throw new Error('Version not found');

	await saveConfigWithVersion(experimentId, version.config);
}

export async function getParticipants(experimentId: string) {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('participants')
		.select('id, email, registration_data, registered_at')
		.eq('experiment_id', experimentId)
		.order('registered_at', { ascending: false });

	if (error) { console.error('Failed to load participants:', error); throw new Error('Failed to load participants'); }

	// Get response counts per participant
	// TODO: replace with a DB-side count() query when participant counts grow large
	const { data: responses } = await supabase
		.from('responses')
		.select('participant_id')
		.eq('experiment_id', experimentId);

	const countMap: Record<string, number> = {};
	if (responses) {
		for (const row of responses) {
			countMap[row.participant_id] = (countMap[row.participant_id] || 0) + 1;
		}
	}

	return (data || []).map((p) => ({
		...p,
		responseCount: countMap[p.id] || 0
	}));
}

export async function getParticipantDetail(participantId: string) {
	const supabase = getServerSupabase();

	const { data: participant, error: pErr } = await supabase
		.from('participants')
		.select('id, email, registration_data, registered_at')
		.eq('id', participantId)
		.single();

	if (pErr || !participant) throw new Error('Participant not found');

	const { data: responses, error: rErr } = await supabase
		.from('responses')
		.select('phase_id, stimulus_id, response_data, created_at, response_index')
		.eq('participant_id', participantId)
		.order('created_at', { ascending: true });

	if (rErr) { console.error('Failed to load responses:', rErr); throw new Error('Failed to load responses'); }

	// Group responses by phase_id
	const responsesByPhase: Record<string, Array<{
		stimulusId: string;
		responseData: Record<string, unknown>;
		createdAt: string;
		responseIndex: number;
	}>> = {};

	for (const r of responses ?? []) {
		if (!responsesByPhase[r.phase_id]) responsesByPhase[r.phase_id] = [];
		responsesByPhase[r.phase_id].push({
			stimulusId: r.stimulus_id,
			responseData: r.response_data ?? {},
			createdAt: r.created_at,
			responseIndex: r.response_index ?? 0
		});
	}

	return { participant, responsesByPhase };
}

export async function deleteParticipant(participantId: string) {
	const supabase = getServerSupabase();
	const { error } = await supabase.from('participants').delete().eq('id', participantId);
	if (error) { console.error('Failed to delete participant:', error); throw new Error('Failed to delete participant'); }
}

export async function resetParticipantResponses(participantId: string) {
	const supabase = getServerSupabase();
	const { error } = await supabase.from('responses').delete().eq('participant_id', participantId);
	if (error) { console.error('Failed to reset responses:', error); throw new Error('Failed to reset responses'); }
}

export async function deleteParticipants(participantIds: string[]) {
	if (participantIds.length === 0) return;
	const supabase = getServerSupabase();
	const { error } = await supabase.from('participants').delete().in('id', participantIds);
	if (error) { console.error('Failed to delete participants:', error); throw new Error('Failed to delete participants'); }
}

export async function getExperimentStats(experimentId: string) {
	const supabase = getServerSupabase();

	// TODO: replace with a DB-side aggregate when response volume grows large
	const { data: responses } = await supabase
		.from('responses')
		.select('phase_id, stimulus_id, participant_id')
		.eq('experiment_id', experimentId);

	const byPhase: Record<string, Set<string>> = {};
	const byStimulusCount: Record<string, number> = {};

	for (const r of responses ?? []) {
		if (!byPhase[r.phase_id]) byPhase[r.phase_id] = new Set();
		byPhase[r.phase_id].add(r.participant_id);
		byStimulusCount[r.stimulus_id] = (byStimulusCount[r.stimulus_id] || 0) + 1;
	}

	return {
		byPhase: Object.entries(byPhase).map(([phaseId, set]) => ({
			phaseId,
			participantsStarted: set.size
		})),
		byStimulusCount: Object.entries(byStimulusCount).map(([stimulusId, responseCount]) => ({
			stimulusId,
			responseCount
		})).sort((a, b) => a.responseCount - b.responseCount)
	};
}

export async function getChunkProgress(
	experimentId: string,
	chunks: Array<{ slug: string; blocks: Array<{ stimulusIds: string[] }> }>,
	minBreakMinutes?: number
): Promise<Map<string, Array<{ slug: string; complete: boolean; respondedCount: number; totalCount: number; completedAt: string | null; canStartNextAt: string | null }>>> {
	const supabase = getServerSupabase();
	const { data: responses } = await supabase
		.from('responses')
		.select('participant_id, stimulus_id, created_at')
		.eq('experiment_id', experimentId);

	// Build: participantId → Map<stimulusId, latest created_at>
	const byParticipant = new Map<string, Map<string, string>>();
	for (const r of responses ?? []) {
		if (!byParticipant.has(r.participant_id)) byParticipant.set(r.participant_id, new Map());
		const existing = byParticipant.get(r.participant_id)!.get(r.stimulus_id);
		if (!existing || r.created_at > existing) byParticipant.get(r.participant_id)!.set(r.stimulus_id, r.created_at);
	}

	const result = new Map<string, ReturnType<typeof getChunkProgress> extends Promise<Map<string, infer V>> ? V : never>();
	for (const [participantId, respondedAt] of byParticipant) {
		let prevCompletedAt: string | null = null;
		const progress = chunks.map((chunk) => {
			const allStimuli = chunk.blocks.flatMap((b) => b.stimulusIds);
			const responded = allStimuli.filter((id) => respondedAt.has(id));
			const complete = allStimuli.length > 0 && responded.length === allStimuli.length;
			const timestamps = responded.map((id) => respondedAt.get(id)!).filter(Boolean);
			const completedAt = complete && timestamps.length ? timestamps.sort().at(-1)! : null;
			const canStartNextAt = prevCompletedAt && minBreakMinutes
				? new Date(new Date(prevCompletedAt).getTime() + minBreakMinutes * 60 * 1000).toISOString()
				: null;
			if (complete && completedAt) prevCompletedAt = completedAt;
			return { slug: chunk.slug, complete, respondedCount: responded.length, totalCount: allStimuli.length, completedAt, canStartNextAt };
		});
		result.set(participantId, progress);
	}
	return result;
}

export async function getResponseData(experimentId: string) {
	const supabase = getServerSupabase();

	// Get the experiment slug first
	const { data: exp } = await supabase
		.from('experiments')
		.select('slug')
		.eq('id', experimentId)
		.single();

	if (!exp) throw new Error('Experiment not found');

	const { data, error } = await supabase
		.from('response_flat')
		.select('*')
		.eq('experiment_slug', exp.slug)
		.order('created_at', { ascending: true });

	if (error) { console.error('Failed to load response data:', error); throw new Error('Failed to load response data'); }

	// Fetch participant_id and registration_data for each unique participant email
	const emails = [...new Set((data || []).map((r) => r.participant_email as string))];
	const { data: participants } = await supabase
		.from('participants')
		.select('id, email, registration_data')
		.eq('experiment_id', experimentId)
		.in('email', emails);

	const participantMap: Record<string, { id: string; registration_data: Record<string, unknown> }> = {};
	for (const p of participants ?? []) {
		participantMap[p.email] = { id: p.id, registration_data: p.registration_data };
	}

	return (data || []).map((row) => ({
		...row,
		participant_id: participantMap[row.participant_email as string]?.id ?? null,
		registration_data: participantMap[row.participant_email as string]?.registration_data ?? null
	}));
}

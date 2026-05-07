import { getServerSupabase } from './supabase';
import { unwrap, unwrapVoid } from './db';
import { listAccessibleExperimentIds } from './collaborators';
import { ExperimentConfigSchema, type ExperimentConfig } from '$lib/config/schema';
import { resolveChunkOrder } from '$lib/utils';
import { isStimulusDoneInChunk } from '$lib/utils/response-data';

/**
 * Parse and validate raw JSONB config loaded from the database. Throws if it
 * fails — callers may catch and downgrade to a "needs migration" state, but
 * we never want to silently serve malformed configs to participants.
 *
 * Use this on EVERY read path (admin or participant) that returns config to
 * downstream code, not just on writes.
 */
export function parseStoredConfig(raw: unknown): ExperimentConfig {
	return ExperimentConfigSchema.parse(raw);
}

export async function listExperiments(adminUserId: string) {
	const supabase = getServerSupabase();
	const accessibleIds = await listAccessibleExperimentIds(adminUserId);
	if (accessibleIds.length === 0) return [];

	const experiments = unwrap(
		await supabase
			.from('experiments')
			.select('id, slug, status, config, created_at, updated_at')
			.in('id', accessibleIds)
			.order('created_at', { ascending: false }),
		'Failed to list experiments'
	);

	// Participant counts via the experiment_participant_counts view
	// (migration 020) — one aggregate scan instead of streaming every row.
	const { data: counts } = await supabase
		.from('experiment_participant_counts')
		.select('experiment_id, participant_count')
		.in('experiment_id', accessibleIds);

	const countMap: Record<string, number> = {};
	for (const row of counts ?? []) {
		countMap[row.experiment_id as string] = row.participant_count as number;
	}

	return experiments.map((exp) => ({
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

export async function createExperiment(
	slug: string,
	config: ExperimentConfig,
	createdBy: string
) {
	const supabase = getServerSupabase();
	// Re-validate the inbound config — defense-in-depth against any caller
	// that bypassed the schema.
	const validated = parseStoredConfig(config);
	const { data, error } = await supabase
		.from('experiments')
		.insert({ slug, config: validated, status: 'draft', created_by: createdBy })
		.select('id')
		.single();

	if (error) {
		// 23505 = Postgres unique_violation. The experiments.slug column is
		// UNIQUE — surface that cleanly so the admin sees "Slug already taken"
		// instead of the opaque "Failed to create experiment".
		if ((error as { code?: string }).code === '23505') {
			throw new Error(`Slug "${slug}" is already taken. Pick a different one.`);
		}
		console.error('Failed to create experiment:', error);
		throw new Error('Failed to create experiment');
	}
	return data;
}

export async function updateExperiment(
	id: string,
	updates: { config?: ExperimentConfig; status?: string; slug?: string }
) {
	if (updates.config !== undefined) parseStoredConfig(updates.config);
	const supabase = getServerSupabase();
	const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

	if (updates.config !== undefined) updateData.config = updates.config;
	if (updates.status !== undefined) updateData.status = updates.status;
	if (updates.slug !== undefined) updateData.slug = updates.slug;

	unwrapVoid(
		await supabase.from('experiments').update(updateData).eq('id', id),
		'Failed to update experiment'
	);
}

/**
 * Best-effort UI naming: probes `experiments.slug` until it finds an unused
 * value of the form `<base>`, `<base>-2`, `<base>-3`, ... The DB unique
 * constraint is the actual safety net — if a concurrent request grabs the
 * slug between probe and insert, the subsequent INSERT raises 23505 and the
 * caller surfaces "Slug already taken".
 */
async function findUniqueSlug(base: string): Promise<string> {
	const supabase = getServerSupabase();
	let candidate = base;
	let attempt = 1;
	while (true) {
		const { data } = await supabase.from('experiments').select('id').eq('slug', candidate).maybeSingle();
		if (!data) return candidate;
		attempt++;
		candidate = `${base}-${attempt}`;
	}
}

export async function duplicateExperiment(id: string, duplicatedBy: string) {
	const source = await getExperiment(id);
	if (!source) throw new Error('Experiment not found');

	const newSlug = await findUniqueSlug(`${source.slug}-copy`);

	// Validate the source config before copying — if it's a stale config that
	// no longer matches the current schema, fail loudly here rather than
	// silently producing a broken duplicate.
	const cloned = parseStoredConfig(structuredClone(source.config));
	cloned.slug = newSlug;
	return createExperiment(newSlug, cloned, duplicatedBy);
}

export async function deleteExperiment(id: string) {
	const supabase = getServerSupabase();
	unwrapVoid(
		await supabase.from('experiments').delete().eq('id', id),
		'Failed to delete experiment'
	);
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
	config: ExperimentConfig,
	options: { newSlug?: string; expectedUpdatedAt?: string } = {}
): Promise<{ versionNumber: number; updatedAt: string }> {
	parseStoredConfig(config);
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
	return unwrap(
		await supabase
			.from('experiment_config_versions')
			.select('id, version_number, created_at')
			.eq('experiment_id', experimentId)
			.order('version_number', { ascending: false }),
		'Failed to list config versions'
	);
}

export async function rollbackToVersion(
	experimentId: string,
	versionId: string,
	options: { expectedUpdatedAt?: string } = {}
) {
	const supabase = getServerSupabase();
	const { data: version, error } = await supabase
		.from('experiment_config_versions')
		.select('config')
		.eq('id', versionId)
		.eq('experiment_id', experimentId)
		.single();

	if (error || !version) throw new Error('Version not found');

	// Re-validate the historical config before re-publishing it. If the schema
	// has tightened since this version was saved, this will throw — the admin
	// can then run scripts/migrate-configs.js or roll back to a different
	// version instead of restoring a config that the runtime will reject.
	const validated = parseStoredConfig(version.config);
	// Pass through the caller's optimistic-lock timestamp so a rollback
	// issued against a stale view of the versions tab is rejected with
	// ConfigConflictError — same guarantee as a regular config save.
	await saveConfigWithVersion(experimentId, validated, {
		expectedUpdatedAt: options.expectedUpdatedAt
	});
}

export async function getParticipants(experimentId: string) {
	const supabase = getServerSupabase();
	const data = unwrap(
		await supabase
			.from('participants')
			.select('id, email, registration_data, registered_at')
			.eq('experiment_id', experimentId)
			.order('registered_at', { ascending: false }),
		'Failed to load participants'
	);

	// Response counts via participant_response_counts view (migration 020).
	// Scoped to just the participants we're about to return.
	const participantIds = data.map((p) => p.id);
	const countMap: Record<string, number> = {};
	if (participantIds.length) {
		const { data: counts } = await supabase
			.from('participant_response_counts')
			.select('participant_id, response_count')
			.in('participant_id', participantIds);
		for (const row of counts ?? []) {
			countMap[row.participant_id as string] = row.response_count as number;
		}
	}

	return data.map((p) => ({
		...p,
		responseCount: countMap[p.id] || 0
	}));
}

/**
 * Fetch participant detail. If `experimentId` is given, the participant must
 * belong to that experiment — otherwise this throws "Participant not found"
 * to avoid IDOR (admin A snooping participants from admin B's experiment by
 * guessing the UUID).
 */
export async function getParticipantDetail(participantId: string, experimentId?: string) {
	const supabase = getServerSupabase();

	let query = supabase
		.from('participants')
		.select('id, email, experiment_id, registration_data, registered_at')
		.eq('id', participantId);
	if (experimentId) query = query.eq('experiment_id', experimentId);
	const { data: participant, error: pErr } = await query.single();

	if (pErr || !participant) return null;

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

/**
 * Returns one row per chunk this participant has responded to, with start/end
 * timestamps and duration. Used to surface session timing on the admin
 * participant detail page (for payment tracking on multi-session studies).
 *
 * Pure compute over already-fetched `responses` rows — no DB calls. Each
 * response's chunk membership is resolved by looking up its stimulus_id in
 * the experiment config's `stimuli.chunking.chunks[].blocks[].stimulusIds`.
 * Caller is expected to pass the responses it already has from
 * `getParticipantDetail`, avoiding a duplicate `responses` SELECT per page hit.
 */
export function computeSessionTimings(
	config: unknown,
	responses: ReadonlyArray<{ stimulusId: string; responseData: Record<string, unknown>; createdAt: string }>
): Array<{
	chunkSlug: string;
	chunkLabel?: Record<string, string>;
	startedAt: string;
	endedAt: string;
	durationSeconds: number;
	responseCount: number;
}> {
	type Chunk = { id: string; slug: string; label?: Record<string, string>; blocks: Array<{ stimulusIds?: string[] }> };
	const chunks: Chunk[] = (config as { stimuli?: { chunking?: { chunks?: Chunk[] } } })?.stimuli?.chunking?.chunks ?? [];
	if (chunks.length === 0) return [];

	// Map stimulus_id → chunk_slug for non-anchor stimuli (each appears in
	// exactly one chunk). Anchors appear in MULTIPLE chunks, so the map's
	// last write wins — meaning we'd misattribute every anchor response. For
	// anchor responses, prefer the `_chunk` sentinel in response_data
	// instead. Legacy responses without `_chunk` fall through to the map.
	const validChunkSlugs = new Set(chunks.map((c) => c.slug));
	const stimulusToChunkSlug = new Map<string, string>();
	for (const c of chunks) {
		for (const b of c.blocks ?? []) {
			for (const id of b.stimulusIds ?? []) stimulusToChunkSlug.set(id, c.slug);
		}
	}

	const byChunk = new Map<string, { startedAt: string; endedAt: string; count: number }>();
	for (const r of responses) {
		const tagged = typeof r.responseData?._chunk === 'string' && validChunkSlugs.has(r.responseData._chunk) ? r.responseData._chunk : null;
		const slug = tagged ?? stimulusToChunkSlug.get(r.stimulusId);
		if (!slug) continue; // response references a stimulus not in any chunk (e.g. legacy)
		const existing = byChunk.get(slug);
		if (existing) {
			if (r.createdAt < existing.startedAt) existing.startedAt = r.createdAt;
			if (r.createdAt > existing.endedAt) existing.endedAt = r.createdAt;
			existing.count++;
		} else {
			byChunk.set(slug, { startedAt: r.createdAt, endedAt: r.createdAt, count: 1 });
		}
	}

	const labelBySlug = new Map(chunks.map((c) => [c.slug, c.label]));
	const out = [...byChunk.entries()].map(([chunkSlug, agg]) => ({
		chunkSlug,
		chunkLabel: labelBySlug.get(chunkSlug),
		startedAt: agg.startedAt,
		endedAt: agg.endedAt,
		durationSeconds: Math.max(
			0,
			Math.round((new Date(agg.endedAt).getTime() - new Date(agg.startedAt).getTime()) / 1000)
		),
		responseCount: agg.count
	}));
	out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
	return out;
}

// All three helpers below run under the service-role key, which bypasses RLS.
// The route-level requireExperimentAccess() gate authorizes the *caller* on
// a specific experiment, but the helpers themselves must re-bind their query
// to that same experiment — otherwise an editor on B can delete participants
// from A by submitting their UUIDs to /admin/experiments/B/data?/bulkDelete.

export async function deleteParticipant(experimentId: string, participantId: string) {
	const supabase = getServerSupabase();
	unwrapVoid(
		await supabase
			.from('participants')
			.delete()
			.eq('id', participantId)
			.eq('experiment_id', experimentId),
		'Failed to delete participant'
	);
}

export async function resetParticipantResponses(experimentId: string, participantId: string) {
	const supabase = getServerSupabase();
	// Verify the participant belongs to the experiment before nuking their
	// responses. Doing this as a guard rather than a join-on-delete because
	// `responses` doesn't carry experiment_id directly — it's reachable via
	// participant_id, and an unscoped delete would obey only the (untrusted)
	// participantId from form data.
	const { data: owner, error: lookupErr } = await supabase
		.from('participants')
		.select('id')
		.eq('id', participantId)
		.eq('experiment_id', experimentId)
		.maybeSingle();
	if (lookupErr) { console.error('Failed to verify participant ownership:', lookupErr); throw new Error('Failed to reset responses'); }
	if (!owner) throw new Error('Participant not found');

	unwrapVoid(
		await supabase.from('responses').delete().eq('participant_id', participantId),
		'Failed to reset responses'
	);
}

export async function deleteParticipants(experimentId: string, participantIds: string[]) {
	if (participantIds.length === 0) return;
	const supabase = getServerSupabase();
	unwrapVoid(
		await supabase
			.from('participants')
			.delete()
			.in('id', participantIds)
			.eq('experiment_id', experimentId),
		'Failed to delete participants'
	);
}

export async function getExperimentStats(experimentId: string) {
	const supabase = getServerSupabase();

	// Aggregates via DB views (migration 020): phase_participant_counts and
	// stimulus_response_counts do the GROUP BY server-side so we only
	// transfer one row per phase / per stimulus instead of one per response.
	const [phaseResult, stimulusResult] = await Promise.all([
		supabase
			.from('phase_participant_counts')
			.select('phase_id, participants_started')
			.eq('experiment_id', experimentId),
		supabase
			.from('stimulus_response_counts')
			.select('stimulus_id, response_count')
			.eq('experiment_id', experimentId)
	]);

	return {
		byPhase: (phaseResult.data ?? []).map((row) => ({
			phaseId: row.phase_id as string,
			participantsStarted: row.participants_started as number
		})),
		byStimulusCount: (stimulusResult.data ?? [])
			.map((row) => ({
				stimulusId: row.stimulus_id as string,
				responseCount: row.response_count as number
			}))
			.sort((a, b) => a.responseCount - b.responseCount)
	};
}

type ChunkProgressEntry = { slug: string; complete: boolean; respondedCount: number; totalCount: number; completedAt: string | null };
type ChunkProgressResult = {
	progress: ChunkProgressEntry[];
	nextChunk: { slug: string; canStartAt: string | null } | null;
};

export async function getChunkProgress(
	experimentId: string,
	chunks: Array<{ slug: string; blocks: Array<{ stimulusIds: string[] }> }>,
	minBreakMinutes?: number,
	chunkOrder: 'sequential' | 'latin-square' | 'random-per-participant' = 'sequential',
	stimulusItems?: Array<{ id: string; isAnchor?: boolean }>
): Promise<Map<string, ChunkProgressResult>> {
	const supabase = getServerSupabase();

	// Bulk-rank participants by registration order ONCE — avoids the N×2 DB
	// calls that would result from looping `getParticipantIndex` per participant.
	const { data: rankedParticipants } = await supabase
		.from('participants')
		.select('id')
		.eq('experiment_id', experimentId)
		.order('registered_at', { ascending: true });
	const indexById = new Map<string, number>();
	for (let i = 0; i < (rankedParticipants ?? []).length; i++) {
		indexById.set(rankedParticipants![i].id, i);
	}

	const itemMap = new Map((stimulusItems ?? []).map((s) => [s.id, s]));

	const { data: responses } = await supabase
		.from('responses')
		.select('participant_id, stimulus_id, response_data, created_at')
		.eq('experiment_id', experimentId);

	// Group per-participant per-stimulus so the shared
	// `isStimulusDoneInChunk` helper can answer "is this anchor satisfied
	// for this chunk?" identically to the participant flow.
	type Resp = { stimulus_id: string; response_data: Record<string, unknown>; created_at: string };
	const byParticipant = new Map<string, { latestAtByStim: Map<string, string>; responsesByStim: Map<string, Resp[]> }>();
	for (const r of responses ?? []) {
		let state = byParticipant.get(r.participant_id);
		if (!state) {
			state = { latestAtByStim: new Map(), responsesByStim: new Map() };
			byParticipant.set(r.participant_id, state);
		}
		const existing = state.latestAtByStim.get(r.stimulus_id);
		if (!existing || r.created_at > existing) state.latestAtByStim.set(r.stimulus_id, r.created_at);
		if (!state.responsesByStim.has(r.stimulus_id)) state.responsesByStim.set(r.stimulus_id, []);
		state.responsesByStim.get(r.stimulus_id)!.push(r as Resp);
	}

	const result = new Map<string, ChunkProgressResult>();
	for (const [participantId, state] of byParticipant) {
		const { latestAtByStim, responsesByStim } = state;
		// `progress[]` stays in array order so the admin's per-chunk chip
		// display reads naturally (chunk-1, chunk-2, …) regardless of
		// participant rotation. Only `nextChunk` is computed per-participant.
		const progress: ChunkProgressEntry[] = chunks.map((chunk) => {
			const allStimuli = chunk.blocks.flatMap((b) => b.stimulusIds);
			const responded = allStimuli.filter((id) => {
				const stim = itemMap.get(id) ?? { id, isAnchor: false };
				return isStimulusDoneInChunk(stim, chunk.slug, responsesByStim.get(id) ?? []);
			});
			const complete = allStimuli.length > 0 && responded.length === allStimuli.length;
			const timestamps = responded.map((id) => latestAtByStim.get(id)!).filter(Boolean);
			const completedAt = complete && timestamps.length ? timestamps.sort().at(-1)! : null;
			return { slug: chunk.slug, complete, respondedCount: responded.length, totalCount: allStimuli.length, completedAt };
		});

		// Resolve this participant's chunk traversal order, then find their
		// first incomplete chunk + the wall-clock time they can start it.
		const orderedSlugs = resolveChunkOrder(
			chunks.map((c) => c.slug),
			chunkOrder,
			indexById.get(participantId) ?? 0,
			participantId
		);
		const progressBySlug = new Map(progress.map((p) => [p.slug, p]));
		let prevCompletedAt: string | null = null;
		let nextChunk: ChunkProgressResult['nextChunk'] = null;
		for (const slug of orderedSlugs) {
			const p = progressBySlug.get(slug);
			if (!p) continue;
			if (!p.complete) {
				const canStartAt = prevCompletedAt && minBreakMinutes
					? new Date(new Date(prevCompletedAt).getTime() + minBreakMinutes * 60 * 1000).toISOString()
					: null;
				nextChunk = { slug, canStartAt };
				break;
			}
			if (p.completedAt) prevCompletedAt = p.completedAt;
		}

		result.set(participantId, { progress, nextChunk });
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

	const data = unwrap(
		await supabase
			.from('response_flat')
			.select('*')
			.eq('experiment_slug', exp.slug)
			.order('created_at', { ascending: true }),
		'Failed to load response data'
	);

	// Fetch participant_id and registration_data for each unique participant email
	const emails = [...new Set(data.map((r) => r.participant_email as string))];
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

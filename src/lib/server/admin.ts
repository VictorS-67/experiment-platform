import { getServerSupabase } from './supabase';

export async function getAdminUser(userId: string) {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('admin_users')
		.select('user_id, role')
		.eq('user_id', userId)
		.single();

	if (error || !data) return null;
	return data;
}

export async function listExperiments() {
	const supabase = getServerSupabase();

	const { data: experiments, error } = await supabase
		.from('experiments')
		.select('id, slug, status, config, created_at, updated_at')
		.order('created_at', { ascending: false });

	if (error) throw new Error(`Failed to list experiments: ${error.message}`);

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

	if (error) throw new Error(`Failed to create experiment: ${error.message}`);
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

	if (error) throw new Error(`Failed to update experiment: ${error.message}`);
}

export async function deleteExperiment(id: string) {
	const supabase = getServerSupabase();
	const { error } = await supabase
		.from('experiments')
		.delete()
		.eq('id', id);

	if (error) throw new Error(`Failed to delete experiment: ${error.message}`);
}

export async function getParticipants(experimentId: string) {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('participants')
		.select('id, email, registration_data, registered_at')
		.eq('experiment_id', experimentId)
		.order('registered_at', { ascending: false });

	if (error) throw new Error(`Failed to load participants: ${error.message}`);

	// Get response counts per participant
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

	if (error) throw new Error(`Failed to load response data: ${error.message}`);
	return data || [];
}

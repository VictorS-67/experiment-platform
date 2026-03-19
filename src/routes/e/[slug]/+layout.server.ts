import type { LayoutServerLoad } from './$types';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { ExperimentConfigSchema } from '$lib/config/schema';
import { error } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ params }) => {
	const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	const { data, error: dbError } = await supabase
		.from('experiments')
		.select('id, slug, config')
		.eq('slug', params.slug)
		.eq('status', 'active')
		.single();

	if (dbError || !data) {
		error(404, 'Experiment not found or not currently active.');
	}

	// Validate config
	const result = ExperimentConfigSchema.safeParse(data.config);
	if (!result.success) {
		console.error('Invalid experiment config:', result.error.issues);
		error(500, 'Experiment configuration is invalid.');
	}

	return {
		experiment: {
			id: data.id,
			slug: data.slug,
			config: result.data
		}
	};
};

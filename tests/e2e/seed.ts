import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ExperimentConfig } from '$lib/config/schema';
import fullFeatureConfig from './fixtures/full-feature-config.json' with { type: 'json' };

/**
 * Seed helper for P-series specs. Inserts a full experiment row using the
 * service role so tests don't rely on the admin-facing UI to bootstrap state.
 *
 * The caller is responsible for cleanup (either `supabase.from('experiments').delete().eq('id', id)`
 * or returning the id via the per-test fixture tracker).
 */
export async function seedExperiment(
	config: Record<string, unknown>,
	opts: { status?: 'active' | 'draft' | 'paused' | 'archived'; supabase?: SupabaseClient } = {}
) {
	const supabase =
		opts.supabase ??
		createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
	const { data, error } = await supabase
		.from('experiments')
		.insert({ slug: config.slug, config, status: opts.status ?? 'active' })
		.select('id')
		.single();
	if (error) throw error;
	return { id: data.id as string, slug: config.slug as string };
}

/** Returns a clone of the canonical full-feature config with a unique slug suffix.
 *  Typed as ExperimentConfig so specs can access known fields without casts.
 *  The JSON is validated by a vitest unit test; if it drifts from the schema
 *  that test fails fast rather than letting typed access hide the drift. */
export function makeFullFeatureConfig(suffix: string): ExperimentConfig & { slug: string } {
	const clone = JSON.parse(JSON.stringify(fullFeatureConfig)) as ExperimentConfig & { slug: string };
	clone.slug = `${clone.slug}-${suffix}`;
	return clone;
}

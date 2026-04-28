import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Async iterator that pages through a Supabase query in fixed-size batches.
 * Used by export / backup endpoints so they don't pull the entire table into
 * memory (and don't blow past Vercel's response-size cap) for large
 * experiments.
 *
 * Usage:
 *   const supabase = getServerSupabase();
 *   for await (const batch of paginate(supabase.from('responses').select('*').eq('experiment_id', id))) {
 *     for (const row of batch) controller.enqueue(JSON.stringify(row));
 *   }
 *
 * NOTE: the query object passed in must be a fresh one per call — Supabase
 * query builders are mutable and calling .range() twice on the same instance
 * will layer the ranges.
 */
export async function* paginate<T = Record<string, unknown>>(
	supabase: SupabaseClient,
	table: string,
	select: string,
	filters: Array<[string, unknown]> = [],
	batchSize = 500
): AsyncGenerator<T[]> {
	let offset = 0;
	while (true) {
		let query = supabase.from(table).select(select);
		for (const [col, val] of filters) {
			query = query.eq(col, val);
		}
		const { data, error } = await query.range(offset, offset + batchSize - 1);
		if (error) throw error;
		if (!data || data.length === 0) return;
		yield data as T[];
		if (data.length < batchSize) return;
		offset += batchSize;
	}
}

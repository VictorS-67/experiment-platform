import { getServerSupabase } from './supabase';

/**
 * Postgres-backed rate limiter (migration 016).
 *
 * Returns true if the request is allowed (and increments the count atomically),
 * false if the caller should reject with 429. Replaces the in-memory limiter
 * in hooks.server.ts that lost state on every Vercel cold start.
 *
 * If the DB is unreachable we fail open (return true) and log the error —
 * blocking all traffic on a transient DB hiccup is worse than the rate-limit
 * miss. The caller still gets defense-in-depth from upstream protections
 * (Vercel platform-level limits, Supabase connection limits).
 */
export async function checkRateLimit(
	ip: string,
	endpoint: string,
	windowSeconds: number,
	maxRequests: number
): Promise<boolean> {
	const supabase = getServerSupabase();
	const { data, error } = await supabase.rpc('rate_limit_check', {
		p_ip: ip,
		p_endpoint: endpoint,
		p_window_seconds: windowSeconds,
		p_max_requests: maxRequests
	});

	if (error) {
		console.error('Rate limiter DB error (failing open):', error.message);
		return true;
	}
	return data === true;
}

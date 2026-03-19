import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

// Validate env vars at module load (fails fast on misconfiguration)
if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_URL.startsWith('https://')) {
	throw new Error(
		`Invalid PUBLIC_SUPABASE_URL: expected "https://..." URL, got "${PUBLIC_SUPABASE_URL || '(empty)'}"`
	);
}
if (!SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY.length < 20) {
	throw new Error('Missing or invalid SUPABASE_SERVICE_ROLE_KEY — check your .env file');
}

let client: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
	if (!client) {
		client = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	}
	return client;
}

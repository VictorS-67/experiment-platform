import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { getServerSupabase } from '$lib/server/supabase';
import { COOKIE_OPTIONS } from '$lib/server/cookies';

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required.' });
		}

		// Authenticate via Supabase Auth
		const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { data, error } = await supabase.auth.signInWithPassword({ email, password });

		if (error || !data.session) {
			return fail(401, { error: 'Invalid email or password.' });
		}

		// Check admin_users table
		const serverSupabase = getServerSupabase();
		const { data: adminRow } = await serverSupabase
			.from('admin_users')
			.select('role')
			.eq('user_id', data.user.id)
			.single();

		if (!adminRow) {
			// Sign out the session we just created — user is not an admin
			await supabase.auth.signOut();
			return fail(403, { error: 'You do not have admin access.' });
		}

		// Set auth cookies
		cookies.set('admin_access_token', data.session.access_token, {
			...COOKIE_OPTIONS,
			maxAge: 60 * 60 // 1 hour (matches JWT lifetime)
		});
		cookies.set('admin_refresh_token', data.session.refresh_token ?? '', {
			...COOKIE_OPTIONS,
			maxAge: 60 * 60 * 24 * 30 // 30 days
		});

		redirect(302, '/admin/experiments');
	},

	logout: async ({ cookies }) => {
		// Revoke the Supabase session server-side
		const accessToken = cookies.get('admin_access_token');
		if (accessToken) {
			try {
				const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
					global: { headers: { Authorization: `Bearer ${accessToken}` } }
				});
				await supabase.auth.signOut();
			} catch {
				// Best-effort — proceed with cookie deletion regardless
			}
		}

		cookies.delete('admin_access_token', { path: '/' });
		cookies.delete('admin_refresh_token', { path: '/' });
		redirect(302, '/admin/login');
	}
};

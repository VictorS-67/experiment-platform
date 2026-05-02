import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const actions: Actions = {
	default: async ({ request, url }) => {
		const formData = await request.formData();
		const email = (formData.get('email') as string | null)?.trim() ?? '';

		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Please enter a valid email address.' });
		}

		// We use the anon client so this endpoint behaves like a public form.
		// The action exists primarily as a CSRF-safe wrapper around
		// `resetPasswordForEmail`; nothing else here needs server privileges.
		const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { error } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${url.origin}/admin/reset-password`
		});

		// We DON'T surface "no such user" to the form. Returning the same
		// success message regardless of whether the email exists prevents
		// account enumeration via this endpoint.
		if (error) {
			console.warn('resetPasswordForEmail failed (silent to user):', error.message);
		}

		return {
			success: true,
			message:
				'If that email is registered as an admin, a password-reset link has been sent. Check your inbox (and spam folder).'
		};
	}
};

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { createClient, type SupabaseClient } from '@supabase/supabase-js';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

	// Recovery flow lands here after the user clicks the password-reset email
	// link. Supabase's hosted magic-link handler sets the session and bounces
	// to redirectTo with `#access_token=...&refresh_token=...&type=recovery`.
	// The hash never reaches the server, so this whole page is client-side:
	// parse the hash, hand the tokens to a per-page Supabase client, then
	// updateUser({ password }). On success we redirect to /admin/login with
	// a success flag — the user signs in normally with the new password.
	//
	// Note: this client is throwaway. We don't want to mutate any global
	// admin session because the user may not yet have one (recovery flow
	// for an invitee who never set a password before).
	let supabase = $state<SupabaseClient | null>(null);
	let phase = $state<'loading' | 'ready' | 'submitting' | 'success' | 'error'>('loading');
	let errorMessage = $state<string | null>(null);

	let password = $state('');
	let passwordConfirm = $state('');
	let passwordError = $state<string | null>(null);

	onMount(async () => {
		const hash = window.location.hash.startsWith('#')
			? window.location.hash.slice(1)
			: window.location.hash;
		const params = new URLSearchParams(hash);
		const accessToken = params.get('access_token');
		const refreshToken = params.get('refresh_token');
		const type = params.get('type');

		if (!accessToken || !refreshToken) {
			phase = 'error';
			errorMessage =
				'This page requires a recovery link from your email. If you arrived here directly, request a new password-reset link from the forgot-password page.';
			return;
		}
		if (type && type !== 'recovery') {
			phase = 'error';
			errorMessage = 'Unexpected link type. Please request a new password-reset link.';
			return;
		}

		// `persistSession: false` is critical: this is a recovery session,
		// short-lived, and we sign out at the end. Default localStorage
		// persistence would leave a `sb-...-auth-token` entry behind if the
		// user navigates away mid-flow — accessible to any script on the
		// origin until it naturally expires.
		supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
			auth: { persistSession: false }
		});
		const { error: setErr } = await supabase.auth.setSession({
			access_token: accessToken,
			refresh_token: refreshToken
		});
		if (setErr) {
			phase = 'error';
			errorMessage = `Could not validate the recovery link: ${setErr.message}. It may have expired — request a new one.`;
			return;
		}

		// Hide the tokens from the URL bar — they're sensitive and don't need
		// to survive a refresh (the session is already in memory).
		history.replaceState(
			null,
			'',
			window.location.pathname + window.location.search
		);

		phase = 'ready';
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		passwordError = null;
		if (password.length < 8) {
			passwordError = 'Password must be at least 8 characters.';
			return;
		}
		if (password !== passwordConfirm) {
			passwordError = 'Passwords do not match.';
			return;
		}
		if (!supabase) return;

		phase = 'submitting';
		const { error: updateErr } = await supabase.auth.updateUser({ password });
		if (updateErr) {
			passwordError = `Could not update password: ${updateErr.message}`;
			phase = 'ready';
			return;
		}

		// Done — sign out the recovery session so the user lands on /admin/login
		// fresh (and forces them to log in with the new password, which is
		// also what tells our server to mint admin cookies).
		await supabase.auth.signOut();
		phase = 'success';
		setTimeout(() => goto('/admin/login?reset=success'), 800);
	}
</script>

<svelte:head>
	<title>Set New Password — Admin</title>
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<main class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
	<div class="w-full max-w-sm">
		<h1 class="text-2xl font-semibold text-center mb-8 text-gray-800">Set New Password</h1>

		{#if phase === 'loading'}
			<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-sm text-gray-600">
				Validating recovery link...
			</div>
		{:else if phase === 'error'}
			<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
				{errorMessage}
			</div>
			<p class="text-sm text-gray-600 text-center">
				<a href="/admin/forgot-password" class="text-indigo-600 hover:underline">Request a new link</a>
			</p>
		{:else if phase === 'success'}
			<div class="bg-green-50 border border-green-200 rounded p-6 text-sm text-green-800">
				Password updated. Redirecting to sign in...
			</div>
		{:else}
			{#if passwordError}
				<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
					{passwordError}
				</div>
			{/if}
			<form
				onsubmit={handleSubmit}
				class="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
			>
				<div class="mb-4">
					<label for="password" class="block text-sm font-medium text-gray-700 mb-1">New password</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						required
						minlength="8"
						class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
					/>
					<p class="text-xs text-gray-500 mt-1">At least 8 characters.</p>
				</div>

				<div class="mb-6">
					<label for="passwordConfirm" class="block text-sm font-medium text-gray-700 mb-1">Confirm</label>
					<input
						type="password"
						id="passwordConfirm"
						bind:value={passwordConfirm}
						required
						class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
					/>
				</div>

				<button
					type="submit"
					disabled={phase === 'submitting'}
					class="w-full bg-indigo-600 text-white py-2 px-4 rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
				>
					{phase === 'submitting' ? 'Updating...' : 'Update password'}
				</button>
			</form>
		{/if}
	</div>
</main>

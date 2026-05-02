<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { createClient, type SupabaseClient } from '@supabase/supabase-js';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

	// Two flows land here, both via the same fragment-tokens contract:
	//   1. Password recovery (`type=recovery`) — user clicked Forgot Password.
	//   2. Invite acceptance (`type=invite`) — Supabase's hosted invite
	//      handler bounces here from /admin/login when type=invite is in
	//      the fragment (the login page short-circuits and forwards us
	//      with the original ?claim= preserved as a query param).
	// Either way: parse fragment → setSession on a throwaway client →
	// updateUser({ password }) → signOut → bounce to /admin/login. When a
	// ?claim= is present, the bounce includes it so claimInvitesForUser
	// runs on the next sign-in.
	//
	// Note: this client is throwaway. We don't want to mutate any global
	// admin session because the user may not yet have one (invite-acceptance
	// flow for someone who hasn't logged in before).
	let supabase = $state<SupabaseClient | null>(null);
	let phase = $state<'loading' | 'ready' | 'submitting' | 'success' | 'error'>('loading');
	let errorMessage = $state<string | null>(null);
	// `flowType` drives the heading + button copy. Set by onMount once the
	// fragment is parsed.
	let flowType = $state<'invite' | 'recovery'>('recovery');
	// Preserve the claim token across the bounce-back to /admin/login so the
	// next sign-in claims the invite. Captured in onMount.
	let claimToken = $state<string | null>(null);

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

		// Capture the claim token from the search params (set by the
		// /admin/login → /admin/reset-password forward in the invite flow).
		claimToken = new URLSearchParams(window.location.search).get('claim');

		if (!accessToken || !refreshToken) {
			phase = 'error';
			errorMessage =
				'This page requires a link from your email. If you arrived here directly, request a new link from the forgot-password page.';
			return;
		}
		if (type && type !== 'recovery' && type !== 'invite') {
			phase = 'error';
			errorMessage = 'Unexpected link type. Please request a new link.';
			return;
		}
		flowType = type === 'invite' ? 'invite' : 'recovery';

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
		// also what tells our server to mint admin cookies). When we got
		// here from an invite forward, preserve the claim token so the
		// next sign-in's claimInvitesForUser can match it (and the login
		// page can show the right banner).
		await supabase.auth.signOut();
		phase = 'success';
		const dest = claimToken
			? `/admin/login?claim=${encodeURIComponent(claimToken)}&reset=success`
			: '/admin/login?reset=success';
		setTimeout(() => goto(dest), 800);
	}
</script>

<svelte:head>
	<title>{flowType === 'invite' ? 'Welcome — Set Your Password' : 'Set New Password'} — Admin</title>
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<main class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
	<div class="w-full max-w-sm">
		<h1 class="text-2xl font-semibold text-center mb-2 text-gray-800">
			{flowType === 'invite' ? 'Welcome — set your password' : 'Set new password'}
		</h1>
		{#if flowType === 'invite'}
			<p class="text-sm text-gray-600 text-center mb-6">
				Choose a password for your new admin account. You'll use it to sign in.
			</p>
		{:else}
			<div class="mb-6"></div>
		{/if}

		{#if phase === 'loading'}
			<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-sm text-gray-600">
				Validating link...
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
				{flowType === 'invite' ? 'Password set. Redirecting to sign in...' : 'Password updated. Redirecting to sign in...'}
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
					<label for="password" class="block text-sm font-medium text-gray-700 mb-1">
						{flowType === 'invite' ? 'Password' : 'New password'}
					</label>
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
					{#if phase === 'submitting'}
						{flowType === 'invite' ? 'Setting...' : 'Updating...'}
					{:else}
						{flowType === 'invite' ? 'Set password & continue' : 'Update password'}
					{/if}
				</button>
			</form>
		{/if}
	</div>
</main>

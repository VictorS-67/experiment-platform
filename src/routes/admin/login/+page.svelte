<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';

	let { form } = $props();

	let loading = $state(false);

	// Three banner states the page surfaces from URL state:
	//
	// 1. `#error=...` fragment — Supabase Auth bounces here when an OTP
	//    expires or any other auth flow fails. The fragment never reaches the
	//    server, so the banner is parsed client-side on mount and the URL
	//    cleaned via history.replaceState so a refresh doesn't re-show.
	// 2. `?claim=<uuid>` query param — invitee is mid-claim. We acknowledge
	//    that they're in an invite flow so they don't wonder why they're on
	//    a generic login page.
	// 3. `?reset=success` query param — set by /admin/reset-password after a
	//    successful password update.
	let errorBanner = $state<string | null>(null);
	let infoBanner = $state<string | null>(null);
	let successBanner = $state<string | null>(null);

	function humanizeAuthError(code: string | null, description: string | null): string {
		if (code === 'otp_expired' || description?.toLowerCase().includes('expired')) {
			return 'This email invitation link has expired. Ask the inviter to resend it from their experiment Settings → Collaborators panel.';
		}
		if (code === 'access_denied') {
			return 'The invitation link could not be validated. Ask the inviter to resend it.';
		}
		return description ?? 'Something went wrong with the auth flow. Please try again.';
	}

	onMount(() => {
		// 1. Auth-error fragment
		const hash = window.location.hash.startsWith('#')
			? window.location.hash.slice(1)
			: window.location.hash;
		if (hash) {
			const params = new URLSearchParams(hash);
			const errCode = params.get('error_code') ?? params.get('error');
			const errDescRaw = params.get('error_description');
			const errDesc = errDescRaw ? errDescRaw.replace(/\+/g, ' ') : null;
			if (errCode || errDesc) {
				errorBanner = humanizeAuthError(errCode, errDesc);
				history.replaceState(null, '', window.location.pathname + window.location.search);
			}
		}
		const search = new URLSearchParams(window.location.search);
		// 2. ?claim=
		if (search.has('claim')) {
			infoBanner =
				"You've been invited as a collaborator. Sign in to accept (or use the link in your invitation email to set a password first).";
		}
		// 3. ?reset=success
		if (search.get('reset') === 'success') {
			successBanner = 'Password updated. Sign in below with your new password.';
		}
	});
</script>

<svelte:head>
	<title>Admin Login</title>
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<main class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
	<div class="w-full max-w-sm">
		<h1 class="text-2xl font-semibold text-center mb-8 text-gray-800">Admin Login</h1>

		{#if errorBanner}
			<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-start gap-2">
				<span class="flex-1">{errorBanner}</span>
				<button
					type="button"
					onclick={() => (errorBanner = null)}
					aria-label="Dismiss"
					class="text-red-500 hover:text-red-700 cursor-pointer"
				>×</button>
			</div>
		{/if}

		{#if successBanner}
			<div class="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
				{successBanner}
			</div>
		{/if}

		{#if infoBanner}
			<div class="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded text-sm text-indigo-800">
				{infoBanner}
			</div>
		{/if}

		{#if form?.error}
			<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
				{form.error}
			</div>
		{/if}

		<form
			method="POST"
			action="?/login"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					await update({ reset: false });
					loading = false;
				};
			}}
			class="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
		>
			<div class="mb-4">
				<label for="email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
				<input
					type="email"
					id="email"
					name="email"
					required
					class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
					placeholder="admin@example.com"
				/>
			</div>

			<div class="mb-6">
				<label for="password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
				<input
					type="password"
					id="password"
					name="password"
					required
					class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full bg-indigo-600 text-white py-2 px-4 rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
			>
				{loading ? 'Signing in...' : 'Sign In'}
			</button>

			<p class="mt-4 text-sm text-center">
				<a href="/admin/forgot-password" class="text-indigo-600 hover:underline">Forgot password?</a>
			</p>
		</form>
	</div>
</main>

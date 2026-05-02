<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Forgot Password — Admin</title>
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<main class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
	<div class="w-full max-w-sm">
		<h1 class="text-2xl font-semibold text-center mb-8 text-gray-800">Forgot Password</h1>

		{#if form?.error}
			<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
				{form.error}
			</div>
		{/if}

		{#if form?.success}
			<div class="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
				{form.message}
			</div>
			<p class="text-sm text-gray-600 text-center">
				<a href="/admin/login" class="text-indigo-600 hover:underline">Back to sign in</a>
			</p>
		{:else}
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update({ reset: false });
						loading = false;
					};
				}}
				class="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
			>
				<p class="text-sm text-gray-600 mb-4">
					Enter your admin email and we'll send a link to reset your password.
				</p>
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

				<button
					type="submit"
					disabled={loading}
					class="w-full bg-indigo-600 text-white py-2 px-4 rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
				>
					{loading ? 'Sending...' : 'Send reset link'}
				</button>

				<p class="mt-4 text-sm text-center text-gray-500">
					<a href="/admin/login" class="text-indigo-600 hover:underline">Back to sign in</a>
				</p>
			</form>
		{/if}
	</div>
</main>

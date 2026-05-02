<script lang="ts">
	import { enhance } from '$app/forms';
	import { withLoadingFlag } from '$lib/utils/enhance';

	let { form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>New Experiment - Admin</title>
</svelte:head>

<div class="p-8 max-w-2xl">
	<div class="mb-6">
		<a href="/admin/experiments" class="text-sm text-gray-500 hover:text-gray-700">&larr; Back to experiments</a>
	</div>

	<h1 class="text-2xl font-semibold text-gray-800 mb-6">New Experiment</h1>

	{#if form?.error}
		<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
			{form.error}
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={withLoadingFlag((v) => (loading = v))}
		class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4"
	>
		<div>
			<label for="slug" class="block text-sm font-medium text-gray-700 mb-1">Slug</label>
			<input
				type="text"
				id="slug"
				name="slug"
				required
				pattern="[a-z0-9\-]+"
				class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
				placeholder="my-experiment"
			/>
			<p class="mt-1 text-xs text-gray-400">Lowercase letters, numbers, and hyphens. Used in the URL: /e/your-slug/</p>
		</div>

		<div>
			<label for="title_en" class="block text-sm font-medium text-gray-700 mb-1">Title (English)</label>
			<input
				type="text"
				id="title_en"
				name="title_en"
				required
				class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
				placeholder="My Experiment Study"
			/>
		</div>

		<div>
			<label for="title_ja" class="block text-sm font-medium text-gray-700 mb-1">Title (Japanese) <span class="text-gray-400 font-normal">— optional</span></label>
			<input
				type="text"
				id="title_ja"
				name="title_ja"
				class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
			/>
		</div>

		<div>
			<label for="description_en" class="block text-sm font-medium text-gray-700 mb-1">Description <span class="text-gray-400 font-normal">— optional</span></label>
			<textarea
				id="description_en"
				name="description_en"
				rows="2"
				class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
				placeholder="A brief description of the experiment..."
			></textarea>
		</div>

		<div class="pt-2">
			<button
				type="submit"
				disabled={loading}
				class="bg-indigo-600 text-white px-6 py-2 rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
			>
				{loading ? 'Creating...' : 'Create Experiment'}
			</button>
		</div>
	</form>
</div>

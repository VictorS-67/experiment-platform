<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let duplicating = $state(false);

	let toast = $state<{ type: 'success' | 'error'; message: string } | null>(null);

	function showToast(type: 'success' | 'error', message: string) {
		toast = { type, message };
		setTimeout(() => (toast = null), 3000);
	}

	$effect(() => {
		if (form?.error) showToast('error', form.error);
	});

	function getTitle(config: Record<string, unknown>): string {
		const meta = config?.metadata as Record<string, unknown> | undefined;
		const title = meta?.title as Record<string, string> | undefined;
		return title?.en || title?.ja || Object.values(title || {})[0] || 'Untitled';
	}

	const statusColors: Record<string, string> = {
		draft: 'bg-gray-100 text-gray-700',
		active: 'bg-green-100 text-green-700',
		paused: 'bg-yellow-100 text-yellow-700',
		archived: 'bg-red-100 text-red-700'
	};
</script>

<svelte:head>
	<title>{getTitle(data.experiment.config)} - Admin</title>
</svelte:head>

{#if toast}
	<div class="mb-4 p-3 rounded text-sm {toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}">
		<pre class="whitespace-pre-wrap font-sans">{toast.message}</pre>
	</div>
{/if}

<div class="max-w-4xl">
	<!-- Header -->
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-semibold text-gray-800">{getTitle(data.experiment.config)}</h1>
			<div class="flex items-center gap-2 mt-1">
				<code class="bg-gray-100 px-1.5 py-0.5 rounded text-xs text-gray-600">{data.experiment.slug}</code>
				<span class="px-2 py-0.5 rounded-full text-xs font-medium {statusColors[data.experiment.status] || 'bg-gray-100 text-gray-700'}">
					{data.experiment.status}
				</span>
			</div>
		</div>
		<form
			method="POST"
			action="?/duplicate"
			use:enhance={() => {
				duplicating = true;
				return async ({ update }) => {
					await update({ reset: false });
					duplicating = false;
				};
			}}
		>
			<button
				type="submit"
				disabled={duplicating}
				class="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-gray-700 cursor-pointer disabled:opacity-50"
			>
				{duplicating ? 'Duplicating...' : 'Duplicate'}
			</button>
		</form>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-3 gap-4 mb-6">
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
			<dt class="text-sm text-gray-500">Participants</dt>
			<dd class="text-2xl font-semibold text-gray-800 mt-1">{data.participantCount}</dd>
		</div>
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
			<dt class="text-sm text-gray-500">Phases</dt>
			<dd class="text-2xl font-semibold text-gray-800 mt-1">{data.experiment.config?.phases?.length ?? 0}</dd>
		</div>
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
			<dt class="text-sm text-gray-500">Stimuli</dt>
			<dd class="text-2xl font-semibold text-gray-800 mt-1">{data.experiment.config?.stimuli?.items?.length ?? 0}</dd>
		</div>
	</div>

	<!-- Details -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
		<h2 class="text-base font-medium text-gray-800 mb-4">Details</h2>
		<dl class="grid grid-cols-2 gap-4 text-sm">
			<div>
				<dt class="text-gray-500">ID</dt>
				<dd class="text-gray-800 font-mono text-xs mt-1">{data.experiment.id}</dd>
			</div>
			<div>
				<dt class="text-gray-500">Slug</dt>
				<dd class="text-gray-800 mt-1">{data.experiment.slug}</dd>
			</div>
			<div>
				<dt class="text-gray-500">Created</dt>
				<dd class="text-gray-800 mt-1">{new Date(data.experiment.created_at).toLocaleString()}</dd>
			</div>
			<div>
				<dt class="text-gray-500">Updated</dt>
				<dd class="text-gray-800 mt-1">{data.experiment.updated_at ? new Date(data.experiment.updated_at).toLocaleString() : '—'}</dd>
			</div>
		</dl>
	</div>

	<!-- Quick Links -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
		<h2 class="text-base font-medium text-gray-800 mb-4">Quick Links</h2>
		<div class="flex flex-wrap gap-3">
			<a
				href="/e/{data.experiment.slug}"
				target="_blank"
				class="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-gray-700"
			>
				View Live ↗
			</a>
			<a
				href="/admin/experiments/{data.experiment.id}/data"
				class="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-gray-700"
			>
				View Data
			</a>
			<a
				href="/admin/experiments/{data.experiment.id}/config"
				class="text-sm px-4 py-2 border border-indigo-300 rounded hover:bg-indigo-50 transition-colors text-indigo-700"
			>
				Edit Config
			</a>
		</div>
	</div>
</div>

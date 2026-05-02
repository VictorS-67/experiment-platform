<script lang="ts">
	import { enhance } from '$app/forms';
	import Toast from '$lib/components/admin/Toast.svelte';
	import { ToastState } from '$lib/utils/toast.svelte';
	import { withLoadingFlag } from '$lib/utils/enhance';
	import { configTitle, STATUS_COLORS, type ExperimentStatus } from '$lib/utils/admin-display';
	import { formatDateTime } from '$lib/utils/format-date';

	let { data, form } = $props();

	let duplicating = $state(false);
	const toast = new ToastState();

	$effect(() => {
		if (form?.error) toast.show('error', form.error);
	});
</script>

<svelte:head>
	<title>{configTitle(data.experiment.config)} - Admin</title>
</svelte:head>

<Toast toast={toast.current} />

<div class="max-w-4xl">
	<!-- Header -->
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-semibold text-gray-800">{configTitle(data.experiment.config)}</h1>
			<div class="flex items-center gap-2 mt-1">
				<code class="bg-gray-100 px-1.5 py-0.5 rounded text-xs text-gray-600">{data.experiment.slug}</code>
				<span class="px-2 py-0.5 rounded-full text-xs font-medium {STATUS_COLORS[data.experiment.status as ExperimentStatus] ?? 'bg-gray-100 text-gray-700'}">
					{data.experiment.status}
				</span>
			</div>
		</div>
		<form
			method="POST"
			action="?/duplicate"
			use:enhance={withLoadingFlag((v) => (duplicating = v))}
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
				<dd class="text-gray-800 mt-1">{formatDateTime(data.experiment.created_at)}</dd>
			</div>
			<div>
				<dt class="text-gray-500">Updated</dt>
				<dd class="text-gray-800 mt-1">{data.experiment.updated_at ? formatDateTime(data.experiment.updated_at) : '—'}</dd>
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

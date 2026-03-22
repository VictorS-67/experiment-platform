<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/layout/Modal.svelte';

	let { data, form } = $props();

	let resetting = $state(false);
	let deleting = $state(false);
	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');
	let showResetConfirm = $state(false);
	let resetConfirmText = $state('');

	let toast = $state<{ type: 'success' | 'error'; message: string } | null>(null);

	$effect(() => {
		if (form?.success && form?.reset) {
			toast = { type: 'success', message: 'Responses reset. Participant can redo the experiment.' };
			setTimeout(() => (toast = null), 4000);
		} else if (form?.error) {
			toast = { type: 'error', message: form.error };
			setTimeout(() => (toast = null), 4000);
		}
	});

	function getTitle(config: Record<string, unknown>): string {
		const meta = config?.metadata as Record<string, unknown> | undefined;
		const title = meta?.title as Record<string, string> | undefined;
		return title?.en || title?.ja || Object.values(title || {})[0] || 'Untitled';
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString('en-US', {
			year: 'numeric', month: 'short', day: 'numeric',
			hour: '2-digit', minute: '2-digit'
		});
	}

	// Get human-readable name from registration data
	function getName(): string {
		const rd = data.participant.registration_data as Record<string, unknown> | null;
		if (!rd) return '—';
		return (rd.name as string) || '—';
	}

	// Resolve registration field labels from config
	let regFields = $derived(() => {
		const config = data.experiment.config as Record<string, unknown>;
		const reg = config?.registration as Record<string, unknown> | undefined;
		const fields = reg?.fields as Array<{ id: string; label: Record<string, string> }> | undefined;
		return fields ?? [];
	});

	function getLabel(obj: Record<string, string>): string {
		return obj?.en || obj?.ja || Object.values(obj || {})[0] || '';
	}

	// Resolve widget labels from config for a given phase
	function getPhaseWidgets(phaseId: string): Array<{ id: string; label: Record<string, string> }> {
		const config = data.experiment.config as Record<string, unknown>;
		const phases = config?.phases as Array<Record<string, unknown>> | undefined;
		const phase = phases?.find((p) => p.id === phaseId);
		if (!phase) return [];
		if (phase.type === 'review') {
			const rc = phase.reviewConfig as Record<string, unknown> | undefined;
			return (rc?.responseWidgets as Array<{ id: string; label: Record<string, string> }>) ?? [];
		}
		return (phase.responseWidgets as Array<{ id: string; label: Record<string, string> }>) ?? [];
	}

	function getPhaseName(phaseId: string): string {
		const config = data.experiment.config as Record<string, unknown>;
		const phases = config?.phases as Array<Record<string, unknown>> | undefined;
		const phase = phases?.find((p) => p.id === phaseId);
		if (!phase) return phaseId;
		const t = phase.title as Record<string, string> | undefined;
		return t?.en || t?.ja || Object.values(t || {})[0] || phaseId;
	}

	// Ordered phases from config
	let configPhases = $derived(() => {
		const config = data.experiment.config as Record<string, unknown>;
		const phases = config?.phases as Array<{ id: string }> | undefined;
		return phases ?? [];
	});
</script>

<svelte:head>
	<title>Participant {data.participant.email} - Admin</title>
</svelte:head>

<div class="p-8">
	<div class="mb-6">
		<a href="/admin/experiments/{data.experiment.id}/data" class="text-sm text-gray-500 hover:text-gray-700">&larr; Back to data</a>
	</div>

	{#if toast}
		<div class="mb-4 p-3 rounded text-sm {toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}">
			{toast.message}
		</div>
	{/if}

	<!-- Header -->
	<div class="flex items-start justify-between mb-6">
		<div>
			<h1 class="text-2xl font-semibold text-gray-800">{data.participant.email}</h1>
			<p class="text-sm text-gray-500 mt-1">
				{getName()} &middot; Registered {formatDate(data.participant.registered_at)}
			</p>
		</div>
		<div class="flex gap-2 items-center">
			<a
				href="/admin/experiments/{data.experiment.id}/data/export?participant={data.participant.id}&includeRegistration=true&style=research"
				class="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-gray-700"
			>
				Download CSV
			</a>
			<button
				type="button"
				onclick={() => { showResetConfirm = true; resetConfirmText = ''; }}
				class="text-sm px-4 py-2 border border-amber-300 text-amber-700 rounded hover:bg-amber-50 transition-colors cursor-pointer"
			>Reset Responses</button>
			<button
				type="button"
				onclick={() => { showDeleteConfirm = true; deleteConfirmText = ''; }}
				class="text-sm px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors cursor-pointer"
			>Delete</button>
		</div>
	</div>

	<!-- Registration Data -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
		<h2 class="text-lg font-medium text-gray-800 mb-4">Registration Data</h2>
		{#if data.participant.registration_data && Object.keys(data.participant.registration_data).length > 0}
			{@const rd = data.participant.registration_data as Record<string, unknown>}
			<dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
				{#each regFields() as field}
					{@const value = rd[field.id]}
					{#if value !== undefined}
						<div>
							<dt class="text-gray-500">{getLabel(field.label)}</dt>
							<dd class="text-gray-800 mt-0.5">{String(value)}</dd>
						</div>
					{/if}
				{/each}
				<!-- Show any keys not in config fields -->
				{#each Object.entries(rd) as [key, value]}
					{#if !regFields().some((f) => f.id === key)}
						<div>
							<dt class="text-gray-400 font-mono text-xs">{key}</dt>
							<dd class="text-gray-800 mt-0.5">{String(value)}</dd>
						</div>
					{/if}
				{/each}
			</dl>
		{:else}
			<p class="text-sm text-gray-500">No registration data.</p>
		{/if}
	</div>

	<!-- Responses by Phase -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
		<h2 class="text-lg font-medium text-gray-800 mb-4">Responses</h2>
		{#if Object.keys(data.responsesByPhase).length === 0}
			<p class="text-sm text-gray-500">No responses recorded.</p>
		{:else}
			{#each configPhases() as phase}
				{@const phaseResponses = data.responsesByPhase[phase.id]}
				{#if phaseResponses && phaseResponses.length > 0}
					{@const widgets = getPhaseWidgets(phase.id)}
					<div class="mb-6">
						<h3 class="text-sm font-semibold text-gray-700 mb-3">{getPhaseName(phase.id)}</h3>
						<div class="space-y-2">
							{#each phaseResponses as response}
								<div class="border border-gray-100 rounded p-3 bg-gray-50">
									<div class="flex items-center justify-between mb-2">
										<span class="text-xs font-mono text-gray-500">{response.stimulusId}</span>
										<span class="text-xs text-gray-400">{formatDate(response.createdAt)}</span>
									</div>
									<dl class="space-y-1">
										{#each Object.entries(response.responseData) as [key, value]}
											{@const widget = widgets.find((w) => w.id === key)}
											<div class="flex gap-2 text-sm">
												<dt class="text-gray-500 shrink-0">{widget ? getLabel(widget.label) : key}:</dt>
												<dd class="text-gray-800">{String(value ?? '—')}</dd>
											</div>
										{/each}
									</dl>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		{/if}
	</div>
</div>

<!-- Reset Responses Modal -->
<Modal
	show={showResetConfirm}
	title="Reset Responses"
	onclose={() => { showResetConfirm = false; resetConfirmText = ''; }}
>
	<p class="text-sm text-gray-700 mb-4">This will delete all responses for this participant. They will be able to redo the experiment. Type <strong>reset data</strong> to confirm.</p>
	<input
		type="text"
		bind:value={resetConfirmText}
		placeholder="reset data"
		class="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
	/>
	<form method="POST" action="?/reset" use:enhance={() => {
		resetting = true;
		return async ({ update }) => { await update({ reset: false }); resetting = false; showResetConfirm = false; resetConfirmText = ''; };
	}}>
		<div class="flex gap-2 justify-end">
			<button type="button" onclick={() => { showResetConfirm = false; resetConfirmText = ''; }}
				class="text-sm px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 cursor-pointer">Cancel</button>
			<button type="submit"
				disabled={resetConfirmText !== 'reset data' || resetting}
				class="text-sm px-4 py-2 border border-amber-400 bg-amber-50 text-amber-800 rounded hover:bg-amber-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
				{resetting ? 'Resetting...' : 'Reset Responses'}
			</button>
		</div>
	</form>
</Modal>

<!-- Delete Participant Modal -->
<Modal
	show={showDeleteConfirm}
	title="Delete User"
	onclose={() => { showDeleteConfirm = false; deleteConfirmText = ''; }}
>
	<p class="text-sm text-gray-700 mb-4">This will permanently delete this participant and all their data. Type <strong>delete user</strong> to confirm.</p>
	<input
		type="text"
		bind:value={deleteConfirmText}
		placeholder="delete user"
		class="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
	/>
	<form method="POST" action="?/delete" use:enhance={() => {
		deleting = true;
		return async ({ update }) => { await update({ reset: false }); deleting = false; };
	}}>
		<div class="flex gap-2 justify-end">
			<button type="button" onclick={() => { showDeleteConfirm = false; deleteConfirmText = ''; }}
				class="text-sm px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 cursor-pointer">Cancel</button>
			<button type="submit"
				disabled={deleteConfirmText !== 'delete user' || deleting}
				class="text-sm px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
				{deleting ? 'Deleting...' : 'Delete User'}
			</button>
		</div>
	</form>
</Modal>

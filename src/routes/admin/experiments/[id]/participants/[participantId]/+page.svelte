<script lang="ts">
	import Toast from '$lib/components/admin/Toast.svelte';
	import ConfirmationModal from '$lib/components/admin/ConfirmationModal.svelte';
	import { isAudioPath } from '$lib/utils/response-data';
	import { ToastState } from '$lib/utils/toast.svelte';
	import { withLoadingFlag } from '$lib/utils/enhance';
	import { localized, participantName } from '$lib/utils/admin-display';
	import { formatDateTime } from '$lib/utils/format-date';

	let { data, form } = $props();

	let resetting = $state(false);
	let deleting = $state(false);
	let showDeleteConfirm = $state(false);
	let showResetConfirm = $state(false);

	const toast = new ToastState();

	$effect(() => {
		if (form?.success && form?.reset) {
			toast.show('success', 'Responses reset. Participant can redo the experiment.', 4000);
		} else if (form?.error) {
			toast.show('error', form.error, 4000);
		}
	});

	// Resolve registration field labels from config
	let regFields = $derived(() => {
		const config = data.experiment.config as Record<string, unknown>;
		const reg = config?.registration as Record<string, unknown> | undefined;
		const fields = reg?.fields as Array<{ id: string; label: Record<string, string> }> | undefined;
		return fields ?? [];
	});

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

	<Toast toast={toast.current} />

	<!-- Header -->
	<div class="flex items-start justify-between mb-6">
		<div>
			<h1 class="text-2xl font-semibold text-gray-800">{data.participant.email}</h1>
			<p class="text-sm text-gray-500 mt-1">
				{participantName(data.participant.registration_data)} &middot; Registered {formatDateTime(data.participant.registered_at)}
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
				onclick={() => (showResetConfirm = true)}
				class="text-sm px-4 py-2 border border-amber-300 text-amber-700 rounded hover:bg-amber-50 transition-colors cursor-pointer"
			>Reset Responses</button>
			<button
				type="button"
				onclick={() => (showDeleteConfirm = true)}
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
							<dt class="text-gray-500">{localized(field.label)}</dt>
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

	<!-- Per-chunk session timings (multi-session studies). Hidden when the
	     experiment isn't chunked or the participant has no responses yet. -->
	{#if data.sessionTimings && data.sessionTimings.length > 0}
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
			<h2 class="text-lg font-medium text-gray-800 mb-1">Sessions</h2>
			<p class="text-xs text-gray-500 mb-4">Per-chunk start/end timestamps derived from response history. Useful for payment tracking on multi-session studies.</p>
			<div class="overflow-x-auto">
				<table class="text-sm w-full">
					<thead>
						<tr class="bg-gray-50">
							<th class="px-3 py-2 text-left font-medium text-gray-600">Chunk</th>
							<th class="px-3 py-2 text-left font-medium text-gray-600">Started</th>
							<th class="px-3 py-2 text-left font-medium text-gray-600">Ended</th>
							<th class="px-3 py-2 text-left font-medium text-gray-600">Duration</th>
							<th class="px-3 py-2 text-left font-medium text-gray-600">Responses</th>
						</tr>
					</thead>
					<tbody>
						{#each data.sessionTimings as s}
							{@const h = Math.floor(s.durationSeconds / 3600)}
							{@const m = Math.floor((s.durationSeconds % 3600) / 60)}
							{@const sec = s.durationSeconds % 60}
							<tr class="border-t border-gray-100">
								<td class="px-3 py-2 font-mono text-gray-700">{s.chunkLabel?.en ?? s.chunkLabel?.[Object.keys(s.chunkLabel ?? {})[0] ?? ''] ?? s.chunkSlug}</td>
								<td class="px-3 py-2 text-gray-600 font-mono text-xs">{formatDateTime(s.startedAt)}</td>
								<td class="px-3 py-2 text-gray-600 font-mono text-xs">{formatDateTime(s.endedAt)}</td>
								<td class="px-3 py-2 text-gray-600 font-mono">{h > 0 ? `${h}h ` : ''}{m}m {sec}s</td>
								<td class="px-3 py-2 text-gray-600">{s.responseCount}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

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
										<span class="text-xs text-gray-400">{formatDateTime(response.createdAt)}</span>
									</div>
									<dl class="space-y-1">
										{#each Object.entries(response.responseData) as [key, value]}
											{@const widget = widgets.find((w) => w.id === key)}
											<div class="flex gap-2 text-sm">
												<dt class="text-gray-500 shrink-0">{widget ? localized(widget.label) : key}:</dt>
												<dd class="text-gray-800">
													{#if isAudioPath(value)}
														{#if data.signedAudioUrls?.[value]}
															<audio src={data.signedAudioUrls[value]} controls class="h-8 w-48 align-middle"></audio>
														{:else}
															<span class="font-mono text-xs text-gray-500">{value}</span>
														{/if}
													{:else}
														{String(value ?? '—')}
													{/if}
												</dd>
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

<ConfirmationModal
	show={showResetConfirm}
	title="Reset Responses"
	body="This will delete all responses for this participant. They will be able to redo the experiment."
	confirmPhrase="reset data"
	confirmLabel="Reset Responses"
	confirmingLabel="Resetting..."
	variant="amber"
	loading={resetting}
	formAction="?/reset"
	formEnhance={withLoadingFlag((v) => (resetting = v), () => { showResetConfirm = false; })}
	onclose={() => (showResetConfirm = false)}
/>

<ConfirmationModal
	show={showDeleteConfirm}
	title="Delete User"
	body="This will permanently delete this participant and all their data."
	confirmPhrase="delete user"
	confirmLabel="Delete User"
	confirmingLabel="Deleting..."
	loading={deleting}
	formAction="?/delete"
	formEnhance={withLoadingFlag((v) => (deleting = v))}
	onclose={() => (showDeleteConfirm = false)}
/>

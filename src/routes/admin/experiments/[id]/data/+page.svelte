<script lang="ts">
	import { enhance } from '$app/forms';
	import Toast from '$lib/components/admin/Toast.svelte';
	import { ToastState } from '$lib/utils/toast.svelte';
	import { withLoadingFlag } from '$lib/utils/enhance';
	import { configTitle, participantName } from '$lib/utils/admin-display';
	import { formatDateTime } from '$lib/utils/format-date';

	let { data, form } = $props();

	// Export options
	let selectedPhase = $state('');
	let exportFormat = $state<'csv' | 'json'>('csv');
	let exportStyle = $state<'raw' | 'research'>('research');
	let dateFormat = $state<'iso' | 'human'>('human');
	let includeRegistration = $state(true);
	let showExportOptions = $state(false);

	// Bulk delete
	let selectedIds = $state<Set<string>>(new Set());
	let bulkDeleting = $state(false);

	const toast = new ToastState();

	$effect(() => {
		if (form?.success) {
			selectedIds = new Set();
			toast.show('success', 'Deleted successfully.');
		} else if (form?.error) {
			toast.show('error', form.error, 4000);
		}
	});

	function toggleAll(checked: boolean) {
		if (checked) {
			selectedIds = new Set(data.participants.map((p: { id: string }) => p.id));
		} else {
			selectedIds = new Set();
		}
	}

	function toggleOne(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	let allSelected = $derived(data.participants.length > 0 && selectedIds.size === data.participants.length);


	// Chunking config + per-participant chunk progress
	let configChunks = $derived(() => {
		const cfg = data.experiment.config as Record<string, unknown>;
		const chunking = (cfg?.stimuli as Record<string, unknown>)?.chunking as { enabled?: boolean; chunks?: Array<{ slug: string; label?: Record<string, string> }>; minBreakMinutes?: number } | undefined;
		return chunking?.enabled ? (chunking.chunks ?? []) : [];
	});

	type ChunkProgressEntry = { slug: string; complete: boolean; respondedCount: number; totalCount: number; completedAt: string | null };
	type ChunkProgressResult = {
		progress: ChunkProgressEntry[];
		nextChunk: { slug: string; canStartAt: string | null } | null;
	};

	function getParticipantChunkProgress(participantId: string): ChunkProgressResult | null {
		if (!data.chunkProgress) return null;
		return (data.chunkProgress as Record<string, ChunkProgressResult>)[participantId] ?? null;
	}

	function getNextChunkUrl(participantId: string): string | null {
		// Reads `nextChunk.slug` resolved server-side per-participant order —
		// no array-walk client-side. Pre-fix this used `chunks.find((c, i) =>
		// !progress[i]?.complete)` which assumed array-order traversal and
		// surfaced wrong URLs for latin-square / random-per-participant.
		const cfg = data.experiment.config as Record<string, unknown>;
		const phases = cfg?.phases as Array<{ slug: string }> | undefined;
		const firstPhaseSlug = phases?.[0]?.slug ?? 'survey';
		const result = getParticipantChunkProgress(participantId);
		if (!result?.nextChunk) return null;
		return `/e/${data.experiment.slug}/c/${result.nextChunk.slug}/${firstPhaseSlug}`;
	}

	function isBreakRequired(participantId: string): boolean {
		const result = getParticipantChunkProgress(participantId);
		const canStartAt = result?.nextChunk?.canStartAt;
		return !!canStartAt && new Date(canStartAt) > new Date();
	}

	function formatBreakTime(participantId: string): string {
		const result = getParticipantChunkProgress(participantId);
		const canStartAt = result?.nextChunk?.canStartAt;
		if (!canStartAt) return '';
		return new Date(canStartAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
	}

	// Get phases from config for stats display and export dropdown
	let configPhases = $derived(() => {
		const cfg = data.experiment.config as Record<string, unknown>;
		const phases = cfg?.phases as Array<{ id: string; title: Record<string, string> }> | undefined;
		return phases ?? [];
	});

	function getPhaseName(phaseId: string): string {
		const phase = configPhases().find((p) => p.id === phaseId);
		if (!phase) return phaseId;
		const t = phase.title;
		return t?.en || t?.ja || Object.values(t || {})[0] || phaseId;
	}

	let exportUrl = $derived(() => {
		const base = `/admin/experiments/${data.experiment.id}/data/export`;
		const params = new URLSearchParams();
		if (selectedPhase) params.set('phase', selectedPhase);
		if (exportFormat !== 'csv') params.set('format', exportFormat);
		if (exportStyle !== 'raw') params.set('style', exportStyle);
		if (dateFormat !== 'iso') params.set('dateFormat', dateFormat);
		if (includeRegistration) params.set('includeRegistration', 'true');
		const q = params.toString();
		return q ? `${base}?${q}` : base;
	});
</script>

<svelte:head>
	<title>Data - {configTitle(data.experiment.config)} - Admin</title>
</svelte:head>

<div class="p-8">
	<div class="mb-6">
		<a href="/admin/experiments/{data.experiment.id}" class="text-sm text-gray-500 hover:text-gray-700">&larr; Back to experiment</a>
	</div>

	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-semibold text-gray-800">{configTitle(data.experiment.config)}</h1>
			<p class="text-sm text-gray-500 mt-1">Participant data &amp; export</p>
		</div>
		<div class="relative">
			<button
				type="button"
				onclick={() => (showExportOptions = !showExportOptions)}
				class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors text-sm font-medium cursor-pointer"
			>
				Export ▾
			</button>
			{#if showExportOptions}
				<div class="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-10 space-y-3">
					<label class="block">
						<span class="block text-xs font-medium text-gray-600 mb-1">Phase</span>
						<select bind:value={selectedPhase} class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
							<option value="">All phases</option>
							{#each configPhases() as phase}
								<option value={phase.id}>{getPhaseName(phase.id)}</option>
							{/each}
						</select>
					</label>
					<div class="flex gap-4">
						<label class="flex items-center gap-1.5 text-sm cursor-pointer">
							<input type="radio" bind:group={exportFormat} value="csv" /> CSV
						</label>
						<label class="flex items-center gap-1.5 text-sm cursor-pointer">
							<input type="radio" bind:group={exportFormat} value="json" /> JSON
						</label>
					</div>
					<fieldset>
						<legend class="block text-xs font-medium text-gray-600 mb-1">Style</legend>
						<div class="flex gap-4">
							<label class="flex items-center gap-1.5 text-sm cursor-pointer">
								<input type="radio" bind:group={exportStyle} value="raw" /> Raw
							</label>
							<label class="flex items-center gap-1.5 text-sm cursor-pointer">
								<input type="radio" bind:group={exportStyle} value="research" /> Research-friendly
							</label>
						</div>
					</fieldset>
					<div class="flex gap-4">
						<label class="flex items-center gap-1.5 text-sm cursor-pointer">
							<input type="radio" bind:group={dateFormat} value="iso" /> ISO dates
						</label>
						<label class="flex items-center gap-1.5 text-sm cursor-pointer">
							<input type="radio" bind:group={dateFormat} value="human" /> Readable dates
						</label>
					</div>
					<label class="flex items-center gap-2 text-sm cursor-pointer">
						<input type="checkbox" bind:checked={includeRegistration} />
						Flatten registration data into columns
					</label>
					<a
						href={exportUrl()}
						onclick={() => (showExportOptions = false)}
						class="block w-full text-center bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors text-sm font-medium"
					>
						Download {exportFormat.toUpperCase()}
					</a>
				</div>
			{/if}
		</div>
	</div>

	<Toast toast={toast.current} />

	<!-- Stats Panel -->
	{#if data.participants.length > 0}
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
			<h2 class="text-sm font-semibold text-gray-700 mb-3">Overview</h2>
			<div class="flex gap-6 flex-wrap">
				<div>
					<p class="text-2xl font-bold text-gray-800">{data.participants.length}</p>
					<p class="text-xs text-gray-500">participants registered</p>
				</div>
				{#each configPhases() as phase}
					{@const phaseStat = data.stats.byPhase.find((s: { phaseId: string; participantsStarted: number }) => s.phaseId === phase.id)}
					<div>
						<p class="text-2xl font-bold text-gray-800">{phaseStat?.participantsStarted ?? 0}</p>
						<p class="text-xs text-gray-500">{getPhaseName(phase.id)} — started</p>
					</div>
				{/each}
			</div>
			{#if data.stats.byStimulusCount.length > 0}
				<div class="mt-4">
					<p class="text-xs font-medium text-gray-500 mb-2">Stimulus response counts (fewest first)</p>
					<div class="space-y-1">
						{#each data.stats.byStimulusCount.slice(0, 10) as item}
							<div class="flex items-center gap-2 text-xs">
								<span class="font-mono text-gray-500 w-32 shrink-0 truncate">{item.stimulusId}</span>
								<div class="flex-1 bg-gray-100 rounded h-2">
									<div class="bg-indigo-400 rounded h-2" style="width: {Math.min(100, (item.responseCount / data.participants.length) * 100)}%"></div>
								</div>
								<span class="text-gray-600 w-6 text-right">{item.responseCount}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if data.participants.length === 0}
		<div class="text-center py-16 text-gray-500">
			<p class="text-lg mb-2">No participants yet</p>
			<p class="text-sm">Participants will appear here once they register.</p>
		</div>
	{:else}
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
			<div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
				<p class="text-sm text-gray-600">{data.participants.length} participant{data.participants.length === 1 ? '' : 's'}</p>
			</div>
			<table class="w-full text-sm">
				<thead class="bg-gray-50 border-b border-gray-200">
					<tr>
						<th class="px-4 py-3 w-10">
							<input type="checkbox" checked={allSelected} onchange={(e) => toggleAll(e.currentTarget.checked)} class="cursor-pointer" />
						</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Email</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Responses</th>
						{#if configChunks().length > 0}
							<th class="text-left px-4 py-3 font-medium text-gray-600">Chunks</th>
						{/if}
						<th class="text-left px-4 py-3 font-medium text-gray-600">Registered</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each data.participants as p}
						<tr class="hover:bg-gray-50 {selectedIds.has(p.id) ? 'bg-indigo-50' : ''}">
							<td class="px-4 py-3 w-10">
								<input type="checkbox" checked={selectedIds.has(p.id)} onchange={() => toggleOne(p.id)} class="cursor-pointer" />
							</td>
							<td class="px-4 py-3 text-gray-800">
								<a href="/admin/experiments/{data.experiment.id}/participants/{p.id}" class="hover:text-indigo-600 hover:underline">
									{p.email}
								</a>
							</td>
							<td class="px-4 py-3 text-gray-600">{participantName(p.registration_data)}</td>
							<td class="px-4 py-3 text-gray-600">{p.responseCount}</td>
							{#if configChunks().length > 0}
								{@const progress = getParticipantChunkProgress(p.id)}
								{@const nextUrl = getNextChunkUrl(p.id)}
								{@const onBreak = isBreakRequired(p.id)}
								<td class="px-4 py-3">
									<div class="flex items-center gap-1 flex-wrap">
										{#each configChunks() as chunk, i}
											{@const cp = progress?.progress[i]}
											<span class="text-xs px-1.5 py-0.5 rounded font-mono {cp?.complete ? 'bg-green-100 text-green-700' : cp && cp.respondedCount > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}">
												{chunk.slug} {#if cp?.complete}✓{:else if cp && cp.respondedCount > 0}{cp.respondedCount}/{cp.totalCount}{:else}–{/if}
											</span>
										{/each}
									</div>
									{#if nextUrl}
										<div class="mt-1 flex items-center gap-1">
											{#if onBreak}
												<span class="text-xs text-amber-600">⏱ eligible {formatBreakTime(p.id)}</span>
											{:else}
												<a href={nextUrl} target="_blank" class="text-xs text-indigo-500 hover:text-indigo-700 font-mono truncate max-w-xs">{nextUrl}</a>
												<button type="button" onclick={() => navigator.clipboard.writeText(location.origin + nextUrl)} class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer shrink-0" title="Copy link">⎘</button>
											{/if}
										</div>
									{/if}
								</td>
							{/if}
							<td class="px-4 py-3 text-gray-500">{formatDateTime(p.registered_at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Floating bulk action bar -->
{#if selectedIds.size > 0}
	<div class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded-lg shadow-xl px-6 py-3 flex items-center gap-4 z-50">
		<span class="text-sm">{selectedIds.size} selected</span>
		<form method="POST" action="?/bulkDelete" use:enhance={withLoadingFlag((v) => (bulkDeleting = v))}>
			{#each [...selectedIds] as id}
				<input type="hidden" name="participantIds" value={id} />
			{/each}
			<button type="submit" disabled={bulkDeleting}
				class="text-sm px-4 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50">
				{bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
			</button>
		</form>
		<button type="button" onclick={() => (selectedIds = new Set())} class="text-sm text-gray-300 hover:text-white cursor-pointer">
			Cancel
		</button>
	</div>
{/if}

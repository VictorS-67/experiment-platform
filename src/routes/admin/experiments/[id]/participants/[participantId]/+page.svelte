<script lang="ts">
	import Toast from '$lib/components/admin/Toast.svelte';
	import ConfirmationModal from '$lib/components/admin/ConfirmationModal.svelte';
	import { isAudioPath, widgetEntries } from '$lib/utils/response-data';
	import { ToastState } from '$lib/utils/toast.svelte';
	import { withLoadingFlag } from '$lib/utils/enhance';
	import { localized, participantName } from '$lib/utils/admin-display';
	import { formatDateTime } from '$lib/utils/format-date';

	type Localized = Record<string, string> | undefined;
	type ResponseRow = {
		stimulusId: string;
		responseData: Record<string, unknown>;
		createdAt: string;
		responseIndex: number;
	};
	type WidgetSpec = { id: string; label: Localized };
	type StimulusSpec = { id: string; label: Localized };
	type StimulusGroup = { stimulus: StimulusSpec; responses: ResponseRow[] };
	type BlockGroup = { id: string; label: Localized; stimuli: StimulusGroup[]; total: number };
	type ChunkGroup = { slug: string; label: Localized; blocks: BlockGroup[]; total: number };
	type PhaseGroup = {
		id: string;
		name: string;
		widgets: WidgetSpec[];
		total: number;
		chunked: boolean;
		chunks: ChunkGroup[]; // empty when chunked === false
		unchunked: StimulusGroup[]; // populated for non-chunked phases AND for orphan stimuli
	};

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
	let regFields = $derived.by(() => {
		const config = data.experiment.config as Record<string, unknown>;
		const reg = config?.registration as Record<string, unknown> | undefined;
		const fields = reg?.fields as Array<{ id: string; label: Record<string, string> }> | undefined;
		return fields ?? [];
	});

	// Build the structured per-phase grouping once. Keyed off chunk → block →
	// stimulus so the admin sees the participant's data the way the participant
	// experienced it (instead of one undifferentiated wall of cards). Sentinel
	// `_chunk` / `_timestamp` keys are filtered out at render time via
	// widgetEntries(); the chunk membership is read from the `_chunk` sentinel
	// when present (the same precedence computeSessionTimings uses on the
	// server side), with a fallback to the chunk config's stimulusIds map.
	let phaseGroups = $derived.by((): PhaseGroup[] => {
		const config = data.experiment.config as Record<string, unknown>;
		const phases = (config?.phases as Array<Record<string, unknown>> | undefined) ?? [];
		const stimuliCfg = config?.stimuli as { items?: Array<{ id: string; label?: Localized }>; chunking?: { enabled?: boolean; chunks?: Array<{ slug: string; label?: Localized; blocks: Array<{ id: string; label?: Localized; stimulusIds: string[] }> }> } } | undefined;
		const stimulusById = new Map<string, StimulusSpec>();
		for (const item of stimuliCfg?.items ?? []) stimulusById.set(item.id, { id: item.id, label: item.label });
		const chunking = stimuliCfg?.chunking;
		const chunkingEnabled = !!chunking?.enabled && (chunking?.chunks?.length ?? 0) > 0;
		const validChunkSlugs = new Set((chunking?.chunks ?? []).map((c) => c.slug));
		// Map stimulus_id → (chunk_slug, block_id) for non-anchor stimuli. Last-
		// write-wins for anchors is fine here because anchors are routed via
		// the `_chunk` sentinel before this map is consulted.
		const stimulusToLocation = new Map<string, { chunkSlug: string; blockId: string }>();
		for (const c of chunking?.chunks ?? []) {
			for (const b of c.blocks ?? []) {
				for (const sid of b.stimulusIds ?? []) {
					stimulusToLocation.set(sid, { chunkSlug: c.slug, blockId: b.id });
				}
			}
		}

		return phases.map((phase): PhaseGroup => {
			const phaseId = String(phase.id);
			const t = phase.title as Localized;
			const phaseName = t?.en || t?.ja || Object.values(t ?? {})[0] || phaseId;
			const widgets: WidgetSpec[] = phase.type === 'review'
				? (((phase.reviewConfig as { responseWidgets?: WidgetSpec[] } | undefined)?.responseWidgets) ?? [])
				: (((phase.responseWidgets as WidgetSpec[] | undefined)) ?? []);
			const responses: ResponseRow[] = data.responsesByPhase[phaseId] ?? [];

			if (!chunkingEnabled) {
				// Non-chunked: just group by stimulus, preserving stimulus order
				// from the config when known (orphan responses fall to the end).
				return buildFlatPhase(phaseId, phaseName, widgets, responses, stimulusById);
			}

			// Chunked: route each response to its (chunk, block, stimulus) cell.
			// Orphans (e.g. legacy anchors with no `_chunk` sentinel and no
			// stimulus mapping) collect under `unchunked`.
			const cellByChunk = new Map<string, Map<string, Map<string, ResponseRow[]>>>();
			const orphan: StimulusGroup[] = [];
			const orphanByStim = new Map<string, ResponseRow[]>();
			for (const r of responses) {
				const tagged = typeof r.responseData?._chunk === 'string' && validChunkSlugs.has(r.responseData._chunk as string) ? (r.responseData._chunk as string) : null;
				const loc = tagged
					? { chunkSlug: tagged, blockId: stimulusToLocation.get(r.stimulusId)?.blockId ?? '__no_block__' }
					: stimulusToLocation.get(r.stimulusId);
				if (!loc) {
					if (!orphanByStim.has(r.stimulusId)) orphanByStim.set(r.stimulusId, []);
					orphanByStim.get(r.stimulusId)!.push(r);
					continue;
				}
				if (!cellByChunk.has(loc.chunkSlug)) cellByChunk.set(loc.chunkSlug, new Map());
				const blockMap = cellByChunk.get(loc.chunkSlug)!;
				if (!blockMap.has(loc.blockId)) blockMap.set(loc.blockId, new Map());
				const stimMap = blockMap.get(loc.blockId)!;
				if (!stimMap.has(r.stimulusId)) stimMap.set(r.stimulusId, []);
				stimMap.get(r.stimulusId)!.push(r);
			}

			// Materialise in config order so the admin sees chunk/block/stimulus
			// in the same order as the experiment definition.
			const chunks: ChunkGroup[] = (chunking!.chunks ?? [])
				.map((c) => {
					const blockMap = cellByChunk.get(c.slug);
					if (!blockMap) return null;
					const blocks: BlockGroup[] = (c.blocks ?? [])
						.map((b) => {
							const stimMap = blockMap.get(b.id);
							if (!stimMap) return null;
							const stimuli: StimulusGroup[] = (b.stimulusIds ?? [])
								.filter((sid) => stimMap.has(sid))
								.map((sid) => ({
									stimulus: stimulusById.get(sid) ?? { id: sid, label: undefined },
									responses: stimMap.get(sid)!
								}));
							const total = stimuli.reduce((acc, s) => acc + s.responses.length, 0);
							return total > 0 ? { id: b.id, label: b.label, stimuli, total } : null;
						})
						.filter((x): x is BlockGroup => x !== null);
					const total = blocks.reduce((acc, b) => acc + b.total, 0);
					return total > 0 ? { slug: c.slug, label: c.label, blocks, total } : null;
				})
				.filter((x): x is ChunkGroup => x !== null);

			for (const [sid, rs] of orphanByStim) {
				orphan.push({ stimulus: stimulusById.get(sid) ?? { id: sid, label: undefined }, responses: rs });
			}
			const total = chunks.reduce((acc, c) => acc + c.total, 0) + orphan.reduce((acc, s) => acc + s.responses.length, 0);
			return { id: phaseId, name: phaseName, widgets, total, chunked: true, chunks, unchunked: orphan };
		});
	});

	function buildFlatPhase(
		phaseId: string,
		phaseName: string,
		widgets: WidgetSpec[],
		responses: ResponseRow[],
		stimulusById: Map<string, StimulusSpec>
	): PhaseGroup {
		const byStim = new Map<string, ResponseRow[]>();
		for (const r of responses) {
			if (!byStim.has(r.stimulusId)) byStim.set(r.stimulusId, []);
			byStim.get(r.stimulusId)!.push(r);
		}
		const ordered: StimulusGroup[] = [];
		const seen = new Set<string>();
		for (const [sid, spec] of stimulusById) {
			if (byStim.has(sid)) {
				ordered.push({ stimulus: spec, responses: byStim.get(sid)! });
				seen.add(sid);
			}
		}
		for (const [sid, rs] of byStim) {
			if (!seen.has(sid)) ordered.push({ stimulus: stimulusById.get(sid) ?? { id: sid, label: undefined }, responses: rs });
		}
		return { id: phaseId, name: phaseName, widgets, total: responses.length, chunked: false, chunks: [], unchunked: ordered };
	}

	function widgetLabel(widgets: WidgetSpec[], key: string): string {
		const w = widgets.find((x) => x.id === key);
		return w ? localized(w.label) : key;
	}

	function stimulusDisplay(stim: StimulusSpec): string {
		const lbl = localized(stim.label);
		return lbl && lbl !== stim.id ? `${lbl} (${stim.id})` : stim.id;
	}
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
				{#each regFields as field}
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
					{#if !regFields.some((f) => f.id === key)}
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

	<!-- Responses, grouped phase → chunk → block → stimulus. Each level is a
	     collapsible <details>, default-collapsed below the phase, so a
	     participant with hundreds of responses produces a navigable tree
	     instead of an undifferentiated wall of cards. Stimulus prompts/labels
	     are surfaced from the config so the admin sees what the participant
	     was shown, not just a raw UUID. Sentinel `_chunk` / `_timestamp` keys
	     are filtered out at render time via widgetEntries(). -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
		<h2 class="text-lg font-medium text-gray-800 mb-4">Responses</h2>
		{#if phaseGroups.every((p) => p.total === 0)}
			<p class="text-sm text-gray-500">No responses recorded.</p>
		{:else}
			{#each phaseGroups as phase}
				{#if phase.total > 0}
					<details class="mb-4 group" open>
						<summary class="cursor-pointer list-none flex items-center justify-between py-2 px-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
							<span class="text-sm font-semibold text-gray-700">
								<span class="inline-block w-3 text-gray-400 group-open:rotate-90 transition-transform">▶</span>
								{phase.name}
							</span>
							<span class="text-xs text-gray-500">{phase.total} {phase.total === 1 ? 'response' : 'responses'}</span>
						</summary>
						<div class="mt-3 ml-4 space-y-2">
							{#if phase.chunked}
								{#each phase.chunks as chunk}
									<details class="border border-gray-200 rounded">
										<summary class="cursor-pointer list-none flex items-center justify-between py-2 px-3 bg-white hover:bg-gray-50 transition-colors">
											<span class="text-sm font-medium text-gray-700">
												Chunk: {localized(chunk.label) || chunk.slug}
											</span>
											<span class="text-xs text-gray-500">{chunk.total} {chunk.total === 1 ? 'response' : 'responses'}</span>
										</summary>
										<div class="px-3 pb-3 pt-1 space-y-2">
											{#each chunk.blocks as block}
												<details class="border border-gray-100 rounded">
													<summary class="cursor-pointer list-none flex items-center justify-between py-1.5 px-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
														<span class="text-xs font-medium text-gray-600">
															Block: {localized(block.label) || block.id}
														</span>
														<span class="text-xs text-gray-500">{block.total}</span>
													</summary>
													<div class="px-2 pb-2 pt-1 space-y-2">
														{#each block.stimuli as stim}
															{@render stimulusBlock(stim, phase.widgets)}
														{/each}
													</div>
												</details>
											{/each}
										</div>
									</details>
								{/each}
							{/if}
							{#if phase.unchunked.length > 0}
								{#if phase.chunked}
									<details class="border border-gray-200 rounded">
										<summary class="cursor-pointer list-none flex items-center justify-between py-2 px-3 bg-white hover:bg-gray-50 transition-colors">
											<span class="text-sm font-medium text-gray-700">Unchunked / orphan responses</span>
											<span class="text-xs text-gray-500">{phase.unchunked.reduce((acc, s) => acc + s.responses.length, 0)}</span>
										</summary>
										<div class="px-3 pb-3 pt-1 space-y-2">
											{#each phase.unchunked as stim}
												{@render stimulusBlock(stim, phase.widgets)}
											{/each}
										</div>
									</details>
								{:else}
									{#each phase.unchunked as stim}
										{@render stimulusBlock(stim, phase.widgets)}
									{/each}
								{/if}
							{/if}
						</div>
					</details>
				{/if}
			{/each}
		{/if}
	</div>
</div>

{#snippet stimulusBlock(stim: StimulusGroup, widgets: WidgetSpec[])}
	<details class="border border-gray-100 rounded bg-white">
		<summary class="cursor-pointer list-none flex items-center justify-between py-1.5 px-2.5 hover:bg-gray-50 transition-colors">
			<span class="text-xs text-gray-700">
				{stimulusDisplay(stim.stimulus)}
			</span>
			<span class="text-xs text-gray-400">{stim.responses.length}</span>
		</summary>
		<div class="px-2 pb-2 pt-1 space-y-2">
			{#each stim.responses as response}
				<div class="border border-gray-100 rounded p-2.5 bg-gray-50">
					<div class="flex items-center justify-end mb-1.5">
						<span class="text-xs text-gray-400">{formatDateTime(response.createdAt)}</span>
					</div>
					<dl class="space-y-1">
						{#each widgetEntries(response.responseData) as [key, value]}
							<div class="flex gap-2 text-sm">
								<dt class="text-gray-500 shrink-0">{widgetLabel(widgets, key)}:</dt>
								<dd class="text-gray-800">
									{#if isAudioPath(value)}
										{#if data.signedAudioUrls?.[value]}
											<!-- preload="none" so 200+ audio responses don't all
												 race to fetch metadata on first paint. -->
											<audio src={data.signedAudioUrls[value]} controls preload="none" class="h-8 w-48 align-middle"></audio>
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
	</details>
{/snippet}

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

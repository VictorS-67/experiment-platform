<script lang="ts">
	import LocalizedInput from '../LocalizedInput.svelte';
	import AddButton from '../AddButton.svelte';
	import Field from './Field.svelte';
	import { updatePath } from './helpers';
	import { balancedStrataAssign } from '$lib/utils';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config, languages }: { config: ExperimentConfig; languages: string[] } = $props();

	const update = (path: string[], value: unknown) => updatePath(config, path, value);

	// --- Auto-generate state ---
	// Bound `$state` instead of the old `document.getElementById` pattern so the
	// inputs survive re-renders and the form reads cleanly.
	let genNumChunks = $state(1);
	let genBlocksPerChunk = $state(1);
	let genBalanceKeys = $state<Set<string>>(new Set());

	function toggleBalanceKey(key: string) {
		const next = new Set(genBalanceKeys);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		genBalanceKeys = next;
	}

	function generateChunks() {
		if (genNumChunks < 1 || genBlocksPerChunk < 1) return;
		const keys = [...genBalanceKeys];
		const seed = `${config.slug}|chunkgen|C${genNumChunks}|B${genBlocksPerChunk}|${keys.sort().join(',')}`;
		const cells = balancedStrataAssign(
			config.stimuli.items,
			keys,
			genNumChunks,
			genBlocksPerChunk,
			seed
		);
		const chunks = Array.from({ length: genNumChunks }, (_, ci) => ({
			id: `chunk-${ci + 1}`,
			slug: `chunk-${ci + 1}`,
			label: Object.fromEntries(languages.map((l) => [l, `Chunk ${ci + 1}`])),
			blocks: Array.from({ length: genBlocksPerChunk }, (_, bi) => ({
				id: genBlocksPerChunk === 1 ? `block-${ci + 1}` : `chunk-${ci + 1}-block-${bi + 1}`,
				stimulusIds: cells[ci * genBlocksPerChunk + bi]
			}))
		}));
		update(['stimuli', 'chunking', 'chunks'], chunks);
	}

	// --- Per-block balance preview ---
	// For each block, count anchors + (when balance keys are configured) the
	// distribution of stimuli across each key's values. Drives the inline
	// "anger×4 · fear×4 · 1 anchor" badge row under each block.
	let itemById = $derived.by(() => {
		const m = new Map<string, (typeof config.stimuli.items)[number]>();
		for (const it of config.stimuli.items) m.set(it.id, it);
		return m;
	});

	function blockSummary(stimulusIds: string[]): {
		anchors: number;
		regulars: number;
		byKey: Record<string, Record<string, number>>;
	} {
		const counts: Record<string, Record<string, number>> = {};
		const keys = config.stimuli.metadataKeys ?? [];
		for (const k of keys) counts[k] = {};
		let anchors = 0;
		let regulars = 0;
		for (const id of stimulusIds) {
			const item = itemById.get(id);
			if (!item) continue;
			if (item.isAnchor) {
				anchors++;
			} else {
				regulars++;
			}
			for (const k of keys) {
				const v = String(item.metadata?.[k] ?? '—');
				counts[k][v] = (counts[k][v] ?? 0) + 1;
			}
		}
		return { anchors, regulars, byKey: counts };
	}
</script>

<div class="space-y-4">
	<label class="flex items-center gap-2 cursor-pointer">
		<input
			type="checkbox"
			checked={config.stimuli.chunking?.enabled ?? false}
			onchange={(e) => {
				if (e.currentTarget.checked) {
					if (!config.stimuli.chunking) {
						update(['stimuli', 'chunking'], {
							enabled: true,
							chunks: [],
							blockOrder: 'sequential',
							withinBlockOrder: 'random-per-participant'
						});
					} else {
						update(['stimuli', 'chunking', 'enabled'], true);
					}
				} else {
					update(['stimuli', 'chunking', 'enabled'], false);
				}
			}}
			class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
		/>
		<span class="text-sm text-gray-700">Enable chunking</span>
	</label>

	{#if config.stimuli.chunking?.enabled}
		<Field label="Min break between chunks (minutes)" help="Participants must wait this long after finishing a chunk before starting the next.">
			<input
				type="number"
				min="1"
				value={config.stimuli.chunking.minBreakMinutes ?? ''}
				oninput={(e) => update(['stimuli', 'chunking', 'minBreakMinutes'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
				class="w-40 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
				placeholder="No break required"
			/>
		</Field>

		<div class="grid grid-cols-3 gap-3">
			<Field label="Chunk Order" help="Across-session order. Latin-square rotates which chunk each participant starts on, counterbalancing first-session learning effects across raters.">
				<select
					value={config.stimuli.chunking.chunkOrder ?? 'sequential'}
					onchange={(e) => update(['stimuli', 'chunking', 'chunkOrder'], e.currentTarget.value)}
					class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
				>
					<option value="sequential">Sequential</option>
					<option value="latin-square">Latin Square</option>
					<option value="random-per-participant">Random per participant</option>
				</select>
			</Field>
			<Field label="Block Order">
				<select
					value={config.stimuli.chunking.blockOrder ?? 'sequential'}
					onchange={(e) => update(['stimuli', 'chunking', 'blockOrder'], e.currentTarget.value)}
					class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
				>
					<option value="sequential">Sequential</option>
					<option value="latin-square">Latin Square</option>
					<option value="random-per-participant">Random per participant</option>
				</select>
			</Field>
			<Field label="Within-Block Order">
				<select
					value={config.stimuli.chunking.withinBlockOrder ?? 'random-per-participant'}
					onchange={(e) => update(['stimuli', 'chunking', 'withinBlockOrder'], e.currentTarget.value)}
					class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
				>
					<option value="sequential">Sequential</option>
					<option value="random">Random</option>
					<option value="random-per-participant">Random per participant</option>
				</select>
			</Field>
		</div>

		<!-- Break Screen -->
		<div class="border-t border-gray-100 pt-3">
			<div class="flex items-center justify-between mb-2">
				<h5 class="text-xs font-medium text-gray-500">Break Screen (between blocks)</h5>
				{#if config.stimuli.chunking?.breakScreen}
					<button type="button" onclick={() => { delete config.stimuli.chunking!.breakScreen; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
				{:else}
					<AddButton onclick={() => {
						config.stimuli.chunking!.breakScreen = {
							title: Object.fromEntries(languages.map((l) => [l, l === 'en' ? 'Take a Break' : '休憩'])),
							body: Object.fromEntries(languages.map((l) => [l, l === 'en' ? 'You have completed a block. Take a moment before continuing.' : 'ブロックが完了しました。少し休憩してから続けてください。']))
						};
					}} />
				{/if}
			</div>
			{#if config.stimuli.chunking?.breakScreen}
				<div class="space-y-2 pl-2 border-l-2 border-indigo-200">
					<label class="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
						<input
							type="checkbox"
							checked={config.stimuli.chunking.breakScreen.disabled === true}
							onchange={(e) => update(['stimuli', 'chunking', 'breakScreen', 'disabled'], e.currentTarget.checked || undefined)}
						/>
						<span>Disable break screen between blocks (no forced pause)</span>
					</label>
					<LocalizedInput label="Title (optional — leave blank for platform default)" value={config.stimuli.chunking.breakScreen.title ?? {}} {languages} onchange={(v) => update(['stimuli', 'chunking', 'breakScreen', 'title'], Object.values(v).some(Boolean) ? v : undefined)} />
					<LocalizedInput label="Body (optional — leave blank for platform default)" value={config.stimuli.chunking.breakScreen.body ?? {}} {languages} multiline onchange={(v) => update(['stimuli', 'chunking', 'breakScreen', 'body'], Object.values(v).some(Boolean) ? v : undefined)} />
					<Field label="Countdown (seconds, optional)">
						<input type="number" value={config.stimuli.chunking.breakScreen.duration ?? ''}
							oninput={(e) => update(['stimuli', 'chunking', 'breakScreen', 'duration'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
							class="w-32 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="No delay" />
					</Field>
				</div>
			{/if}
		</div>

		<!-- Auto-generate helper -->
		{#if config.stimuli.items.length}
			<div class="border border-dashed border-indigo-300 rounded p-3 bg-indigo-50/50 space-y-3">
				<div>
					<p class="text-xs font-medium text-indigo-700">Auto-generate balanced chunks</p>
					<p class="text-[11px] text-indigo-500/80 mt-0.5">
						Splits {config.stimuli.items.length} stimulus item{config.stimuli.items.length === 1 ? '' : 's'}
						across chunks × blocks. Each cell gets approximately equal counts across the
						selected balance keys. Items marked as <span class="font-medium">Anchor</span> are replicated once into every chunk for test-retest reliability.
					</p>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<Field label="Number of chunks" help="Each chunk = one session. Participants do them across days.">
						<input
							type="number"
							min="1"
							bind:value={genNumChunks}
							class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
					</Field>
					<Field label="Blocks per chunk" help="Within-session forced break points. 2–3 is typical for 30–45 min sessions.">
						<input
							type="number"
							min="1"
							bind:value={genBlocksPerChunk}
							class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
					</Field>
				</div>
				{#if config.stimuli.metadataKeys?.length}
					<Field label="Balance across metadata keys" help="Tick the keys whose values should be evenly distributed across blocks (e.g. emotion, performer rank). Leave all unticked for pure round-robin distribution by count.">
						<div class="flex flex-wrap gap-2">
							{#each config.stimuli.metadataKeys as key}
								<label class="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 border border-gray-300 rounded {genBalanceKeys.has(key) ? 'bg-indigo-100 border-indigo-400 text-indigo-800' : 'bg-white text-gray-600 hover:bg-gray-50'}">
									<input
										type="checkbox"
										checked={genBalanceKeys.has(key)}
										onchange={() => toggleBalanceKey(key)}
									/>
									<span class="font-mono">{key}</span>
								</label>
							{/each}
						</div>
					</Field>
				{:else}
					<p class="text-[11px] text-gray-500 italic">
						No metadata keys defined for this experiment — generation will distribute purely round-robin by count.
						Add metadata keys in the Stimuli section to enable balanced splitting.
					</p>
				{/if}
				<div class="flex items-center justify-end gap-2">
					{#if config.stimuli.chunking.chunks.length > 0}
						<span class="text-[11px] text-amber-600">Will replace the existing {config.stimuli.chunking.chunks.length} chunk{config.stimuli.chunking.chunks.length === 1 ? '' : 's'}.</span>
					{/if}
					<button
						type="button"
						onclick={generateChunks}
						class="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer"
					>
						Generate
					</button>
				</div>
			</div>
		{/if}

		<!-- Chunk list -->
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<h4 class="text-sm font-medium text-gray-600">Chunks ({config.stimuli.chunking.chunks?.length ?? 0})</h4>
				<button
					type="button"
					onclick={() => {
						const chunks = config.stimuli.chunking?.chunks ?? [];
						const idx = chunks.length + 1;
						chunks.push({
							id: `chunk-${idx}`,
							slug: `chunk-${idx}`,
							blocks: []
						});
						update(['stimuli', 'chunking', 'chunks'], chunks);
					}}
					class="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer"
				>+ Add Chunk</button>
			</div>

			{#each config.stimuli.chunking.chunks ?? [] as chunk, ci}
				<div class="border-2 border-gray-300 rounded-lg p-4 space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-gray-700">Chunk {ci + 1}</span>
						<button
							type="button"
							onclick={() => { config.stimuli.chunking!.chunks.splice(ci, 1); }}
							class="text-xs text-red-500 hover:text-red-700 cursor-pointer"
						>Remove</button>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<Field label="ID">
							<input type="text" value={chunk.id}
								oninput={(e) => update(['stimuli', 'chunking', 'chunks', String(ci), 'id'], e.currentTarget.value)}
								class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
						</Field>
						<Field label="Slug (URL)">
							<input type="text" value={chunk.slug}
								oninput={(e) => update(['stimuli', 'chunking', 'chunks', String(ci), 'slug'], e.currentTarget.value)}
								class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
						</Field>
					</div>
					<LocalizedInput label="Label" value={chunk.label ?? {}} {languages} onchange={(v) => update(['stimuli', 'chunking', 'chunks', String(ci), 'label'], Object.values(v).some(Boolean) ? v : undefined)} />

					<!-- Blocks within this chunk -->
					<div class="pl-3 border-l-2 border-indigo-200 space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-xs text-gray-500">Blocks ({chunk.blocks?.length ?? 0})</span>
							<AddButton
								label="+ Add Block"
								onclick={() => {
									const blocks = chunk.blocks ?? [];
									blocks.push({ id: `block-${blocks.length + 1}`, stimulusIds: [] });
									update(['stimuli', 'chunking', 'chunks', String(ci), 'blocks'], blocks);
								}}
							/>
						</div>
						{#each chunk.blocks ?? [] as block, bi}
							<div class="border border-gray-100 rounded p-2 space-y-1.5">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<input type="text" value={block.id}
											oninput={(e) => update(['stimuli', 'chunking', 'chunks', String(ci), 'blocks', String(bi), 'id'], e.currentTarget.value)}
											class="w-28 px-2 py-0.5 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="block ID" />
										<span class="text-xs text-gray-400">{block.stimulusIds?.length ?? 0} stimuli</span>
									</div>
									<button type="button" onclick={() => { chunk.blocks.splice(bi, 1); }}
										class="text-xs text-red-500 hover:text-red-700 cursor-pointer">x</button>
								</div>
								{#if (block.stimulusIds?.length ?? 0) > 0}
									{@const summary = blockSummary(block.stimulusIds ?? [])}
									<div class="flex flex-wrap items-center gap-1 text-[10px] text-gray-500">
										<span class="font-medium text-gray-600">{summary.regulars} reg</span>
										{#if summary.anchors > 0}
											<span class="px-1 py-px bg-amber-100 text-amber-700 rounded">+{summary.anchors} anchor{summary.anchors === 1 ? '' : 's'}</span>
										{/if}
										{#each Object.entries(summary.byKey) as [key, valueCounts]}
											{#if Object.keys(valueCounts).length > 0}
												<span class="text-gray-400">·</span>
												<span class="text-gray-400">{key}:</span>
												{#each Object.entries(valueCounts) as [val, count]}
													<span class="font-mono">{val}×{count}</span>
												{/each}
											{/if}
										{/each}
									</div>
								{/if}
								<LocalizedInput label="Label" value={block.label ?? {}} {languages} onchange={(v) => update(['stimuli', 'chunking', 'chunks', String(ci), 'blocks', String(bi), 'label'], Object.values(v).some(Boolean) ? v : undefined)} />
								<!-- Stimulus selector -->
								<div class="max-h-32 overflow-y-auto border border-gray-100 rounded p-1.5">
									{#each config.stimuli.items as stim}
										<label class="flex items-center gap-1.5 text-xs cursor-pointer py-0.5">
											<input
												type="checkbox"
												checked={block.stimulusIds?.includes(stim.id) ?? false}
												onchange={(e) => {
													const ids = [...(block.stimulusIds ?? [])];
													if (e.currentTarget.checked) {
														ids.push(stim.id);
													} else {
														const idx = ids.indexOf(stim.id);
														if (idx >= 0) ids.splice(idx, 1);
													}
													update(['stimuli', 'chunking', 'chunks', String(ci), 'blocks', String(bi), 'stimulusIds'], ids);
												}}
												class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
											/>
											<span class="font-mono text-gray-600">{stim.id}</span>
											{#if stim.filename}<span class="text-gray-400 truncate">- {stim.filename}</span>{/if}
										</label>
									{/each}
								</div>
							</div>
						{/each}
					</div>

					<!-- Chunk URL preview -->
					{#if chunk.slug}
						<p class="text-xs text-gray-400 mt-1">
							URL: <span class="font-mono">/e/{config.slug}/c/{chunk.slug}/{config.phases[0]?.slug ?? 'phase'}</span>
						</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

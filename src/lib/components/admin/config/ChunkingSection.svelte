<script lang="ts">
	import LocalizedInput from '../LocalizedInput.svelte';
	import Field from './Field.svelte';
	import { updatePath } from './helpers';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config, languages }: { config: ExperimentConfig; languages: string[] } = $props();

	const update = (path: string[], value: unknown) => updatePath(config, path, value);
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

		<div class="grid grid-cols-2 gap-3">
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
					<button type="button" onclick={() => {
						config.stimuli.chunking!.breakScreen = {
							title: Object.fromEntries(languages.map((l) => [l, l === 'en' ? 'Take a Break' : '休憩'])),
							body: Object.fromEntries(languages.map((l) => [l, l === 'en' ? 'You have completed a block. Take a moment before continuing.' : 'ブロックが完了しました。少し休憩してから続けてください。']))
						};
					}} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
				{/if}
			</div>
			{#if config.stimuli.chunking?.breakScreen}
				<div class="space-y-2 pl-2 border-l-2 border-indigo-200">
					<LocalizedInput label="Title" value={config.stimuli.chunking.breakScreen.title} {languages} onchange={(v) => update(['stimuli', 'chunking', 'breakScreen', 'title'], v)} />
					<LocalizedInput label="Body" value={config.stimuli.chunking.breakScreen.body} {languages} multiline onchange={(v) => update(['stimuli', 'chunking', 'breakScreen', 'body'], v)} />
					<Field label="Countdown (seconds, optional)">
						<input type="number" value={config.stimuli.chunking.breakScreen.duration ?? ''}
							oninput={(e) => update(['stimuli', 'chunking', 'breakScreen', 'duration'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
							class="w-32 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="No delay" />
					</Field>
				</div>
			{/if}
		</div>

		<!-- Auto-generate helper -->
		{#if config.stimuli.metadataKeys?.length && config.stimuli.items.length}
			<div class="border border-dashed border-indigo-300 rounded p-3 bg-indigo-50/50">
				<p class="text-xs font-medium text-indigo-700 mb-2">Auto-generate chunks from metadata</p>
				<div class="flex items-end gap-2">
					<Field label="Group by metadata key" class="block flex-1">
						<select
							id="chunk-gen-key"
							class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
						>
							{#each config.stimuli.metadataKeys ?? [] as key}
								<option value={key}>{key}</option>
							{/each}
						</select>
					</Field>
					<Field label="Chunks" class="block w-24">
						<input
							type="number"
							id="chunk-gen-count"
							value="1"
							min="1"
							class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
					</Field>
					<button
						type="button"
						onclick={() => {
							const keyEl = document.getElementById('chunk-gen-key') as HTMLSelectElement;
							const countEl = document.getElementById('chunk-gen-count') as HTMLInputElement;
							const metaKey = keyEl?.value;
							const numChunks = parseInt(countEl?.value ?? '1') || 1;
							if (!metaKey) return;

							const groups = new Map<string, string[]>();
							for (const item of config.stimuli.items) {
								const val = String(item.metadata?.[metaKey] ?? 'unknown');
								if (!groups.has(val)) groups.set(val, []);
								groups.get(val)!.push(item.id);
							}

							const blockDefs = [...groups.entries()].map(([val, ids]) => ({
								id: val.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
								label: Object.fromEntries(languages.map(l => [l, val])),
								stimulusIds: ids
							}));

							const chunks = Array.from({ length: numChunks }, (_, ci) => ({
								id: `chunk-${ci + 1}`,
								slug: `chunk-${ci + 1}`,
								label: Object.fromEntries(languages.map(l => [l, `Chunk ${ci + 1}`])),
								blocks: blockDefs.map(b => ({
									id: b.id,
									label: b.label,
									stimulusIds: b.stimulusIds.filter((_, si) =>
										Math.floor(si / (b.stimulusIds.length / numChunks)) === ci
									)
								}))
							}));

							update(['stimuli', 'chunking', 'chunks'], chunks);
						}}
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
				<div class="border border-gray-200 rounded-lg p-3 space-y-2">
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
							<button
								type="button"
								onclick={() => {
									const blocks = chunk.blocks ?? [];
									blocks.push({ id: `block-${blocks.length + 1}`, stimulusIds: [] });
									update(['stimuli', 'chunking', 'chunks', String(ci), 'blocks'], blocks);
								}}
								class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer"
							>+ Add Block</button>
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

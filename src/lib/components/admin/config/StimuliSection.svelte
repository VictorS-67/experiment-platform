<script lang="ts">
	import LocalizedInput from '../LocalizedInput.svelte';
	import { updatePath, stimulusTypes, sourceTypes } from './helpers';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config, languages, experimentId }: { config: ExperimentConfig; languages: string[]; experimentId?: string } = $props();

	const update = (path: string[], value: unknown) => updatePath(config, path, value);

	// Storage check
	type StorageCheckState = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; count: number; files: string[] } | { status: 'error'; message: string };
	let storageCheck = $state<StorageCheckState>({ status: 'idle' });

	async function checkStorage() {
		if (!experimentId || !config.stimuli.storagePath) return;
		storageCheck = { status: 'loading' };
		try {
			const res = await fetch(`/admin/experiments/${experimentId}/storage-check?path=${encodeURIComponent(config.stimuli.storagePath)}`);
			const body = await res.json();
			if (body.error) {
				storageCheck = { status: 'error', message: body.error };
			} else {
				storageCheck = { status: 'ok', count: body.count, files: body.files };
			}
		} catch {
			storageCheck = { status: 'error', message: 'Request failed' };
		}
	}

	const PAGE_SIZE = 20;
	let currentPage = $state(0);
	let searchQuery = $state('');

	let filteredIndices = $derived.by(() => {
		const q = searchQuery.toLowerCase().trim();
		if (!q) return config.stimuli.items.map((_, i) => i);
		return config.stimuli.items
			.map((item, i) => ({ item, i }))
			.filter(({ item }) =>
				item.id.toLowerCase().includes(q) ||
				(item.filename ?? '').toLowerCase().includes(q) ||
				(item.url ?? '').toLowerCase().includes(q)
			)
			.map(({ i }) => i);
	});

	let totalPages = $derived(Math.max(1, Math.ceil(filteredIndices.length / PAGE_SIZE)));
	let safePage = $derived(Math.min(currentPage, totalPages - 1));
	let pagedIndices = $derived(filteredIndices.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE));

	function addStimulusItem() {
		const newId = `stim_${Date.now()}`;
		config.stimuli.items.push({ id: newId });
		// Jump to last page to see the new item
		searchQuery = '';
		currentPage = Math.floor(config.stimuli.items.length / PAGE_SIZE);
	}

	function removeStimulusItem(index: number) {
		config.stimuli.items.splice(index, 1);
	}
</script>

<div class="space-y-4">
	<div class="grid grid-cols-3 gap-3">
		<div>
			<label class="block text-xs text-gray-500 mb-1">Type</label>
			<select
				value={config.stimuli.type}
				onchange={(e) => update(['stimuli', 'type'], e.currentTarget.value)}
				class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
			>
				{#each stimulusTypes as t}
					<option value={t}>{t}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class="block text-xs text-gray-500 mb-1">Source</label>
			<select
				value={config.stimuli.source}
				onchange={(e) => update(['stimuli', 'source'], e.currentTarget.value)}
				class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
			>
				{#each sourceTypes as t}
					<option value={t}>{t}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class="block text-xs text-gray-500 mb-1">Storage Path</label>
			<input
				type="text"
				value={config.stimuli.storagePath ?? ''}
				oninput={(e) => { update(['stimuli', 'storagePath'], e.currentTarget.value || undefined); storageCheck = { status: 'idle' }; }}
				class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
				placeholder="stimuli/experiment-name"
			/>
		</div>
	</div>

	{#if config.stimuli.source === 'supabase-storage' && config.stimuli.storagePath}
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={checkStorage}
				disabled={storageCheck.status === 'loading'}
				class="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600 cursor-pointer disabled:opacity-50"
			>
				{storageCheck.status === 'loading' ? 'Checking...' : 'Check storage'}
			</button>
			{#if storageCheck.status === 'ok'}
				{#if storageCheck.count === 0}
					<span class="text-xs text-amber-600">No files found at this path</span>
				{:else}
					<span class="text-xs text-green-700">{storageCheck.count} file{storageCheck.count === 1 ? '' : 's'} found</span>
					<span class="text-xs text-gray-400 font-mono truncate max-w-xs">{storageCheck.files.slice(0, 3).join(', ')}{storageCheck.count > 3 ? ` +${storageCheck.count - 3} more` : ''}</span>
				{/if}
			{:else if storageCheck.status === 'error'}
				<span class="text-xs text-red-600">{storageCheck.message}</span>
			{/if}
		</div>
	{/if}

	<div>
		<label class="block text-xs text-gray-500 mb-1">Message template <span class="text-gray-400 font-normal">(optional)</span></label>
		<input
			type="text"
			value={config.stimuli.messageTemplate ?? ''}
			oninput={(e) => update(['stimuli', 'messageTemplate'], e.currentTarget.value || undefined)}
			class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
			placeholder="e.g. The emotion displayed is {'{metadata.emotion}'}."
		/>
		<p class="mt-1 text-xs text-gray-400">Shown below each stimulus. Use <code class="font-mono">{'{metadata.key}'}</code> for per-stimulus values.</p>
	</div>

	<!-- Shared metadata keys -->
	<div class="space-y-1.5">
		<div class="flex items-center justify-between">
			<label class="block text-xs text-gray-500">Metadata keys</label>
			<button
				type="button"
				onclick={() => {
					const keys = [...(config.stimuli.metadataKeys ?? [])];
					const newKey = `key${keys.length + 1}`;
					keys.push(newKey);
					update(['stimuli', 'metadataKeys'], keys);
					config.stimuli.items.forEach((_, idx) => {
						if (!config.stimuli.items[idx].metadata) update(['stimuli', 'items', String(idx), 'metadata'], {});
						update(['stimuli', 'items', String(idx), 'metadata', newKey], '');
					});
				}}
				class="text-xs text-indigo-500 hover:text-indigo-700 cursor-pointer"
			>+ Add key</button>
		</div>
		{#each (config.stimuli.metadataKeys ?? []) as metaKey, ki}
			<div class="flex items-center gap-1.5">
				<input
					type="text"
					value={metaKey}
					oninput={(e) => {
						const oldKey = metaKey;
						const newKey = e.currentTarget.value;
						const keys = [...(config.stimuli.metadataKeys ?? [])];
						keys[ki] = newKey;
						update(['stimuli', 'metadataKeys'], keys);
						config.stimuli.items.forEach((item, idx) => {
							const current = { ...(item.metadata ?? {}) };
							const val = current[oldKey];
							delete current[oldKey];
							current[newKey] = val ?? '';
							update(['stimuli', 'items', String(idx), 'metadata'], current);
						});
					}}
					class="w-36 px-1.5 py-0.5 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
					placeholder="key name"
				/>
				<button
					type="button"
					onclick={() => {
						const keys = (config.stimuli.metadataKeys ?? []).filter((_, i) => i !== ki);
						update(['stimuli', 'metadataKeys'], keys.length ? keys : undefined);
						config.stimuli.items.forEach((item, idx) => {
							if (!item.metadata) return;
							const current = { ...item.metadata };
							delete current[metaKey];
							update(['stimuli', 'items', String(idx), 'metadata'], Object.keys(current).length ? current : undefined);
						});
					}}
					class="text-xs text-red-400 hover:text-red-600 cursor-pointer px-1"
				>x</button>
			</div>
		{/each}
		{#if !(config.stimuli.metadataKeys?.length)}
			<p class="text-xs text-gray-400 italic">No metadata keys defined.</p>
		{/if}
	</div>

	<div class="flex items-center justify-between">
		<h4 class="text-sm text-gray-500">Items ({config.stimuli.items.length})</h4>
		<button type="button" onclick={addStimulusItem} class="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add Item</button>
	</div>

	<!-- Search + pagination controls -->
	{#if config.stimuli.items.length > PAGE_SIZE}
		<div class="flex items-center gap-3">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search by ID, filename, or URL..."
				class="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
			/>
			<div class="flex items-center gap-1 shrink-0">
				<button type="button" disabled={safePage === 0} onclick={() => currentPage = safePage - 1}
					class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">&lt;</button>
				<span class="text-xs text-gray-500 min-w-[5rem] text-center">{safePage + 1} / {totalPages}</span>
				<button type="button" disabled={safePage >= totalPages - 1} onclick={() => currentPage = safePage + 1}
					class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">&gt;</button>
			</div>
			{#if searchQuery}
				<span class="text-xs text-gray-400 shrink-0">{filteredIndices.length} match{filteredIndices.length === 1 ? '' : 'es'}</span>
			{/if}
		</div>
	{/if}

	{#each pagedIndices as i (config.stimuli.items[i]?.id ?? i)}
		{@const item = config.stimuli.items[i]}
		<div class="border border-gray-200 rounded p-3 space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-xs font-mono text-gray-400"><span class="text-gray-300">#{i + 1}</span> {item.id}</span>
				<div class="flex items-center gap-2">
					<button type="button" disabled={i === 0}
						onclick={() => { [config.stimuli.items[i-1], config.stimuli.items[i]] = [config.stimuli.items[i], config.stimuli.items[i-1]]; }}
						class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed">^</button>
					<button type="button" disabled={i === config.stimuli.items.length - 1}
						onclick={() => { [config.stimuli.items[i], config.stimuli.items[i+1]] = [config.stimuli.items[i+1], config.stimuli.items[i]]; }}
						class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed">v</button>
					<button type="button" onclick={() => removeStimulusItem(i)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
				</div>
			</div>
			<div class="grid grid-cols-3 gap-2">
				<div>
					<label class="block text-xs text-gray-500 mb-0.5">ID</label>
					<input
						type="text"
						value={item.id}
						oninput={(e) => update(['stimuli', 'items', String(i), 'id'], e.currentTarget.value)}
						class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>
				<div>
					<label class="block text-xs text-gray-500 mb-0.5">Filename</label>
					<input
						type="text"
						value={item.filename ?? ''}
						oninput={(e) => update(['stimuli', 'items', String(i), 'filename'], e.currentTarget.value || undefined)}
						class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>
				<div>
					<label class="block text-xs text-gray-500 mb-0.5">URL</label>
					<input
						type="text"
						value={item.url ?? ''}
						oninput={(e) => update(['stimuli', 'items', String(i), 'url'], e.currentTarget.value || undefined)}
						class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs text-gray-500 mb-0.5">Type</label>
					<select
						value={item.type ?? ''}
						onchange={(e) => update(['stimuli', 'items', String(i), 'type'], e.currentTarget.value || undefined)}
						class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
					>
						<option value="">Inherit ({config.stimuli.type})</option>
						{#each ['video', 'image', 'audio', 'text'] as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
				</div>
				<div>
					<LocalizedInput label="Label" value={item.label ?? {}} {languages} onchange={(v) => update(['stimuli', 'items', String(i), 'label'], Object.values(v).some(Boolean) ? v : undefined)} />
				</div>
			</div>
			<!-- Metadata values -->
			{#if config.stimuli.metadataKeys?.length}
				<div class="space-y-1">
					{#each (config.stimuli.metadataKeys ?? []) as metaKey}
						<div class="flex items-center gap-1.5">
							<span class="w-24 text-xs font-mono text-gray-500 shrink-0">{metaKey}</span>
							<span class="text-gray-300 text-xs">:</span>
							<input
								type="text"
								value={String(item.metadata?.[metaKey] ?? '')}
								oninput={(e) => {
									if (!item.metadata) update(['stimuli', 'items', String(i), 'metadata'], {});
									update(['stimuli', 'items', String(i), 'metadata', metaKey], e.currentTarget.value);
								}}
								class="flex-1 px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
								placeholder="value"
							/>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}

	<!-- Bottom pagination -->
	{#if config.stimuli.items.length > PAGE_SIZE}
		<div class="flex items-center justify-center gap-1">
			<button type="button" disabled={safePage === 0} onclick={() => currentPage = safePage - 1}
				class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">&lt;</button>
			<span class="text-xs text-gray-500 min-w-[5rem] text-center">{safePage + 1} / {totalPages}</span>
			<button type="button" disabled={safePage >= totalPages - 1} onclick={() => currentPage = safePage + 1}
				class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">&gt;</button>
		</div>
	{/if}
</div>

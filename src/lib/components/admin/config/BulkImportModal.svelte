<script lang="ts">
	import Modal from '$lib/components/layout/Modal.svelte';
	import type { ExperimentConfig, StimulusItemType } from '$lib/config/schema';
	import {
		compileFilenamePattern,
		extractMetadata,
		parseCSV,
		globToRegex,
		buildStimulusItems,
		type StimulusItemCandidate
	} from '$lib/utils/bulk-import';

	let {
		show,
		config,
		experimentId,
		initialMode = 'storage',
		onclose,
		onimport
	}: {
		show: boolean;
		config: ExperimentConfig;
		experimentId: string;
		initialMode?: 'storage' | 'csv';
		onclose: () => void;
		onimport: (items: StimulusItemType[], newMetadataKeys: string[], strategy: 'append' | 'replace') => void;
	} = $props();

	// --- Wizard state ---
	let step = $state<'source' | 'preview'>('source');
	let importMode = $state<'storage' | 'csv'>('storage');
	let mergeStrategy = $state<'append' | 'replace'>('append');

	// --- Storage mode ---
	let storageFiles = $state<string[]>([]);
	let storageLoading = $state(false);
	let storageError = $state<string | null>(null);
	let selectedFiles = $state<Set<string>>(new Set());
	let fileSearch = $state('');
	let fileGlob = $state('');
	let filenamePattern = $state('');

	// --- CSV mode ---
	let csvText = $state('');
	let csvError = $state<string | null>(null);
	let csvParsed = $state<{ headers: string[]; rows: Record<string, string>[] } | null>(null);

	// --- Preview ---
	let candidates = $state<StimulusItemCandidate[]>([]);
	let selectedCandidates = $state<Set<string>>(new Set());
	let previewSearch = $state('');
	let previewPage = $state(0);

	const PAGE_SIZE = 50;

	// Reset state when modal opens
	$effect(() => {
		if (show) {
			step = 'source';
			importMode = initialMode;
			storageFiles = [];
			storageLoading = false;
			storageError = null;
			selectedFiles = new Set();
			fileSearch = '';
			fileGlob = '';
			filenamePattern = '';
			csvText = '';
			csvError = null;
			csvParsed = null;
			candidates = [];
			selectedCandidates = new Set();
			mergeStrategy = 'append';
			previewSearch = '';
			previewPage = 0;
		}
	});

	// --- Storage: filtered file list ---
	let filteredFiles = $derived.by(() => {
		let files = storageFiles;
		const q = fileSearch.toLowerCase().trim();
		if (q) files = files.filter(f => f.toLowerCase().includes(q));
		if (fileGlob.trim()) {
			try {
				const re = globToRegex(fileGlob.trim());
				files = files.filter(f => re.test(f));
			} catch { /* invalid glob, ignore */ }
		}
		return files;
	});

	let storagePageCount = $derived(Math.max(1, Math.ceil(filteredFiles.length / PAGE_SIZE)));
	let storageSafePage = $derived(Math.min(previewPage, storagePageCount - 1));
	let storagePagedFiles = $derived(filteredFiles.slice(storageSafePage * PAGE_SIZE, (storageSafePage + 1) * PAGE_SIZE));

	// Storage page state (separate from preview page)
	let storagePage = $state(0);
	let storagePageSafe = $derived(Math.min(storagePage, storagePageCount - 1));
	let storagePagedFilesActual = $derived(filteredFiles.slice(storagePageSafe * PAGE_SIZE, (storagePageSafe + 1) * PAGE_SIZE));

	// --- Pattern preview ---
	let patternResult = $derived.by(() => {
		if (!filenamePattern.trim()) return null;
		return compileFilenamePattern(filenamePattern);
	});

	let patternPreview = $derived.by(() => {
		if (!patternResult) return [];
		const samples = (selectedFiles.size > 0
			? [...selectedFiles].slice(0, 3)
			: storageFiles.slice(0, 3)
		);
		return samples.map(f => ({
			filename: f,
			metadata: extractMetadata(f, patternResult.regex)
		}));
	});

	// --- CSV parsing ---
	function handleCSVFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			csvText = reader.result as string;
			doParseCSV();
		};
		reader.readAsText(file);
	}

	function doParseCSV() {
		csvError = null;
		try {
			const result = parseCSV(csvText);
			if (result.headers.length === 0) {
				csvError = 'No columns found in CSV';
				csvParsed = null;
				return;
			}
			if (!result.headers.includes('filename') && !result.headers.includes('id')) {
				csvError = 'CSV must have a "filename" or "id" column';
				csvParsed = null;
				return;
			}
			csvParsed = result;
		} catch {
			csvError = 'Failed to parse CSV';
			csvParsed = null;
		}
	}

	// --- Fetch storage files ---
	async function fetchStorageFiles() {
		storageLoading = true;
		storageError = null;
		storageFiles = [];
		selectedFiles = new Set();

		try {
			const path = config.stimuli.storagePath ?? '';
			const res = await fetch(
				`/admin/experiments/${experimentId}/storage-check?path=${encodeURIComponent(path)}&all=true`
			);
			const body = await res.json();
			if (body.error) {
				storageError = body.error;
			} else {
				storageFiles = body.files;
				// Auto-select all
				selectedFiles = new Set(body.files);
			}
		} catch {
			storageError = 'Failed to fetch files from storage';
		} finally {
			storageLoading = false;
		}
	}

	// --- File selection ---
	function toggleFile(filename: string) {
		const next = new Set(selectedFiles);
		if (next.has(filename)) next.delete(filename);
		else next.add(filename);
		selectedFiles = next;
	}

	function selectAllFiltered() {
		const next = new Set(selectedFiles);
		for (const f of filteredFiles) next.add(f);
		selectedFiles = next;
	}

	function deselectAllFiltered() {
		const next = new Set(selectedFiles);
		for (const f of filteredFiles) next.delete(f);
		selectedFiles = next;
	}

	let allFilteredSelected = $derived(
		filteredFiles.length > 0 && filteredFiles.every(f => selectedFiles.has(f))
	);

	// --- Proceed to preview ---
	function goToPreview() {
		const existingFilenames = new Set(config.stimuli.items.map(s => s.filename ?? ''));
		const existingIds = new Set(config.stimuli.items.map(s => s.id));

		if (importMode === 'storage') {
			const files = [...selectedFiles];
			// Build CSV data map if CSV is also loaded (combined mode)
			let csvData: Map<string, Record<string, string>> | undefined;
			if (csvParsed && csvParsed.rows.length > 0) {
				csvData = new Map();
				const metaCols = csvParsed.headers.filter(h => h !== 'filename' && h !== 'id');
				for (const row of csvParsed.rows) {
					const key = row.filename || row.id;
					if (key) {
						const meta: Record<string, string> = {};
						for (const col of metaCols) {
							if (row[col]) meta[col] = row[col];
						}
						csvData.set(key, meta);
					}
				}
			}

			candidates = buildStimulusItems(files, {
				patternRegex: patternResult?.regex,
				csvData,
				existingFilenames,
				existingIds
			});
		} else {
			// CSV-only mode
			if (!csvParsed) return;
			const files = csvParsed.rows.map(r => r.filename || r.id).filter(Boolean);
			const csvData = new Map<string, Record<string, string>>();
			const metaCols = csvParsed.headers.filter(h => h !== 'filename' && h !== 'id');
			for (const row of csvParsed.rows) {
				const key = row.filename || row.id;
				if (key) {
					const meta: Record<string, string> = {};
					for (const col of metaCols) {
						if (row[col]) meta[col] = row[col];
					}
					csvData.set(key, meta);
				}
			}
			candidates = buildStimulusItems(files, {
				csvData,
				existingFilenames,
				existingIds
			});
		}

		// Default selection: all non-duplicates checked
		selectedCandidates = new Set(
			candidates.filter(c => !c.duplicate).map(c => c.id)
		);
		previewSearch = '';
		previewPage = 0;
		step = 'preview';
	}

	// --- Preview: filtered + paginated ---
	let filteredCandidates = $derived.by(() => {
		const q = previewSearch.toLowerCase().trim();
		if (!q) return candidates;
		return candidates.filter(c =>
			c.id.toLowerCase().includes(q) ||
			c.filename.toLowerCase().includes(q) ||
			Object.values(c.metadata ?? {}).some(v => v.toLowerCase().includes(q))
		);
	});

	let previewPageCount = $derived(Math.max(1, Math.ceil(filteredCandidates.length / PAGE_SIZE)));
	let previewSafePage = $derived(Math.min(previewPage, previewPageCount - 1));
	let previewPaged = $derived(filteredCandidates.slice(previewSafePage * PAGE_SIZE, (previewSafePage + 1) * PAGE_SIZE));

	let allPreviewSelected = $derived(
		filteredCandidates.length > 0 && filteredCandidates.every(c => selectedCandidates.has(c.id))
	);

	function toggleCandidate(id: string) {
		const next = new Set(selectedCandidates);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedCandidates = next;
	}

	function selectAllPreviewFiltered() {
		const next = new Set(selectedCandidates);
		for (const c of filteredCandidates) next.add(c.id);
		selectedCandidates = next;
	}

	function deselectAllPreviewFiltered() {
		const next = new Set(selectedCandidates);
		for (const c of filteredCandidates) next.delete(c.id);
		selectedCandidates = next;
	}

	// Collect all metadata keys from selected candidates
	let candidateMetadataKeys = $derived.by(() => {
		const keys = new Set<string>();
		for (const c of candidates) {
			if (selectedCandidates.has(c.id) && c.metadata) {
				for (const k of Object.keys(c.metadata)) keys.add(k);
			}
		}
		return [...keys];
	});

	let selectedCount = $derived(selectedCandidates.size);
	let duplicateCount = $derived(candidates.filter(c => c.duplicate && selectedCandidates.has(c.id)).length);

	// --- Import ---
	function doImport() {
		const items: StimulusItemType[] = candidates
			.filter(c => selectedCandidates.has(c.id))
			.map(c => ({
				id: c.id,
				filename: c.filename,
				...(c.metadata && Object.keys(c.metadata).length > 0 ? { metadata: c.metadata } : {})
			}));

		// Collect metadata keys from pattern + CSV
		const newKeys: string[] = [];
		if (patternResult) newKeys.push(...patternResult.keys);
		if (csvParsed) {
			const metaCols = csvParsed.headers.filter(h => h !== 'filename' && h !== 'id');
			newKeys.push(...metaCols);
		}
		const uniqueKeys = [...new Set(newKeys)];

		onimport(items, uniqueKeys, mergeStrategy);
	}

	// --- Can proceed? ---
	let canGoToPreview = $derived.by(() => {
		if (importMode === 'storage') return selectedFiles.size > 0;
		return csvParsed !== null && csvParsed.rows.length > 0;
	});
</script>

<Modal {show} title="Bulk Import Stimuli" wide onclose={onclose}>
	{#if step === 'source'}
		<!-- Tab selector -->
		<div class="flex border-b border-gray-200 mb-4">
			{#if config.stimuli.source === 'supabase-storage' && config.stimuli.storagePath}
				<button
					type="button"
					class="px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer {importMode === 'storage' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
					onclick={() => { importMode = 'storage'; }}
				>From Storage</button>
			{/if}
			<button
				type="button"
				class="px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer {importMode === 'csv' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				onclick={() => { importMode = 'csv'; }}
			>From CSV</button>
		</div>

		{#if importMode === 'storage'}
			<!-- Storage import -->
			<div class="space-y-3">
				<div class="flex items-center gap-3">
					<button
						type="button"
						onclick={fetchStorageFiles}
						disabled={storageLoading}
						class="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
					>
						{storageLoading ? 'Loading...' : storageFiles.length > 0 ? 'Refresh' : 'Fetch files from storage'}
					</button>
					<span class="text-xs text-gray-500 font-mono">{config.stimuli.storagePath}</span>
				</div>

				{#if storageError}
					<p class="text-sm text-red-600">{storageError}</p>
				{/if}

				{#if storageFiles.length > 0}
					<div class="flex items-center gap-2 text-sm text-gray-600">
						<span class="font-medium">{storageFiles.length} files found</span>
						<span class="text-gray-400">|</span>
						<span class="text-indigo-600 font-medium">{selectedFiles.size} selected</span>
					</div>

					<!-- Search + glob filter -->
					<div class="flex gap-2">
						<input
							type="text"
							bind:value={fileSearch}
							placeholder="Search filenames..."
							class="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
						<input
							type="text"
							bind:value={fileGlob}
							placeholder="Glob filter (e.g. anger-*)"
							class="w-48 px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
					</div>

					<!-- Select all / deselect -->
					<div class="flex items-center gap-3">
						<button type="button" onclick={selectAllFiltered} class="text-xs text-indigo-600 hover:text-indigo-800 cursor-pointer">
							Select all{fileSearch || fileGlob ? ' matching' : ''} ({filteredFiles.length})
						</button>
						<button type="button" onclick={deselectAllFiltered} class="text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
							Deselect all{fileSearch || fileGlob ? ' matching' : ''}
						</button>
					</div>

					<!-- File list -->
					<div class="border border-gray-200 rounded max-h-56 overflow-y-auto">
						{#each storagePagedFilesActual as filename (filename)}
							<label class="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs {selectedFiles.has(filename) ? 'bg-indigo-50' : ''}">
								<input
									type="checkbox"
									checked={selectedFiles.has(filename)}
									onchange={() => toggleFile(filename)}
								/>
								<span class="font-mono truncate">{filename}</span>
							</label>
						{/each}
					</div>

					<!-- Pagination -->
					{#if storagePageCount > 1}
						<div class="flex items-center justify-center gap-2">
							<button type="button" disabled={storagePageSafe === 0} onclick={() => storagePage = storagePageSafe - 1}
								class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">&lt;</button>
							<span class="text-xs text-gray-500">{storagePageSafe + 1} / {storagePageCount}</span>
							<button type="button" disabled={storagePageSafe >= storagePageCount - 1} onclick={() => storagePage = storagePageSafe + 1}
								class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">&gt;</button>
						</div>
					{/if}

					<!-- Filename pattern for metadata extraction -->
					<div class="border-t border-gray-200 pt-3 space-y-2">
						<label class="block text-xs text-gray-500">
							Filename pattern <span class="text-gray-400">(optional — extract metadata from filenames)</span>
						</label>
						<input
							type="text"
							bind:value={filenamePattern}
							placeholder="e.g. {'{emotion}'}-{'{actor}'}-{'{take}'}.mp4"
							class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
						{#if patternResult && patternPreview.length > 0}
							<div class="text-xs space-y-1">
								<p class="text-gray-500">Preview ({patternResult.keys.join(', ')}):</p>
								{#each patternPreview as sample}
									<div class="flex items-center gap-2 font-mono">
										<span class="text-gray-400 truncate max-w-40">{sample.filename}</span>
										<span class="text-gray-300">&rarr;</span>
										{#if sample.metadata}
											<span class="text-green-700">{JSON.stringify(sample.metadata)}</span>
										{:else}
											<span class="text-amber-600">no match</span>
										{/if}
									</div>
								{/each}
							</div>
						{:else if filenamePattern.trim() && !patternResult}
							<p class="text-xs text-amber-600">Pattern needs at least one {'{placeholder}'}</p>
						{/if}
					</div>

					<!-- Optional CSV enrichment in storage mode -->
					<div class="border-t border-gray-200 pt-3 space-y-2">
						<label class="block text-xs text-gray-500">
							CSV metadata enrichment <span class="text-gray-400">(optional — upload a CSV to add metadata by filename)</span>
						</label>
						<input type="file" accept=".csv,.tsv,.txt" onchange={handleCSVFile} class="text-xs" />
						{#if csvParsed}
							<p class="text-xs text-green-700">
								{csvParsed.rows.length} rows, columns: {csvParsed.headers.join(', ')}
							</p>
						{/if}
						{#if csvError}
							<p class="text-xs text-red-600">{csvError}</p>
						{/if}
					</div>
				{/if}
			</div>

		{:else}
			<!-- CSV import -->
			<div class="space-y-3">
				<div>
					<label class="block text-xs text-gray-500 mb-1">Upload CSV file</label>
					<input type="file" accept=".csv,.tsv,.txt" onchange={handleCSVFile} class="text-xs" />
				</div>
				<div>
					<label class="block text-xs text-gray-500 mb-1">Or paste CSV content</label>
					<textarea
						bind:value={csvText}
						rows={6}
						class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
						placeholder="filename,emotion,actor&#10;anger-1.mp4,anger,john&#10;joy-2.mp4,joy,jane"
					></textarea>
					<button
						type="button"
						onclick={doParseCSV}
						disabled={!csvText.trim()}
						class="mt-1 px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer disabled:opacity-50"
					>Parse CSV</button>
				</div>

				{#if csvError}
					<p class="text-sm text-red-600">{csvError}</p>
				{/if}

				{#if csvParsed}
					<div class="text-xs space-y-1">
						<p class="text-green-700 font-medium">{csvParsed.rows.length} rows parsed</p>
						<p class="text-gray-500">Columns: {csvParsed.headers.join(', ')}</p>
						{#if csvParsed.rows.length > 0}
							<div class="border border-gray-200 rounded overflow-x-auto">
								<table class="text-xs w-full">
									<thead>
										<tr class="bg-gray-50">
											{#each csvParsed.headers as h}
												<th class="px-2 py-1 text-left font-medium text-gray-600">{h}</th>
											{/each}
										</tr>
									</thead>
									<tbody>
										{#each csvParsed.rows.slice(0, 3) as row}
											<tr class="border-t border-gray-100">
												{#each csvParsed.headers as h}
													<td class="px-2 py-1 text-gray-700 font-mono">{row[h] ?? ''}</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
								{#if csvParsed.rows.length > 3}
									<p class="px-2 py-1 text-gray-400">... and {csvParsed.rows.length - 3} more rows</p>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Footer -->
		<div class="flex justify-between items-center mt-6 pt-4 border-t border-gray-200">
			<button type="button" onclick={onclose} class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">
				Cancel
			</button>
			<button
				type="button"
				onclick={goToPreview}
				disabled={!canGoToPreview}
				class="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Next: Preview
			</button>
		</div>

	{:else}
		<!-- Preview step -->
		<div class="space-y-3">
			<!-- Merge strategy -->
			<div class="flex items-center gap-4 text-sm">
				<label class="flex items-center gap-1.5 cursor-pointer">
					<input type="radio" bind:group={mergeStrategy} value="append" />
					<span>Append to existing {config.stimuli.items.length} items</span>
				</label>
				<label class="flex items-center gap-1.5 cursor-pointer">
					<input type="radio" bind:group={mergeStrategy} value="replace" />
					<span class="text-amber-700">Replace all existing items</span>
				</label>
			</div>

			<!-- Summary -->
			<div class="flex items-center gap-2 text-sm">
				<span class="font-medium text-gray-700">
					{selectedCount} item{selectedCount === 1 ? '' : 's'} to import
				</span>
				{#if duplicateCount > 0}
					<span class="text-amber-600">({duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'})</span>
				{/if}
			</div>

			<!-- Search -->
			<input
				type="text"
				bind:value={previewSearch}
				placeholder="Search preview..."
				class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
			/>

			<!-- Select all / deselect -->
			<div class="flex items-center gap-3">
				<label class="flex items-center gap-1.5 cursor-pointer text-xs">
					<input
						type="checkbox"
						checked={allPreviewSelected}
						onchange={(e) => { if ((e.target as HTMLInputElement).checked) selectAllPreviewFiltered(); else deselectAllPreviewFiltered(); }}
					/>
					<span class="text-gray-600">Select all{previewSearch ? ' matching' : ''}</span>
				</label>
			</div>

			<!-- Candidate table -->
			<div class="border border-gray-200 rounded overflow-x-auto">
				<table class="text-xs w-full">
					<thead>
						<tr class="bg-gray-50">
							<th class="px-2 py-1.5 w-8"></th>
							<th class="px-2 py-1.5 text-left font-medium text-gray-600">ID</th>
							<th class="px-2 py-1.5 text-left font-medium text-gray-600">Filename</th>
							{#each candidateMetadataKeys as key}
								<th class="px-2 py-1.5 text-left font-medium text-gray-600">{key}</th>
							{/each}
							<th class="px-2 py-1.5 text-left font-medium text-gray-600 w-16">Status</th>
						</tr>
					</thead>
					<tbody>
						{#each previewPaged as candidate (candidate.id)}
							<tr class="border-t border-gray-100 {selectedCandidates.has(candidate.id) ? 'bg-indigo-50' : ''} {candidate.duplicate ? 'bg-amber-50' : ''}">
								<td class="px-2 py-1">
									<input
										type="checkbox"
										checked={selectedCandidates.has(candidate.id)}
										onchange={() => toggleCandidate(candidate.id)}
									/>
								</td>
								<td class="px-2 py-1 font-mono text-gray-700">{candidate.id}</td>
								<td class="px-2 py-1 font-mono text-gray-500 max-w-48 truncate">{candidate.filename}</td>
								{#each candidateMetadataKeys as key}
									<td class="px-2 py-1 text-gray-600">{candidate.metadata?.[key] ?? ''}</td>
								{/each}
								<td class="px-2 py-1">
									{#if candidate.duplicate}
										<span class="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">exists</span>
									{:else}
										<span class="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">new</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			{#if previewPageCount > 1}
				<div class="flex items-center justify-center gap-2">
					<button type="button" disabled={previewSafePage === 0} onclick={() => previewPage = previewSafePage - 1}
						class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">&lt;</button>
					<span class="text-xs text-gray-500">{previewSafePage + 1} / {previewPageCount}</span>
					<button type="button" disabled={previewSafePage >= previewPageCount - 1} onclick={() => previewPage = previewSafePage + 1}
						class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">&gt;</button>
				</div>
			{/if}

			<!-- Footer -->
			<div class="flex justify-between items-center pt-4 border-t border-gray-200">
				<button type="button" onclick={() => { step = 'source'; }} class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">
					&larr; Back
				</button>
				<button
					type="button"
					onclick={doImport}
					disabled={selectedCount === 0}
					class="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Import {selectedCount} item{selectedCount === 1 ? '' : 's'}
				</button>
			</div>
		</div>
	{/if}
</Modal>

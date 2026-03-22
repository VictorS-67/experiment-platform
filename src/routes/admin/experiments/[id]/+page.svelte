<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfigEditor from '$lib/components/admin/ConfigEditor.svelte';
	import Modal from '$lib/components/layout/Modal.svelte';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { data, form } = $props();

	type Tab = 'settings' | 'config' | 'versions';
	type ConfigMode = 'form' | 'json';
	let activeTab = $state<Tab>('settings');
	let configMode = $state<ConfigMode>('form');

	// The config object used by both Form and JSON modes
	let configState = $state<ExperimentConfig>(structuredClone(data.experiment.config));
	let configJson = $state(JSON.stringify(data.experiment.config, null, 2));
	let jsonError = $state<string | null>(null);

	let saving = $state(false);
	let statusUpdating = $state(false);
	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');
	let deleting = $state(false);
	let duplicating = $state(false);
	let rollingBack = $state(false);

	let toast = $state<{ type: 'success' | 'error'; message: string } | null>(null);

	function showToast(type: 'success' | 'error', message: string) {
		toast = { type, message };
		setTimeout(() => (toast = null), 3000);
	}

	$effect(() => {
		if (form?.success) {
			if (form.statusUpdated) {
				showToast('success', 'Status updated.');
			} else if (form.rolledBack) {
				showToast('success', 'Config restored. Reload the Config tab to see changes.');
				// Re-sync after rollback
				configState = structuredClone(data.experiment.config);
				configJson = JSON.stringify(data.experiment.config, null, 2);
			} else {
				showToast('success', 'Config saved.');
				// Re-sync configState from freshly loaded data (Zod may have added defaults during save)
				configState = structuredClone(data.experiment.config);
				configJson = JSON.stringify(data.experiment.config, null, 2);
			}
		} else if (form?.error) {
			showToast('error', form.error);
		}
	});

	// Sync between form and JSON modes
	function switchToJson() {
		configJson = JSON.stringify(configState, null, 2);
		jsonError = null;
		configMode = 'json';
	}

	function switchToForm() {
		try {
			const parsed = JSON.parse(configJson);
			configState = parsed as ExperimentConfig;
			jsonError = null;
			configMode = 'form';
		} catch {
			jsonError = 'Invalid JSON — fix errors before switching to Form mode.';
		}
	}

	// Compare current editing state to what's saved in the DB
	let savedConfigJson = $derived(JSON.stringify(data.experiment.config));
	let hasUnsavedChanges = $derived.by(() => {
		if (configMode === 'form') {
			return JSON.stringify(configState) !== savedConfigJson;
		}
		try {
			return JSON.stringify(JSON.parse(configJson)) !== savedConfigJson;
		} catch {
			return true; // Invalid JSON counts as unsaved
		}
	});

	// When saving, always serialize from the current mode's state
	function getConfigForSave(): string {
		if (configMode === 'form') {
			return JSON.stringify(configState, null, 2);
		}
		return configJson;
	}

	function formatJson() {
		try {
			const parsed = JSON.parse(configJson);
			configJson = JSON.stringify(parsed, null, 2);
			jsonError = null;
		} catch {
			jsonError = 'Cannot format — invalid JSON syntax.';
		}
	}

	function getTitle(config: Record<string, unknown>): string {
		const meta = config?.metadata as Record<string, unknown> | undefined;
		const title = meta?.title as Record<string, string> | undefined;
		return title?.en || title?.ja || Object.values(title || {})[0] || 'Untitled';
	}

	const statusOptions = ['draft', 'active', 'paused', 'archived'] as const;
	const statusColors: Record<string, string> = {
		draft: 'bg-gray-100 text-gray-700',
		active: 'bg-green-100 text-green-700',
		paused: 'bg-yellow-100 text-yellow-700',
		archived: 'bg-red-100 text-red-700'
	};
</script>

<svelte:head>
	<title>{getTitle(data.experiment.config)} - Edit - Admin</title>
</svelte:head>

<div class="p-8">
	<!-- Header -->
	<div class="mb-6">
		<a href="/admin/experiments" class="text-sm text-gray-500 hover:text-gray-700">&larr; Back to experiments</a>
	</div>

	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-semibold text-gray-800">{getTitle(data.experiment.config)}</h1>
			<p class="text-sm text-gray-500 mt-1">
				<code class="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{data.experiment.slug}</code>
				<span class="mx-2">&middot;</span>
				<span class="px-2 py-0.5 rounded-full text-xs font-medium {statusColors[data.experiment.status] || 'bg-gray-100 text-gray-700'}">
					{data.experiment.status}
				</span>
			</p>
		</div>
		<div class="flex gap-2">
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
			<a
				href="/admin/experiments/{data.experiment.id}/data"
				class="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-gray-700"
			>
				View Data
			</a>
		</div>
	</div>

	<!-- Toast -->
	{#if toast}
		<div class="mb-4 p-3 rounded text-sm {toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}">
			<pre class="whitespace-pre-wrap font-sans">{toast.message}</pre>
		</div>
	{/if}

	<!-- Tabs -->
	<div class="border-b border-gray-200 mb-6">
		<nav class="flex gap-6">
			<button
				type="button"
				class="pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer {activeTab === 'settings' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				onclick={() => (activeTab = 'settings')}
			>
				Settings
			</button>
			<button
				type="button"
				class="pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer {activeTab === 'config' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				onclick={() => (activeTab = 'config')}
			>
				Config
			</button>
			<button
				type="button"
				class="pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer {activeTab === 'versions' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
				onclick={() => (activeTab = 'versions')}
			>
				Versions {#if data.versions.length > 0}<span class="ml-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">{data.versions.length}</span>{/if}
			</button>
		</nav>
	</div>

	<!-- Settings Tab -->
	{#if activeTab === 'settings'}
		<div class="space-y-6 max-w-2xl">
			<!-- Status -->
			<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
				<h2 class="text-lg font-medium text-gray-800 mb-4">Status</h2>
				<form
					method="POST"
					action="?/updateStatus"
					use:enhance={() => {
						statusUpdating = true;
						return async ({ update }) => {
							await update({ reset: false });
							statusUpdating = false;
						};
					}}
					class="flex items-end gap-3"
				>
					<div class="flex-1">
						<label for="status" class="block text-sm text-gray-600 mb-1">Experiment status</label>
						<select
							id="status"
							name="status"
							class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
							value={data.experiment.status}
						>
							{#each statusOptions as s}
								<option value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
							{/each}
						</select>
					</div>
					<button
						type="submit"
						disabled={statusUpdating}
						class="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50 text-sm"
					>
						{statusUpdating ? 'Updating...' : 'Update'}
					</button>
				</form>
			</div>

			<!-- Info -->
			<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
				<h2 class="text-lg font-medium text-gray-800 mb-4">Info</h2>
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

			<!-- Danger Zone -->
			<div class="bg-white rounded-lg shadow-sm border border-red-200 p-6">
				<h2 class="text-lg font-medium text-red-700 mb-2">Danger Zone</h2>
				<p class="text-sm text-gray-600 mb-4">Deleting an experiment removes it permanently along with all related data.</p>

				<button
					type="button"
					onclick={() => { showDeleteConfirm = true; deleteConfirmText = ''; }}
					class="text-sm px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors cursor-pointer"
				>
					Delete Experiment
				</button>
			</div>

			<Modal
				show={showDeleteConfirm}
				title="Delete Experiment"
				onclose={() => { showDeleteConfirm = false; deleteConfirmText = ''; }}
			>
				<p class="text-sm text-gray-700 mb-4">This will permanently delete the experiment and all its data. Type <strong>delete experiment</strong> to confirm.</p>
				<input
					type="text"
					bind:value={deleteConfirmText}
					placeholder="delete experiment"
					class="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
				/>
				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						deleting = true;
						return async ({ update }) => { await update({ reset: false }); deleting = false; };
					}}
				>
					<div class="flex gap-2 justify-end">
						<button
							type="button"
							onclick={() => { showDeleteConfirm = false; deleteConfirmText = ''; }}
							class="text-sm px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 cursor-pointer"
						>Cancel</button>
						<button
							type="submit"
							disabled={deleteConfirmText !== 'delete experiment' || deleting}
							class="text-sm px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
						>{deleting ? 'Deleting...' : 'Delete Experiment'}</button>
					</div>
				</form>
			</Modal>
		</div>

	<!-- Config Tab -->
	{:else if activeTab === 'config'}
		{#if data.experiment.status === 'active' && data.participantCount > 0}
			<div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
				⚠ This experiment has {data.participantCount} active participant{data.participantCount === 1 ? '' : 's'}. Changing stimulus IDs or widget IDs may cause existing response data to no longer match the config.
			</div>
		{/if}
		<form
			method="POST"
			action="?/saveConfig"
			use:enhance={({ formData }) => {
				formData.set('config', getConfigForSave());
				saving = true;
				return async ({ update }) => {
					await update({ reset: false });
					saving = false;
				};
			}}
		>
			<!-- Mode toggle + save button -->
			<div class="flex items-center justify-between mb-4">
				<div class="flex items-center gap-1 bg-gray-100 rounded p-0.5">
					<button
						type="button"
						class="px-3 py-1 rounded text-sm font-medium transition-colors cursor-pointer {configMode === 'form' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
						onclick={() => { if (configMode === 'json') switchToForm(); }}
					>
						Form
					</button>
					<button
						type="button"
						class="px-3 py-1 rounded text-sm font-medium transition-colors cursor-pointer {configMode === 'json' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
						onclick={() => { if (configMode === 'form') switchToJson(); }}
					>
						JSON
					</button>
				</div>
				<div class="flex gap-2">
					{#if configMode === 'json'}
						<button
							type="button"
							onclick={formatJson}
							class="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-gray-600 cursor-pointer"
						>
							Format
						</button>
					{/if}
					<button
						type="submit"
						disabled={saving}
						class="text-sm px-4 py-1.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
					>
						{saving ? 'Saving...' : 'Save Config'}{#if hasUnsavedChanges && !saving}&nbsp;●{/if}
					</button>
				</div>
			</div>

			{#if jsonError}
				<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
					{jsonError}
				</div>
			{/if}

			{#if configMode === 'form'}
				<ConfigEditor config={configState} experimentId={data.experiment.id} />
			{:else}
				<textarea
					bind:value={configJson}
					oninput={() => { if (jsonError) jsonError = null; }}
					class="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
					style="height: calc(100vh - 280px); min-height: 400px;"
					spellcheck="false"
				></textarea>
			{/if}
		</form>

	<!-- Versions Tab -->
	{:else if activeTab === 'versions'}
		<div class="max-w-2xl">
			{#if data.versions.length === 0}
				<div class="text-center py-12 text-gray-500">
					<p class="mb-1">No versions saved yet.</p>
					<p class="text-sm">Versions are saved automatically each time you click "Save Config".</p>
				</div>
			{:else}
				<div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
					<div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
						<p class="text-sm text-gray-600">{data.versions.length} version{data.versions.length === 1 ? '' : 's'} — newest first</p>
					</div>
					<table class="w-full text-sm">
						<thead class="bg-gray-50 border-b border-gray-200">
							<tr>
								<th class="text-left px-4 py-3 font-medium text-gray-600">#</th>
								<th class="text-left px-4 py-3 font-medium text-gray-600">Saved</th>
								<th class="text-right px-4 py-3 font-medium text-gray-600">Action</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each data.versions as v, i}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-3 text-gray-800 font-medium">v{v.version_number}</td>
									<td class="px-4 py-3 text-gray-500">{new Date(v.created_at).toLocaleString()}</td>
									<td class="px-4 py-3 text-right">
										{#if i === 0}
											<span class="text-xs text-gray-400">current</span>
										{:else}
											<form method="POST" action="?/rollback" use:enhance={() => {
												rollingBack = true;
												return async ({ update }) => { await update({ reset: false }); rollingBack = false; };
											}}>
												<input type="hidden" name="versionId" value={v.id} />
												<button type="submit" disabled={rollingBack}
													class="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-700 cursor-pointer disabled:opacity-50">
													{rollingBack ? '...' : 'Restore'}
												</button>
											</form>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>

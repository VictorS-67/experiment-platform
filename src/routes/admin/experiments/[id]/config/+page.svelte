<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { getContext } from 'svelte';
	import ConfigEditor from '$lib/components/admin/ConfigEditor.svelte';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { data, form } = $props();

	const configEditorCtx = getContext<{
		activeSection: string;
		hasUnsavedChanges: boolean;
		showConfigControls: boolean;
	}>('configEditorState');

	// Form editor state
	let configState = $state<ExperimentConfig>(structuredClone(data.experiment.config));

	// JSON editor state
	let configJson = $state(JSON.stringify(data.experiment.config, null, 2));
	let jsonError = $state<string | null>(null);

	// Optimistic-locking token: the experiments.updated_at we saw when loading
	// this page. Sent back on save so the server can reject with 409 if someone
	// else saved the config in the meantime. `form?.updatedAt` wins over `data`
	// because the action returns the fresh timestamp before the `data` reload.
	let expectedUpdatedAt = $derived(form?.updatedAt ?? data.experiment.updated_at);

	let saving = $state(false);

	let toast = $state<{ type: 'success' | 'error'; message: string } | null>(null);

	let isJsonMode = $derived(configEditorCtx.activeSection === 'json');

	function showToast(type: 'success' | 'error', message: string) {
		toast = { type, message };
		setTimeout(() => (toast = null), 3000);
	}

	$effect(() => {
		if (form?.success) {
			showToast('success', 'Config saved.');
		} else if (form?.error) {
			showToast('error', form.error);
		}
	});

	// Sync when switching to/from JSON section
	let prevSection = configEditorCtx.activeSection;
	$effect(() => {
		const section = configEditorCtx.activeSection;
		if (section === prevSection) return;
		if (section === 'json') {
			// Entering JSON mode: serialize current form state
			configJson = JSON.stringify(configState, null, 2);
			jsonError = null;
		} else if (prevSection === 'json') {
			// Leaving JSON mode: parse back to form state
			try {
				configState = JSON.parse(configJson);
				jsonError = null;
			} catch {
				jsonError = 'Invalid JSON — fix before leaving Full JSON.';
			}
		}
		prevSection = section;
	});

	// Compare editing state to what's saved
	let savedConfigJson = $derived(JSON.stringify(data.experiment.config));
	let hasUnsavedChanges = $derived(JSON.stringify(configState) !== savedConfigJson);
	let jsonHasUnsavedChanges = $derived.by(() => {
		try {
			return JSON.stringify(JSON.parse(configJson)) !== savedConfigJson;
		} catch {
			return true;
		}
	});

	let currentUnsaved = $derived(isJsonMode ? jsonHasUnsavedChanges : hasUnsavedChanges);

	// Sync unsaved state to sidebar context
	$effect(() => {
		configEditorCtx.hasUnsavedChanges = currentUnsaved;
	});

	// Mark config controls as active when on this page
	$effect(() => {
		configEditorCtx.showConfigControls = true;
		return () => {
			configEditorCtx.showConfigControls = false;
			configEditorCtx.hasUnsavedChanges = false;
		};
	});

	// Warn about unsaved changes on navigation
	beforeNavigate(({ cancel }) => {
		if (currentUnsaved && !confirm('You have unsaved changes. Leave anyway?')) {
			cancel();
		}
	});

	function formatJson() {
		try {
			const parsed = JSON.parse(configJson);
			configJson = JSON.stringify(parsed, null, 2);
			jsonError = null;
		} catch {
			jsonError = 'Cannot format — invalid JSON syntax.';
		}
	}
</script>

<svelte:head>
	<title>Config - {data.experiment.config?.metadata?.title?.en ?? data.experiment.slug} - Admin</title>
</svelte:head>

{#if toast}
	<div class="mb-4 p-3 rounded text-sm {toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}">
		<pre class="whitespace-pre-wrap font-sans">{toast.message}</pre>
	</div>
{/if}

{#if data.experiment.status === 'active' && data.participantCount > 0}
	<div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
		This experiment has {data.participantCount} active participant{data.participantCount === 1 ? '' : 's'}. Changing stimulus IDs or widget IDs may cause existing response data to no longer match the config.
	</div>
{/if}

{#if isJsonMode}
	{#if jsonError}
		<div class="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{jsonError}</div>
	{/if}
	<form
		method="POST"
		action="?/saveConfig"
		use:enhance={({ formData }) => {
			formData.set('config', configJson);
			formData.set('expectedUpdatedAt', expectedUpdatedAt);
			saving = true;
			return async ({ update }) => { await update({ reset: false }); saving = false; };
		}}
	>
		<textarea
			bind:value={configJson}
			oninput={() => { if (jsonError) jsonError = null; }}
			class="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y mb-3"
			style="height: 600px; min-height: 300px;"
			spellcheck="false"
		></textarea>
		<div class="flex gap-2 justify-end">
			<button
				type="button"
				onclick={formatJson}
				class="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-gray-600 cursor-pointer"
			>Format</button>
			<button
				type="submit"
				disabled={saving}
				class="text-sm px-4 py-1.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
			>{saving ? 'Saving...' : 'Save Config'}{#if jsonHasUnsavedChanges && !saving}&nbsp;●{/if}</button>
		</div>
	</form>
{:else}
	<form
		method="POST"
		action="?/saveConfig"
		use:enhance={({ formData }) => {
			formData.set('config', JSON.stringify(configState, null, 2));
			formData.set('expectedUpdatedAt', expectedUpdatedAt);
			saving = true;
			return async ({ update }) => {
				await update({ reset: false });
				saving = false;
			};
		}}
	>
		<div class="flex justify-end mb-4">
			<button
				type="submit"
				disabled={saving}
				class="text-sm px-4 py-1.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
			>
				{saving ? 'Saving...' : 'Save Config'}{#if hasUnsavedChanges && !saving}&nbsp;●{/if}
			</button>
		</div>
		<ConfigEditor config={configState} experimentId={data.experiment.id} activeSection={configEditorCtx.activeSection} />
	</form>
{/if}

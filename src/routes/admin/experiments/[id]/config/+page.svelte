<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { getContext } from 'svelte';
	import ConfigEditor from '$lib/components/admin/ConfigEditor.svelte';
	import Toast from '$lib/components/admin/Toast.svelte';
	import { ToastState } from '$lib/utils/toast.svelte';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { data, form } = $props();

	const configEditorCtx = getContext<{
		activeSection: string;
		hasUnsavedChanges: boolean;
		showConfigControls: boolean;
	}>('configEditorState');

	// Form editor state — deliberately a one-shot clone of the server-loaded
	// config. If `data.experiment.config` changes while the user is editing
	// (e.g. navigation round-trip), we do NOT want to blow away their in-flight
	// edits; they'll see the updated-at conflict on save instead.
	// svelte-ignore state_referenced_locally
	let configState = $state<ExperimentConfig>(structuredClone(data.experiment.config));

	// JSON editor state — same one-shot pattern as configState above.
	// svelte-ignore state_referenced_locally
	let configJson = $state(JSON.stringify(data.experiment.config, null, 2));
	let jsonError = $state<string | null>(null);

	// Optimistic-locking token: the experiments.updated_at we saw when loading
	// this page. Sent back on save so the server can reject with 409 if someone
	// else saved the config in the meantime. `form?.updatedAt` wins over `data`
	// because the action returns the fresh timestamp before the `data` reload.
	let expectedUpdatedAt = $derived(form?.updatedAt ?? data.experiment.updated_at);

	let saving = $state(false);

	// Viewers (read-only role) should not see edit affordances. The server
	// rejects their save POST with 403 anyway, but a button they can't use is
	// confusing UX.
	let canEdit = $derived(data.myRole === 'owner' || data.myRole === 'editor');

	const toast = new ToastState();

	let isJsonMode = $derived(configEditorCtx.activeSection === 'json');

	$effect(() => {
		if (form?.success) {
			toast.show('success', 'Config saved.');
		} else if (form?.error) {
			toast.show('error', form.error);
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

	// Compare editing state to what's saved. Postgres JSONB doesn't preserve
	// key order on read, so a naive JSON.stringify comparison of the in-memory
	// editor state vs data.experiment.config would flag "dirty" even right
	// after a successful save. Canonicalize by sorting object keys before
	// stringifying so the comparison is order-independent.
	function canonical(value: unknown): string {
		return JSON.stringify(value, function replacer(_key, v) {
			if (v && typeof v === 'object' && !Array.isArray(v)) {
				return Object.keys(v).sort().reduce((acc: Record<string, unknown>, k) => {
					acc[k] = (v as Record<string, unknown>)[k];
					return acc;
				}, {});
			}
			return v;
		});
	}
	let savedConfigJson = $derived(canonical(data.experiment.config));
	let hasUnsavedChanges = $derived(canonical(configState) !== savedConfigJson);
	let jsonHasUnsavedChanges = $derived.by(() => {
		try {
			return canonical(JSON.parse(configJson)) !== savedConfigJson;
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

<Toast toast={toast.current} />

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
			return async ({ update }) => {
				await update({ reset: false });
				// Re-sync local editor state from the freshly-loaded config so
				// the dirty indicator clears. Zod fills in defaults server-side
				// (e.g. `allowRevisit: true`) and Postgres JSONB re-orders keys
				// on read; without this re-sync, a naive comparison of the
				// textarea text to `data.experiment.config` would always flag
				// "dirty" even on a clean save.
				configJson = JSON.stringify(data.experiment.config, null, 2);
				configState = structuredClone(data.experiment.config);
				saving = false;
			};
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
			{#if canEdit}
				<button
					type="submit"
					disabled={saving}
					class="text-sm px-4 py-1.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
				>{saving ? 'Saving...' : 'Save Config'}{#if jsonHasUnsavedChanges && !saving}&nbsp;●{/if}</button>
			{/if}
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
				// See JSON-mode save above — re-sync after the server round trip
				// so the dirty pulse clears.
				configState = structuredClone(data.experiment.config);
				configJson = JSON.stringify(data.experiment.config, null, 2);
				saving = false;
			};
		}}
	>
		<div class="flex justify-end mb-4">
			{#if canEdit}
				<button
					type="submit"
					disabled={saving}
					class="text-sm px-4 py-1.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
				>
					{saving ? 'Saving...' : 'Save Config'}{#if hasUnsavedChanges && !saving}&nbsp;●{/if}
				</button>
			{/if}
		</div>
		<ConfigEditor config={configState} experimentId={data.experiment.id} activeSection={configEditorCtx.activeSection} />
	</form>
{/if}

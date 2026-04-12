<script lang="ts">
	import { setContext } from 'svelte';
	import { page } from '$app/stores';
	import ExperimentSidebar from '$lib/components/admin/ExperimentSidebar.svelte';

	let { data, children } = $props();

	let experiment = $derived({
		id: data.experiment.id,
		title: data.experiment.config?.metadata?.title?.en ?? data.experiment.slug,
		slug: data.experiment.slug,
		status: data.experiment.status
	});

	// Shared state for config editor ↔ sidebar communication
	let configEditorState = $state({
		activeSection: 'metadata' as string,
		hasUnsavedChanges: false,
		showConfigControls: false
	});

	setContext('configEditorState', configEditorState);

	// Mobile sidebar toggle
	let sidebarOpen = $state(false);

	// Close sidebar on navigation
	$effect(() => {
		$page.url.pathname;
		sidebarOpen = false;
	});
</script>

<!-- Mobile menu button -->
<button
	type="button"
	class="md:hidden fixed top-15 left-3 z-40 p-2 bg-white border border-gray-200 rounded-lg shadow-sm"
	onclick={() => (sidebarOpen = !sidebarOpen)}
>
	<svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		{#if sidebarOpen}
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
		{:else}
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
		{/if}
	</svg>
</button>

<!-- Mobile overlay -->
{#if sidebarOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="md:hidden fixed inset-0 bg-black/30 z-30"
		onclick={() => (sidebarOpen = false)}
		onkeydown={(e) => { if (e.key === 'Escape') sidebarOpen = false; }}
		role="presentation"
	></div>
{/if}

<!-- Sidebar: always visible on md+, slide-over on mobile -->
<div class="hidden md:flex flex-shrink-0">
	<ExperimentSidebar
		{experiment}
		activeConfigSection={configEditorState.activeSection}
		hasUnsavedChanges={configEditorState.hasUnsavedChanges}
		showConfigControls={configEditorState.showConfigControls}
		onsectionchange={(section) => { configEditorState.activeSection = section; }}
	/>
</div>

{#if sidebarOpen}
	<div class="md:hidden fixed left-0 top-14 bottom-0 z-30">
		<ExperimentSidebar
			{experiment}
			activeConfigSection={configEditorState.activeSection}
			hasUnsavedChanges={configEditorState.hasUnsavedChanges}
			showConfigControls={configEditorState.showConfigControls}
			onsectionchange={(section) => { configEditorState.activeSection = section; }}
		/>
	</div>
{/if}

<main class="flex-1 overflow-auto p-6">
	{@render children()}
</main>

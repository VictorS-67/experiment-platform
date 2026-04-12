<script lang="ts">
	import { page } from '$app/stores';

	let {
		experiment,
		activeConfigSection,
		onsectionchange,
		hasUnsavedChanges = false,
		showConfigControls = false
	}: {
		experiment: { id: string; title: string; slug: string; status: string };
		activeConfigSection?: string;
		onsectionchange?: (section: string) => void;
		hasUnsavedChanges?: boolean;
		showConfigControls?: boolean;
	} = $props();

	let currentPath = $derived($page.url.pathname);
	let basePath = $derived(`/admin/experiments/${experiment.id}`);

	const configSections = [
		{ id: 'metadata', label: 'Metadata' },
		{ id: 'registration', label: 'Registration' },
		{ id: 'phases', label: 'Phases' },
		{ id: 'stimuli', label: 'Stimuli' },
		{ id: 'chunking', label: 'Chunking & Blocks' },
		{ id: 'tutorial', label: 'Tutorial' },
		{ id: 'completion', label: 'Completion' },
		{ id: 'json', label: 'Full JSON' }
	];

	const topNav = [
		{ id: 'overview', label: 'Overview', href: '' },
		{ id: 'config', label: 'Config', href: '/config' },
		{ id: 'data', label: 'Data', href: '/data' },
		{ id: 'analytics', label: 'Analytics', href: '/analytics', disabled: true },
		{ id: 'settings', label: 'Settings', href: '/settings' },
		{ id: 'versions', label: 'Versions', href: '/versions' }
	];

	function isActive(navHref: string): boolean {
		const fullHref = basePath + navHref;
		if (navHref === '') return currentPath === basePath;
		return currentPath.startsWith(fullHref);
	}

	const statusColors: Record<string, string> = {
		draft: 'bg-gray-200 text-gray-700',
		active: 'bg-green-100 text-green-800',
		paused: 'bg-yellow-100 text-yellow-800',
		archived: 'bg-red-100 text-red-800'
	};
</script>

<aside class="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
	<!-- Experiment header -->
	<div class="p-4 border-b border-gray-100">
		<a href="/admin/experiments" class="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
			← Experiments
		</a>
		<h2 class="font-semibold text-sm text-gray-900 leading-tight">{experiment.title}</h2>
		<div class="flex items-center gap-2 mt-1">
			<code class="text-xs text-gray-400">{experiment.slug}</code>
			<span class="text-xs px-1.5 py-0.5 rounded-full {statusColors[experiment.status] ?? 'bg-gray-200 text-gray-700'}">
				{experiment.status}
			</span>
		</div>
	</div>

	<!-- Navigation -->
	<nav class="flex-1 p-2 space-y-0.5">
		{#each topNav as item}
			{@const active = isActive(item.href)}
			{#if item.disabled}
				<div class="px-3 py-1.5 text-xs text-gray-300 cursor-not-allowed flex items-center justify-between">
					{item.label}
					<span class="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Soon</span>
				</div>
			{:else}
				<a
					href="{basePath}{item.href}"
					class="block px-3 py-1.5 rounded text-sm transition-colors {active ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}"
				>
					{item.label}
					{#if item.id === 'config' && hasUnsavedChanges}
						<span class="text-indigo-500 ml-1">●</span>
					{/if}
				</a>
			{/if}

			<!-- Config sub-sections -->
			{#if item.id === 'config' && isActive('/config')}
				<div class="ml-3 space-y-0.5 pb-1">
					{#each configSections as section}
						<button
							type="button"
							onclick={() => onsectionchange?.(section.id)}
							class="block w-full text-left px-3 py-1 rounded text-xs transition-colors {activeConfigSection === section.id ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
						>
							{section.label}
						</button>
					{/each}
				</div>
			{/if}
		{/each}
	</nav>
</aside>

<script lang="ts">
	let { data } = $props();

	function getTitle(config: Record<string, unknown>): string {
		const meta = config?.metadata as Record<string, unknown> | undefined;
		const title = meta?.title as Record<string, string> | undefined;
		return title?.en || title?.ja || Object.values(title || {})[0] || 'Untitled';
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getName(registrationData: Record<string, unknown> | null): string {
		if (!registrationData) return '—';
		const name = registrationData.name as string | undefined;
		return name || '—';
	}
</script>

<svelte:head>
	<title>Data - {getTitle(data.experiment.config)} - Admin</title>
</svelte:head>

<div class="p-8">
	<div class="mb-6">
		<a href="/admin/experiments/{data.experiment.id}" class="text-sm text-gray-500 hover:text-gray-700">&larr; Back to experiment</a>
	</div>

	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-semibold text-gray-800">{getTitle(data.experiment.config)}</h1>
			<p class="text-sm text-gray-500 mt-1">Participant data &amp; export</p>
		</div>
		<a
			href="/admin/experiments/{data.experiment.id}/data/export"
			class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors text-sm font-medium"
		>
			Export CSV
		</a>
	</div>

	{#if data.participants.length === 0}
		<div class="text-center py-16 text-gray-500">
			<p class="text-lg mb-2">No participants yet</p>
			<p class="text-sm">Participants will appear here once they register.</p>
		</div>
	{:else}
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
			<div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
				<p class="text-sm text-gray-600">{data.participants.length} participant{data.participants.length === 1 ? '' : 's'}</p>
			</div>
			<table class="w-full text-sm">
				<thead class="bg-gray-50 border-b border-gray-200">
					<tr>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Email</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Responses</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Registered</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each data.participants as p}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3 text-gray-800">{p.email}</td>
							<td class="px-4 py-3 text-gray-600">{getName(p.registration_data)}</td>
							<td class="px-4 py-3 text-gray-600">{p.responseCount}</td>
							<td class="px-4 py-3 text-gray-500">{formatDate(p.registered_at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

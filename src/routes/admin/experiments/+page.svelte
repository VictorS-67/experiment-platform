<script lang="ts">
	import { enhance } from '$app/forms';
	import { localizedTitle, STATUS_COLORS, type ExperimentStatus } from '$lib/utils/admin-display';
	import { formatDate } from '$lib/utils/format-date';

	let { data } = $props();
</script>

<svelte:head>
	<title>Experiments - Admin</title>
</svelte:head>

<div class="p-8">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-semibold text-gray-800">Experiments</h1>
		<a
			href="/admin/experiments/new"
			class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors text-sm font-medium"
		>
			New Experiment
		</a>
	</div>

	{#if data.experiments.length === 0}
		<div class="text-center py-16 text-gray-500">
			<p class="text-lg mb-2">No experiments yet</p>
			<p class="text-sm">Create your first experiment to get started.</p>
		</div>
	{:else}
		<div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
			<table class="w-full text-sm">
				<thead class="bg-gray-50 border-b border-gray-200">
					<tr>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Slug</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Status</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Participants</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Created</th>
						<th class="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each data.experiments as exp}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-3 font-medium text-gray-800">
								{localizedTitle(exp.title)}
							</td>
							<td class="px-4 py-3 text-gray-500">
								<code class="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{exp.slug}</code>
							</td>
							<td class="px-4 py-3">
								<span class="px-2 py-0.5 rounded-full text-xs font-medium {STATUS_COLORS[exp.status as ExperimentStatus] ?? 'bg-gray-100 text-gray-700'}">
									{exp.status}
								</span>
							</td>
							<td class="px-4 py-3 text-gray-600">{exp.participantCount}</td>
							<td class="px-4 py-3 text-gray-500">{formatDate(exp.createdAt)}</td>
							<td class="px-4 py-3 text-right">
								<div class="flex items-center justify-end gap-3">
									<a href="/admin/experiments/{exp.id}" class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">
										Edit
									</a>
									<a href="/admin/experiments/{exp.id}/data" class="text-gray-500 hover:text-gray-700 text-xs font-medium">
										Data
									</a>
									<form method="POST" action="?/duplicate" use:enhance>
										<input type="hidden" name="id" value={exp.id} />
										<button type="submit" class="text-gray-400 hover:text-gray-600 text-xs font-medium cursor-pointer">
											Duplicate
										</button>
									</form>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="mt-8 pt-6 border-t border-gray-200">
		<a
			href="/admin/backup"
			class="text-sm px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors"
		>
			Download Backup
		</a>
		<p class="mt-2 text-xs text-gray-400">Downloads all experiments, participants, and responses as a JSON file.</p>
	</div>
</div>

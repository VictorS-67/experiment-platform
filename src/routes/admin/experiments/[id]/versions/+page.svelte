<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let rollingBack = $state(false);

	let toast = $state<{ type: 'success' | 'error'; message: string } | null>(null);

	function showToast(type: 'success' | 'error', message: string) {
		toast = { type, message };
		setTimeout(() => (toast = null), 3000);
	}

	$effect(() => {
		if (form?.success && form.rolledBack) {
			showToast('success', 'Config restored to selected version.');
		} else if (form?.error) {
			showToast('error', form.error);
		}
	});
</script>

<svelte:head>
	<title>Versions - {data.experiment.config?.metadata?.title?.en ?? data.experiment.slug} - Admin</title>
</svelte:head>

{#if toast}
	<div class="mb-4 p-3 rounded text-sm {toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}">
		<pre class="whitespace-pre-wrap font-sans">{toast.message}</pre>
	</div>
{/if}

<div class="max-w-2xl">
	{#if data.versions.length === 0}
		<div class="text-center py-12 text-gray-500">
			<p class="mb-1">No versions saved yet.</p>
			<p class="text-sm">Versions are saved automatically each time you save the config.</p>
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
										<input type="hidden" name="expectedUpdatedAt" value={data.experiment.updated_at ?? ''} />
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

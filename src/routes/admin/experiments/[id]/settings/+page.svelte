<script lang="ts">
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/layout/Modal.svelte';
	import CollaboratorsPanel from '$lib/components/admin/CollaboratorsPanel.svelte';

	let { data, form } = $props();

	let statusUpdating = $state(false);
	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');
	let deleting = $state(false);

	let toast = $state<{ type: 'success' | 'error'; message: string } | null>(null);

	function showToast(type: 'success' | 'error', message: string) {
		toast = { type, message };
		setTimeout(() => (toast = null), 3000);
	}

	$effect(() => {
		if (form?.success) {
			if (form.statusUpdated) showToast('success', 'Status updated.');
			else if (form.roleChanged) showToast('success', 'Role updated.');
			else if (form.removed) showToast('success', 'Collaborator removed.');
			else if (form.inviteRevoked) showToast('success', 'Invite revoked.');
			// Note: invite success has its own inline UI in CollaboratorsPanel.
		} else if (form?.error && !form.form) {
			showToast('error', form.error);
		}
	});

	const statusOptions = ['draft', 'active', 'paused', 'archived'] as const;
	const isOwner = $derived(data.myRole === 'owner');
	const canEditStatus = $derived(data.myRole === 'owner' || data.myRole === 'editor');
</script>

<svelte:head>
	<title>Settings - {data.experiment.config?.metadata?.title?.en ?? data.experiment.slug} - Admin</title>
</svelte:head>

{#if toast}
	<div class="mb-4 p-3 rounded text-sm {toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}">
		<pre class="whitespace-pre-wrap font-sans">{toast.message}</pre>
	</div>
{/if}

<div class="max-w-2xl space-y-6">
	<!-- Status -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
		<h2 class="text-lg font-medium text-gray-800 mb-4">Status</h2>
		{#if !canEditStatus}
			<p class="text-sm text-gray-500 mb-3">You have <strong>{data.myRole}</strong> access — only owners and editors can change status.</p>
		{/if}
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
					class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
					value={data.experiment.status}
					disabled={!canEditStatus}
				>
					{#each statusOptions as s}
						<option value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
					{/each}
				</select>
			</div>
			<button
				type="submit"
				disabled={statusUpdating || !canEditStatus}
				class="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
			>
				{statusUpdating ? 'Updating...' : 'Update'}
			</button>
		</form>
	</div>

	<!-- Collaborators -->
	<CollaboratorsPanel
		collaborators={data.collaborators}
		pendingInvites={data.pendingInvites}
		myRole={data.myRole}
		myUserId={data.adminUserId}
		formMessage={form}
	/>

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
	{#if isOwner}
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
				aria-label="Confirm deletion phrase"
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
	{/if}
</div>

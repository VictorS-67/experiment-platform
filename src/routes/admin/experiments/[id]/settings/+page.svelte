<script lang="ts">
	import { enhance } from '$app/forms';
	import Toast from '$lib/components/admin/Toast.svelte';
	import ConfirmationModal from '$lib/components/admin/ConfirmationModal.svelte';
	import CollaboratorsPanel from '$lib/components/admin/CollaboratorsPanel.svelte';
	import { ToastState } from '$lib/utils/toast.svelte';
	import { withLoadingFlag } from '$lib/utils/enhance';
	import { formatDateTime } from '$lib/utils/format-date';

	let { data, form } = $props();

	let statusUpdating = $state(false);
	let showDeleteConfirm = $state(false);
	let deleting = $state(false);

	const toast = new ToastState();

	$effect(() => {
		if (form?.success) {
			if (form.statusUpdated) toast.show('success', 'Status updated.');
			else if (form.roleChanged) toast.show('success', 'Role updated.');
			else if (form.removed) toast.show('success', 'Collaborator removed.');
			else if (form.inviteRevoked) toast.show('success', 'Invite revoked.');
			// Note: invite success has its own inline UI in CollaboratorsPanel.
		} else if (form?.error && !form.form) {
			toast.show('error', form.error);
		}
	});

	const statusOptions = ['draft', 'active', 'paused', 'archived'] as const;
	const isOwner = $derived(data.myRole === 'owner');
	const canEditStatus = $derived(data.myRole === 'owner' || data.myRole === 'editor');
</script>

<svelte:head>
	<title>Settings - {data.experiment.config?.metadata?.title?.en ?? data.experiment.slug} - Admin</title>
</svelte:head>

<Toast toast={toast.current} />

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
			use:enhance={withLoadingFlag((v) => (statusUpdating = v))}
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
				<dd class="text-gray-800 mt-1">{formatDateTime(data.experiment.created_at)}</dd>
			</div>
			<div>
				<dt class="text-gray-500">Updated</dt>
				<dd class="text-gray-800 mt-1">{data.experiment.updated_at ? formatDateTime(data.experiment.updated_at) : '—'}</dd>
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
				onclick={() => (showDeleteConfirm = true)}
				class="text-sm px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors cursor-pointer"
			>
				Delete Experiment
			</button>
		</div>

		<ConfirmationModal
			show={showDeleteConfirm}
			title="Delete Experiment"
			body="This will permanently delete the experiment and all its data."
			confirmPhrase="delete experiment"
			confirmLabel="Delete Experiment"
			confirmingLabel="Deleting..."
			loading={deleting}
			formAction="?/delete"
			formEnhance={withLoadingFlag((v) => (deleting = v))}
			onclose={() => (showDeleteConfirm = false)}
		/>
	{/if}
</div>

<script lang="ts">
	import { enhance } from '$app/forms';
	import type { CollaboratorRole, Collaborator, PendingInvite } from '$lib/server/collaborators';

	interface Props {
		collaborators: Collaborator[];
		pendingInvites: PendingInvite[];
		myRole: CollaboratorRole;
		myUserId: string;
		formMessage?: { success?: boolean; message?: string; claimUrl?: string; error?: string; form?: string } | null;
	}

	let { collaborators, pendingInvites, myRole, myUserId, formMessage }: Props = $props();

	let inviteEmail = $state('');
	let inviteRole = $state<CollaboratorRole>('editor');
	let inviting = $state(false);
	let copiedClaimUrl = $state<string | null>(null);

	const isOwner = $derived(myRole === 'owner');
	const roleOptions: CollaboratorRole[] = ['owner', 'editor', 'viewer'];

	function copyToClipboard(url: string) {
		navigator.clipboard.writeText(url).then(() => {
			copiedClaimUrl = url;
			setTimeout(() => { if (copiedClaimUrl === url) copiedClaimUrl = null; }, 2000);
		});
	}
</script>

<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
	<h2 class="text-lg font-medium text-gray-800 mb-1">Collaborators</h2>
	<p class="text-sm text-gray-600 mb-4">
		Owners can invite, change roles, and delete the experiment. Editors can edit config and manage participants. Viewers have read-only access.
	</p>

	{#if formMessage?.error && !formMessage.form}
		<div class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{formMessage.error}</div>
	{/if}

	<table class="w-full text-sm mb-4">
		<thead>
			<tr class="text-left text-gray-500 border-b border-gray-200">
				<th class="py-2 font-medium">Email</th>
				<th class="py-2 font-medium">Role</th>
				<th class="py-2 font-medium text-right">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each collaborators as c (c.userId)}
				<tr class="border-b border-gray-100">
					<td class="py-2 text-gray-800">
						{c.email}
						{#if c.userId === myUserId}<span class="text-xs text-gray-400 ml-1">(you)</span>{/if}
					</td>
					<td class="py-2">
						{#if isOwner && c.userId !== myUserId}
							<form
								method="POST"
								action="?/setRole"
								use:enhance={() => {
									return async ({ update }) => { await update({ reset: false }); };
								}}
							>
								<input type="hidden" name="userId" value={c.userId} />
								<select
									name="role"
									value={c.role}
									onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
									aria-label="Role for {c.email}"
									class="text-xs border border-gray-300 rounded px-2 py-1"
								>
									{#each roleOptions as r}
										<option value={r}>{r}</option>
									{/each}
								</select>
							</form>
						{:else}
							<span class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{c.role}</span>
						{/if}
					</td>
					<td class="py-2 text-right">
						{#if isOwner && c.userId !== myUserId}
							<form
								method="POST"
								action="?/remove"
								use:enhance={() => {
									return async ({ update }) => { await update({ reset: false }); };
								}}
							>
								<input type="hidden" name="userId" value={c.userId} />
								<button
									type="submit"
									class="text-xs text-red-600 hover:underline cursor-pointer"
									onclick={(e) => { if (!confirm(`Remove ${c.email} from this experiment?`)) e.preventDefault(); }}
								>Remove</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	{#if pendingInvites.length > 0}
		<h3 class="text-sm font-medium text-gray-700 mt-6 mb-2">Pending invites</h3>
		<table class="w-full text-sm mb-4">
			<thead>
				<tr class="text-left text-gray-500 border-b border-gray-200">
					<th class="py-2 font-medium">Email</th>
					<th class="py-2 font-medium">Role</th>
					<th class="py-2 font-medium">Expires</th>
					<th class="py-2 font-medium text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each pendingInvites as inv (inv.id)}
					<tr class="border-b border-gray-100">
						<td class="py-2 text-gray-800">{inv.email}</td>
						<td class="py-2"><span class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{inv.role}</span></td>
						<td class="py-2 text-gray-500 text-xs">{new Date(inv.expiresAt).toLocaleDateString()}</td>
						<td class="py-2 text-right">
							{#if isOwner}
								<button
									type="button"
									onclick={() => copyToClipboard(`${window.location.origin}/admin/login?claim=${inv.claimToken}`)}
									class="text-xs text-indigo-600 hover:underline cursor-pointer mr-3"
								>{copiedClaimUrl?.endsWith(inv.claimToken) ? 'Copied!' : 'Copy link'}</button>
								<form
									method="POST"
									action="?/revokeInvite"
									use:enhance={() => {
										return async ({ update }) => { await update({ reset: false }); };
									}}
									class="inline"
								>
									<input type="hidden" name="inviteId" value={inv.id} />
									<button
										type="submit"
										class="text-xs text-red-600 hover:underline cursor-pointer"
									>Revoke</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if isOwner}
		<form
			method="POST"
			action="?/invite"
			use:enhance={() => {
				inviting = true;
				return async ({ update }) => {
					await update({ reset: false });
					inviting = false;
				};
			}}
			class="mt-4 pt-4 border-t border-gray-100"
		>
			<label class="block text-sm font-medium text-gray-700 mb-2" for="invite-email">Invite by email</label>
			<div class="flex gap-2">
				<input
					id="invite-email"
					type="email"
					name="email"
					bind:value={inviteEmail}
					placeholder="user@example.com"
					required
					class="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
				/>
				<select
					name="role"
					bind:value={inviteRole}
					aria-label="Role for invitee"
					class="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
				>
					{#each roleOptions as r}
						<option value={r}>{r}</option>
					{/each}
				</select>
				<button
					type="submit"
					disabled={inviting}
					class="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
				>{inviting ? 'Inviting...' : 'Invite'}</button>
			</div>
			{#if formMessage?.form === 'invite' && formMessage?.error}
				<p class="mt-2 text-sm text-red-600">{formMessage.error}</p>
			{/if}
			{#if formMessage?.success && formMessage.message && !formMessage.form}
				<div class="mt-3 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
					<p>{formMessage.message}</p>
					{#if formMessage.claimUrl}
						<div class="mt-2 flex gap-2 items-center">
							<input
								type="text"
								readonly
								value={formMessage.claimUrl}
								class="flex-1 text-xs font-mono px-2 py-1 border border-green-300 rounded bg-white"
							/>
							<button
								type="button"
								onclick={() => copyToClipboard(formMessage!.claimUrl!)}
								class="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer"
							>{copiedClaimUrl === formMessage.claimUrl ? 'Copied!' : 'Copy'}</button>
						</div>
					{/if}
				</div>
			{/if}
		</form>
	{/if}
</div>

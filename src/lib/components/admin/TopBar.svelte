<script lang="ts">
	import { enhance } from '$app/forms';

	let { adminUser, breadcrumb }: {
		adminUser: { email: string; role: string } | null;
		breadcrumb?: { label: string; href: string }[];
	} = $props();
</script>

<header class="h-14 bg-gray-900 text-gray-300 flex items-center justify-between px-4 flex-shrink-0">
	<div class="flex items-center gap-2 min-w-0">
		<a href="/admin/experiments" class="text-white font-semibold text-lg whitespace-nowrap">Admin</a>
		{#if breadcrumb?.length}
			{#each breadcrumb as crumb}
				<span class="text-gray-500">/</span>
				<a href={crumb.href} class="text-gray-400 hover:text-white text-sm truncate max-w-48">
					{crumb.label}
				</a>
			{/each}
		{/if}
	</div>

	{#if adminUser}
		<div class="flex items-center gap-4">
			<span class="text-xs text-gray-400 hidden sm:inline">{adminUser.email}</span>
			<form method="POST" action="/admin/login?/logout" use:enhance>
				<button type="submit" class="text-xs text-gray-400 hover:text-white cursor-pointer">
					Sign out
				</button>
			</form>
		</div>
	{/if}
</header>

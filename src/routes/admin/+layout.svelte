<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';

	let { data, children } = $props();
	let adminUser = $derived(data.adminUser);

	let isLoginPage = $derived($page.url.pathname === '/admin/login');

	let navItems = [
		{ href: '/admin/experiments', label: 'Experiments', icon: 'flask' }
	];

	let currentPath = $derived($page.url.pathname);
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

{#if isLoginPage}
	{@render children()}
{:else}
	<div class="min-h-screen flex bg-gray-50">
		<!-- Sidebar -->
		<aside class="w-56 bg-gray-900 text-gray-300 flex flex-col flex-shrink-0">
			<div class="p-4 border-b border-gray-700">
				<a href="/admin/experiments" class="text-white font-semibold text-lg">Admin</a>
			</div>

			<nav class="flex-1 p-3 space-y-1">
				{#each navItems as item}
					<a
						href={item.href}
						class="block px-3 py-2 rounded text-sm transition-colors {currentPath.startsWith(item.href) ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 hover:text-white'}"
					>
						{item.label}
					</a>
				{/each}
			</nav>

			{#if adminUser}
				<div class="p-4 border-t border-gray-700">
					<p class="text-xs text-gray-400 mb-2 truncate">{adminUser.email}</p>
					<form method="POST" action="/admin/login?/logout" use:enhance>
						<button type="submit" class="text-xs text-gray-400 hover:text-white cursor-pointer">
							Sign out
						</button>
					</form>
				</div>
			{/if}
		</aside>

		<!-- Main content -->
		<main class="flex-1 overflow-auto">
			{@render children()}
		</main>
	</div>
{/if}

<script lang="ts">
	import { page } from '$app/stores';
	import TopBar from '$lib/components/admin/TopBar.svelte';

	let { data, children } = $props();
	let adminUser = $derived(data.adminUser);

	// Bare layout (no TopBar, no flex shell) for the public auth pages —
	// they render their own centered single-column layout. Keeping these
	// pages out of the admin shell also avoids leaking adminUser/breadcrumb
	// state to logged-out visitors.
	let isBarePage = $derived(
		$page.url.pathname === '/admin/login' ||
			$page.url.pathname === '/admin/forgot-password' ||
			$page.url.pathname === '/admin/reset-password'
	);

	// Build breadcrumb from URL
	let breadcrumb = $derived.by(() => {
		const path = $page.url.pathname;
		const crumbs: { label: string; href: string }[] = [];

		// Inside an experiment?
		const expMatch = path.match(/^\/admin\/experiments\/([^/]+)/);
		if (expMatch && expMatch[1] !== 'new') {
			// The experiment layout will handle its own breadcrumb via TopBar
			// We just show a simple breadcrumb here
			const expData = $page.data as Record<string, unknown>;
			const exp = expData?.experiment as { slug?: string } | undefined;
			if (exp?.slug) {
				crumbs.push({ label: exp.slug, href: `/admin/experiments/${expMatch[1]}` });
			}
		}

		return crumbs;
	});
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

{#if isBarePage}
	{@render children()}
{:else}
	<div class="min-h-screen flex flex-col bg-gray-50">
		<TopBar {adminUser} {breadcrumb} />
		<div class="flex-1 flex overflow-hidden">
			{@render children()}
		</div>
	</div>
{/if}

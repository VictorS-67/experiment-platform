<script lang="ts">
	import { page } from '$app/stores';
</script>

<div class="flex flex-col items-center justify-center py-20 text-center">
	<h1 class="text-4xl font-bold text-gray-300 mb-2">{$page.status}</h1>
	<p class="text-gray-600 mb-6">{$page.error?.message ?? 'Something went wrong.'}</p>
	<a
		href="/admin/experiments"
		class="text-sm px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
	>
		Back to Experiments
	</a>
</div>

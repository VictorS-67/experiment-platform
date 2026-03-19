<script lang="ts">
	// Landing page — in future this will list active experiments
	// For now, it's a simple welcome page
</script>

<svelte:head>
	<title>Experiment Platform</title>
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<main class="container">
	<div class="max-w-lg mx-auto mt-16 text-center">
		<h1 class="text-3xl font-semibold mb-4">Experiment Platform</h1>
		<p class="text-gray-600 mb-8">
			A config-driven platform for research data collection experiments.
		</p>

		<div class="bg-gray-50 rounded-lg p-6 text-left">
			<h2 class="font-medium text-gray-800 mb-3">Getting Started</h2>
			<ol class="text-sm text-gray-600 list-decimal list-inside space-y-2">
				<li>Set up your Supabase project and add credentials to <code class="bg-gray-200 px-1 rounded">.env</code></li>
				<li>Run the SQL migration in <code class="bg-gray-200 px-1 rounded">supabase/migrations/</code></li>
				<li>Insert an experiment config into the <code class="bg-gray-200 px-1 rounded">experiments</code> table</li>
				<li>Access the experiment at <code class="bg-gray-200 px-1 rounded">/e/your-slug/</code></li>
			</ol>
		</div>

		<div class="mt-8 text-sm text-gray-400">
			<p>Example experiment configs are in <code class="bg-gray-100 px-1 rounded">configs/</code></p>
		</div>
	</div>
</main>

<script lang="ts">
	import { page } from '$app/stores';
	import { experiment } from '$lib/stores/experiment.svelte';
	import { participantStore } from '$lib/stores/participant.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import Header from '$lib/components/layout/Header.svelte';
	import WidgetRenderer from '$lib/components/widgets/WidgetRenderer.svelte';
	import type { ResponseWidgetType } from '$lib/config/schema';

	let { data } = $props();

	// Use layout server data directly — always available, no $effect timing dependency
	let config = $derived(data.experiment.config);
	let slug = $derived($page.params.slug);
	let completion = $derived(config?.completion);
	let feedbackWidgets: ResponseWidgetType[] = $derived(completion?.feedbackWidgets ?? []);

	let widgetValues = $state<Record<string, string>>(
		Object.fromEntries(
			(data.experiment.config?.completion?.feedbackWidgets ?? []).map((w) => [w.id, ''])
		)
	);
	let saving = $state(false);
	let submitted = $state(!!data.existingFeedback);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Initialize participant from server data
	$effect(() => {
		if (data.participant) {
			participantStore.current = {
				id: data.participant.id,
				experimentId: experiment.id!,
				email: data.participant.email,
				registrationData: data.participant.registrationData,
				registeredAt: data.participant.registeredAt
			};
		}
	});

	async function handleFeedbackSubmit() {
		// Validate required fields
		for (const w of feedbackWidgets) {
			if (!w.required) continue;
			if (!String(widgetValues[w.id] ?? '').trim()) {
				message = { type: 'error', text: i18n.platform('survey.fill_in_required', { field: i18n.localized(w.label, w.id) }) };
				return;
			}
		}

		saving = true;
		message = null;

		try {
			const responseData: Record<string, unknown> = {};
			for (const w of feedbackWidgets) {
				const v = widgetValues[w.id];
				responseData[w.id] = (v != null && v !== '') ? String(v) : null;
			}

			const res = await fetch(`/e/${slug}/complete/save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ responseData })
			});

			if (!res.ok) {
				const errText = await res.text().catch(() => 'Failed to submit feedback');
				throw new Error(errText || 'Failed to submit feedback');
			}

			submitted = true;
			message = { type: 'success', text: i18n.platform('survey.feedback_submitted') };
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Unknown error';
			message = { type: 'error', text: errorMsg };
			console.error('Feedback submit error:', err);
		} finally {
			saving = false;
		}
	}

	async function handleLogout() {
		await fetch(`/e/${slug}/auth`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'logout' })
		});
		participantStore.current = null;
		// Hard navigate to ensure clean page transition
		window.location.href = `/e/${slug}`;
	}
</script>

<svelte:head>
	<title>{config ? i18n.localized(config.metadata.title, 'Experiment') : 'Experiment'} — {completion ? i18n.localized(completion.title) : i18n.platform('survey.experiment_complete_title')}</title>
</svelte:head>

<Header onLogout={handleLogout} />

<main class="container">
	<div class="max-w-md mx-auto mt-16 text-center">
		<div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
			<svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
			</svg>
		</div>

		<h1 class="text-2xl font-semibold text-gray-800 mb-3">
			{completion ? i18n.localized(completion.title) : i18n.platform('survey.experiment_complete_title')}
		</h1>

		<p class="text-gray-600 mb-8">
			{completion ? i18n.localized(completion.body) : i18n.platform('survey.experiment_complete_body')}
		</p>
	</div>

	<!-- Response Summary -->
	{#if data.responseSummary?.length}
		<div class="max-w-md mx-auto mb-8">
			<h2 class="text-lg font-medium text-gray-700 mb-3 text-center">
				{i18n.platform('survey.response_summary_title')}
			</h2>
			<ul class="space-y-2">
				{#each data.responseSummary as phase}
					<li class="flex justify-between items-center bg-gray-50 rounded px-4 py-2 text-sm">
						<span class="text-gray-700">{i18n.localized(phase.phaseTitle, phase.phaseId)}</span>
						<span class="font-medium text-indigo-600">{phase.count}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Feedback Form -->
	{#if feedbackWidgets.length > 0}
		<div class="max-w-md mx-auto mb-8">
			{#if submitted}
				<div class="text-center py-4">
					<p class="text-green-600 font-medium">{i18n.platform('survey.feedback_submitted')}</p>
				</div>
			{:else}
				<h2 class="text-lg font-medium text-gray-700 mb-4 text-center">
					{i18n.platform('survey.feedback_title')}
				</h2>

				{#if message}
					<div class="message {message.type} mb-4">{message.text}</div>
				{/if}

				<div class="space-y-3 text-left">
					{#each feedbackWidgets as widget (widget.id)}
						<WidgetRenderer
							{widget}
							bind:value={widgetValues[widget.id]}
							mediaElement={null}
						/>
					{/each}

					<button
						type="button"
						class="w-full mt-4 bg-indigo-600 text-white font-medium py-2 px-4 rounded hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
						onclick={handleFeedbackSubmit}
						disabled={saving}
					>
						{saving ? i18n.platform('survey.feedback_submitting') : i18n.platform('survey.feedback_submit')}
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Redirect Button -->
	{#if completion?.redirectUrl}
		<div class="max-w-md mx-auto text-center">
			<a
				href={completion.redirectUrl}
				class="inline-block bg-indigo-600 text-white font-medium py-2 px-6 rounded hover:bg-indigo-700 transition-colors"
			>
				{i18n.platform('common.continue')}
			</a>
		</div>
	{/if}
</main>

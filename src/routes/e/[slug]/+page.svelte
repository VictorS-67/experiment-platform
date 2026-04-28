<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { experiment } from '$lib/stores/experiment.svelte';
	import { participantStore } from '$lib/stores/participant.svelte';
	import { responseStore } from '$lib/stores/responses.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import Header from '$lib/components/layout/Header.svelte';
	import RegistrationForm from '$lib/components/registration/RegistrationForm.svelte';

	let { data } = $props();

	let config = $derived(experiment.config);
	let slug = $derived($page.params.slug);

	let emailInput = $state('');
	let showForm = $state(false);
	let loading = $state(false);
	let message = $state<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
	let breakInfo = $state<{ canStartAt: string } | null>(null);  // set when participant must wait before next chunk
	let pendingNextChunkUrl = $state<string | null>(null);  // stored from login response for use after break

	// Live countdown for break enforcement
	let breakSecondsLeft = $state(0);
	let breakInterval: ReturnType<typeof setInterval> | undefined;

	function startBreakCountdown(canStartAt: string) {
		breakInfo = { canStartAt };
		const updateCountdown = () => {
			breakSecondsLeft = Math.max(0, Math.ceil((new Date(canStartAt).getTime() - Date.now()) / 1000));
			if (breakSecondsLeft === 0 && breakInterval) {
				clearInterval(breakInterval);
				breakInterval = undefined;
			}
		};
		updateCountdown();
		if (breakSecondsLeft > 0) breakInterval = setInterval(updateCountdown, 1000);
	}

	// Clear the countdown interval if the participant navigates away mid-break.
	$effect(() => () => {
		if (breakInterval) { clearInterval(breakInterval); breakInterval = undefined; }
	});

	function formatCountdown(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return m > 0 ? `${m}m ${s}s` : `${s}s`;
	}

	/** Returns the URL to send a participant to after login/registration */
	function firstPhaseUrl(): string {
		const firstPhase = config?.phases?.[0];
		const phaseSlug = firstPhase?.slug ?? 'survey';
		const chunking = config?.stimuli?.chunking;
		if (chunking?.enabled && chunking.chunks?.length > 0) {
			return `/e/${slug}/c/${chunking.chunks[0].slug}/${phaseSlug}`;
		}
		return `/e/${slug}/${phaseSlug}`;
	}

	async function handleEmailSubmit(e: Event) {
		e.preventDefault();

		const email = emailInput.trim().toLowerCase();
		if (!email) {
			message = { type: 'error', text: i18n.platform('registration.error_email_required') };
			return;
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			message = { type: 'error', text: i18n.platform('registration.error_invalid_email') };
			return;
		}

		loading = true;
		message = null;

		try {
			const res = await fetch(`/e/${slug}/auth`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'login', email })
			});

			if (!res.ok) throw new Error('Login request failed');
			const data = await res.json();

			if (data.found) {
				// Returning participant — session cookie is set by server
				participantStore.current = {
					id: data.participant.id,
					experimentId: experiment.id!,
					email: data.participant.email,
					registrationData: data.participant.registrationData,
					registeredAt: data.participant.registeredAt
				};
				responseStore.list = data.responses ?? [];

				if (data.allChunksComplete) {
					// Hard navigate — goto causes infinite loading via SvelteKit client-side state conflict
					window.location.href = `/e/${slug}/complete`;
					return;
				} else if (data.breakRequired) {
					// Participant must wait before starting next chunk
					loading = false;
					pendingNextChunkUrl = data.nextChunkUrl ?? null;
					startBreakCountdown(data.breakRequired.canStartAt);
				} else {
					message = { type: 'success', text: i18n.platform('registration.welcome_back') };
					await goto(data.nextChunkUrl ?? firstPhaseUrl());
				}
			} else {
				// New participant — show registration form
				loading = false;
				showForm = true;
				message = { type: 'success', text: i18n.platform('registration.new_participant') };
			}
		} catch (err) {
			loading = false;
			const errorMsg = err instanceof Error ? err.message : 'Unknown error';
			message = { type: 'error', text: i18n.platform('registration.error_generic', { error: errorMsg }) };
			console.error('Email submit error:', err);
		}
	}

	async function handleRegistration(data: Record<string, string>) {
		if (!config) {
			message = { type: 'error', text: i18n.platform('registration.error_config_not_loaded') };
			return;
		}

		loading = true;
		message = null;

		try {
			const email = data.email || emailInput.trim().toLowerCase();
			const registrationData = { ...data };
			delete registrationData.email;

			const res = await fetch(`/e/${slug}/auth`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'register', email, registrationData })
			});

			if (!res.ok) {
				const errText = await res.text().catch(() => 'Registration request failed');
				throw new Error(errText || 'Registration request failed');
			}
			const result = await res.json();

			participantStore.current = {
				id: result.participant.id,
				experimentId: experiment.id!,
				email: result.participant.email,
				registrationData: result.participant.registrationData,
				registeredAt: result.participant.registeredAt
			};
			responseStore.list = [];

			message = { type: 'success', text: i18n.platform('registration.success_registered') };

			const destination = config.tutorial
				? `/e/${slug}/tutorial`
				: firstPhaseUrl();
			await goto(destination);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Unknown error';
			message = { type: 'error', text: i18n.platform('registration.error_registration_failed', { error: errorMsg }) };
			console.error('Registration error:', err);
		} finally {
			loading = false;
		}
	}

	async function handleLogout() {
		await fetch(`/e/${slug}/auth`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'logout' })
		});
		participantStore.current = null;
		responseStore.list = [];
		showForm = false;
		emailInput = '';
		message = null;
	}
</script>

<svelte:head>
	<title>{data.experiment ? i18n.localized(data.experiment.config.metadata.title, 'Experiment') : (config ? i18n.localized(config.metadata.title, 'Experiment') : 'Experiment')}</title>
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<Header onLogout={handleLogout} />

<main class="container">
	{#if config}
		<div class="max-w-md mx-auto mt-8">
			<h1 class="text-2xl font-semibold mb-2 text-center">
				{i18n.localized(config.metadata.title, 'Experiment')}
			</h1>

			{#if config.metadata.description}
				<p class="text-gray-600 text-sm mb-6 text-center">
					{i18n.localized(config.metadata.description)}
				</p>
			{/if}

			{#if message}
				<div class="message {message.type}">{message.text}</div>
			{/if}

			{#if breakInfo}
				<!-- Break enforcement screen -->
				<div class="text-center py-8">
					<div class="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
						<svg class="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h2 class="text-lg font-semibold text-gray-800 mb-2">Time for a break!</h2>
					<p class="text-gray-600 text-sm mb-6">You've completed a chunk. Please take a short break before continuing.</p>
					{#if breakSecondsLeft > 0}
						<p class="text-3xl font-mono font-bold text-indigo-600 mb-2">{formatCountdown(breakSecondsLeft)}</p>
						<p class="text-sm text-gray-500">until your next chunk is available</p>
					{:else}
						<p class="text-sm text-green-600 font-medium mb-4">Your break is over — you can continue now!</p>
						<button
							type="button"
							class="bg-indigo-600 text-white font-medium py-2 px-6 rounded hover:bg-indigo-700 transition-colors cursor-pointer"
							onclick={() => { breakInfo = null; goto(pendingNextChunkUrl ?? firstPhaseUrl()); }}
						>
							Continue to next chunk →
						</button>
					{/if}
				</div>
			{:else if !showForm}
				<!-- Email entry step -->
				<form onsubmit={handleEmailSubmit} class="space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1" for="email">
							{i18n.platform('registration.email_label')}
						</label>
						<input
							id="email"
							type="email"
							class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
							placeholder={i18n.platform('registration.email_placeholder')}
							bind:value={emailInput}
							required
							disabled={loading}
						/>
					</div>
					<button
						type="submit"
						class="w-full bg-indigo-600 text-white font-medium py-2 px-4 rounded hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
						disabled={loading}
					>
						{loading ? i18n.platform('common.loading') : i18n.platform('registration.submit_email')}
					</button>
				</form>
			{:else}
				<!-- Introduction -->
				<div class="mb-6 bg-blue-50 border border-blue-200 rounded p-4">
					<h2 class="font-medium text-blue-900 mb-2">
						{i18n.localized(config.registration.introduction.title, 'Welcome')}
					</h2>
					<p class="text-sm text-blue-800 mb-3">
						{i18n.localized(config.registration.introduction.body)}
					</p>
					{#if config.registration.introduction.instructions}
						{@const steps = config.registration.introduction.instructions}
						{#if steps[i18n.language]}
							<ol class="text-sm text-blue-800 list-decimal list-inside space-y-1">
								{#each steps[i18n.language] as step}
									<li>{step}</li>
								{/each}
							</ol>
						{/if}
					{/if}
				</div>

				<!-- Registration form -->
				<RegistrationForm {config} email={emailInput.trim().toLowerCase()} loading={loading} onFormSubmit={handleRegistration} />
			{/if}
		</div>
	{:else}
		<div class="flex justify-center items-center py-20">
			<div class="spinner w-8 h-8"></div>
		</div>
	{/if}
</main>

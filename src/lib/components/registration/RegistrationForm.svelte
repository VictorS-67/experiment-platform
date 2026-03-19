<script lang="ts">
	import type { ExperimentConfig } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';
	import FieldRenderer from './FieldRenderer.svelte';

	let {
		config,
		email = '',
		loading = false,
		onFormSubmit
	}: {
		config: ExperimentConfig;
		email?: string;
		loading?: boolean;
		onFormSubmit: (data: Record<string, string>) => void;
	} = $props();

	// Skip the email field — collected in the previous step
	let visibleFields = $derived(
		config.registration.fields.filter(f => f.type !== 'email')
	);

	function buildDefaults(): Record<string, string> {
		const defaults: Record<string, string> = {};
		for (const field of config.registration.fields) {
			if (field.type !== 'email') {
				defaults[field.id] = field.defaultValue ?? '';
			}
		}
		return defaults;
	}

	let formValues = $state<Record<string, string | number>>(buildDefaults());
	let error = $state('');

	// Always get a string value from formValues (number inputs return numbers)
	function strVal(id: string): string {
		return String(formValues[id] ?? '');
	}

	function isFieldVisible(field: typeof config.registration.fields[0]): boolean {
		if (!field.conditionalOn) return true;
		return formValues[field.conditionalOn.field] === field.conditionalOn.value;
	}

	function validate(): boolean {
		for (const field of visibleFields) {
			if (!isFieldVisible(field)) continue;
			if (field.required && !strVal(field.id).trim()) {
				const fieldName = i18n.localized(field.label, field.id);
				error = i18n.platform('registration.field_required', { field: fieldName });
				return false;
			}
			if (field.type === 'number' && strVal(field.id)) {
				const num = Number(strVal(field.id));
				const fieldName = i18n.localized(field.label, field.id);
				if (field.validation?.min !== undefined && num < field.validation.min) {
					error = i18n.localized(field.validation.errorMessage) ||
						i18n.platform('registration.field_min_value', { field: fieldName, min: field.validation.min });
					return false;
				}
				if (field.validation?.max !== undefined && num > field.validation.max) {
					error = i18n.localized(field.validation.errorMessage) ||
						i18n.platform('registration.field_max_value', { field: fieldName, max: field.validation.max });
					return false;
				}
			}
		}
		error = '';
		return true;
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (!validate()) {
			setTimeout(() => {
				document.querySelector('.message.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 50);
			return;
		}

		const data: Record<string, string> = { email };
		for (const field of visibleFields) {
			if (isFieldVisible(field)) {
				data[field.id] = strVal(field.id).trim();
			}
		}
		onFormSubmit(data);
	}
</script>

<form onsubmit={handleSubmit} class="space-y-1">
	<div class="mb-3 px-1 text-sm text-gray-500">
		{i18n.platform('common.registering_as')} <strong class="text-gray-700">{email}</strong>
	</div>

	{#each visibleFields as field (field.id)}
		{#if isFieldVisible(field)}
			<FieldRenderer {field} bind:value={formValues[field.id]} />
		{/if}
	{/each}

	{#if error}
		<div class="message error">{error}</div>
	{/if}

	<button
		type="submit"
		class="w-full mt-4 bg-indigo-600 text-white font-medium py-2 px-4 rounded hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
		disabled={loading}
	>
		{loading ? i18n.platform('common.registering') : i18n.platform('registration.register')}
	</button>
</form>

<script lang="ts">
	import type { RegistrationFieldType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';
	import SelectOrOtherField from './SelectOrOtherField.svelte';

	let {
		field,
		value = $bindable<string | number>('')
	}: {
		field: RegistrationFieldType;
		value: string | number;
	} = $props();

	let label = $derived(i18n.localized(field.label, field.id));
	let placeholder = $derived(field.placeholder ? i18n.localized(field.placeholder) : '');
</script>

<div class="mb-4">
	<label class="block text-sm font-medium text-gray-700 mb-1" for={`field-${field.id}`}>
		{label}
		{#if !field.required}
			<span class="text-gray-400 text-xs">({i18n.platform('common.optional')})</span>
		{/if}
	</label>

	{#if field.type === 'text' || field.type === 'email'}
		<input
			id={`field-${field.id}`}
			type={field.type}
			class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
			placeholder={placeholder}
			bind:value
			required={field.required}
		/>
	{:else if field.type === 'number'}
		<input
			id={`field-${field.id}`}
			type="number"
			class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
			placeholder={placeholder}
			bind:value
			required={field.required}
			min={field.validation?.min}
			max={field.validation?.max}
		/>
	{:else if field.type === 'textarea'}
		<textarea
			id={`field-${field.id}`}
			class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
			placeholder={placeholder}
			bind:value
			required={field.required}
			rows="3"
		></textarea>
	{:else if field.type === 'select'}
		<select
			id={`field-${field.id}`}
			class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
			bind:value
			required={field.required}
		>
			<option value="">{placeholder || '---'}</option>
			{#each field.options ?? [] as option}
				<option value={option.value}>{i18n.localized(option.label, option.value)}</option>
			{/each}
		</select>
	{:else if field.type === 'select-or-other'}
		<SelectOrOtherField {field} bind:value />
	{/if}
</div>

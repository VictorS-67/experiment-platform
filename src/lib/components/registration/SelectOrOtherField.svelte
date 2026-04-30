<script lang="ts">
	import type { RegistrationFieldType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';

	// The '__OTHER__' marker is a UI-only sentinel that lives exclusively in this
	// component's local state.  It is NEVER written to `value` — `value` always
	// receives either a real option value (string) or the participant's typed
	// free text.
	const OTHER_MARKER = '__OTHER__';

	// Accept the same broad union type as FieldRenderer so bind:value works
	// without type assertions in the parent.  select-or-other values are always
	// strings, but we coerce here rather than constraining the parent's type.
	let {
		field,
		value = $bindable<string | number>('')
	}: {
		field: RegistrationFieldType;
		value: string | number;
	} = $props();

	const soField = $derived(field as {
		options?: Array<{ value: string; label: Record<string, string> }>;
		otherLabel?: Record<string, string>;
		otherPlaceholder?: Record<string, string>;
	});
	const options = $derived(soField.options ?? []);
	const otherLabel = $derived(i18n.localized(soField.otherLabel ?? {}, 'Other'));
	const otherPlaceholder = $derived(
		soField.otherPlaceholder ? i18n.localized(soField.otherPlaceholder) : ''
	);

	// Determine initial UI state from an incoming value (e.g. session restore).
	function resolveInitial(v: string | number): { selected: string; text: string } {
		const s = String(v);
		if (!s) return { selected: '', text: '' };
		const isKnownOption = options.some((o) => o.value === s);
		return isKnownOption ? { selected: s, text: '' } : { selected: OTHER_MARKER, text: s };
	}

	const initial = resolveInitial(value);
	let selectedOption = $state(initial.selected);
	let otherText = $state(initial.text);

	// Keep the bindable `value` in sync: emit the real stored value, never the marker.
	$effect(() => {
		value = selectedOption === OTHER_MARKER ? otherText.trim() : selectedOption;
	});
</script>

<select
	id={`field-${field.id}`}
	class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
	bind:value={selectedOption}
	required={field.required && selectedOption === ''}
>
	<option value="">---</option>
	{#each options as option}
		<option value={option.value}>{i18n.localized(option.label, option.value)}</option>
	{/each}
	<option value={OTHER_MARKER}>{otherLabel}</option>
</select>

{#if selectedOption === OTHER_MARKER}
	<input
		type="text"
		class="mt-2 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
		placeholder={otherPlaceholder}
		bind:value={otherText}
		required={field.required}
		aria-label={otherLabel}
	/>
{/if}

<script lang="ts">
	type InputType = 'text' | 'number' | 'email' | 'date' | 'url';

	type Props = {
		value: string | number | undefined;
		type?: InputType;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		multiline?: boolean;
		rows?: number;
		size?: 'sm' | 'xs';
		mono?: boolean;
		error?: boolean;
		'aria-label'?: string;
		oninput?: (value: string) => void;
		onchange?: (value: string) => void;
	};

	let {
		value,
		type = 'text',
		placeholder,
		required,
		disabled,
		multiline = false,
		rows = 2,
		size = 'sm',
		mono = false,
		error = false,
		'aria-label': ariaLabel,
		oninput,
		onchange
	}: Props = $props();

	// `sm` is the standard form size used in MetadataSection / RegistrationSection
	// outer fields. `xs` is the nested-field size used inside per-item editor
	// blocks (e.g. inside a phase card). These are the only two sizes that
	// recurred across the audit; anything else stays inline.
	const sizeClass = $derived(size === 'xs' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm');
	const borderClass = $derived(error ? 'border-red-400' : 'border-gray-300');
	const monoClass = $derived(mono ? 'font-mono' : '');
	const klass = $derived(
		`w-full border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${sizeClass} ${borderClass} ${monoClass}`
	);
</script>

{#if multiline}
	<textarea
		{value}
		{placeholder}
		{required}
		{disabled}
		{rows}
		aria-label={ariaLabel}
		oninput={(e) => oninput?.(e.currentTarget.value)}
		onchange={(e) => onchange?.(e.currentTarget.value)}
		class={klass}
	></textarea>
{:else}
	<input
		{type}
		{value}
		{placeholder}
		{required}
		{disabled}
		aria-label={ariaLabel}
		oninput={(e) => oninput?.(e.currentTarget.value)}
		onchange={(e) => onchange?.(e.currentTarget.value)}
		class={klass}
	/>
{/if}

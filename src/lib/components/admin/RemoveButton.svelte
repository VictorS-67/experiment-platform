<script lang="ts">
	type Props = {
		onclick: () => void;
		disabled?: boolean;
		/** Default label is "Remove". Pass `label="x"` for compact contexts. */
		label?: string;
		title?: string;
	};

	let { onclick, disabled = false, label = 'Remove', title }: Props = $props();
</script>

<!-- Standardized "Remove" affordance. type="button" hardcoded — see AddButton. -->
<button
	type="button"
	{onclick}
	{disabled}
	{title}
	class="text-xs text-red-500 hover:text-red-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
>{label}</button>

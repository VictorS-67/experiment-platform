<script lang="ts">
	type Props = {
		onclick: () => void;
		disabled?: boolean;
		/** Default label is "+ Add". Pass `label="+ Add Field"` etc. for context. */
		label?: string;
	};

	let { onclick, disabled = false, label = '+ Add' }: Props = $props();
</script>

<!--
  Standardized "+ Add" affordance used throughout the config sections. Wraps
  the Tailwind class string that appeared inline ~40 times before. CLAUDE.md
  warns that <button> inside <form> defaults to type="submit"; this component
  hardcodes type="button" to avoid that footgun.
-->
<button
	type="button"
	{onclick}
	{disabled}
	class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
>{label}</button>

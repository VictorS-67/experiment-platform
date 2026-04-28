<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		help,
		class: klass = '',
		children
	}: {
		label: string;
		help?: string;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<!--
  Wraps a form input with its label using implicit label-input association
  (input nested inside <label>). No `for`/`id` needed; satisfies
  svelte-check's a11y_label_has_associated_control rule.
-->
<label class={klass || 'block'}>
	<span class="block text-xs text-gray-500 mb-0.5">{label}</span>
	{@render children()}
	{#if help}<p class="text-xs text-gray-400 mt-0.5">{help}</p>{/if}
</label>

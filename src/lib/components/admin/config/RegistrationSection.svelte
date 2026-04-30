<script lang="ts">
	import LocalizedInput from '../LocalizedInput.svelte';
	import Field from './Field.svelte';
	import { updatePath, fieldTypes } from './helpers';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config, languages }: { config: ExperimentConfig; languages: string[] } = $props();

	const update = (path: string[], value: unknown) => updatePath(config, path, value);

	function addRegistrationField() {
		const newId = `field_${Date.now()}`;
		config.registration.fields.push({
			id: newId,
			type: 'text',
			label: Object.fromEntries(languages.map((l) => [l, ''])),
			required: true
		});
	}

	function removeRegistrationField(index: number) {
		config.registration.fields.splice(index, 1);
	}

	function addFieldOption(fi: number) {
		const field = config.registration.fields[fi];
		if (!field.options) field.options = [];
		field.options.push({
			value: `option_${Date.now()}`,
			label: Object.fromEntries(languages.map((l) => [l, '']))
		});
	}

	function removeFieldOption(fi: number, oi: number) {
		config.registration.fields[fi].options!.splice(oi, 1);
	}
</script>

<div class="space-y-4">
	<h4 class="text-sm font-medium text-gray-600">Introduction</h4>
	<LocalizedInput label="Title" value={config.registration.introduction.title} {languages} onchange={(v) => update(['registration', 'introduction', 'title'], v)} />
	<LocalizedInput label="Body" value={config.registration.introduction.body} {languages} multiline onchange={(v) => update(['registration', 'introduction', 'body'], v)} />

	<div class="flex items-center justify-between mt-4">
		<h4 class="text-sm font-medium text-gray-600">Fields ({config.registration.fields.length})</h4>
		<button type="button" onclick={addRegistrationField} class="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add Field</button>
	</div>

	{#each config.registration.fields as field, i}
		<div class="border border-gray-200 rounded p-4 space-y-3">
			<div class="flex items-center justify-between">
				<span class="text-xs font-mono text-gray-400">{field.id}</span>
				<button type="button" onclick={() => removeRegistrationField(i)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
			</div>
			<div class="grid grid-cols-3 gap-3">
				<Field label="ID">
					<input
						type="text"
						value={field.id}
						oninput={(e) => update(['registration', 'fields', String(i), 'id'], e.currentTarget.value)}
						class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</Field>
				<Field label="Type">
					<select
						value={field.type}
						onchange={(e) => update(['registration', 'fields', String(i), 'type'], e.currentTarget.value)}
						class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					>
						{#each fieldTypes as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
				</Field>
				<div class="flex items-end">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={field.required}
							onchange={(e) => update(['registration', 'fields', String(i), 'required'], e.currentTarget.checked)}
						/>
						Required
					</label>
				</div>
			</div>
			<LocalizedInput label="Label" value={field.label} {languages} onchange={(v) => update(['registration', 'fields', String(i), 'label'], v)} />
			<LocalizedInput label="Placeholder" value={field.placeholder ?? {}} {languages} onchange={(v) => update(['registration', 'fields', String(i), 'placeholder'], Object.values(v).some(Boolean) ? v : undefined)} />
			<Field label="Default Value">
				<input
					type="text"
					value={field.defaultValue ?? ''}
					oninput={(e) => update(['registration', 'fields', String(i), 'defaultValue'], e.currentTarget.value || undefined)}
					class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					placeholder="Pre-filled value (optional)"
				/>
			</Field>
			<!-- Validation config -->
			<div class="border-t border-gray-100 pt-2 mt-2">
				<div class="flex items-center justify-between mb-1">
					<span class="text-xs text-gray-500">Validation</span>
					{#if field.validation}
						<button type="button" onclick={() => { delete config.registration.fields[i].validation; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
					{:else}
						<button type="button" onclick={() => { config.registration.fields[i].validation = { errorMessage: Object.fromEntries(languages.map((l) => [l, ''])) }; }} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
					{/if}
				</div>
				{#if field.validation}
					<div class="pl-2 border-l-2 border-indigo-200 space-y-2">
						{#if field.type === 'number'}
							<div class="grid grid-cols-2 gap-2">
								<Field label="Min">
									<input type="number" value={field.validation.min ?? ''}
										oninput={(e) => update(['registration', 'fields', String(i), 'validation', 'min'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
								</Field>
								<Field label="Max">
									<input type="number" value={field.validation.max ?? ''}
										oninput={(e) => update(['registration', 'fields', String(i), 'validation', 'max'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
								</Field>
							</div>
						{:else}
							<Field label="Pattern (regex)">
								<input type="text" value={field.validation.pattern ?? ''}
									oninput={(e) => update(['registration', 'fields', String(i), 'validation', 'pattern'], e.currentTarget.value || undefined)}
									class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="^[A-Za-z]+$" />
							</Field>
						{/if}
						<LocalizedInput label="Error message" value={field.validation.errorMessage ?? {}} {languages} onchange={(v) => update(['registration', 'fields', String(i), 'validation', 'errorMessage'], v)} />
					</div>
				{/if}
			</div>

			<!-- Options for select/multiselect/select-or-other registration fields -->
			{#if field.type === 'select' || field.type === 'multiselect' || field.type === 'select-or-other'}
				<div class="border-t border-gray-100 pt-2 mt-2">
					<div class="flex items-center justify-between mb-1">
						<span class="text-xs text-gray-500">Options ({field.options?.length ?? 0})</span>
						<button type="button" onclick={() => addFieldOption(i)} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
					</div>
					{#if field.type === 'select-or-other'}
						<p class="text-xs text-gray-400 mb-1">These are the fixed options. An "Other" entry is added automatically at the end.</p>
					{/if}
					{#each field.options ?? [] as option, oi}
						<div class="flex items-start gap-2 mb-1">
							<input
								type="text"
								value={option.value}
								oninput={(e) => update(['registration', 'fields', String(i), 'options', String(oi), 'value'], e.currentTarget.value)}
								aria-label="Option value"
								class="w-24 shrink-0 px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
								placeholder="value"
							/>
							<div class="flex-1">
								<LocalizedInput label="" value={option.label} {languages} onchange={(v) => update(['registration', 'fields', String(i), 'options', String(oi), 'label'], v)} />
							</div>
							<button type="button" onclick={() => removeFieldOption(i, oi)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer mt-1">x</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- otherLabel / otherPlaceholder for select-or-other fields -->
			{#if field.type === 'select-or-other'}
				<div class="border-t border-gray-100 pt-2 mt-2 space-y-2">
					<span class="text-xs text-gray-500">"Other" option</span>
					<LocalizedInput
						label="Other label"
						value={(field as Record<string, unknown>).otherLabel as Record<string, string> ?? Object.fromEntries(languages.map((l) => [l, '']))}
						{languages}
						onchange={(v) => update(['registration', 'fields', String(i), 'otherLabel'], v)}
					/>
					<LocalizedInput
						label="Other placeholder"
						value={(field as Record<string, unknown>).otherPlaceholder as Record<string, string> ?? Object.fromEntries(languages.map((l) => [l, '']))}
						{languages}
						onchange={(v) => update(['registration', 'fields', String(i), 'otherPlaceholder'], Object.values(v).some(Boolean) ? v : undefined)}
					/>
				</div>
			{/if}

			<!-- Conditional visibility -->
			<div class="border-t border-gray-100 pt-2 mt-2">
				<div class="flex items-center justify-between mb-1">
					<span class="text-xs text-gray-500">Conditional visibility</span>
					{#if field.conditionalOn}
						<button type="button" onclick={() => { delete config.registration.fields[i].conditionalOn; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
					{:else}
						<button type="button" onclick={() => { config.registration.fields[i].conditionalOn = { field: '', value: '' }; }} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
					{/if}
				</div>
				{#if field.conditionalOn}
					<div class="pl-2 border-l-2 border-indigo-200">
						<p class="text-xs text-gray-400 mb-1.5">Show this field only when:</p>
						<div class="flex items-center gap-2">
							<select
								value={field.conditionalOn.field}
								onchange={(e) => update(['registration', 'fields', String(i), 'conditionalOn', 'field'], e.currentTarget.value)}
								aria-label="Field that controls visibility"
								class="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
							>
								<option value="">-- select field --</option>
								{#each config.registration.fields.filter((_, j) => j !== i) as other}
									<option value={other.id}>{other.id}</option>
								{/each}
							</select>
							<span class="text-xs text-gray-400">=</span>
							<input
								type="text"
								value={field.conditionalOn.value}
								oninput={(e) => update(['registration', 'fields', String(i), 'conditionalOn', 'value'], e.currentTarget.value)}
								aria-label="Value that triggers visibility"
								class="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
								placeholder="option value"
							/>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/each}
</div>

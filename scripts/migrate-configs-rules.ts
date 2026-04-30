// Pure migration rules for stored experiment configs.
//
// Extracted from scripts/migrate-configs.ts so the rules can be unit-tested
// without firing the CLI's env-loading + supabase-client side effects on
// import. The CLI script imports MIGRATIONS + applyMigrations from here and
// wraps them with the runtime concerns (DB read, dry-run output, --write).
//
// Add new schema-evolution rules to MIGRATIONS as the schema tightens.
// Order matters: earlier rules run first, so a later rule sees the output of
// every earlier one. Each rule must be idempotent — running the full pipeline
// twice should produce the same output as running it once.

export interface MigrationResult {
	config: unknown;
	changed: boolean;
	notes: string[];
}

export interface Migration {
	name: string;
	apply: (config: unknown) => MigrationResult;
}

export const MIGRATIONS: Migration[] = [
	// Normalize metadata.languages: `jn` (typo) → `ja`, dedupe.
	// Runs FIRST so the downstream walk doesn't have to care about the array.
	{
		name: 'normalize-metadata-languages',
		apply(config) {
			const notes: string[] = [];
			if (!config || typeof config !== 'object') return { config, changed: false, notes };
			const cfg = config as Record<string, unknown>;
			const metadata = cfg.metadata as Record<string, unknown> | undefined;
			if (!metadata || !Array.isArray(metadata.languages)) {
				return { config, changed: false, notes };
			}

			const originalLangs = metadata.languages as unknown[];
			const remapped = originalLangs.map((l) => (l === 'jn' ? 'ja' : l));
			const deduped = [...new Set(remapped)];
			const originalDefault = metadata.defaultLanguage;
			const remappedDefault = originalDefault === 'jn' ? 'ja' : originalDefault;

			const languagesChanged =
				deduped.length !== originalLangs.length ||
				deduped.some((l, i) => l !== originalLangs[i]);
			const defaultChanged = originalDefault !== remappedDefault;

			if (!languagesChanged && !defaultChanged) {
				return { config, changed: false, notes };
			}

			if (languagesChanged) notes.push(`$.metadata.languages: ${JSON.stringify(originalLangs)} → ${JSON.stringify(deduped)}`);
			if (defaultChanged) notes.push(`$.metadata.defaultLanguage: ${String(originalDefault)} → ${String(remappedDefault)}`);

			const newMetadata = { ...metadata, languages: deduped, defaultLanguage: remappedDefault };
			return {
				config: { ...cfg, metadata: newMetadata },
				changed: true,
				notes
			};
		}
	},
	// Fill missing min/max for likert (default 1..7) and slider (default 0..100, step 1).
	// The new schema refinement rejects these without bounds; assigning
	// conservative defaults lets old configs pass validation without hand-editing.
	{
		name: 'fill-likert-slider-range-defaults',
		apply(config) {
			const notes: string[] = [];
			let changed = false;

			function walkWidgets(
				widgets: unknown[],
				path: string
			): unknown[] {
				return widgets.map((w, i) => {
					if (!w || typeof w !== 'object') return w;
					const widget = w as Record<string, unknown>;
					const type = widget.type;
					if (type !== 'likert' && type !== 'slider') return widget;

					const cfg = (widget.config ?? {}) as Record<string, unknown>;
					const needsMin = typeof cfg.min !== 'number';
					const needsMax = typeof cfg.max !== 'number';
					if (!needsMin && !needsMax) return widget;

					const defaults =
						type === 'likert'
							? { min: 1, max: 7 }
							: { min: 0, max: 100, step: 1 };
					const newCfg = { ...cfg };
					if (needsMin) { newCfg.min = defaults.min; notes.push(`${path}[${i}].config.min set to ${defaults.min} (${type} default)`); }
					if (needsMax) { newCfg.max = defaults.max; notes.push(`${path}[${i}].config.max set to ${defaults.max} (${type} default)`); }
					if (type === 'slider' && typeof cfg.step !== 'number') {
						newCfg.step = 1;
						notes.push(`${path}[${i}].config.step set to 1 (slider default)`);
					}
					changed = true;
					return { ...widget, config: newCfg };
				});
			}

			if (!config || typeof config !== 'object') return { config, changed: false, notes };
			const cfg = config as Record<string, unknown>;

			const phases = Array.isArray(cfg.phases) ? cfg.phases : [];
			const newPhases = phases.map((p, pi) => {
				if (!p || typeof p !== 'object') return p;
				const phase = p as Record<string, unknown>;
				let nextPhase = phase;
				if (Array.isArray(phase.responseWidgets)) {
					const w = walkWidgets(phase.responseWidgets, `$.phases[${pi}].responseWidgets`);
					nextPhase = { ...nextPhase, responseWidgets: w };
				}
				if (phase.reviewConfig && typeof phase.reviewConfig === 'object') {
					const rc = phase.reviewConfig as Record<string, unknown>;
					if (Array.isArray(rc.responseWidgets)) {
						const w = walkWidgets(rc.responseWidgets, `$.phases[${pi}].reviewConfig.responseWidgets`);
						nextPhase = { ...nextPhase, reviewConfig: { ...rc, responseWidgets: w } };
					}
				}
				return nextPhase;
			});

			const completion = cfg.completion as Record<string, unknown> | undefined;
			let newCompletion = completion;
			if (completion && Array.isArray(completion.feedbackWidgets)) {
				const w = walkWidgets(completion.feedbackWidgets, `$.completion.feedbackWidgets`);
				newCompletion = { ...completion, feedbackWidgets: w };
			}

			if (!changed) return { config, changed: false, notes };
			return {
				config: { ...cfg, phases: newPhases, ...(newCompletion ? { completion: newCompletion } : {}) },
				changed: true,
				notes
			};
		}
	},
	{
		name: 'rename-language-code-jn-to-ja',
		apply(config) {
			const notes: string[] = [];
			let changed = false;
			const visited = new WeakSet<object>();

			function walk(value: unknown, path: string): unknown {
				if (value === null || typeof value !== 'object') return value;
				if (visited.has(value as object)) return value;
				visited.add(value as object);

				if (Array.isArray(value)) {
					return value.map((v, i) => walk(v, `${path}[${i}]`));
				}

				const obj = value as Record<string, unknown>;
				const out: Record<string, unknown> = {};
				for (const [key, child] of Object.entries(obj)) {
					if (key === 'jn') {
						const existingJa = obj.ja;
						if (existingJa && existingJa !== '') {
							notes.push(`${path}.jn dropped (already had ja=${JSON.stringify(existingJa)})`);
						} else if (typeof child === 'string' && child !== '') {
							out.ja = child;
							notes.push(`${path}.jn → ${path}.ja`);
						} else {
							notes.push(`${path}.jn dropped (empty)`);
						}
						changed = true;
					} else {
						out[key] = walk(child, `${path}.${key}`);
					}
				}
				return out;
			}

			return { config: walk(config, '$'), changed, notes };
		}
	},
	// Lift flat gatekeeperQuestion shape to nested {initial, subsequent?}.
	// Old: {text, yesLabel, noLabel, noResponseValue, skipToNext}
	// New: {initial: {text, yesLabel, noLabel}, subsequent?, skipToNext}
	// Also drops `noResponseValue` (skip rows now write JSON null per widget;
	// see Fix 7 in the plan). Idempotent — already-nested configs are skipped.
	{
		name: 'nest-gatekeeper-question',
		apply(config) {
			const notes: string[] = [];
			let changed = false;

			if (!config || typeof config !== 'object') return { config, changed: false, notes };
			const cfg = config as Record<string, unknown>;
			const phases = Array.isArray(cfg.phases) ? cfg.phases : null;
			if (!phases) return { config, changed: false, notes };

			const newPhases = phases.map((p, pi) => {
				if (!p || typeof p !== 'object') return p;
				const phase = p as Record<string, unknown>;
				const gq = phase.gatekeeperQuestion as Record<string, unknown> | undefined;
				if (!gq) return phase;

				// Already migrated? Detect by presence of `initial`.
				if (gq.initial && typeof gq.initial === 'object') {
					// Still drop a stray noResponseValue if it lingered alongside the new shape.
					if ('noResponseValue' in gq) {
						const { noResponseValue: _drop, ...rest } = gq;
						void _drop;
						notes.push(`$.phases[${pi}].gatekeeperQuestion.noResponseValue dropped (post-migration cleanup)`);
						changed = true;
						return { ...phase, gatekeeperQuestion: rest };
					}
					return phase;
				}

				// Legacy flat shape — lift into `initial`.
				const { text, yesLabel, noLabel, noResponseValue: _drop2, skipToNext, ...rest } = gq as {
					text?: unknown;
					yesLabel?: unknown;
					noLabel?: unknown;
					noResponseValue?: unknown;
					skipToNext?: unknown;
					[k: string]: unknown;
				};
				void _drop2;

				if (text === undefined && yesLabel === undefined && noLabel === undefined) {
					// Doesn't look like a flat gatekeeper either — leave alone, let Zod surface the issue.
					return phase;
				}

				const newGq: Record<string, unknown> = {
					...rest,
					initial: {
						...(text !== undefined ? { text } : {}),
						...(yesLabel !== undefined ? { yesLabel } : {}),
						...(noLabel !== undefined ? { noLabel } : {})
					},
					...(skipToNext !== undefined ? { skipToNext } : {})
				};
				notes.push(`$.phases[${pi}].gatekeeperQuestion: lifted text/yesLabel/noLabel into initial; dropped noResponseValue if present`);
				changed = true;
				return { ...phase, gatekeeperQuestion: newGq };
			});

			if (!changed) return { config, changed: false, notes };
			return { config: { ...cfg, phases: newPhases }, changed: true, notes };
		}
	},
	// Strip showConditionalField from every FieldOption in registration.
	// The field is parsed-but-unused; removing it from the schema leaves any
	// stored value as dead data. Logging each occurrence so the operator can
	// audit the loss before --write.
	{
		name: 'strip-show-conditional-field',
		apply(config) {
			const notes: string[] = [];
			let changed = false;

			if (!config || typeof config !== 'object') return { config, changed: false, notes };
			const cfg = config as Record<string, unknown>;
			const reg = cfg.registration as Record<string, unknown> | undefined;
			if (!reg) return { config, changed: false, notes };
			const fields = Array.isArray(reg.fields) ? reg.fields : null;
			if (!fields) return { config, changed: false, notes };

			const newFields = fields.map((f, fi) => {
				if (!f || typeof f !== 'object') return f;
				const field = f as Record<string, unknown>;
				const opts = Array.isArray(field.options) ? field.options : null;
				if (!opts) return field;

				let fieldChanged = false;
				const newOpts = opts.map((o, oi) => {
					if (!o || typeof o !== 'object') return o;
					const opt = o as Record<string, unknown>;
					if (!('showConditionalField' in opt)) return opt;
					const { showConditionalField, ...rest } = opt;
					notes.push(
						`$.registration.fields[${fi}].options[${oi}].showConditionalField=${JSON.stringify(showConditionalField)} stripped (field id=${String(field.id)}, option value=${String(opt.value)})`
					);
					fieldChanged = true;
					changed = true;
					return rest;
				});

				return fieldChanged ? { ...field, options: newOpts } : field;
			});

			if (!changed) return { config, changed: false, notes };
			return { config: { ...cfg, registration: { ...reg, fields: newFields } }, changed: true, notes };
		}
	}
];

export function applyMigrations(config: unknown): MigrationResult {
	let current: unknown = config;
	const allNotes: string[] = [];
	let anyChanged = false;
	for (const m of MIGRATIONS) {
		const { config: next, changed, notes } = m.apply(current);
		if (changed) {
			anyChanged = true;
			allNotes.push(`[${m.name}]`, ...notes.map((n) => `  ${n}`));
		}
		current = next;
	}
	return { config: current, changed: anyChanged, notes: allNotes };
}

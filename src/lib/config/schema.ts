import { z } from 'zod';

// ---------------------------------------------------------------------------
// Localized string
// ---------------------------------------------------------------------------
//
// Restricted to the ISO 639-1 language codes the platform actually supports.
// Tighter than the previous `z.record(z.string(), z.string())` which let any
// key through (including typos like the `jn` we found in old configs and
// fixed via the one-shot migrator at scripts/migrate-configs.js).
//
// To add a new language: extend this list AND add translations under
// src/lib/i18n.

export const LANGUAGE_CODES = [
	'en', 'ja', 'fr', 'es', 'de', 'it', 'pt', 'ru', 'zh', 'ko',
	'ar', 'hi', 'tr', 'vi', 'th', 'id', 'nl', 'pl', 'sv', 'da', 'no', 'fi'
] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];
const LANGUAGE_CODE_SET: ReadonlySet<string> = new Set(LANGUAGE_CODES);

// Note: we deliberately keep the key type as `string` (not `z.enum(LANGUAGE_CODES)`)
// because Zod infers `z.record(z.enum(...), V)` as `Record<K, V>` requiring
// EVERY enum value as a key — which would break every `{ en: 'foo' }` literal
// in the codebase. The `.refine` below enforces the whitelist at runtime
// without contaminating the inferred TS shape.
const localizedKeysOk = (obj: Record<string, unknown>) =>
	Object.keys(obj).every((k) => LANGUAGE_CODE_SET.has(k));
const localizedKeysMessage = `keys must be one of: ${LANGUAGE_CODES.join(', ')}`;

const LocalizedString = z
	.record(z.string(), z.string())
	.refine(localizedKeysOk, { message: localizedKeysMessage });
const LocalizedStringArray = z
	.record(z.string(), z.array(z.string()))
	.refine(localizedKeysOk, { message: localizedKeysMessage });

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const FieldOption = z.object({
	value: z.string(),
	label: LocalizedString
});

const FieldValidation = z.object({
	min: z.number().optional(),
	max: z.number().optional(),
	pattern: z.string().optional(),
	errorMessage: LocalizedString.optional()
});

// `select-or-other` is a single field type that combines a select with a free-
// text fallback for "Other". The form's submitted value is always one string —
// either an option value or whatever the participant typed. Replaces the
// previous two-field pattern (a `select` with an `Other` option + a `text`
// child gated by `conditionalOn`) which split one fact across two keys in
// `registration_data`. See plan + scripts/migrate-select-or-other.ts.
const RegistrationField = z
	.object({
		id: z.string(),
		type: z.enum(['text', 'number', 'email', 'select', 'multiselect', 'textarea', 'select-or-other']),
		label: LocalizedString,
		placeholder: LocalizedString.optional(),
		required: z.boolean().default(true),
		validation: FieldValidation.optional(),
		options: z.array(FieldOption).optional(),
		// select-or-other only — label for the Other entry in the rendered list.
		otherLabel: LocalizedString.optional(),
		// select-or-other only — placeholder for the inline free-text input.
		otherPlaceholder: LocalizedString.optional(),
		conditionalOn: z.object({
			field: z.string(),
			value: z.string()
		}).optional(),
		defaultValue: z.string().optional()
	})
	.superRefine((f, ctx) => {
		if (f.type === 'select-or-other') {
			if (!f.options || f.options.length === 0) {
				ctx.addIssue({
					code: 'custom',
					path: ['options'],
					message: `field '${f.id}' (type=select-or-other) requires non-empty options`
				});
			}
			if (!f.otherLabel) {
				ctx.addIssue({
					code: 'custom',
					path: ['otherLabel'],
					message: `field '${f.id}' (type=select-or-other) requires otherLabel`
				});
			}
		}
		if ((f.type === 'select' || f.type === 'multiselect') && (!f.options || f.options.length === 0)) {
			ctx.addIssue({
				code: 'custom',
				path: ['options'],
				message: `field '${f.id}' (type=${f.type}) requires non-empty options`
			});
		}
	});

const RegistrationIntro = z.object({
	title: LocalizedString,
	body: LocalizedString,
	instructions: LocalizedStringArray.optional(),
	additionalInfo: LocalizedString.optional()
});

const RegistrationConfig = z.object({
	introduction: RegistrationIntro,
	fields: z.array(RegistrationField)
});

// ---------------------------------------------------------------------------
// Tutorial
// ---------------------------------------------------------------------------

const TutorialStepValidation = z.object({
	type: z.enum(['click', 'input', 'play', 'none']),
	target: z.string().optional()
});

const TutorialStep = z.object({
	id: z.string(),
	targetSelector: z.string(),
	title: LocalizedString,
	body: LocalizedString,
	instruction: LocalizedString.optional(),
	position: z.enum(['top', 'bottom', 'left', 'right', 'center']).default('bottom'),
	validation: TutorialStepValidation.optional()
});

const TutorialConfig = z.object({
	allowSkip: z.boolean().default(true),
	introduction: z.object({
		title: LocalizedString,
		body: LocalizedString,
		buttonText: LocalizedString.optional()
	}).optional(),
	welcome: z.object({
		title: LocalizedString,
		body: LocalizedString,
		buttonText: LocalizedString
	}),
	steps: z.array(TutorialStep),
	completion: z.object({
		title: LocalizedString,
		body: LocalizedString,
		buttonText: LocalizedString
	}),
	sampleStimuliIds: z.array(z.string()).default([])
});

// ---------------------------------------------------------------------------
// Response widgets
// ---------------------------------------------------------------------------
//
// TODO(refactor): convert this into a `z.discriminatedUnion('type', [...])`
// where each widget type has its own narrowly-typed `config`. The
// `enforceWidgetConfig` superRefine below covers the runtime correctness side
// of that refactor; the remaining work is purely TypeScript ergonomics for
// downstream code paths and is out of scope for the audit-remediation pass.

const WidgetOption = z.object({
	value: z.string(),
	label: LocalizedString
});

const WidgetConfig = z.object({
	options: z.array(WidgetOption).optional(),
	min: z.number().optional(),
	max: z.number().optional(),
	step: z.number().optional(),
	minLabel: LocalizedString.optional(),
	maxLabel: LocalizedString.optional(),
	minLength: z.number().optional(),
	maxLength: z.number().optional(),
	showCharCount: z.boolean().optional(),
	captureStartLabel: LocalizedString.optional(),
	captureEndLabel: LocalizedString.optional(),
	timestampReviewMode: z.enum(['segment', 'full-highlight']).optional(),
	maxDurationSeconds: z.number().optional(),
	maxFileSizeMB: z.number().optional()
});

const WIDGET_TYPES = [
	'text', 'textarea', 'select', 'multiselect',
	'likert', 'timestamp-range', 'audio-recording',
	'slider', 'number'
] as const;

const ResponseWidget = z
	.object({
		id: z.string(),
		type: z.enum(WIDGET_TYPES),
		label: LocalizedString,
		placeholder: LocalizedString.optional(),
		required: z.boolean().default(true),
		stepNumber: z.number().optional(),
		stepLabel: LocalizedString.optional(),
		config: WidgetConfig.optional(),
		conditionalOn: z.object({
			widgetId: z.string(),
			value: z.string()
		}).optional()
	})
	.superRefine((w, ctx) => {
		// Type-specific config invariants. These are what a discriminated
		// union would enforce structurally; we enforce them as refinements.
		const cfg = w.config ?? {};

		if ((w.type === 'select' || w.type === 'multiselect') && (!cfg.options || cfg.options.length === 0)) {
			ctx.addIssue({
				code: 'custom',
				path: ['config', 'options'],
				message: `widget '${w.id}' (type=${w.type}) requires non-empty config.options`
			});
		}

		// likert + slider have a discrete visible range and don't make sense
		// without min/max. `number` widgets are plain numeric inputs where
		// bounds are commonly optional, so we only require them here.
		if ((w.type === 'likert' || w.type === 'slider') &&
			(typeof cfg.min !== 'number' || typeof cfg.max !== 'number')) {
			ctx.addIssue({
				code: 'custom',
				path: ['config'],
				message: `widget '${w.id}' (type=${w.type}) requires numeric config.min and config.max`
			});
		}

		if (w.type === 'timestamp-range' && cfg.timestampReviewMode === undefined) {
			// Not required, but warn-via-issue would be noisy. Allow default.
		}
	});

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

// Gatekeeper is rendered above the response widgets on a stimulus and gates
// engagement. `initial` is shown the first time a stimulus is reached;
// `subsequent` (optional) overrides text/labels on re-prompts (after the
// participant has saved at least one response and the phase is configured for
// allowMultipleResponses). Falls back to `initial` when `subsequent` is
// omitted. On No: first encounter writes a row with JSON null per widget
// (skip), subsequent encounters just advance — see handleNo() in
// src/routes/e/[slug]/[phaseSlug]/+page.svelte.
const GatePromptText = z.object({
	text: LocalizedString,
	yesLabel: LocalizedString,
	noLabel: LocalizedString
});

const GatekeeperQuestion = z.object({
	initial: GatePromptText,
	subsequent: GatePromptText.optional(),
	skipToNext: z.boolean().default(true)
});

const ReviewConfig = z.object({
	sourcePhase: z.string(),
	filterEmpty: z.boolean().default(true),
	replayMode: z.enum(['segment', 'full-highlight']).default('segment'),
	responseWidgets: z.array(ResponseWidget)
});

const PhaseCompletion = z.object({
	title: LocalizedString,
	body: LocalizedString,
	nextPhaseButton: LocalizedString.optional(),
	stayButton: LocalizedString.optional()
});

const SkipRule = z.object({
	targetStimulusId: z.string(),
	condition: z.object({
		stimulusId: z.string(),
		widgetId: z.string(),
		operator: z.enum(['equals', 'not_equals']).default('equals'),
		value: z.string()
	})
});

const BranchRule = z.object({
	condition: z.object({
		widgetId: z.string(),
		stimulusId: z.string().optional(),
		operator: z.enum(['equals', 'not_equals']).default('equals'),
		value: z.string()
	}),
	nextPhaseSlug: z.string()
});

const PhaseConfig = z
	.object({
		id: z.string(),
		slug: z.string(),
		type: z.enum(['stimulus-response', 'review']),
		title: LocalizedString,
		introduction: z.object({
			title: LocalizedString,
			body: LocalizedString
		}).optional(),
		gatekeeperQuestion: GatekeeperQuestion.optional(),
		responseWidgets: z.array(ResponseWidget).default([]),
		reviewConfig: ReviewConfig.optional(),
		stimulusOrder: z.enum(['sequential', 'random', 'random-per-participant']).default('sequential'),
		allowRevisit: z.boolean().default(true),
		allowMultipleResponses: z.boolean().default(false),
		skipRules: z.array(SkipRule).optional(),
		branchRules: z.array(BranchRule).optional(),
		completion: PhaseCompletion
	})
	.superRefine((phase, ctx) => {
		// Review phases must declare reviewConfig (with its sourcePhase + widgets);
		// stimulus-response phases must NOT have reviewConfig (it would be ignored).
		if (phase.type === 'review' && !phase.reviewConfig) {
			ctx.addIssue({
				code: 'custom',
				path: ['reviewConfig'],
				message: `review phase '${phase.id}' requires reviewConfig`
			});
		}
		if (phase.type === 'stimulus-response' && phase.reviewConfig) {
			ctx.addIssue({
				code: 'custom',
				path: ['reviewConfig'],
				message: `stimulus-response phase '${phase.id}' must not have reviewConfig`
			});
		}
	});

// ---------------------------------------------------------------------------
// Stimuli
// ---------------------------------------------------------------------------

// Allow strings, numbers, booleans, and null in stimulus metadata. Replaces
// the previous z.any() that defeated validation entirely.
const StimulusMetadataValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const StimulusItem = z.object({
	id: z.string(),
	type: z.enum(['video', 'image', 'audio', 'text']).optional(),
	url: z.string().optional(),
	filename: z.string().optional(),
	label: LocalizedString.optional(),
	metadata: z.record(z.string(), StimulusMetadataValue).optional()
});

const BlockConfig = z.object({
	id: z.string(),
	label: LocalizedString.optional(),
	stimulusIds: z.array(z.string())
});

const ChunkConfig = z.object({
	id: z.string(),
	slug: z.string().regex(/^[a-z0-9-]+$/),
	label: LocalizedString.optional(),
	blocks: z.array(BlockConfig)
});

const BreakScreen = z.object({
	title: LocalizedString,
	body: LocalizedString,
	duration: z.number().optional()
});

const ChunkingConfig = z.object({
	enabled: z.boolean().default(false),
	chunks: z.array(ChunkConfig).default([]),
	blockOrder: z.enum(['sequential', 'latin-square', 'random-per-participant']).default('sequential'),
	withinBlockOrder: z.enum(['sequential', 'random', 'random-per-participant']).default('random-per-participant'),
	breakScreen: BreakScreen.optional(),
	minBreakMinutes: z.number().optional()
});

const StimuliConfig = z.object({
	type: z.enum(['video', 'image', 'audio', 'text', 'mixed']),
	source: z.enum(['upload', 'external-urls', 'supabase-storage']).default('supabase-storage'),
	storagePath: z.string().optional(),
	messageTemplate: z.string().optional(),
	metadataKeys: z.array(z.string()).optional(),
	items: z.array(StimulusItem),
	chunking: ChunkingConfig.optional()
});

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

const ExperimentMetadata = z.object({
	title: LocalizedString,
	description: LocalizedString.optional(),
	languages: z.array(z.enum(LANGUAGE_CODES)).default(['en']),
	defaultLanguage: z.enum(LANGUAGE_CODES).default('en' as LanguageCode)
});

const CompletionConfig = z.object({
	title: LocalizedString,
	body: LocalizedString,
	redirectUrl: z.string().optional(),
	showSummary: z.boolean().optional(),
	feedbackWidgets: z.array(ResponseWidget).default([])
});

export const ExperimentConfigSchema = z
	.object({
		id: z.string().uuid().optional(),
		slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
		version: z.number().int().default(1),
		status: z.enum(['draft', 'active', 'paused', 'archived']).default('draft'),
		metadata: ExperimentMetadata,
		registration: RegistrationConfig,
		tutorial: TutorialConfig.nullable().default(null),
		phases: z.array(PhaseConfig).min(1),
		stimuli: StimuliConfig,
		completion: CompletionConfig.optional()
	})
	.superRefine((cfg, ctx) => {
		// Reference integrity: every phase / stimulus / widget id mentioned by
		// a review phase, skip rule, or branch rule must point at something
		// that actually exists in the config. Without this, a typo in the
		// admin UI silently produces a phase that never advances.

		const phaseSlugs = new Set(cfg.phases.map((p) => p.slug));
		const phaseIds = new Set(cfg.phases.map((p) => p.id));
		const stimulusIds = new Set(cfg.stimuli.items.map((s) => s.id));

		for (let i = 0; i < cfg.phases.length; i++) {
			const phase = cfg.phases[i];
			const widgetIds = new Set(
				(phase.type === 'review' && phase.reviewConfig
					? phase.reviewConfig.responseWidgets
					: phase.responseWidgets
				).map((w) => w.id)
			);

			if (phase.type === 'review' && phase.reviewConfig) {
				const src = phase.reviewConfig.sourcePhase;
				if (!phaseIds.has(src) && !phaseSlugs.has(src)) {
					ctx.addIssue({
						code: 'custom',
						path: ['phases', i, 'reviewConfig', 'sourcePhase'],
						message: `sourcePhase '${src}' does not match any phase id or slug`
					});
				}
			}

			for (let r = 0; r < (phase.skipRules ?? []).length; r++) {
				const rule = phase.skipRules![r];
				if (!stimulusIds.has(rule.targetStimulusId)) {
					ctx.addIssue({
						code: 'custom',
						path: ['phases', i, 'skipRules', r, 'targetStimulusId'],
						message: `skipRule.targetStimulusId '${rule.targetStimulusId}' does not match any stimulus id`
					});
				}
				if (!stimulusIds.has(rule.condition.stimulusId)) {
					ctx.addIssue({
						code: 'custom',
						path: ['phases', i, 'skipRules', r, 'condition', 'stimulusId'],
						message: `skipRule.condition.stimulusId '${rule.condition.stimulusId}' does not match any stimulus id`
					});
				}
				if (!widgetIds.has(rule.condition.widgetId)) {
					ctx.addIssue({
						code: 'custom',
						path: ['phases', i, 'skipRules', r, 'condition', 'widgetId'],
						message: `skipRule.condition.widgetId '${rule.condition.widgetId}' does not match any widget id in this phase`
					});
				}
			}

			for (let b = 0; b < (phase.branchRules ?? []).length; b++) {
				const rule = phase.branchRules![b];
				if (!phaseSlugs.has(rule.nextPhaseSlug)) {
					ctx.addIssue({
						code: 'custom',
						path: ['phases', i, 'branchRules', b, 'nextPhaseSlug'],
						message: `branchRule.nextPhaseSlug '${rule.nextPhaseSlug}' does not match any phase slug`
					});
				}
				if (!widgetIds.has(rule.condition.widgetId)) {
					ctx.addIssue({
						code: 'custom',
						path: ['phases', i, 'branchRules', b, 'condition', 'widgetId'],
						message: `branchRule.condition.widgetId '${rule.condition.widgetId}' does not match any widget id in this phase`
					});
				}
				if (rule.condition.stimulusId && !stimulusIds.has(rule.condition.stimulusId)) {
					ctx.addIssue({
						code: 'custom',
						path: ['phases', i, 'branchRules', b, 'condition', 'stimulusId'],
						message: `branchRule.condition.stimulusId '${rule.condition.stimulusId}' does not match any stimulus id`
					});
				}
			}
		}

		// Chunking blocks must reference real stimuli.
		const chunking = cfg.stimuli.chunking;
		if (chunking?.enabled) {
			for (let c = 0; c < chunking.chunks.length; c++) {
				const chunk = chunking.chunks[c];
				for (let b = 0; b < chunk.blocks.length; b++) {
					for (let s = 0; s < chunk.blocks[b].stimulusIds.length; s++) {
						const sid = chunk.blocks[b].stimulusIds[s];
						if (!stimulusIds.has(sid)) {
							ctx.addIssue({
								code: 'custom',
								path: ['stimuli', 'chunking', 'chunks', c, 'blocks', b, 'stimulusIds', s],
								message: `chunk block references unknown stimulus id '${sid}'`
							});
						}
					}
				}
			}
		}

		// Default language must be one of the declared languages.
		if (!cfg.metadata.languages.includes(cfg.metadata.defaultLanguage)) {
			ctx.addIssue({
				code: 'custom',
				path: ['metadata', 'defaultLanguage'],
				message: `defaultLanguage '${cfg.metadata.defaultLanguage}' is not in metadata.languages`
			});
		}
	});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>;
export type RegistrationFieldType = z.infer<typeof RegistrationField>;
export type ResponseWidgetType = z.infer<typeof ResponseWidget>;
export type PhaseConfigType = z.infer<typeof PhaseConfig>;
export type SkipRuleType = z.infer<typeof SkipRule>;
export type BranchRuleType = z.infer<typeof BranchRule>;
export type BreakScreenType = z.infer<typeof BreakScreen>;
export type StimulusItemType = z.infer<typeof StimulusItem>;
export type TutorialConfigType = z.infer<typeof TutorialConfig>;
export type TutorialStepType = z.infer<typeof TutorialStep>;
export type WidgetOptionType = z.infer<typeof WidgetOption>;
export type FieldOptionType = z.infer<typeof FieldOption>;
export type StimuliConfigType = z.infer<typeof StimuliConfig>;
export type ReviewConfigType = z.infer<typeof ReviewConfig>;
export type LocalizedStringType = z.infer<typeof LocalizedString>;
export type ChunkingConfigType = z.infer<typeof ChunkingConfig>;
export type ChunkConfigType = z.infer<typeof ChunkConfig>;
export type BlockConfigType = z.infer<typeof BlockConfig>;

// Re-exported for the StimulusItem schema so admin code (e.g. bulk import)
// can validate single items against the same shape used in the experiment
// config.
export const StimulusItemSchema = StimulusItem;

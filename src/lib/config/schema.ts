import { z } from 'zod';

// Localized string: { en: "...", ja: "..." }
const LocalizedString = z.record(z.string(), z.string());
const LocalizedStringArray = z.record(z.string(), z.array(z.string()));

// --- Registration ---

const FieldOption = z.object({
	value: z.string(),
	label: LocalizedString,
	showConditionalField: z.string().optional()
});

const FieldValidation = z.object({
	min: z.number().optional(),
	max: z.number().optional(),
	pattern: z.string().optional(),
	errorMessage: LocalizedString.optional()
});

const RegistrationField = z.object({
	id: z.string(),
	type: z.enum(['text', 'number', 'email', 'select', 'multiselect', 'textarea']),
	label: LocalizedString,
	placeholder: LocalizedString.optional(),
	required: z.boolean().default(true),
	validation: FieldValidation.optional(),
	options: z.array(FieldOption).optional(),
	conditionalOn: z.object({
		field: z.string(),
		value: z.string()
	}).optional(),
	defaultValue: z.string().optional()
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

// --- Tutorial ---

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

// --- Response Widgets ---

const WidgetOption = z.object({
	value: z.string(),
	label: LocalizedString
});

const WidgetConfig = z.object({
	// For select/multiselect
	options: z.array(WidgetOption).optional(),
	// For likert/slider
	min: z.number().optional(),
	max: z.number().optional(),
	step: z.number().optional(),
	minLabel: LocalizedString.optional(),
	maxLabel: LocalizedString.optional(),
	// For textarea
	minLength: z.number().optional(),
	maxLength: z.number().optional(),
	showCharCount: z.boolean().optional(),
	// For timestamp-range
	captureStartLabel: LocalizedString.optional(),
	captureEndLabel: LocalizedString.optional(),
	timestampReviewMode: z.enum(['segment', 'full-highlight']).optional(),
	// For audio-recording
	maxDurationSeconds: z.number().optional(),
	maxFileSizeMB: z.number().optional()
});

const ResponseWidget = z.object({
	id: z.string(),
	type: z.enum([
		'text', 'textarea', 'select', 'multiselect',
		'likert', 'timestamp-range', 'audio-recording',
		'slider', 'number'
	]),
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
});

// --- Phases ---

const GatekeeperQuestion = z.object({
	text: LocalizedString,
	yesLabel: LocalizedString,
	noLabel: LocalizedString,
	noResponseValue: z.string().default('null'),
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

const PhaseConfig = z.object({
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
});

// --- Stimuli ---

const StimulusItem = z.object({
	id: z.string(),
	type: z.enum(['video', 'image', 'audio', 'text']).optional(),
	url: z.string().optional(),
	filename: z.string().optional(),
	label: LocalizedString.optional(),
	metadata: z.record(z.string(), z.any()).optional()
});

// --- Chunking & Blocks ---

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
	minBreakMinutes: z.number().optional()  // minimum minutes between completing one chunk and starting the next
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

// --- Top-level ---

const ExperimentMetadata = z.object({
	title: LocalizedString,
	description: LocalizedString.optional(),
	languages: z.array(z.string()).default(['en']),
	defaultLanguage: z.string().default('en')
});

const CompletionConfig = z.object({
	title: LocalizedString,
	body: LocalizedString,
	redirectUrl: z.string().optional(),
	showSummary: z.boolean().optional(),
	feedbackWidgets: z.array(ResponseWidget).default([])
});

export const ExperimentConfigSchema = z.object({
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
});

// Export inferred types
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

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
	config: WidgetConfig.optional()
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
	responseWidgets: z.array(ResponseWidget)
});

const PhaseCompletion = z.object({
	title: LocalizedString,
	body: LocalizedString,
	nextPhaseButton: LocalizedString.optional(),
	stayButton: LocalizedString.optional()
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

const StimuliConfig = z.object({
	type: z.enum(['video', 'image', 'audio', 'text', 'mixed']),
	source: z.enum(['upload', 'external-urls', 'supabase-storage']).default('supabase-storage'),
	storagePath: z.string().optional(),
	items: z.array(StimulusItem)
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
	showSummary: z.boolean().optional()
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
export type StimulusItemType = z.infer<typeof StimulusItem>;
export type TutorialConfigType = z.infer<typeof TutorialConfig>;
export type TutorialStepType = z.infer<typeof TutorialStep>;
export type WidgetOptionType = z.infer<typeof WidgetOption>;
export type FieldOptionType = z.infer<typeof FieldOption>;
export type StimuliConfigType = z.infer<typeof StimuliConfig>;
export type LocalizedStringType = z.infer<typeof LocalizedString>;

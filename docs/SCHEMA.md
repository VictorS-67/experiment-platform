# Experiment Config Schema

Full Zod schema: `src/lib/config/schema.ts`

## Config Tree

```
ExperimentConfig
├── slug: string (lowercase alphanumeric + hyphens)
├── version: int (default 1)
├── status: "draft" | "active" | "paused" | "archived"
├── metadata
│   ├── title: LocalizedString          # Record<string, string>
│   ├── description: LocalizedString?
│   ├── languages: string[]             # default ["en"]
│   └── defaultLanguage: string         # default "en"
├── registration
│   ├── introduction
│   │   ├── title, body: LocalizedString
│   │   ├── instructions: LocalizedStringArray?
│   │   └── additionalInfo: LocalizedString?
│   └── fields: RegistrationField[]
│       ├── id, type (text|number|email|select|multiselect|textarea)
│       ├── label: LocalizedString, placeholder: LocalizedString?
│       ├── required: boolean, defaultValue: string?
│       ├── validation: { min?, max?, pattern? (max 200 chars), errorMessage? }?
│       ├── options: [{ value, label, showConditionalField? }]?
│       └── conditionalOn: { field, value }?
├── tutorial: TutorialConfig | null
│   ├── allowSkip: boolean?
│   ├── introduction?: { title, body, buttonText? }
│   ├── welcome: { title, body, buttonText }
│   ├── steps: TutorialStep[]
│   │   ├── id, targetSelector, title, body: LocalizedString
│   │   ├── instruction: LocalizedString?, position: top|bottom|left|right|center
│   │   └── validation: { type: click|input|play|none, target?: string }?
│   ├── completion: { title, body, buttonText }
│   └── sampleStimuliIds: string[]
├── phases: PhaseConfig[] (min 1)
│   ├── id, slug, type: "stimulus-response" | "review"
│   ├── title: LocalizedString
│   ├── introduction: { title, body }?
│   ├── gatekeeperQuestion?
│   │   ├── text, yesLabel, noLabel: LocalizedString
│   │   ├── noResponseValue: string (default "null")
│   │   └── skipToNext: boolean (default true)
│   ├── responseWidgets: ResponseWidget[]       # For stimulus-response phases
│   ├── reviewConfig?                           # Required for review phases
│   │   ├── sourcePhase: string
│   │   ├── filterEmpty: boolean (default true)
│   │   └── responseWidgets: ResponseWidget[]
│   ├── stimulusOrder: "sequential" | "random" | "random-per-participant"
│   ├── allowRevisit: boolean (default true)
│   ├── allowMultipleResponses: boolean (default false)
│   ├── skipRules: SkipRule[]?
│   ├── branchRules: BranchRule[]?
│   └── completion: PhaseCompletion
├── stimuli
│   ├── type: "video" | "image" | "audio" | "text" | "mixed"
│   ├── source: "upload" | "external-urls" | "supabase-storage"
│   ├── storagePath: string?
│   ├── items: StimulusItem[]
│   │   ├── id, type?, url?, filename?
│   │   ├── label: LocalizedString?
│   │   └── metadata: Record<string, any>?
│   └── chunking?: ChunkingConfig
│       ├── enabled: boolean, blockOrder, withinBlockOrder
│       ├── breakScreen?: { title, body, duration? }
│       └── chunks: [{ id, slug, label?, blocks: [{ id, label?, stimulusIds }] }]
└── completion?
    ├── title, body: LocalizedString
    ├── redirectUrl: string?
    └── showSummary: boolean?
```

## Response Widget Types

| Type | UI Component | Config Options | Storage |
|------|-------------|----------------|---------|
| `text` | `<input type="text">` | — | `{widgetId}: "value"` |
| `textarea` | `<textarea>` | `showCharCount`, `minLength`, `maxLength` | `{widgetId}: "value"` |
| `select` | `<select>` dropdown | `options` (required) | `{widgetId}: "selectedValue"` |
| `multiselect` | Toggle buttons | `options` (required) | `{widgetId}: "a,b,c"` |
| `number` | `<input type="number">` | `min`, `max`, `step` | `{widgetId}: "value"` |
| `likert` | Clickable number row | `min`, `max` (required), labels | `{widgetId}: "3"` |
| `slider` | `<input type="range">` | `min`, `max` (required), `step`, labels | `{widgetId}: "value"` |
| `timestamp-range` | Two capture buttons | `captureStartLabel`, `captureEndLabel`, `timestampReviewMode` | `{widgetId}_start`, `{widgetId}_end` |
| `audio-recording` | MediaRecorder UI | `maxDurationSeconds`, `maxFileSizeMB` | `{widgetId}: "storage/path.webm"` |

Shared optional fields: `conditionalOn`, `stepNumber`, `stepLabel`, `placeholder`.

**Timestamp-range detail**: Internally stores `"start,end"` comma-separated, split into `_start`/`_end` keys on save. `ReviewItemDisplay` detects pairs via hyphen-delimited regex and shows replay button.

## Stimulus Naming

- **Existing experiments**: Numeric IDs (`"4"`, `"4.mp4"`) — mapping in `previous_expe_data/`
- **New experiments**: Use original filename as both `id` and `filename`
- **Storage**: `stimuli/{experiment-slug}/{filename}` in Supabase Storage

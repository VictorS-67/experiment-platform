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
│       ├── id, type (text|number|email|select|multiselect|textarea|select-or-other)
│       ├── label: LocalizedString, placeholder: LocalizedString?
│       ├── required: boolean, defaultValue: string?
│       ├── validation: { min?, max?, pattern? (max 200 chars), errorMessage? }?
│       ├── options: [{ value, label }]?                    # required for select/select-or-other
│       ├── otherLabel: LocalizedString?                    # select-or-other only
│       ├── otherPlaceholder: LocalizedString?              # select-or-other only
│       └── conditionalOn: { field, value }?
├── tutorial: TutorialConfig | null
│   ├── allowSkip: boolean?
│   ├── introduction?: { title, body, buttonText? }
│   ├── welcome: { title, body, buttonText }
│   ├── steps: TutorialStep[]
│   │   ├── id, targetSelector, title, body: LocalizedString
│   │   ├── instruction: LocalizedString?, position: top|bottom|left|right|center
│   │   ├── validation: { type: click|input|play|none, target?: string }?
│   │   └── autoAdvance: boolean?       # If true, overlay advances ~400ms after validation completes
│   ├── completion: { title, body, buttonText }
│   └── sampleStimuliIds: string[]
├── phases: PhaseConfig[] (min 1)
│   ├── id, slug, type: "stimulus-response" | "review"
│   ├── title: LocalizedString
│   ├── introduction: { title, body }?
│   ├── gatekeeperQuestion?
│   │   ├── initial: { text, yesLabel, noLabel: LocalizedString }  # required
│   │   ├── subsequent?: { text, yesLabel, noLabel: LocalizedString }  # re-prompt after a real response
│   │   └── skipToNext: boolean (default true)
│   ├── responseWidgets: ResponseWidget[]       # For stimulus-response phases
│   ├── reviewConfig?                           # Required for review phases
│   │   ├── sourcePhase: string
│   │   ├── filterEmpty: boolean (default true)
│   │   ├── replayMode: "segment" | "full-highlight" (default "segment")
│   │   ├── allowNavigation: boolean (default false)   # If false, StimulusNav is hidden; sequential only
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
│   ├── metadataKeys: string[]?                          # Editable list driving balance auto-gen + bulk import metadata columns
│   ├── items: StimulusItem[]
│   │   ├── id, type?, url?, filename?
│   │   ├── label: LocalizedString?
│   │   ├── metadata: Record<string, string|number|boolean|null>?
│   │   └── isAnchor: boolean?                            # Test-retest anchor — replicated once per chunk
│   └── chunking?: ChunkingConfig
│       ├── enabled: boolean
│       ├── chunkOrder: "sequential" | "latin-square" | "random-per-participant"  # default sequential
│       ├── blockOrder: "sequential" | "latin-square" | "random-per-participant"
│       ├── withinBlockOrder: "sequential" | "random" | "random-per-participant"
│       ├── minBreakMinutes: number?
│       ├── breakScreen?: { title?, body?, duration?, disabled? }   # All optional; falls back to platform defaults `survey.break_default_*`
│       └── chunks: [{ id, slug, label?, blocks: [{ id, label?, stimulusIds }] }]
└── completion?
    ├── title, body: LocalizedString
    ├── redirectUrl: string?
    └── showSummary: boolean?
```

## Registration Field Types

| Type | UI Component | Notes |
|------|-------------|-------|
| `text` | `<input type="text">` | |
| `email` | `<input type="email">` | |
| `number` | `<input type="number">` | Supports `validation.min` / `validation.max` |
| `textarea` | `<textarea>` | |
| `select` | `<select>` dropdown | Requires `options` |
| `multiselect` | Toggle buttons | Requires `options` |
| `select-or-other` | `<select>` + conditional text | Requires `options` + `otherLabel`. Adds an "Other" entry automatically; when picked, an inline text input appears. Stores a **single string** in `registration_data[id]` — either the chosen option's value or the typed free-text. The UI-only sentinel `__OTHER__` is never stored. |

**`select-or-other` storage contract**: `registration_data[id]` is always a plain string. If it matches a known option value, the participant picked from the list. If it doesn't, they typed free-text via the Other path. Migrated from a legacy two-field pattern using `scripts/migrate-select-or-other.ts`.

**`gatekeeperQuestion` behaviour**: The `initial` block renders on first encounter (no prior response for the stimulus); `subsequent` (if configured) renders on re-prompt after a real response. Clicking "No" on first encounter writes a skip row with JSON `null` per widget. Clicking "No" after a real response only advances — no DB write.

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

## Sentinel keys in `response_data`

Beyond user-defined widget keys, the `response_data` JSONB blob can hold platform-injected metadata under `_`-prefixed keys (the sentinel convention):

| Key | Set by | Purpose |
|-----|--------|---------|
| `_chunk` | client save call (any chunked URL) | Records which chunk visit this response came from. Lynchpin of per-chunk anchor accounting and CSV-export-friendly chunk attribution. |
| `_timestamp` | (legacy) | Was previously injected by some clients; current code paths don't add it but the filter convention preserves it for backward compat. |

All consumers that iterate widget keys must filter `!k.startsWith('_')` before treating values as widget answers. The save endpoint (`save/+server.ts`) explicitly bypasses `_`-prefixed keys in widget-ID validation. Adding a new sentinel later is a matter of injection + documentation; the filter convention picks it up automatically.

**Anchor behaviour** (`StimulusItem.isAnchor: true`): the auto-generator pulls anchors out of the regular pool and replicates them once per chunk. At runtime, the canonical `chunkCompletion: Map<id, 'completed' | 'skipped'>` derivation in the phase page treats an anchor as "done in this chunk" only when a response with `_chunk === currentChunkSlug` exists — so the gatekeeper engages fresh, the StimulusNav button stays neutral, and the saved-responses card hides prior-chunk ratings (test-retest blinding). Legacy responses without `_chunk` are treated as belonging to the participant's first chunk in their resolved order.

## Stimulus Naming

- **Existing experiments**: Numeric IDs (`"4"`, `"4.mp4"`) — mapping in `previous_expe_data/`
- **New experiments**: Use original filename as both `id` and `filename`
- **Storage**: `stimuli/{experiment-slug}/{filename}` in Supabase Storage

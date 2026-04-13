/**
 * Bulk stimulus import utilities.
 * Pure functions for filename pattern parsing, CSV parsing, and stimulus item generation.
 */

export interface StimulusItemCandidate {
	id: string;
	filename: string;
	metadata?: Record<string, string>;
	duplicate: boolean;
}

// --- Filename pattern → regex ---

export function compileFilenamePattern(
	pattern: string
): { regex: RegExp; keys: string[] } | null {
	const trimmed = pattern.trim();
	if (!trimmed) return null;

	const keys: string[] = [];
	// Replace {name} placeholders with named capture groups
	// Everything else is escaped as a literal
	let regexStr = '^';
	let i = 0;
	while (i < trimmed.length) {
		if (trimmed[i] === '{') {
			const end = trimmed.indexOf('}', i + 1);
			if (end === -1) {
				// No closing brace — treat rest as literal
				regexStr += escapeRegex(trimmed.slice(i));
				break;
			}
			const key = trimmed.slice(i + 1, end);
			if (key.length > 0) {
				keys.push(key);
				regexStr += `(?<${key}>[^-._/]+)`;
			}
			i = end + 1;
		} else {
			regexStr += escapeRegex(trimmed[i]);
			i++;
		}
	}
	regexStr += '$';

	if (keys.length === 0) return null;

	try {
		return { regex: new RegExp(regexStr), keys };
	} catch {
		return null;
	}
}

export function extractMetadata(
	filename: string,
	regex: RegExp
): Record<string, string> | null {
	const match = filename.match(regex);
	if (!match?.groups) return null;
	return { ...match.groups };
}

// --- CSV parsing (RFC 4180) ---

export function parseCSV(
	text: string
): { headers: string[]; rows: Record<string, string>[] } {
	// Strip BOM and normalize line endings
	const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const lines = splitCSVLines(clean);

	if (lines.length === 0) return { headers: [], rows: [] };

	const headers = parseCSVRow(lines[0]);
	const rows: Record<string, string>[] = [];

	for (let i = 1; i < lines.length; i++) {
		const values = parseCSVRow(lines[i]);
		if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;
		const row: Record<string, string> = {};
		for (let j = 0; j < headers.length; j++) {
			row[headers[j]] = values[j] ?? '';
		}
		rows.push(row);
	}

	return { headers, rows };
}

function splitCSVLines(text: string): string[] {
	const lines: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '"') {
			inQuotes = !inQuotes;
			current += ch;
		} else if (ch === '\n' && !inQuotes) {
			lines.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	if (current.length > 0) lines.push(current);
	return lines;
}

function parseCSVRow(line: string): string[] {
	const fields: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"') {
				if (i + 1 < line.length && line[i + 1] === '"') {
					current += '"';
					i++; // skip escaped quote
				} else {
					inQuotes = false;
				}
			} else {
				current += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ',') {
				fields.push(current);
				current = '';
			} else {
				current += ch;
			}
		}
	}
	fields.push(current);
	return fields;
}

// --- Glob → regex ---

export function globToRegex(glob: string): RegExp {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	const withWildcards = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
	return new RegExp(`^${withWildcards}$`, 'i');
}

// --- Build stimulus items ---

export function filenameToId(filename: string): string {
	// Strip extension, lowercase, replace non-alphanumeric with hyphens, collapse
	const base = filename.replace(/\.[^.]+$/, '');
	return base
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function buildStimulusItems(
	files: string[],
	options: {
		patternRegex?: RegExp;
		csvData?: Map<string, Record<string, string>>;
		existingFilenames: Set<string>;
		existingIds: Set<string>;
	}
): StimulusItemCandidate[] {
	const { patternRegex, csvData, existingFilenames, existingIds } = options;
	const usedIds = new Set(existingIds);
	const candidates: StimulusItemCandidate[] = [];

	for (const filename of files) {
		let id = filenameToId(filename);

		// Deduplicate IDs
		if (usedIds.has(id)) {
			let suffix = 2;
			while (usedIds.has(`${id}-${suffix}`)) suffix++;
			id = `${id}-${suffix}`;
		}
		usedIds.add(id);

		// Build metadata from pattern and/or CSV
		let metadata: Record<string, string> | undefined;

		if (patternRegex) {
			const extracted = extractMetadata(filename, patternRegex);
			if (extracted) metadata = extracted;
		}

		if (csvData) {
			const csvRow = csvData.get(filename);
			if (csvRow) {
				metadata = { ...(metadata ?? {}), ...csvRow };
			}
		}

		const duplicate = existingFilenames.has(filename);

		candidates.push({
			id,
			filename,
			metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
			duplicate
		});
	}

	return candidates;
}

// --- Helpers ---

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

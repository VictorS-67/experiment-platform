import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getExperiment, getResponseData } from '$lib/server/admin';

type Row = Record<string, unknown>;

function buildResearchRows(
	rows: Row[],
	experimentConfig: Record<string, unknown>,
	fmtDate: (ts: string) => string,
	includeRegistration: boolean
): { mergedRows: Row[]; columns: string[] } {
	const phases = (experimentConfig.phases ?? []) as Array<{
		id: string;
		type?: string;
		responseWidgets?: Array<{ id: string }>;
		reviewConfig?: { responseWidgets?: Array<{ id: string }> };
	}>;

	// Collect all response_data keys per phase (in config order)
	const phaseWidgetKeys: Map<string, string[]> = new Map();
	for (const phase of phases) {
		const widgets =
			phase.type === 'review'
				? (phase.reviewConfig?.responseWidgets ?? [])
				: (phase.responseWidgets ?? []);
		phaseWidgetKeys.set(
			phase.id,
			widgets.map((w) => w.id)
		);
	}
	const phaseOrder = phases.map((p) => p.id);

	// Group rows by (participant_id, stimulus_id, response_index)
	const groups = new Map<string, Row[]>();
	for (const row of rows) {
		const key = `${row.participant_id}__${row.stimulus_id}__${row.response_index}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(row);
	}

	// Collect all response_data keys actually present in data (union across all rows)
	const allResponseKeys: Map<string, Set<string>> = new Map();
	for (const phaseId of phaseOrder) allResponseKeys.set(phaseId, new Set());
	for (const row of rows) {
		const pid = row.phase_id as string;
		if (!allResponseKeys.has(pid)) allResponseKeys.set(pid, new Set());
		const rd = row.response_data as Record<string, unknown> | null;
		if (rd) for (const k of Object.keys(rd)) allResponseKeys.get(pid)!.add(k);
	}

	// Build ordered response_data columns: config widget order first, then any extra keys found in data
	const responseColumns: string[] = [];
	for (const phaseId of phaseOrder) {
		const configKeys = phaseWidgetKeys.get(phaseId) ?? [];
		const dataKeys = allResponseKeys.get(phaseId) ?? new Set();
		const ordered = [
			...configKeys,
			...[...dataKeys].filter((k) => !configKeys.includes(k))
		];
		for (const k of ordered) {
			if (!responseColumns.includes(k)) responseColumns.push(k);
		}
	}

	// Build stimulus lookup: id → { filename, metadata }
	const stimuliConfig = experimentConfig.stimuli as {
		metadataKeys?: string[];
		items?: Array<{ id: string; filename?: string; metadata?: Record<string, unknown> }>;
	} | undefined;
	const stimulusMap = new Map<string, { filename?: string; metadata?: Record<string, unknown> }>();
	for (const item of stimuliConfig?.items ?? []) stimulusMap.set(item.id, item);

	// Determine metadata columns: use declared metadataKeys if present, else union across all items
	const metadataKeys: string[] = stimuliConfig?.metadataKeys?.length
		? stimuliConfig.metadataKeys
		: [...new Set((stimuliConfig?.items ?? []).flatMap((s) => Object.keys(s.metadata ?? {})))];
	const stimulusMetaColumns = metadataKeys.map((k) => `stimulus_${k}`);

	// Build timestamp columns: one per phase
	const tsColumns = phaseOrder.map((pid) => `${pid}_created_at`);

	// Collect registration keys (only if requested)
	const regKeys: string[] = [];
	if (includeRegistration) {
		const regKeySet = new Set<string>();
		for (const row of rows) {
			const rd = row.registration_data as Record<string, unknown> | null;
			if (rd) for (const k of Object.keys(rd)) regKeySet.add(k);
		}
		regKeys.push(...[...regKeySet].sort());
	}

	const columns = [
		'id',
		'stimulus_id',
		'stimulus_filename',
		...stimulusMetaColumns,
		'response_index',
		...responseColumns,
		...tsColumns,
		'participant_email',
		'participant_name',
		...regKeys.map((k) => `reg_${k}`)
	];

	// Merge each group into one row
	const mergedRows: Row[] = [];
	for (const groupRows of groups.values()) {
		// Index rows by phase_id (take the one with highest response_index within group if duplicates)
		const byPhase = new Map<string, Row>();
		for (const r of groupRows) {
			const pid = r.phase_id as string;
			byPhase.set(pid, r);
		}

		// Use first phase row's id as the merged row id
		const firstPhaseId = phaseOrder.find((pid) => byPhase.has(pid));
		const firstRow = firstPhaseId ? byPhase.get(firstPhaseId)! : groupRows[0];

		const stimItem = stimulusMap.get(String(firstRow.stimulus_id));
		const merged: Row = {
			id: firstRow.id,
			stimulus_id: firstRow.stimulus_id,
			stimulus_filename: stimItem?.filename ?? null,
			response_index: firstRow.response_index
		};
		// Stimulus metadata columns
		for (const k of metadataKeys) {
			merged[`stimulus_${k}`] = stimItem?.metadata?.[k] ?? null;
		}

		// Expand response_data keys from all phases
		for (const phaseId of phaseOrder) {
			const phaseRow = byPhase.get(phaseId);
			const rd = (phaseRow?.response_data ?? {}) as Record<string, unknown>;
			for (const k of responseColumns) {
				// Only set if this phase actually had this key, and we haven't set it yet
				if (rd[k] !== undefined && merged[k] === undefined) {
					merged[k] = rd[k];
				}
			}
			// Timestamp
			const tsCol = `${phaseId}_created_at`;
			merged[tsCol] = phaseRow?.created_at ? fmtDate(phaseRow.created_at as string) : null;
		}

		// Participant info
		merged.participant_email = firstRow.participant_email;
		merged.participant_name = firstRow.participant_name;
		const rd = firstRow.registration_data as Record<string, unknown> | null;
		for (const k of regKeys) merged[`reg_${k}`] = rd?.[k] ?? null;

		mergedRows.push(merged);
	}

	// Sort: stimulus_id (numeric if possible), then participant_email, then response_index
	mergedRows.sort((a, b) => {
		const sa = Number(a.stimulus_id) || String(a.stimulus_id ?? '');
		const sb = Number(b.stimulus_id) || String(b.stimulus_id ?? '');
		if (sa < sb) return -1;
		if (sa > sb) return 1;
		const ea = String(a.participant_email ?? '');
		const eb = String(b.participant_email ?? '');
		if (ea < eb) return -1;
		if (ea > eb) return 1;
		return Number(a.response_index ?? 0) - Number(b.response_index ?? 0);
	});

	return { mergedRows, columns };
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');

	const experiment = await getExperiment(params.id);
	if (!experiment) error(404, 'Experiment not found');

	// Query params
	const phaseFilter = url.searchParams.get('phase') || '';
	const participantFilter = url.searchParams.get('participant') || '';
	const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';
	const style = url.searchParams.get('style') === 'research' ? 'research' : 'raw';
	const dateFormat = url.searchParams.get('dateFormat') === 'human' ? 'human' : 'iso';
	const includeRegistration = url.searchParams.get('includeRegistration') === 'true';

	let rows = await getResponseData(params.id);

	// Filtering
	if (phaseFilter) rows = rows.filter((r) => r.phase_id === phaseFilter);
	if (participantFilter) rows = rows.filter((r) => r.participant_id === participantFilter);

	// Timestamp formatting
	const fmtDate = (ts: string) =>
		dateFormat === 'human'
			? new Date(ts).toLocaleString('en-US', { timeZone: 'UTC' })
			: ts;

	function escapeCSV(value: unknown): string {
		if (value === null || value === undefined) return '';
		let str = typeof value === 'object' ? JSON.stringify(value) : String(value);
		if (/^[=+\-@\t\r]/.test(str)) str = '\t' + str;
		if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	}

	// Research-friendly style: merge phases into one row per (participant × stimulus × response_index)
	if (style === 'research') {
		const config = experiment.config as Record<string, unknown>;
		const { mergedRows, columns } = buildResearchRows(rows as Row[], config, fmtDate, includeRegistration);
		const dateStr = new Date().toISOString().slice(0, 10);

		if (format === 'json') {
			const filename = `${experiment.slug}-responses-research-${dateStr}.json`;
			return new Response(JSON.stringify(mergedRows, null, 2), {
				headers: {
					'Content-Type': 'application/json',
					'Content-Disposition': `attachment; filename="${filename}"`
				}
			});
		}

		const header = columns.map(escapeCSV).join(',');
		const body = mergedRows.map((row) => columns.map((col) => escapeCSV(row[col])).join(',')).join('\n');
		const filename = `${experiment.slug}-responses-research-${dateStr}.csv`;
		return new Response(header + '\n' + body, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	}

	// Raw style (default)
	if (format === 'json') {
		const output = rows.map((row) => {
			const r: Record<string, unknown> = { ...row };
			if (r.created_at) r.created_at = fmtDate(r.created_at as string);
			if (includeRegistration && r.registration_data) {
				const rd = r.registration_data as Record<string, unknown>;
				for (const [k, v] of Object.entries(rd)) r[`reg_${k}`] = v;
				delete r.registration_data;
			}
			return r;
		});
		const filename = `${experiment.slug}-responses-${new Date().toISOString().slice(0, 10)}.json`;
		return new Response(JSON.stringify(output, null, 2), {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	}

	// Build flattened rows for CSV
	const flatRows = rows.map((row) => {
		const r: Record<string, unknown> = { ...row };
		if (r.created_at) r.created_at = fmtDate(r.created_at as string);
		return r;
	});

	// Collect all unique registration data keys if requested
	let regKeys: string[] = [];
	if (includeRegistration) {
		const allRegKeys = new Set<string>();
		for (const row of flatRows) {
			const rd = row.registration_data as Record<string, unknown> | null;
			if (rd) for (const k of Object.keys(rd)) allRegKeys.add(k);
		}
		regKeys = [...allRegKeys].sort();
	}

	// Build final rows with optional registration columns
	const processedRows = flatRows.map((row) => {
		const r: Record<string, unknown> = { ...row };
		if (includeRegistration && regKeys.length > 0) {
			const rd = r.registration_data as Record<string, unknown> | null;
			for (const k of regKeys) r[`reg_${k}`] = rd?.[k] ?? null;
		}
		delete r.registration_data;
		return r;
	});

	// Collect columns: non-registration-data columns first, then reg_ columns
	const baseColumns = Array.from(
		new Set(processedRows.flatMap((row) => Object.keys(row).filter((k) => !k.startsWith('reg_'))))
	).sort();
	const regColumns = regKeys.map((k) => `reg_${k}`);
	const columns = [...baseColumns, ...regColumns];

	const header = columns.map(escapeCSV).join(',');
	const body = processedRows.map((row) => columns.map((col) => escapeCSV(row[col])).join(',')).join('\n');
	const csv = header + '\n' + body;

	const filename = `${experiment.slug}-responses-${new Date().toISOString().slice(0, 10)}.csv`;
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getExperiment, getResponseData } from '$lib/server/admin';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');

	const experiment = await getExperiment(params.id);
	if (!experiment) error(404, 'Experiment not found');

	const rows = await getResponseData(params.id);

	// Collect all unique column names across rows, sorted for consistency
	const columns = Array.from(
		new Set(rows.flatMap((row) => Object.keys(row)))
	).sort();

	function escapeCSV(value: unknown): string {
		if (value === null || value === undefined) return '';
		let str = typeof value === 'object' ? JSON.stringify(value) : String(value);

		// Prevent CSV injection: prefix formula-triggering characters with a tab
		if (/^[=+\-@\t\r]/.test(str)) {
			str = '\t' + str;
		}

		if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	}

	const header = columns.map(escapeCSV).join(',');
	const body = rows.map((row) => columns.map((col) => escapeCSV(row[col])).join(',')).join('\n');
	const csv = header + '\n' + body;

	const filename = `${experiment.slug}-responses-${new Date().toISOString().slice(0, 10)}.csv`;

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};

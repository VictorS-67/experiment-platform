import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerSupabase } from '$lib/server/supabase';
import { logAdminAction } from '$lib/server/audit';
import { paginate } from '$lib/server/pagination';

export const GET: RequestHandler = async ({ locals, getClientAddress }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');

	// Mass-export of every experiment's PII + responses. Restrict to platform
	// `admin` role — the `researcher` role is now auto-issued by
	// `claimInvitesForUser` to anyone accepting a collaborator invite, and a
	// viewer-on-one-experiment must NOT be able to dump every other study.
	// Per-experiment researchers can still pull their own data via the per-
	// experiment CSV/JSON export at /admin/experiments/[id]/data/export.
	if (locals.adminUser.role !== 'admin') error(403, 'Forbidden');

	// Audit row makes operator-level dumps reviewable after the fact.
	await logAdminAction({
		adminUserId: locals.adminUser.id,
		adminEmail: locals.adminUser.email,
		action: 'backup.export_all',
		ip: getClientAddress()
	});

	const supabase = getServerSupabase();
	const encoder = new TextEncoder();
	const dateStr = new Date().toISOString().slice(0, 10);
	const filename = `backup-${dateStr}.json`;

	// Stream the backup as a JSON document built up table-by-table, batch-by-
	// batch. Keeps serverless memory usage bounded no matter how large the
	// experiment volume grows, and lets the download start immediately.
	//
	// Participant session_token / experiment config.created_by etc. are still
	// intentionally omitted where applicable — the column lists below match
	// the previous non-streaming implementation.
	const stream = new ReadableStream({
		async start(controller) {
			try {
				const write = (s: string) => controller.enqueue(encoder.encode(s));

				write(`{"exportedAt":${JSON.stringify(new Date().toISOString())},"tables":{`);

				const tables: Array<[string, string, string]> = [
					['experiments', 'experiments', '*'],
					[
						'participants',
						'participants',
						'id, experiment_id, email, registration_data, registered_at, last_active_at, last_rotated_at, chunk_assignments'
					],
					['responses', 'responses', '*']
				];

				for (let t = 0; t < tables.length; t++) {
					const [name, table, select] = tables[t];
					write(`${t === 0 ? '' : ','}${JSON.stringify(name)}:[`);
					let first = true;
					for await (const batch of paginate(supabase, table, select)) {
						for (const row of batch) {
							write(`${first ? '' : ','}${JSON.stringify(row)}`);
							first = false;
						}
					}
					write(']');
				}

				write('}}');
				controller.close();
			} catch (err) {
				console.error('Backup streaming failed:', err);
				controller.error(err);
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};

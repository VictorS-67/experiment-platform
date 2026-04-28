import { getServerSupabase } from './supabase';

export interface AuditEntry {
	adminUserId: string | null;
	adminEmail?: string | null;
	experimentId?: string | null;
	action: string;
	resourceType?: string;
	resourceId?: string;
	metadata?: Record<string, unknown>;
	ip?: string | null;
}

/**
 * Append a record to admin_audit_log (migration 017). Best-effort: failures
 * are logged but do not prevent the underlying admin action from succeeding —
 * losing a single audit row is preferable to taking down a working route.
 */
export async function logAdminAction(entry: AuditEntry): Promise<void> {
	try {
		const supabase = getServerSupabase();
		const { error } = await supabase.from('admin_audit_log').insert({
			admin_user_id: entry.adminUserId,
			admin_email: entry.adminEmail ?? null,
			experiment_id: entry.experimentId ?? null,
			action: entry.action,
			resource_type: entry.resourceType ?? null,
			resource_id: entry.resourceId ?? null,
			metadata: entry.metadata ?? null,
			ip: entry.ip ?? null
		});
		if (error) console.error('Audit log write failed:', error.message);
	} catch (err) {
		console.error('Audit log write threw:', err);
	}
}

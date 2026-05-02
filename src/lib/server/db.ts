// Accepts any error shape (PostgrestError, StorageError, AuthError, ...) — the
// helper only needs to log it and throw a generic. Specific error-code branching
// must stay inline at the callsite.
type AnyError = { message?: string; code?: string } | Error;

type SupabaseResult<T> = { data: T | null; error: AnyError | null };

/**
 * Throw a generic `Error(context)` if the Supabase call returned an error or
 * null data. Centralizes the `if (error) { console.error; throw }` boilerplate
 * for the canonical "this query must succeed and must return data" case.
 *
 * Use only when:
 *   - The caller does NOT need to branch on error.code. Specific codes like
 *     '23505' (unique violation) or 'P0004' (optimistic-lock raise) must be
 *     handled inline so they can map to user-facing messages or HTTP 409.
 *   - Failure should bubble up as a 500. Best-effort callers (audit log,
 *     rate limit) deliberately swallow errors and must NOT use unwrap.
 *   - Null data is a true error, not a "missing record is OK" signal.
 *     For the latter (e.g. `findParticipantByEmail`), keep `if (error || !data) return null`.
 */
export function unwrap<T>(result: SupabaseResult<T>, context: string): NonNullable<T> {
	if (result.error) {
		console.error(`${context}:`, result.error);
		throw new Error(context);
	}
	if (result.data === null) {
		throw new Error(`${context}: no data`);
	}
	return result.data as NonNullable<T>;
}

/**
 * Same throw-on-error semantics for void operations (insert/update/delete
 * where Supabase returns `{ error }` with no data).
 */
export function unwrapVoid(result: { error: AnyError | null }, context: string): void {
	if (result.error) {
		console.error(`${context}:`, result.error);
		throw new Error(context);
	}
}

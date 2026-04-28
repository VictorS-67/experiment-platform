import { getServerSupabase } from './supabase';

export interface ErrorContext {
	url?: string;
	method?: string;
	status?: number;
	userId?: string | null;
	participantId?: string | null;
	metadata?: Record<string, unknown>;
}

/**
 * Report a server-side error.
 *
 * Default backend writes to the `error_log` table (migration 019). To switch
 * to Sentry (or any other service), set process.env.SENTRY_DSN and replace
 * the body of `sendToExternalReporter` with the SDK call. The shape of this
 * function deliberately mirrors what Sentry expects so the swap is local.
 *
 * Always best-effort — never throws. We never want error reporting itself to
 * cascade into another error and obscure the original problem.
 */
export async function reportError(err: unknown, ctx: ErrorContext = {}): Promise<void> {
	const message = err instanceof Error ? err.message : String(err);
	const stack = err instanceof Error ? err.stack ?? null : null;

	// Always log locally so devs see it in the terminal / Vercel logs.
	console.error(`[reportError] ${ctx.method ?? ''} ${ctx.url ?? ''} → ${message}`);
	if (stack) console.error(stack);

	if (process.env.SENTRY_DSN) {
		await sendToExternalReporter(message, stack, ctx).catch((reportingErr) => {
			console.error('External error reporter failed:', reportingErr);
		});
		return;
	}

	try {
		const supabase = getServerSupabase();
		await supabase.from('error_log').insert({
			message,
			stack,
			url: ctx.url ?? null,
			method: ctx.method ?? null,
			status: ctx.status ?? null,
			user_id: ctx.userId ?? null,
			participant_id: ctx.participantId ?? null,
			metadata: ctx.metadata ?? null
		});
	} catch (writeErr) {
		console.error('error_log write failed:', writeErr);
	}
}

async function sendToExternalReporter(
	_message: string,
	_stack: string | null,
	_ctx: ErrorContext
): Promise<void> {
	// Placeholder: when SENTRY_DSN is set, install @sentry/node and replace
	// this with `Sentry.captureException(err, { extra: ctx })`. Kept as a
	// no-op so the abstraction exists today without forcing the dependency.
}

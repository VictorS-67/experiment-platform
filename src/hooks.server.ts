import type { Handle, HandleServerError } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { dev } from '$app/environment';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '$lib/server/supabase';
import { isRedirect, isHttpError, redirect, error } from '@sveltejs/kit';
import { COOKIE_OPTIONS } from '$lib/server/cookies';
import { checkRateLimit } from '$lib/server/rate-limit';
import { getParticipantAndMaybeRotate } from '$lib/server/data';
import { reportError } from '$lib/server/errors';

// Global error hook — runs for every unhandled exception in a route handler.
// Writes to error_log (or Sentry if configured). Returns only a safe message
// to the client so internals (stack traces, DB errors) don't leak.
export const handleError: HandleServerError = async ({ error: err, event, status, message }) => {
	await reportError(err, {
		url: event.url.pathname,
		method: event.request.method,
		status,
		userId: event.locals.adminUser?.id ?? null,
		metadata: { message }
	});
	return { message: status >= 500 ? 'Internal server error' : message };
};

const PARTICIPANT_COOKIE_OPTIONS = { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 90 }; // 90 days

// --- Rate limiting (Postgres-backed; migration 016) ---
// 60-second fixed window per (ip, endpoint). Survives serverless cold starts.

const RATE_WINDOW_SECONDS = 60;
const RATE_LIMITS: Record<string, number> = {
	'/auth': 20,    // 20 auth requests per minute per IP
	'/save': 60,    // 60 saves per minute per IP
	'/upload': 30   // 30 uploads per minute per IP
};

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const method = event.request.method;

	// --- CSRF origin check for API endpoints (POST/PUT/DELETE to +server.ts) ---
	if (method !== 'GET' && method !== 'HEAD') {
		// SvelteKit form actions already have CSRF protection.
		// We only need to protect +server.ts API endpoints.
		const isApiEndpoint = pathname.includes('/auth') ||
			pathname.includes('/save') ||
			pathname.includes('/upload') ||
			pathname.includes('/export');

		if (isApiEndpoint) {
			const origin = event.request.headers.get('origin');
			const expectedOrigin = event.url.origin;

			if (dev) {
				// In dev, allow requests with no Origin header (e.g., curl, Postman)
				if (origin && origin !== expectedOrigin) {
					error(403, 'Cross-origin request blocked');
				}
			} else {
				// In production, require Origin header to prevent CSRF
				if (!origin || origin !== expectedOrigin) {
					error(403, 'Cross-origin request blocked');
				}
			}
		}
	}

	// --- Rate limiting for sensitive endpoints ---
	if (method === 'POST') {
		const clientIp = event.getClientAddress();

		for (const [endpointPattern, limit] of Object.entries(RATE_LIMITS)) {
			if (pathname.endsWith(endpointPattern) || pathname.includes(`${endpointPattern}/`)) {
				const allowed = await checkRateLimit(clientIp, endpointPattern, RATE_WINDOW_SECONDS, limit);
				if (!allowed) {
					error(429, 'Too many requests — please wait a moment and try again');
				}
				break;
			}
		}
	}

	// Parse participant session token from cookie. For participant page loads,
	// rotate the token if it's older than 24h (migration 018) — limits the
	// exposure window if the cookie ever leaks. We only rotate on GETs to
	// avoid mid-POST cookie races; POST handlers can re-verify by reading
	// `event.locals.sessionToken` which was just refreshed.
	let sessionToken = event.cookies.get('session_token') ?? null;
	if (sessionToken && method === 'GET' && pathname.startsWith('/e/')) {
		try {
			const result = await getParticipantAndMaybeRotate(sessionToken);
			if (result === null) {
				// Token doesn't match any participant row (deleted, rotated by
				// migration 013, or just stale). Clear the cookie so the page
				// guard's redirect to /e/<slug> isn't followed by another stale
				// hit on every subsequent navigation.
				event.cookies.delete('session_token', { path: '/' });
				sessionToken = null;
			} else if (result.newToken) {
				event.cookies.set('session_token', result.newToken, PARTICIPANT_COOKIE_OPTIONS);
				sessionToken = result.newToken;
			}
		} catch (err) {
			// Failure here is non-fatal — the next request will retry rotation.
			console.warn('Session rotation skipped due to error:', err);
		}
	}
	event.locals.sessionToken = sessionToken;
	event.locals.adminUser = null;

	// Admin auth middleware
	const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
	const isLoginPage = pathname === '/admin/login';

	if (isAdminRoute && !isLoginPage) {
		const accessToken = event.cookies.get('admin_access_token');
		const refreshToken = event.cookies.get('admin_refresh_token');

		if (!accessToken || !refreshToken) {
			redirect(302, '/admin/login');
		}

		try {
			// Verify the session via server-side call
			const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
			const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

			let verifiedUserId: string;
			let verifiedEmail: string;

			if (authError || !user) {
				// Try refreshing the token
				const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
					refresh_token: refreshToken
				});

				if (refreshError || !refreshData.session) {
					event.cookies.delete('admin_access_token', { path: '/' });
					event.cookies.delete('admin_refresh_token', { path: '/' });
					redirect(302, '/admin/login');
				}

				const { session } = refreshData;
				event.cookies.set('admin_access_token', session.access_token, {
					...COOKIE_OPTIONS,
					maxAge: 60 * 60 // 1 hour (matches JWT lifetime)
				});
				// Supabase rotates the refresh token on every successful refresh
				// (refresh_token_reuse_detection is on by default), so we set the
				// freshly-issued one. Shortened from 30d → 14d per audit.
				event.cookies.set('admin_refresh_token', session.refresh_token ?? refreshToken, {
					...COOKIE_OPTIONS,
					maxAge: 60 * 60 * 24 * 14
				});

				verifiedUserId = session.user.id;
				verifiedEmail = session.user.email ?? '';
			} else {
				verifiedUserId = user.id;
				verifiedEmail = user.email ?? '';
			}

			// Check admin_users table
			const serverSupabase = getServerSupabase();
			const { data: adminRow } = await serverSupabase
				.from('admin_users')
				.select('role')
				.eq('user_id', verifiedUserId)
				.maybeSingle();

			if (!adminRow) {
				event.cookies.delete('admin_access_token', { path: '/' });
				event.cookies.delete('admin_refresh_token', { path: '/' });
				redirect(302, '/admin/login');
			}

			event.locals.adminUser = {
				id: verifiedUserId,
				email: verifiedEmail,
				role: adminRow.role
			};
		} catch (err) {
			if (isRedirect(err) || isHttpError(err)) throw err;
			// Auth failed unexpectedly — redirect to login
			redirect(302, '/admin/login');
		}
	}

	const response = await resolve(event);

	// Security headers (CSP is configured in svelte.config.js under kit.csp
	// so SvelteKit can generate per-response nonces/hashes for every <script>
	// and <style> tag it emits — that's why `unsafe-inline` is no longer in
	// script-src or style-src-elem).
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
	// HSTS — only meaningful over HTTPS so we skip in dev (where vite serves
	// over http://localhost). 1 year, includeSubDomains, preload-eligible.
	if (!dev) {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains; preload'
		);
	}

	return response;
};

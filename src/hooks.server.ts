import type { Handle } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '$lib/server/supabase';
import { isRedirect, isHttpError, redirect, error } from '@sveltejs/kit';
import { dev } from '$app/environment';

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: !dev
};

// --- Rate limiting (in-memory sliding window) ---

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMITS: Record<string, number> = {
	'/auth': 20,    // 20 auth requests per minute per IP
	'/save': 60,    // 60 saves per minute per IP
	'/upload': 30   // 30 uploads per minute per IP
};

const requestCounts = new Map<string, { timestamps: number[] }>();

// Clean up stale entries every 5 minutes to prevent memory leak
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of requestCounts) {
		entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
		if (entry.timestamps.length === 0) requestCounts.delete(key);
	}
}, 5 * 60_000);

function checkRateLimit(ip: string, endpoint: string, limit: number): boolean {
	const key = `${ip}:${endpoint}`;
	const now = Date.now();
	const entry = requestCounts.get(key) ?? { timestamps: [] };

	// Remove timestamps outside the window
	entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
	if (entry.timestamps.length >= limit) return false;

	entry.timestamps.push(now);
	requestCounts.set(key, entry);
	return true;
}

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

			// In dev, also allow requests with no Origin header (e.g., curl, Postman)
			if (origin && origin !== expectedOrigin) {
				error(403, 'Cross-origin request blocked');
			}
		}
	}

	// --- Rate limiting for sensitive endpoints ---
	if (method === 'POST') {
		const clientIp = event.getClientAddress();

		for (const [endpointPattern, limit] of Object.entries(RATE_LIMITS)) {
			if (pathname.endsWith(endpointPattern) || pathname.includes(`${endpointPattern}/`)) {
				if (!checkRateLimit(clientIp, endpointPattern, limit)) {
					error(429, 'Too many requests — please wait a moment and try again');
				}
				break;
			}
		}
	}

	// Parse participant session token from cookie
	const sessionToken = event.cookies.get('session_token') ?? null;
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
				event.cookies.set('admin_refresh_token', session.refresh_token ?? refreshToken, {
					...COOKIE_OPTIONS,
					maxAge: 60 * 60 * 24 * 30
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
				.single();

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

	// Security headers
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
	response.headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline'",
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
			"font-src 'self' https://fonts.gstatic.com",
			`img-src 'self' data: blob: ${PUBLIC_SUPABASE_URL}`,
			`media-src 'self' blob: ${PUBLIC_SUPABASE_URL}`,
			`connect-src 'self' ${PUBLIC_SUPABASE_URL}`,
			"frame-ancestors 'none'"
		].join('; ')
	);

	return response;
};

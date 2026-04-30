import adapter from '@sveltejs/adapter-vercel';
import { loadEnv } from 'vite';

// svelte.config.js is evaluated before Vite processes mode-specific env files,
// so process.env won't contain .env.local-db overrides when --mode local-db is
// used. loadEnv reads the same files Vite would, giving us the correct URL for
// whitelisting in the CSP regardless of which Supabase instance is active.
const modeArgIdx = process.argv.indexOf('--mode');
const mode = modeArgIdx >= 0 ? process.argv[modeArgIdx + 1] : 'development';
const env = loadEnv(mode, process.cwd(), '');
const supabaseUrl = env.PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '';

// In non-production builds always whitelist the default local Supabase port so
// that `npm run dev:local` (which generates signed URLs from 127.0.0.1:54321)
// isn't blocked by CSP even if loadEnv doesn't pick up .env.local-db.
const localOrigins = mode !== 'production' ? ['http://127.0.0.1:54321'] : [];

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),

		// Content Security Policy.
		//
		// `mode: 'auto'` uses nonces in dev (so hot reload works) and SHA
		// hashes in prod (so we don't add cache-busting nonces to every
		// response). SvelteKit emits nonces/hashes for every <script> and
		// <style> tag it generates itself.
		//
		// `style-src-attr 'unsafe-inline'` is scoped narrowly to dynamic
		// inline style attributes (e.g. progress bar widths, animation
		// transforms) that can't be expressed as hashed stylesheets. This is
		// safer than the old `style-src 'unsafe-inline'` which also allowed
		// arbitrary inline <style> blocks.
		//
		// supabaseUrl is whitelisted so media and XHR can reach the project's
		// storage + REST endpoints. loadEnv above ensures the correct URL is
		// used for whichever mode (online vs local-db) the server started with.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'https://fonts.googleapis.com'],
				'style-src-attr': ['unsafe-inline'],
				'font-src': ['self', 'https://fonts.gstatic.com'],
				'img-src': ['self', 'data:', 'blob:', supabaseUrl, ...localOrigins],
				'media-src': ['self', 'blob:', supabaseUrl, ...localOrigins],
				'connect-src': ['self', supabaseUrl, ...localOrigins],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;

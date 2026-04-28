import adapter from '@sveltejs/adapter-vercel';

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
		// PUBLIC_SUPABASE_URL is whitelisted at build time via the env var so
		// media and XHR can reach the project's storage + REST endpoints.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'https://fonts.googleapis.com'],
				'style-src-attr': ['unsafe-inline'],
				'font-src': ['self', 'https://fonts.gstatic.com'],
				'img-src': ['self', 'data:', 'blob:', process.env.PUBLIC_SUPABASE_URL ?? ''],
				'media-src': ['self', 'blob:', process.env.PUBLIC_SUPABASE_URL ?? ''],
				'connect-src': ['self', process.env.PUBLIC_SUPABASE_URL ?? ''],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;

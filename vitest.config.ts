import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
		// Playwright's E2E specs live under tests/e2e — they have a different
		// runner and must never be picked up by Vitest.
		exclude: ['node_modules/**', 'tests/e2e/**']
	}
});

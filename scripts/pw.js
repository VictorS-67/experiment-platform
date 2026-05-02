#!/usr/bin/env node
// Drop-in wrapper around `playwright test` that adds a real `--slowmo=N` (or
// `--slowmo N`) CLI flag. Playwright doesn't expose slowMo at the CLI today;
// it's only a config-level launchOption. This wrapper extracts the flag from
// argv, sets PW_SLOWMO in the environment, and forwards the remaining args
// to `npx playwright test`. playwright.config.ts reads PW_SLOWMO via
// use.launchOptions.slowMo so the value reaches the browser.
//
// Usage:
//   npm run pw -- --headed --slowmo=200 tests/e2e/participant/
//   node scripts/pw.js --headed --slowmo 200 tests/e2e/participant/
//
// Behaves identically to `playwright test` for any flag it doesn't intercept.

import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const forwarded = [];
let slowMo = 0;

for (let i = 0; i < args.length; i++) {
	const a = args[i];
	if (a.startsWith('--slowmo=')) {
		slowMo = Number(a.slice('--slowmo='.length));
	} else if (a === '--slowmo') {
		slowMo = Number(args[++i]);
	} else {
		forwarded.push(a);
	}
}

if (slowMo && (!Number.isFinite(slowMo) || slowMo < 0)) {
	console.error(`--slowmo: expected a non-negative number, got "${slowMo}"`);
	process.exit(2);
}

const env = { ...process.env };
if (slowMo > 0) env.PW_SLOWMO = String(slowMo);

const child = spawn('npx', ['playwright', 'test', ...forwarded], {
	stdio: 'inherit',
	env
});
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
	console.error('Failed to spawn playwright:', err);
	process.exit(2);
});

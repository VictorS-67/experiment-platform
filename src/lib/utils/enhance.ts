import type { SubmitFunction } from '@sveltejs/kit';

/**
 * Tiny `use:enhance` callback that just preserves field values after submit
 * (`reset: false` per CLAUDE.md's gotcha about SvelteKit's default form reset).
 * Use when there's no loading flag or post-update cleanup to manage.
 */
export const preserveFields: SubmitFunction = () => async ({ update }) => {
	await update({ reset: false });
};

/**
 * `use:enhance` callback that toggles a loading flag for the duration of the
 * submission, applies the result with `reset: false`, and runs an optional
 * after-update callback for additional cleanup (e.g. closing a confirm modal,
 * clearing a magic-phrase input). Mirrors the boilerplate that was inline-
 * duplicated across ~10 admin pages and CollaboratorsPanel.
 */
export function withLoadingFlag(
	setLoading: (loading: boolean) => void,
	after?: () => void | Promise<void>
): SubmitFunction {
	return () => {
		setLoading(true);
		return async ({ update }) => {
			await update({ reset: false });
			setLoading(false);
			if (after) await after();
		};
	};
}

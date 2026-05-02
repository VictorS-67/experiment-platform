/**
 * Display helpers shared across admin pages. Pure rendering — no reactivity,
 * no i18n state. Centralizes the EN-first fallback policy and the experiment-
 * status badge palette that were previously redefined per page.
 */

type LocalizedString = Record<string, string> | undefined | null;

/** Resolve a localized title with EN-first fallback to JA, then any other
 *  locale, then a literal placeholder. Used for experiment titles in lists,
 *  headers, and document <title>. */
export function localizedTitle(title: LocalizedString, fallback: string = 'Untitled'): string {
	return title?.en || title?.ja || Object.values(title ?? {})[0] || fallback;
}

/** Same fallback policy as `localizedTitle` but with no literal placeholder
 *  — returns '' when nothing is available. Use for inline labels where an
 *  empty string is preferable to a hardcoded "Untitled". */
export function localized(obj: LocalizedString): string {
	return obj?.en || obj?.ja || Object.values(obj ?? {})[0] || '';
}

/** Pull `metadata.title` out of a stored experiment config and resolve it. */
export function configTitle(config: Record<string, unknown> | undefined | null): string {
	const meta = config?.metadata as Record<string, unknown> | undefined;
	return localizedTitle(meta?.title as LocalizedString);
}

/** Display name for a participant. Pulls `name` from registration_data,
 *  falls back to em-dash. */
export function participantName(registrationData: Record<string, unknown> | null | undefined): string {
	if (!registrationData) return '—';
	return (registrationData.name as string) || '—';
}

/** Tailwind class map for the experiment status badge. Exhaustive over the
 *  4 known statuses — adding a new status without updating this map is a
 *  compile-time error rather than a silent fallback to gray. */
export type ExperimentStatus = 'draft' | 'active' | 'paused' | 'archived';

export const STATUS_COLORS: Record<ExperimentStatus, string> = {
	draft: 'bg-gray-100 text-gray-700',
	active: 'bg-green-100 text-green-700',
	paused: 'bg-yellow-100 text-yellow-700',
	archived: 'bg-red-100 text-red-700'
};

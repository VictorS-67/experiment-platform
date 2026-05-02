/**
 * Date formatting helpers used by the admin UI. Locale defaults to 'en-US'
 * (matches the inline behavior these replaced); pass an explicit locale if a
 * future i18n-of-dates feature wants the participant's selected language.
 *
 * Kept separate from $lib/i18n so utils don't depend on i18n state.
 */

const DEFAULT_LOCALE = 'en-US';

/** Date only: "Mar 5, 2026". Used in tabular listings. */
export function formatDate(date: string | Date, locale: string = DEFAULT_LOCALE): string {
	return new Date(date).toLocaleDateString(locale, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/** Date + time: "Mar 5, 2026, 04:32 PM". Used for record timestamps. */
export function formatDateTime(date: string | Date, locale: string = DEFAULT_LOCALE): string {
	return new Date(date).toLocaleString(locale, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

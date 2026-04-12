import type { LocalizedStringType } from '$lib/config/schema';
import enTranslations from './platform/en.json';

const translationCache = new Map<string, Record<string, unknown>>();
// Pre-populate English so setLanguage('en') is always synchronous
translationCache.set('en', enTranslations);

async function loadPlatformTranslations(lang: string): Promise<Record<string, unknown>> {
	if (translationCache.has(lang)) return translationCache.get(lang)!;
	try {
		const module = await import(`./platform/${lang}.json`);
		const translations = module.default;
		translationCache.set(lang, translations);
		return translations;
	} catch {
		// Fallback to English if the requested language file doesn't exist
		if (lang !== 'en') return loadPlatformTranslations('en');
		return {};
	}
}

class I18nStore {
	language = $state('en');
	translations = $state<Record<string, unknown>>(enTranslations);

	async setLanguage(lang: string): Promise<void> {
		this.language = lang;
		// Use cached value synchronously if available (avoids flash of untranslated keys)
		if (translationCache.has(lang)) {
			this.translations = translationCache.get(lang)!;
			return;
		}
		this.translations = await loadPlatformTranslations(lang);
	}

	/**
	 * Get a platform translation by dot-notation key.
	 * Supports template interpolation: platform('validation.min_length', { min: 3 })
	 */
	platform(key: string, params?: Record<string, string | number>): string {
		const parts = key.split('.');
		let current: unknown = this.translations;
		for (const part of parts) {
			if (current && typeof current === 'object' && part in current) {
				current = (current as Record<string, unknown>)[part];
			} else {
				return key;
			}
		}
		let result = typeof current === 'string' ? current : key;
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				result = result.replaceAll(`{${k}}`, String(v));
			}
		}
		return result;
	}

	/**
	 * Get text from a localized string object (from experiment config).
	 * Reactively depends on this.language ($state).
	 */
	localized(localized: LocalizedStringType | undefined, fallback = ''): string {
		if (!localized) return fallback;
		return localized[this.language] ?? localized['en'] ?? fallback;
	}
}

export const i18n = new I18nStore();

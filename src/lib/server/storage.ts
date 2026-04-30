import { getServerSupabase } from './supabase';
import type { StimuliConfigType } from '$lib/config/schema';

const BUCKET = 'experiments';

export async function signStimuliUrls(
	stimuliConfig: StimuliConfigType,
	ttl = 7200
): Promise<Record<string, string>> {
	if (stimuliConfig.source !== 'supabase-storage' || !stimuliConfig.storagePath) return {};

	// storagePath includes bucket prefix e.g. "experiments/stimuli/foo/" — strip it for the API
	const pathPrefix = stimuliConfig.storagePath.replace(/^experiments\//, '');
	const itemsToSign = stimuliConfig.items.filter((item) => item.filename && !item.url);
	if (itemsToSign.length === 0) return {};

	const paths = itemsToSign.map((item) => `${pathPrefix}${item.filename}`);

	const supabase = getServerSupabase();
	const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, ttl);
	if (error || !data) {
		console.error('signStimuliUrls: failed to sign URLs', error);
		return {};
	}

	const result: Record<string, string> = {};
	for (const item of itemsToSign) {
		const entry = data.find((d) => d.path === `${pathPrefix}${item.filename}`);
		if (entry?.signedUrl) result[item.id] = entry.signedUrl;
	}
	return result;
}

export async function signAudioUrls(
	paths: string[],
	ttl = 7200
): Promise<Record<string, string>> {
	const unique = [...new Set(paths)];
	if (unique.length === 0) return {};

	const supabase = getServerSupabase();
	const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, ttl);
	if (error || !data) {
		console.error('signAudioUrls: failed to sign URLs', error);
		return {};
	}

	const result: Record<string, string> = {};
	for (const entry of data) {
		if (entry.signedUrl && entry.path) result[entry.path] = entry.signedUrl;
	}
	return result;
}

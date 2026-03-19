import { getServerSupabase } from './supabase';
import type { ParticipantRecord, ResponseRecord } from '$lib/services/data';

// --- Participants ---

export async function findParticipantByEmail(
	experimentId: string,
	email: string
): Promise<(ParticipantRecord & { session_token: string }) | null> {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('participants')
		.select('*')
		.eq('experiment_id', experimentId)
		.eq('email', email.toLowerCase().trim())
		.maybeSingle();

	if (error || !data) return null;
	return data as ParticipantRecord & { session_token: string };
}

export async function getParticipantByToken(
	sessionToken: string
): Promise<(ParticipantRecord & { session_token: string }) | null> {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('participants')
		.select('*')
		.eq('session_token', sessionToken)
		.maybeSingle();

	if (error || !data) return null;
	return data as ParticipantRecord & { session_token: string };
}

export async function createParticipant(
	experimentId: string,
	email: string,
	registrationData: Record<string, unknown>
): Promise<ParticipantRecord & { session_token: string }> {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('participants')
		.insert({
			experiment_id: experimentId,
			email: email.toLowerCase().trim(),
			registration_data: registrationData
		})
		.select('*')
		.single();

	if (error) throw new Error(`Failed to register: ${error.message}`);
	return data as ParticipantRecord & { session_token: string };
}

// --- Responses ---

export async function loadResponses(
	experimentId: string,
	participantId: string,
	phaseId?: string
): Promise<ResponseRecord[]> {
	const supabase = getServerSupabase();
	let query = supabase
		.from('responses')
		.select('*')
		.eq('experiment_id', experimentId)
		.eq('participant_id', participantId)
		.order('created_at', { ascending: true });

	if (phaseId) {
		query = query.eq('phase_id', phaseId);
	}

	const { data, error } = await query;
	if (error) throw new Error(`Failed to load responses: ${error.message}`);
	return (data ?? []) as ResponseRecord[];
}

export async function saveResponse(
	experimentId: string,
	participantId: string,
	phaseId: string,
	stimulusId: string,
	responseData: Record<string, unknown>,
	responseIndex: number = 0
): Promise<ResponseRecord> {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('responses')
		.insert({
			experiment_id: experimentId,
			participant_id: participantId,
			phase_id: phaseId,
			stimulus_id: stimulusId,
			response_data: responseData,
			response_index: responseIndex
		})
		.select()
		.single();

	if (error) throw new Error(`Failed to save response: ${error.message}`);
	return data as ResponseRecord;
}

// --- File Uploads ---

const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function uploadFile(
	bucket: string,
	path: string,
	file: Blob,
	contentType: string,
	experimentId: string
): Promise<string> {
	// Validate content type
	if (!ALLOWED_AUDIO_TYPES.includes(contentType)) {
		throw new Error(`Disallowed file type: ${contentType}`);
	}

	// Validate file size
	if (file.size > MAX_FILE_SIZE) {
		throw new Error(`File too large: ${file.size} bytes (max ${MAX_FILE_SIZE})`);
	}

	// Validate path doesn't escape expected directory
	const normalizedPath = path.replace(/\.\./g, '').replace(/\/\//g, '/');
	if (!normalizedPath.startsWith(`audio/${experimentId}/`)) {
		throw new Error('Invalid upload path');
	}

	const supabase = getServerSupabase();
	const { error } = await supabase.storage
		.from(bucket)
		.upload(normalizedPath, file, { contentType, upsert: false });

	if (error) throw new Error(`Failed to upload file: ${error.message}`);
	return normalizedPath;
}

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

export async function rotateSessionToken(
	participantId: string
): Promise<string> {
	const supabase = getServerSupabase();
	const newToken = crypto.randomUUID();
	const { error } = await supabase
		.from('participants')
		.update({ session_token: newToken })
		.eq('id', participantId);

	if (error) { console.error('Failed to rotate session token:', error); throw new Error('Failed to rotate session token'); }
	return newToken;
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

	if (error) { console.error('Failed to register participant:', error); throw new Error('Failed to register'); }
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
	if (error) { console.error('Failed to load responses:', error); throw new Error('Failed to load responses'); }
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

	if (error) { console.error('Failed to save response:', error); throw new Error('Failed to save response'); }
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
	// Validate content type (strip codec parameters like ";codecs=opus")
	const baseType = contentType.split(';')[0].trim();
	if (!ALLOWED_AUDIO_TYPES.includes(baseType)) {
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

	if (error) { console.error('Failed to upload file:', error); throw new Error('Failed to upload file'); }
	return normalizedPath;
}

// --- Chunk Assignments ---

export async function getChunkAssignment(
	participantId: string,
	chunkSlug: string
): Promise<{ blockOrder: string[] } | null> {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('participants')
		.select('chunk_assignments')
		.eq('id', participantId)
		.single();

	if (error || !data) return null;
	const assignments = (data.chunk_assignments ?? {}) as Record<string, { blockOrder: string[] }>;
	return assignments[chunkSlug] ?? null;
}

export async function saveChunkAssignment(
	participantId: string,
	chunkSlug: string,
	blockOrder: string[]
): Promise<void> {
	const supabase = getServerSupabase();
	const assignment = { blockOrder, assignedAt: new Date().toISOString() };

	const { error } = await supabase.rpc('set_chunk_assignment', {
		p_id: participantId,
		chunk_key: chunkSlug,
		assignment
	});

	if (error) { console.error('Failed to save chunk assignment:', error); throw new Error('Failed to save chunk assignment'); }
}

export async function getParticipantIndex(
	experimentId: string,
	participantId: string
): Promise<number> {
	const supabase = getServerSupabase();
	const { count, error } = await supabase
		.from('participants')
		.select('id', { count: 'exact', head: true })
		.eq('experiment_id', experimentId)
		.lt('id', participantId);

	if (error) { console.error('Failed to get participant index:', error); return 0; }
	return count ?? 0;
}

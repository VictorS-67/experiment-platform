import { getServerSupabase } from './supabase';
import { unwrap, unwrapVoid } from './db';
import { detectAudioType } from '$lib/utils/audio-detect';
import type { ParticipantRecord, ResponseRecord } from '$lib/services/data';

// Explicit column list used on every participant read — keeps bandwidth
// predictable (registration_data can be large), and prevents a future
// schema addition from accidentally leaking a new column through.
const PARTICIPANT_COLUMNS =
	'id, experiment_id, email, registration_data, registered_at, session_token, last_rotated_at, chunk_assignments';

// Same rationale for responses — explicit list matches the ResponseRecord
// shape and makes the query cost inspectable without peeking at the schema.
const RESPONSE_COLUMNS =
	'id, experiment_id, participant_id, phase_id, stimulus_id, response_data, response_index, created_at, updated_at';

// --- Participants ---

export async function findParticipantByEmail(
	experimentId: string,
	email: string
): Promise<(ParticipantRecord & { session_token: string }) | null> {
	const supabase = getServerSupabase();
	const { data, error } = await supabase
		.from('participants')
		.select(PARTICIPANT_COLUMNS)
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
		.select(PARTICIPANT_COLUMNS)
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
	unwrapVoid(
		await supabase
			.from('participants')
			.update({ session_token: newToken, last_rotated_at: new Date().toISOString() })
			.eq('id', participantId),
		'Failed to rotate session token'
	);
	return newToken;
}

export const SESSION_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Look up the participant for a session token and rotate the token if it's
 * older than SESSION_ROTATION_INTERVAL_MS. Returns:
 *   - { participant, newToken: string }  if rotation happened (caller must reset the cookie)
 *   - { participant, newToken: null }    if the token is still fresh
 *   - null                                if the token is unknown/invalid
 */
export async function getParticipantAndMaybeRotate(
	sessionToken: string
): Promise<{ participant: ParticipantRecord & { session_token: string }; newToken: string | null } | null> {
	const participant = await getParticipantByToken(sessionToken);
	if (!participant) return null;

	const lastRotated = (participant as ParticipantRecord & { last_rotated_at?: string }).last_rotated_at;
	const lastRotatedMs = lastRotated ? new Date(lastRotated).getTime() : 0;
	if (Date.now() - lastRotatedMs < SESSION_ROTATION_INTERVAL_MS) {
		return { participant, newToken: null };
	}

	const newToken = await rotateSessionToken(participant.id);
	return { participant: { ...participant, session_token: newToken }, newToken };
}

export async function createParticipant(
	experimentId: string,
	email: string,
	registrationData: Record<string, unknown>
): Promise<ParticipantRecord & { session_token: string }> {
	const supabase = getServerSupabase();
	const data = unwrap(
		await supabase
			.from('participants')
			.insert({
				experiment_id: experimentId,
				email: email.toLowerCase().trim(),
				registration_data: registrationData
			})
			.select(PARTICIPANT_COLUMNS)
			.single(),
		'Failed to register'
	);
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
		.select(RESPONSE_COLUMNS)
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
	const data = unwrap(
		await supabase
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
			.single(),
		'Failed to save response'
	);
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

	// Defense-in-depth: verify the file's magic bytes match the declared
	// content type. Without this, a client could upload arbitrary bytes
	// (e.g. a script payload) with a spoofed `Content-Type: audio/webm`.
	const header = await file.slice(0, 8).arrayBuffer();
	const detectedType = detectAudioType(header);
	if (detectedType !== baseType) {
		throw new Error(`File contents do not match declared type ${baseType}`);
	}

	// Validate path using a segment-level whitelist instead of substring
	// replacement. Rejects anything that isn't strictly
	// `audio/{experimentId}/<filename-segments>` where each segment only
	// contains [a-zA-Z0-9._-]. Far harder to bypass than the previous
	// `.replace('..', '')` approach, which didn't catch sequences like
	// `....////` that collapse to `../` after a single pass.
	const segments = path.split('/');
	const segmentRe = /^[A-Za-z0-9._-]+$/;
	const validPrefix =
		segments.length >= 3 &&
		segments[0] === 'audio' &&
		segments[1] === experimentId &&
		segments.slice(2).every((s) => s !== '' && segmentRe.test(s) && s !== '.' && s !== '..');
	if (!validPrefix) {
		throw new Error('Invalid upload path');
	}
	const normalizedPath = segments.join('/');

	const supabase = getServerSupabase();
	unwrapVoid(
		await supabase.storage.from(bucket).upload(normalizedPath, file, { contentType, upsert: false }),
		'Failed to upload file'
	);
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
	unwrapVoid(
		await supabase.rpc('set_chunk_assignment', {
			p_id: participantId,
			chunk_key: chunkSlug,
			assignment
		}),
		'Failed to save chunk assignment'
	);
}

export async function getParticipantIndex(
	experimentId: string,
	participantId: string
): Promise<number> {
	// Rank by registration order so latin-square / round-robin schemes
	// distribute strictly across registration order. The previous
	// implementation used `.lt('id', participantId)` which ranks by
	// lexicographic UUID comparison — uniformly random, not round-robin.
	const supabase = getServerSupabase();

	const { data: self, error: selfErr } = await supabase
		.from('participants')
		.select('registered_at')
		.eq('id', participantId)
		.single();
	if (selfErr || !self?.registered_at) {
		console.error('Failed to get participant registered_at:', selfErr);
		return 0;
	}

	const { count: beforeCount, error: beforeErr } = await supabase
		.from('participants')
		.select('id', { count: 'exact', head: true })
		.eq('experiment_id', experimentId)
		.lt('registered_at', self.registered_at);
	if (beforeErr) {
		console.error('Failed to count earlier participants:', beforeErr);
		return 0;
	}

	// Tie-break by id for participants sharing a registered_at (bulk inserts
	// inside one transaction all get the same now() timestamp). Keeps ranks
	// distinct so two participants never land on the same latin-square row.
	const { count: tieCount, error: tieErr } = await supabase
		.from('participants')
		.select('id', { count: 'exact', head: true })
		.eq('experiment_id', experimentId)
		.eq('registered_at', self.registered_at)
		.lt('id', participantId);
	if (tieErr) {
		console.error('Failed to count tie-bucket participants:', tieErr);
		return 0;
	}

	return (beforeCount ?? 0) + (tieCount ?? 0);
}

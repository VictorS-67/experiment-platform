/**
 * Detects audio file type by checking magic bytes (file signatures).
 * Returns the detected MIME type or null if not recognized as audio.
 */
export function detectAudioType(buffer: ArrayBuffer): string | null {
	const bytes = new Uint8Array(buffer);
	if (bytes.length < 4) return null;

	// OGG: starts with 'OggS' (0x4F 0x67 0x67 0x53)
	if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
		return 'audio/ogg';
	}

	// WebM/Matroska: starts with 0x1A 0x45 0xDF 0xA3
	if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
		return 'audio/webm';
	}

	// MP4/M4A: 'ftyp' at offset 4
	if (bytes.length >= 8 &&
		bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
		return 'audio/mp4';
	}

	// MP3: ID3 tag (0x49 0x44 0x33) or MPEG sync (0xFF 0xFB/0xF3/0xF2)
	if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
		return 'audio/mpeg';
	}
	if (bytes[0] === 0xFF && (bytes[1] === 0xFB || bytes[1] === 0xF3 || bytes[1] === 0xF2)) {
		return 'audio/mpeg';
	}

	return null;
}

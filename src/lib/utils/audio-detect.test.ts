import { describe, it, expect } from 'vitest';
import { detectAudioType } from './audio-detect';

function makeBuffer(...bytes: number[]): ArrayBuffer {
	return new Uint8Array(bytes).buffer;
}

describe('detectAudioType', () => {
	it('identifies OGG magic bytes', () => {
		// OggS
		expect(detectAudioType(makeBuffer(0x4F, 0x67, 0x67, 0x53, 0x00, 0x00))).toBe('audio/ogg');
	});

	it('identifies WebM/Matroska magic bytes', () => {
		expect(detectAudioType(makeBuffer(0x1A, 0x45, 0xDF, 0xA3, 0x00, 0x00))).toBe('audio/webm');
	});

	it('identifies MP4 ftyp magic bytes', () => {
		// ftyp at offset 4
		expect(detectAudioType(makeBuffer(0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D))).toBe('audio/mp4');
	});

	it('identifies MP3 with ID3 tag', () => {
		expect(detectAudioType(makeBuffer(0x49, 0x44, 0x33, 0x04, 0x00))).toBe('audio/mpeg');
	});

	it('identifies MP3 with sync bytes', () => {
		expect(detectAudioType(makeBuffer(0xFF, 0xFB, 0x90, 0x00))).toBe('audio/mpeg');
	});

	it('rejects PNG disguised as audio', () => {
		// PNG magic: 89 50 4E 47
		expect(detectAudioType(makeBuffer(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))).toBe(null);
	});

	it('rejects empty buffer', () => {
		expect(detectAudioType(makeBuffer())).toBe(null);
	});

	it('rejects too-short buffer', () => {
		expect(detectAudioType(makeBuffer(0x00, 0x00))).toBe(null);
	});

	it('rejects plain text', () => {
		// ASCII 'hello'
		expect(detectAudioType(makeBuffer(0x68, 0x65, 0x6C, 0x6C, 0x6F))).toBe(null);
	});
});

<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';

	let {
		widgetId,
		value = $bindable(''),
		maxDurationSeconds = 120,
		onAudioReady
	}: {
		widgetId: string;
		value: string;
		maxDurationSeconds?: number;
		onAudioReady?: (widgetId: string, blob: Blob | null) => void;
	} = $props();

	type RecordingState = 'idle' | 'recording' | 'recorded' | 'error';

	let recordingState = $state<RecordingState>('idle');
	let audioBlob = $state<Blob | null>(null);
	let audioUrl = $state<string | null>(null);
	let durationMs = $state(0);
	let errorMessage = $state('');

	let mediaRecorder: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let chunks: BlobPart[] = [];
	let startTime = 0;
	let timerInterval: ReturnType<typeof setInterval> | null = null;
	let maxDurationTimeout: ReturnType<typeof setTimeout> | null = null;

	let durationDisplay = $derived.by(() => {
		const secs = Math.floor(durationMs / 1000);
		const mins = Math.floor(secs / 60);
		const s = secs % 60;
		return `${mins}:${s.toString().padStart(2, '0')}`;
	});

	async function startRecording() {
		errorMessage = '';
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes('Permission denied') || msg.includes('NotAllowedError')) {
				errorMessage = i18n.platform('audio.error_permission');
			} else {
				errorMessage = i18n.platform('audio.error_no_device');
			}
			recordingState = 'error';
			return;
		}

		chunks = [];
		const mimeType = getSupportedMimeType();
		mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

		mediaRecorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};

		mediaRecorder.onstop = () => {
			const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
			audioBlob = blob;
			if (audioUrl) URL.revokeObjectURL(audioUrl);
			audioUrl = URL.createObjectURL(blob);
			recordingState = 'recorded';
			value = 'recorded';
			onAudioReady?.(widgetId, blob);
			stopStream();
		};

		mediaRecorder.start(100);
		startTime = Date.now();
		recordingState = 'recording';
		durationMs = 0;

		timerInterval = setInterval(() => {
			durationMs = Date.now() - startTime;
		}, 250);

		if (maxDurationSeconds > 0) {
			maxDurationTimeout = setTimeout(() => {
				if (recordingState === 'recording') stopRecording();
			}, maxDurationSeconds * 1000);
		}
	}

	function stopRecording() {
		if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
		if (maxDurationTimeout) { clearTimeout(maxDurationTimeout); maxDurationTimeout = null; }
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.stop();
		}
	}

	function deleteRecording() {
		if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
		audioBlob = null;
		durationMs = 0;
		recordingState = 'idle';
		value = '';
		onAudioReady?.(widgetId, null);
	}

	function stopStream() {
		stream?.getTracks().forEach(t => t.stop());
		stream = null;
	}

	function getSupportedMimeType(): string {
		const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
		for (const type of candidates) {
			if (MediaRecorder.isTypeSupported(type)) return type;
		}
		return '';
	}

	// Cleanup on destroy
	$effect(() => {
		return () => {
			stopStream();
			if (timerInterval) clearInterval(timerInterval);
			if (maxDurationTimeout) clearTimeout(maxDurationTimeout);
			if (audioUrl) URL.revokeObjectURL(audioUrl);
		};
	});
</script>

<div class="audio-recorder">
	{#if recordingState === 'idle'}
		<button
			type="button"
			class="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors cursor-pointer text-sm"
			onclick={startRecording}
		>
			<span class="w-3 h-3 rounded-full bg-white inline-block"></span>
			{i18n.platform('audio.start_recording')}
		</button>

	{:else if recordingState === 'recording'}
		<div class="flex items-center gap-3">
			<button
				type="button"
				class="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors cursor-pointer text-sm"
				onclick={stopRecording}
			>
				<span class="w-3 h-3 bg-white inline-block"></span>
				{i18n.platform('audio.stop')}
			</button>
			<div class="flex items-center gap-2 text-sm text-red-600">
				<span class="w-2 h-2 rounded-full bg-red-600 animate-pulse inline-block"></span>
				{i18n.platform('audio.recording')} {durationDisplay}
				{#if maxDurationSeconds > 0}
					<span class="text-gray-400">/ {Math.floor(maxDurationSeconds / 60)}:{String(maxDurationSeconds % 60).padStart(2, '0')}</span>
				{/if}
			</div>
		</div>

	{:else if recordingState === 'recorded' && audioUrl}
		<div class="space-y-2">
			<audio src={audioUrl} controls class="w-full h-9"></audio>
			<div class="flex gap-2">
				<button
					type="button"
					class="text-xs text-gray-500 hover:text-red-600 underline cursor-pointer"
					onclick={deleteRecording}
				>
					{i18n.platform('audio.delete_rerecord')}
				</button>
			</div>
		</div>

	{:else if recordingState === 'error'}
		<div class="text-sm text-red-600 mb-2">{errorMessage}</div>
		<button
			type="button"
			class="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors cursor-pointer text-sm"
			onclick={startRecording}
		>
			{i18n.platform('audio.try_again')}
		</button>
	{/if}
</div>

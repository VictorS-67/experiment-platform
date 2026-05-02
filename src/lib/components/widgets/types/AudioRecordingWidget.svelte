<script lang="ts">
	import type { ResponseWidgetType } from '$lib/config/schema';
	import AudioRecorder from '../AudioRecorder.svelte';

	type Props = {
		widget: ResponseWidgetType;
		value: string;
		onAudioReady?: ((widgetId: string, blob: Blob | null) => void) | null;
	};

	let { widget, value = $bindable(''), onAudioReady = null }: Props = $props();
</script>

<AudioRecorder
	widgetId={widget.id}
	bind:value
	maxDurationSeconds={widget.config?.maxDurationSeconds ?? 120}
	onAudioReady={onAudioReady ?? undefined}
/>

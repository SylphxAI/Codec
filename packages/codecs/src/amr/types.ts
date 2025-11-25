/**
 * AMR (Adaptive Multi-Rate) audio format types
 * AMR-NB (Narrowband) and AMR-WB (Wideband) speech codec
 */

/** AMR codec variant */
export enum AmrVariant {
	/** AMR-NB (Narrowband): 8kHz, 4.75-12.2 kbps */
	NB = 'NB',
	/** AMR-WB (Wideband): 16kHz, 6.6-23.85 kbps */
	WB = 'WB',
}

/** AMR-NB frame sizes (in bytes, excluding mode byte) */
export const AMR_NB_FRAME_SIZES = [
	12, // 4.75 kbps
	13, // 5.15 kbps
	15, // 5.9 kbps
	17, // 6.7 kbps
	19, // 7.4 kbps
	20, // 7.95 kbps
	26, // 10.2 kbps
	31, // 12.2 kbps
	5, // SID (Silence Insertion Descriptor)
	0, // Reserved
	0, // Reserved
	0, // Reserved
	0, // Reserved
	0, // Reserved
	0, // No data
	0, // No data
] as const

/** AMR-WB frame sizes (in bytes, excluding mode byte) */
export const AMR_WB_FRAME_SIZES = [
	17, // 6.6 kbps
	23, // 8.85 kbps
	32, // 12.65 kbps
	36, // 14.25 kbps
	40, // 15.85 kbps
	46, // 18.25 kbps
	50, // 19.85 kbps
	58, // 23.05 kbps
	60, // 23.85 kbps
	5, // SID
	0, // Reserved
	0, // Reserved
	0, // Reserved
	0, // Reserved
	0, // Speech lost
	0, // No data
] as const

/** AMR magic numbers */
export const AMR_NB_MAGIC = '#!AMR\n'
export const AMR_WB_MAGIC = '#!AMR-WB\n'

/** AMR file header */
export interface AmrHeader {
	/** Codec variant (NB or WB) */
	variant: AmrVariant
	/** Header offset (length of magic string) */
	headerOffset: number
	/** Total file size */
	fileSize: number
}

/** AMR frame */
export interface AmrFrame {
	/** Frame type (0-15) */
	mode: number
	/** Frame data (compressed speech) */
	data: Uint8Array
}

/** AMR audio info (metadata without decoding) */
export interface AmrInfo {
	/** Codec variant */
	variant: AmrVariant
	/** Sample rate (8000 for NB, 16000 for WB) */
	sampleRate: number
	/** Number of channels (always 1 for AMR) */
	numChannels: number
	/** Duration in seconds */
	duration: number
	/** Total frame count */
	frameCount: number
	/** Average bitrate in bits per second */
	bitrate: number
}

/** Decoded AMR audio */
export interface AmrAudio {
	/** Audio info */
	info: AmrInfo
	/** Raw AMR frames (compressed) */
	frames: AmrFrame[]
}

/** AMR encode options */
export interface AmrEncodeOptions {
	/** Codec variant (default: NB) */
	variant?: AmrVariant
	/** Bitrate mode 0-7 for NB, 0-8 for WB (default: 7 for NB, 8 for WB) */
	mode?: number
}

/** AMR frame duration in milliseconds */
export const AMR_FRAME_DURATION_MS = 20
/** AMR frame sample count for NB */
export const AMR_NB_SAMPLES_PER_FRAME = 160 // 8000 Hz * 0.02s
/** AMR frame sample count for WB */
export const AMR_WB_SAMPLES_PER_FRAME = 320 // 16000 Hz * 0.02s

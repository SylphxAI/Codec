/**
 * WAV audio format types
 * RIFF WAVE container with PCM audio data
 */

/** WAV audio format codes */
export const WavFormat = {
	/** Uncompressed PCM */
	PCM: 1,
	/** IEEE floating point */
	IEEE_FLOAT: 3,
	/** A-law encoded */
	ALAW: 6,
	/** μ-law encoded */
	MULAW: 7,
	/** Extensible format */
	EXTENSIBLE: 0xfffe,
} as const

export type WavFormatCode = (typeof WavFormat)[keyof typeof WavFormat]

/** WAV file header (RIFF + fmt chunk) */
export interface WavHeader {
	/** File size (RIFF chunk size + 8) */
	fileSize: number
	/** Audio format code */
	audioFormat: WavFormatCode
	/** Number of channels (1=mono, 2=stereo) */
	numChannels: number
	/** Sample rate in Hz */
	sampleRate: number
	/** Bytes per second */
	byteRate: number
	/** Block alignment (bytes per sample frame) */
	blockAlign: number
	/** Bits per sample */
	bitsPerSample: number
	/** Data chunk offset */
	dataOffset: number
	/** Data chunk size in bytes */
	dataSize: number
}

/** WAV audio info (metadata without decoding) */
export interface WavInfo {
	/** Number of channels */
	numChannels: number
	/** Sample rate in Hz */
	sampleRate: number
	/** Bits per sample */
	bitsPerSample: number
	/** Audio format */
	format: WavFormatCode
	/** Duration in seconds */
	duration: number
	/** Total sample count per channel */
	sampleCount: number
}

/** Decoded WAV audio */
export interface WavAudio {
	/** Audio info */
	info: WavInfo
	/** Audio samples as Float32Array (normalized -1 to 1) */
	samples: Float32Array[]
}

/** WAV encode options */
export interface WavEncodeOptions {
	/** Sample rate (default: 44100) */
	sampleRate?: number
	/** Bits per sample: 8, 16, 24, or 32 (default: 16) */
	bitsPerSample?: 8 | 16 | 24 | 32
	/** Use floating point format for 32-bit (default: false) */
	floatingPoint?: boolean
}

// RIFF magic numbers
export const RIFF_MAGIC = 0x46464952 // 'RIFF'
export const WAVE_MAGIC = 0x45564157 // 'WAVE'
export const FMT_MAGIC = 0x20746d66 // 'fmt '
export const DATA_MAGIC = 0x61746164 // 'data'

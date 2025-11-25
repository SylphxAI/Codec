/**
 * DSF (DSD Stream File) types
 * 1-bit DSD audio format for high-resolution audio
 */

/**
 * DSF magic number: "DSD "
 */
export const DSF_MAGIC = 0x44534420

/**
 * Format chunk magic: "fmt "
 */
export const FMT_MAGIC = 0x666d7420

/**
 * Data chunk magic: "data"
 */
export const DATA_MAGIC = 0x64617461

/**
 * DSF format chunk
 */
export interface DsfFormatChunk {
	formatVersion: number // Always 1
	formatId: number // 0 = DSD raw
	channelType: number // 1=mono, 2=stereo, 3=3ch, 4=quad, 5=4ch, 6=5ch, 7=5.1ch
	channelNum: number // Number of channels (1-6)
	samplingFrequency: number // 2822400, 5644800, 11289600, or 22579200 Hz
	bitsPerSample: number // 1 or 8 (always 1 for DSD)
	sampleCount: number // Per channel
	blockSizePerChannel: number // Always 4096
	reserved: number
}

/**
 * DSF file info
 */
export interface DsfInfo {
	format: DsfFormatChunk
	channels: number
	sampleRate: number
	bitsPerSample: number
	totalSamples: number
	duration: number
	hasMetadata: boolean
}

/**
 * DSD channel types
 */
export const DsfChannelType = {
	MONO: 1,
	STEREO: 2,
	THREE_CHANNEL: 3,
	QUAD: 4,
	FOUR_CHANNEL: 5,
	FIVE_CHANNEL: 6,
	FIVE_ONE: 7,
} as const

/**
 * Common DSD sample rates
 */
export const DsdSampleRate = {
	DSD64: 2822400, // 64 * 44100
	DSD128: 5644800, // 128 * 44100
	DSD256: 11289600, // 256 * 44100
	DSD512: 22579200, // 512 * 44100
} as const

/**
 * Audio data for encoding (normalized Float32Array)
 */
export interface DsfAudioData {
	samples: Float32Array[] // One array per channel, normalized -1.0 to 1.0
	sampleRate: number
}

/**
 * Encode options
 */
export interface DsfEncodeOptions {
	sampleRate?: number // Default: 2822400 (DSD64)
}

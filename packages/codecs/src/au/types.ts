/**
 * AU audio format types
 * Sun/NeXT audio format
 */

/** AU encoding types */
export const AuEncoding = {
	/** μ-law (8-bit) */
	MULAW: 1,
	/** 8-bit linear PCM */
	LINEAR_8: 2,
	/** 16-bit linear PCM */
	LINEAR_16: 3,
	/** 24-bit linear PCM */
	LINEAR_24: 4,
	/** 32-bit linear PCM */
	LINEAR_32: 5,
	/** 32-bit IEEE float */
	FLOAT: 6,
	/** 64-bit IEEE float */
	DOUBLE: 7,
	/** A-law (8-bit) */
	ALAW: 27,
} as const

export type AuEncodingType = (typeof AuEncoding)[keyof typeof AuEncoding]

/** AU file header */
export interface AuHeader {
	/** Data offset from file start */
	dataOffset: number
	/** Data size in bytes */
	dataSize: number
	/** Encoding type */
	encoding: AuEncodingType
	/** Sample rate in Hz */
	sampleRate: number
	/** Number of channels */
	numChannels: number
	/** Annotation/info string */
	annotation?: string
}

/** AU audio info */
export interface AuInfo {
	/** Number of channels */
	numChannels: number
	/** Sample rate in Hz */
	sampleRate: number
	/** Bits per sample */
	bitsPerSample: number
	/** Encoding type */
	encoding: AuEncodingType
	/** Duration in seconds */
	duration: number
	/** Total sample count per channel */
	sampleCount: number
}

/** Decoded AU audio */
export interface AuAudio {
	/** Audio info */
	info: AuInfo
	/** Audio samples as Float32Array (normalized -1 to 1) */
	samples: Float32Array[]
}

/** AU encode options */
export interface AuEncodeOptions {
	/** Sample rate (default: 44100) */
	sampleRate?: number
	/** Bits per sample: 8, 16, 24, or 32 (default: 16) */
	bitsPerSample?: 8 | 16 | 24 | 32
	/** Annotation string */
	annotation?: string
}

// AU magic number
export const AU_MAGIC = 0x2e736e64 // '.snd'

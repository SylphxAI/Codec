/**
 * AIFF audio format types
 * Audio Interchange File Format (Apple)
 */

/** AIFF file header */
export interface AiffHeader {
	/** File size */
	fileSize: number
	/** Is AIFF-C (compressed) format */
	isAIFC: boolean
	/** Number of channels */
	numChannels: number
	/** Number of sample frames */
	numSampleFrames: number
	/** Bits per sample */
	sampleSize: number
	/** Sample rate in Hz */
	sampleRate: number
	/** Compression type (for AIFF-C) */
	compressionType?: string
	/** Sound data offset */
	dataOffset: number
	/** Sound data size */
	dataSize: number
	/** Block size */
	blockSize: number
}

/** AIFF audio info */
export interface AiffInfo {
	/** Number of channels */
	numChannels: number
	/** Sample rate in Hz */
	sampleRate: number
	/** Bits per sample */
	bitsPerSample: number
	/** Is AIFF-C format */
	isCompressed: boolean
	/** Duration in seconds */
	duration: number
	/** Total sample count per channel */
	sampleCount: number
}

/** Decoded AIFF audio */
export interface AiffAudio {
	/** Audio info */
	info: AiffInfo
	/** Audio samples as Float32Array (normalized -1 to 1) */
	samples: Float32Array[]
}

/** AIFF encode options */
export interface AiffEncodeOptions {
	/** Sample rate (default: 44100) */
	sampleRate?: number
	/** Bits per sample: 8, 16, 24, or 32 (default: 16) */
	bitsPerSample?: 8 | 16 | 24 | 32
}

// IFF magic numbers (big-endian)
export const FORM_MAGIC = 0x464f524d // 'FORM'
export const AIFF_MAGIC = 0x41494646 // 'AIFF'
export const AIFC_MAGIC = 0x41494643 // 'AIFC'
export const COMM_MAGIC = 0x434f4d4d // 'COMM'
export const SSND_MAGIC = 0x53534e44 // 'SSND'
export const NONE_COMPRESSION = 'NONE' // Uncompressed

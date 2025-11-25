/**
 * TTA (True Audio) types
 * Lossless audio compression format with simple adaptive predictor
 */

/**
 * TTA magic number: "TTA1"
 */
export const TTA_MAGIC = 0x31415454

/**
 * TTA format version
 */
export const TTA_FORMAT_VERSION = 1

/**
 * Stream info from TTA header
 */
export interface TtaStreamInfo {
	format: number // Audio format (1 = PCM, 2 = DTS, 3 = floating point)
	channels: number
	bitsPerSample: number
	sampleRate: number
	totalSamples: number
	crc32: number
}

/**
 * TTA file info
 */
export interface TtaInfo {
	streamInfo: TtaStreamInfo
	sampleRate: number
	channels: number
	bitsPerSample: number
	totalSamples: number
	duration: number
}

/**
 * Decoded TTA result
 */
export interface TtaDecodeResult {
	info: TtaInfo
	samples: Int32Array[] // One array per channel
}

/**
 * Audio data for encoding
 */
export interface TtaAudioData {
	samples: Int32Array[] // One array per channel
	sampleRate: number
	bitsPerSample: number
}

/**
 * Encode options
 */
export interface TtaEncodeOptions {
	format?: number // Audio format (default 1 = PCM)
}

/**
 * Frame header info
 */
export interface TtaFrameHeader {
	size: number // Frame size in bytes
}

/**
 * Filter state for adaptive prediction
 */
export interface TtaFilter {
	round: number
	shift: number
	error: number
	qm: Int32Array // Quantized samples
	dx: Int32Array // Deltas
	dl: Int32Array // Differences
}

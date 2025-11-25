/**
 * APE (Monkey's Audio) types
 * Lossless audio compression format
 */

import type { AudioData } from '@sylphx/codec-core'

/**
 * APE magic number: "MAC " (4D 41 43 20)
 */
export const APE_MAGIC = 0x4d414320

/**
 * APE file version
 */
export const APE_VERSION = 3980

/**
 * Compression levels
 */
export const ApeCompressionLevel = {
	FAST: 1000, // Fast compression
	NORMAL: 2000, // Normal compression
	HIGH: 3000, // High compression
	EXTRA_HIGH: 4000, // Extra high compression
	INSANE: 5000, // Insane compression (slowest)
} as const

/**
 * APE descriptor (header)
 */
export interface ApeDescriptor {
	magic: number // 'MAC '
	version: number // File version
	compressionLevel: number // 1000-5000
	formatFlags: number // Format flags
	blocksPerFrame: number // Blocks per frame
	finalFrameBlocks: number // Blocks in final frame
	totalFrames: number // Total frames
	bitsPerSample: number // Bits per sample (8, 16, 24)
	channels: number // Number of channels (1-2)
	sampleRate: number // Sample rate
}

/**
 * APE header
 */
export interface ApeHeader {
	descriptor: ApeDescriptor
	wavHeaderLength: number
	wavTerminatingLength: number
	wavTotalBytes: number
	peakLevel: number
	seekTableElements: number
	seekTable: number[] // Seek positions
}

/**
 * APE file info
 */
export interface ApeInfo {
	version: number
	compressionLevel: number
	sampleRate: number
	channels: number
	bitsPerSample: number
	totalSamples: number
	totalFrames: number
	blocksPerFrame: number
	finalFrameBlocks: number
	duration: number
}

/**
 * Decoded APE result
 */
export interface ApeDecodeResult {
	info: ApeInfo
	samples: Int32Array[] // One array per channel
}

/**
 * APE audio data for encoding (extends base AudioData)
 */
export interface ApeAudioData extends AudioData {
	samples: Int32Array[] // One array per channel
	sampleRate: number
	bitsPerSample: number
}

/**
 * Encode options
 */
export interface ApeEncodeOptions {
	compressionLevel?: number // 1000-5000, default 2000 (NORMAL)
	blocksPerFrame?: number // Blocks per frame, default 73728 (about 1.67s at 44.1kHz)
}

/**
 * Frame header
 */
export interface ApeFrameHeader {
	crc: number
	blockSize: number
	frameIndex: number
}

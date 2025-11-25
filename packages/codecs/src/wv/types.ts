/**
 * WavPack (WV) types
 * Hybrid lossless/lossy audio compression format
 */

import type { AudioData } from '@sylphx/codec-core'

/**
 * WavPack magic number: "wvpk"
 */
export const WAVPACK_MAGIC = 0x7776706b

/**
 * WavPack block header flags
 */
export const WavPackFlags = {
	BYTES_PER_SAMPLE_MASK: 0x03,
	MONO_FLAG: 0x04,
	HYBRID_FLAG: 0x08,
	JOINT_STEREO: 0x10,
	CROSS_DECORR: 0x20,
	HYBRID_SHAPE: 0x40,
	FLOAT_DATA: 0x80,
	INT32_DATA: 0x100,
	HYBRID_BITRATE: 0x200,
	HYBRID_BALANCE: 0x400,
	INITIAL_BLOCK: 0x800,
	FINAL_BLOCK: 0x1000,
	LEFT_SHIFT_MASK: 0x1e000,
	MAX_MAGNITUDE: 0x60000,
	SAMPLE_RATE_MASK: 0x780000,
	USE_IIR: 0x2000000,
	FALSE_STEREO: 0x40000000,
	DSD_FLAG: 0x80000000,
} as const

/**
 * WavPack metadata IDs
 */
export const WavPackMetadataId = {
	DUMMY: 0,
	DECORR_TERMS: 2,
	DECORR_WEIGHTS: 3,
	DECORR_SAMPLES: 4,
	ENTROPY_VARS: 5,
	HYBRID_PROFILE: 6,
	SHAPING_WEIGHTS: 7,
	FLOAT_INFO: 8,
	INT32_INFO: 9,
	WV_BITSTREAM: 10,
	WVC_BITSTREAM: 11,
	WVX_BITSTREAM: 12,
	CHANNEL_INFO: 13,
	RIFF_HEADER: 21,
	RIFF_TRAILER: 22,
	CONFIG_BLOCK: 25,
	MD5_CHECKSUM: 26,
	SAMPLE_RATE: 27,
} as const

/**
 * WavPack block header
 */
export interface WavPackBlockHeader {
	blockId: string // "wvpk"
	blockSize: number
	version: number
	trackNo: number
	indexNo: number
	totalSamples: number
	blockIndex: number
	blockSamples: number
	flags: number
	crc: number
}

/**
 * WavPack decorrelation term
 */
export interface WavPackDecorrTerm {
	term: number
	delta: number
	weightA: number
	weightB: number
	samplesA: Int32Array
	samplesB: Int32Array
}

/**
 * WavPack entropy variables
 */
export interface WavPackEntropy {
	median: number[]
	slowLevel: number
	errorLimit: number
}

/**
 * WavPack file info
 */
export interface WavPackInfo {
	version: number
	sampleRate: number
	channels: number
	bitsPerSample: number
	totalSamples: number
	duration: number
	isHybrid: boolean
	isLossless: boolean
	isFloat: boolean
}

/**
 * Decoded WavPack result
 */
export interface WavPackDecodeResult extends AudioData {
	info: WavPackInfo
}

/**
 * WavPack encode options
 */
export interface WavPackEncodeOptions {
	compressionLevel?: number // 0-3: fast, high, very high, custom (default: 1)
	blockSize?: number // Samples per block (default: 22050)
	jointStereo?: boolean // Use joint stereo for stereo files
	hybridMode?: boolean // Enable hybrid lossy mode
	hybridBitrate?: number // Target bitrate for hybrid mode in kbps
}

/**
 * WavPack metadata block
 */
export interface WavPackMetadata {
	id: number
	size: number
	data: Uint8Array
}

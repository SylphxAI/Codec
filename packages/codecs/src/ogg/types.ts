/**
 * OGG container format types
 * Page-based multimedia container
 */

/**
 * OGG magic pattern: "OggS"
 */
export const OGG_MAGIC = 0x4f676753

/**
 * Page header flags
 */
export const OggPageFlag = {
	CONTINUATION: 0x01, // Continuation of previous packet
	BOS: 0x02, // Beginning of stream
	EOS: 0x04, // End of stream
} as const

/**
 * Common codec identifiers
 */
export const OggCodecId = {
	FLAC: 0x7f464c4143, // "\x7fFLAC"
	VORBIS: 0x01766f72626973, // "\x01vorbis"
	OPUS: 0x4f707573486561, // "OpusHead"
	THEORA: 0x80746865, // "\x80the"
} as const

/**
 * OGG page structure
 */
export interface OggPage {
	version: number
	flags: number
	granulePosition: bigint
	serialNumber: number
	pageSequence: number
	checksum: number
	segmentCount: number
	segmentTable: number[]
	data: Uint8Array
}

/**
 * OGG stream info
 */
export interface OggStreamInfo {
	serialNumber: number
	codecId: string
	codecName: string
	// FLAC specific
	flacInfo?: {
		sampleRate: number
		channels: number
		bitsPerSample: number
		totalSamples: number
	}
	// Vorbis specific
	vorbisInfo?: {
		channels: number
		sampleRate: number
		bitrateMax: number
		bitrateNominal: number
		bitrateMin: number
	}
}

/**
 * OGG file info
 */
export interface OggInfo {
	streams: OggStreamInfo[]
	duration: number
	hasAudio: boolean
	hasVideo: boolean
}

/**
 * Decoded OGG result
 */
export interface OggDecodeResult {
	info: OggInfo
	pages: OggPage[]
	packets: Uint8Array[][]  // Packets per stream
}

/**
 * Audio data for OGG encoding
 */
export interface OggAudioData {
	samples: Int32Array[]  // Per channel
	sampleRate: number
	bitsPerSample: number
}

/**
 * OGG encode options
 */
export interface OggEncodeOptions {
	codec?: 'flac'
	serialNumber?: number
}

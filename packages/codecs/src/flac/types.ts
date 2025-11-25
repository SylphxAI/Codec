/**
 * FLAC (Free Lossless Audio Codec) types
 * Lossless audio compression format
 */

/**
 * FLAC magic number: "fLaC"
 */
export const FLAC_MAGIC = 0x664c6143

/**
 * Metadata block types
 */
export const FlacBlockType = {
	STREAMINFO: 0,
	PADDING: 1,
	APPLICATION: 2,
	SEEKTABLE: 3,
	VORBIS_COMMENT: 4,
	CUESHEET: 5,
	PICTURE: 6,
} as const

/**
 * Frame channel assignment
 */
export const FlacChannelAssignment = {
	INDEPENDENT: 0, // Channels are independent
	LEFT_SIDE: 1, // Left + side (difference)
	RIGHT_SIDE: 2, // Right + side
	MID_SIDE: 3, // Mid + side
} as const

/**
 * Subframe types
 */
export const FlacSubframeType = {
	CONSTANT: 0,
	VERBATIM: 1,
	FIXED: 2,
	LPC: 3,
} as const

/**
 * Stream info metadata
 */
export interface FlacStreamInfo {
	minBlockSize: number
	maxBlockSize: number
	minFrameSize: number
	maxFrameSize: number
	sampleRate: number
	channels: number
	bitsPerSample: number
	totalSamples: number
	md5: Uint8Array
}

/**
 * Seek point
 */
export interface FlacSeekPoint {
	sampleNumber: number
	offset: number
	samples: number
}

/**
 * Vorbis comment (metadata tags)
 */
export interface FlacVorbisComment {
	vendor: string
	comments: Map<string, string>
}

/**
 * Metadata block
 */
export interface FlacMetadataBlock {
	type: number
	isLast: boolean
	data: Uint8Array
}

/**
 * FLAC file info
 */
export interface FlacInfo {
	streamInfo: FlacStreamInfo
	seekTable?: FlacSeekPoint[]
	vorbisComment?: FlacVorbisComment
	sampleRate: number
	channels: number
	bitsPerSample: number
	totalSamples: number
	duration: number
}

/**
 * Decoded FLAC result
 */
export interface FlacDecodeResult {
	info: FlacInfo
	samples: Int32Array[] // One array per channel
}

/**
 * Audio data for encoding
 */
export interface FlacAudioData {
	samples: Int32Array[] // One array per channel
	sampleRate: number
	bitsPerSample: number
}

/**
 * Encode options
 */
export interface FlacEncodeOptions {
	compressionLevel?: number // 0-8, default 5
	blockSize?: number // Samples per block
	doMidSideStereo?: boolean
	verifyEncoding?: boolean
}

/**
 * Frame header info
 */
export interface FlacFrameHeader {
	blockSize: number
	sampleRate: number
	channels: number
	channelAssignment: number
	bitsPerSample: number
	frameNumber: number
	sampleNumber?: number
}

/**
 * Subframe info
 */
export interface FlacSubframe {
	type: number
	wastedBits: number
	data: Int32Array
}

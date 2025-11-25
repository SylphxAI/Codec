/**
 * MP3 (MPEG-1/2 Audio Layer III) types
 * Lossy audio compression format
 */

/**
 * MP3 frame sync word: 11 bits all set to 1
 * When extracted from top 11 bits of 16-bit header: 0x7FF
 */
export const MP3_SYNC_WORD = 0x7ff

/**
 * MPEG version
 */
export const MpegVersion = {
	MPEG_2_5: 0,
	RESERVED: 1,
	MPEG_2: 2,
	MPEG_1: 3,
} as const

export type MpegVersionType = (typeof MpegVersion)[keyof typeof MpegVersion]

/**
 * MPEG layer
 */
export const MpegLayer = {
	RESERVED: 0,
	LAYER_III: 1, // MP3
	LAYER_II: 2,
	LAYER_I: 3,
} as const

export type MpegLayerType = (typeof MpegLayer)[keyof typeof MpegLayer]

/**
 * Channel mode
 */
export const ChannelMode = {
	STEREO: 0,
	JOINT_STEREO: 1,
	DUAL_CHANNEL: 2,
	MONO: 3,
} as const

export type ChannelModeType = (typeof ChannelMode)[keyof typeof ChannelMode]

/**
 * Emphasis
 */
export const Emphasis = {
	NONE: 0,
	MS_50_15: 1,
	RESERVED: 2,
	CCIT_J_17: 3,
} as const

export type EmphasisType = (typeof Emphasis)[keyof typeof Emphasis]

/**
 * ID3v2 header
 */
export interface ID3v2Header {
	/** Major version (3 or 4) */
	version: number
	/** Revision number */
	revision: number
	/** Flags byte */
	flags: number
	/** Total tag size (excluding header) */
	size: number
}

/**
 * ID3v2 frame
 */
export interface ID3v2Frame {
	/** Frame ID (e.g., 'TIT2', 'TPE1') */
	id: string
	/** Frame data */
	data: Uint8Array
}

/**
 * ID3v2 tag
 */
export interface ID3v2Tag {
	/** Header info */
	header: ID3v2Header
	/** Tag frames */
	frames: ID3v2Frame[]
	/** Parsed metadata */
	metadata: Map<string, string>
}

/**
 * MP3 frame header
 */
export interface MP3FrameHeader {
	/** MPEG version */
	version: MpegVersionType
	/** Layer (should be Layer III for MP3) */
	layer: MpegLayerType
	/** Protected by CRC (if false, CRC follows header) */
	protection: boolean
	/** Bitrate in kbps */
	bitrate: number
	/** Sample rate in Hz */
	sampleRate: number
	/** Padding bit */
	padding: boolean
	/** Private bit */
	privateBit: boolean
	/** Channel mode */
	channelMode: ChannelModeType
	/** Mode extension (for joint stereo) */
	modeExtension: number
	/** Copyright bit */
	copyright: boolean
	/** Original bit */
	original: boolean
	/** Emphasis */
	emphasis: EmphasisType
	/** Frame size in bytes */
	frameSize: number
	/** Number of samples in frame */
	samplesPerFrame: number
}

/**
 * MP3 side info (Layer III specific)
 */
export interface MP3SideInfo {
	/** Main data begin offset */
	mainDataBegin: number
	/** Private bits */
	privateBits: number
	/** Scale factor selection info */
	scfsi: number[][]
	/** Granules (2 for MPEG-1, 1 for MPEG-2) */
	granules: MP3Granule[][]
}

/**
 * Granule info for Layer III
 */
export interface MP3Granule {
	/** Part 2-3 length */
	part23Length: number
	/** Big values pairs */
	bigValues: number
	/** Global gain */
	globalGain: number
	/** Scalefac compress */
	scalefacCompress: number
	/** Window switching flag */
	windowSwitching: boolean
	/** Block type */
	blockType: number
	/** Mixed block flag */
	mixedBlockFlag: boolean
	/** Table select */
	tableSelect: number[]
	/** Subblock gain */
	subblockGain: number[]
	/** Region0 count */
	region0Count: number
	/** Region1 count */
	region1Count: number
	/** Preflag */
	preflag: boolean
	/** Scalefac scale */
	scalefacScale: boolean
	/** Count1 table select */
	count1TableSelect: boolean
}

/**
 * MP3 frame
 */
export interface MP3Frame {
	/** Frame header */
	header: MP3FrameHeader
	/** Side info (Layer III) */
	sideInfo?: MP3SideInfo
	/** Main data (compressed audio) */
	mainData: Uint8Array
	/** Decoded PCM samples (after decoding) */
	samples?: Float32Array[]
}

/**
 * MP3 file info
 */
export interface MP3Info {
	/** ID3v2 tag if present */
	id3v2?: ID3v2Tag
	/** Sample rate in Hz */
	sampleRate: number
	/** Number of channels */
	channels: number
	/** Bitrate in kbps (average) */
	bitrate: number
	/** Duration in seconds */
	duration: number
	/** Total number of frames */
	frameCount: number
	/** MPEG version */
	version: MpegVersionType
	/** Layer */
	layer: MpegLayerType
	/** Channel mode */
	channelMode: ChannelModeType
}

/**
 * Decoded MP3 result
 */
export interface MP3DecodeResult {
	/** File info */
	info: MP3Info
	/** Decoded audio samples (Float32Array per channel, normalized -1 to 1) */
	samples: Float32Array[]
}

/**
 * Audio data for encoding
 */
export interface MP3AudioData {
	/** Audio samples (Float32Array per channel, normalized -1 to 1) */
	samples: Float32Array[]
	/** Sample rate in Hz */
	sampleRate: number
	/** Number of channels */
	channels: number
}

/**
 * MP3 encode options
 */
export interface MP3EncodeOptions {
	/** Bitrate in kbps (default: 128) */
	bitrate?: number
	/** Sample rate in Hz (default: 44100) */
	sampleRate?: number
	/** Channel mode (default: STEREO for 2ch, MONO for 1ch) */
	channelMode?: ChannelModeType
	/** Quality (0-9, 0=best, 9=worst, default: 5) */
	quality?: number
	/** VBR (Variable Bitrate) mode */
	vbr?: boolean
	/** ID3v2 metadata */
	metadata?: Map<string, string>
}

/**
 * Bitrate table [version][layer][index]
 * version: 0=MPEG-2.5, 1=reserved, 2=MPEG-2, 3=MPEG-1
 * layer: 0=reserved, 1=Layer III, 2=Layer II, 3=Layer I
 * index: 0-15 (0=free, 1-14=bitrate, 15=reserved)
 */
export const BITRATE_TABLE: number[][][] = [
	// MPEG-2.5
	[
		[], // reserved
		[0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1], // Layer III
		[0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1], // Layer II
		[0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, -1], // Layer I
	],
	// reserved
	[[], [], [], []],
	// MPEG-2
	[
		[], // reserved
		[0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1], // Layer III
		[0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1], // Layer II
		[0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, -1], // Layer I
	],
	// MPEG-1
	[
		[], // reserved
		[0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1], // Layer III
		[0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, -1], // Layer II
		[0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, -1], // Layer I
	],
]

/**
 * Sample rate table [version][index]
 * version: 0=MPEG-2.5, 1=reserved, 2=MPEG-2, 3=MPEG-1
 * index: 0-3
 */
export const SAMPLE_RATE_TABLE: number[][] = [
	[11025, 12000, 8000, -1], // MPEG-2.5
	[-1, -1, -1, -1], // reserved
	[22050, 24000, 16000, -1], // MPEG-2
	[44100, 48000, 32000, -1], // MPEG-1
]

/**
 * Samples per frame table [version][layer]
 */
export const SAMPLES_PER_FRAME_TABLE: number[][] = [
	[0, 576, 1152, 384], // MPEG-2.5: [reserved, Layer III, Layer II, Layer I]
	[0, 0, 0, 0], // reserved
	[0, 576, 1152, 384], // MPEG-2
	[0, 1152, 1152, 384], // MPEG-1
]

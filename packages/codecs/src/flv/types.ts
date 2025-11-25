/**
 * FLV (Flash Video) container format types
 * Simple streaming video container
 */

/** FLV tag types */
export const FlvTagType = {
	/** Audio tag */
	AUDIO: 8,
	/** Video tag */
	VIDEO: 9,
	/** Script data (metadata) */
	SCRIPT: 18,
} as const

export type FlvTagTypeValue = (typeof FlvTagType)[keyof typeof FlvTagType]

/** FLV video codecs */
export const FlvVideoCodec = {
	/** Sorenson H.263 */
	SORENSON_H263: 2,
	/** Screen video */
	SCREEN_VIDEO: 3,
	/** VP6 */
	VP6: 4,
	/** VP6 with alpha */
	VP6_ALPHA: 5,
	/** Screen video v2 */
	SCREEN_VIDEO_2: 6,
	/** AVC (H.264) */
	AVC: 7,
} as const

export type FlvVideoCodecValue = (typeof FlvVideoCodec)[keyof typeof FlvVideoCodec]

/** FLV video frame types */
export const FlvFrameType = {
	/** Key frame (IDR) */
	KEY_FRAME: 1,
	/** Inter frame (P/B) */
	INTER_FRAME: 2,
	/** Disposable inter frame */
	DISPOSABLE_INTER: 3,
	/** Generated key frame */
	GENERATED_KEY: 4,
	/** Video info/command */
	VIDEO_INFO: 5,
} as const

export type FlvFrameTypeValue = (typeof FlvFrameType)[keyof typeof FlvFrameType]

/** FLV audio codecs */
export const FlvAudioCodec = {
	/** Linear PCM (platform endian) */
	LINEAR_PCM: 0,
	/** ADPCM */
	ADPCM: 1,
	/** MP3 */
	MP3: 2,
	/** Linear PCM (little endian) */
	LINEAR_PCM_LE: 3,
	/** Nellymoser 16kHz mono */
	NELLYMOSER_16K_MONO: 4,
	/** Nellymoser 8kHz mono */
	NELLYMOSER_8K_MONO: 5,
	/** Nellymoser */
	NELLYMOSER: 6,
	/** G.711 A-law */
	G711_ALAW: 7,
	/** G.711 μ-law */
	G711_MULAW: 8,
	/** AAC */
	AAC: 10,
	/** Speex */
	SPEEX: 11,
	/** MP3 8kHz */
	MP3_8K: 14,
	/** Device-specific */
	DEVICE_SPECIFIC: 15,
} as const

export type FlvAudioCodecValue = (typeof FlvAudioCodec)[keyof typeof FlvAudioCodec]

/** FLV audio sample rates */
export const FlvSampleRate = {
	/** 5.5 kHz */
	RATE_5500: 0,
	/** 11 kHz */
	RATE_11000: 1,
	/** 22 kHz */
	RATE_22050: 2,
	/** 44 kHz */
	RATE_44100: 3,
} as const

export type FlvSampleRateValue = (typeof FlvSampleRate)[keyof typeof FlvSampleRate]

/** FLV header */
export interface FlvHeader {
	/** FLV version */
	version: number
	/** Has audio */
	hasAudio: boolean
	/** Has video */
	hasVideo: boolean
	/** Data offset (header size) */
	dataOffset: number
}

/** FLV tag */
export interface FlvTag {
	/** Tag type */
	type: FlvTagTypeValue
	/** Data size */
	dataSize: number
	/** Timestamp in milliseconds */
	timestamp: number
	/** Stream ID (always 0) */
	streamId: number
	/** Tag data */
	data: Uint8Array
}

/** FLV video tag data */
export interface FlvVideoTag {
	/** Frame type */
	frameType: FlvFrameTypeValue
	/** Codec ID */
	codecId: FlvVideoCodecValue
	/** AVC packet type (if AVC) */
	avcPacketType?: number
	/** Composition time offset (if AVC) */
	compositionTime?: number
	/** Raw frame data */
	data: Uint8Array
}

/** FLV audio tag data */
export interface FlvAudioTag {
	/** Sound format (codec) */
	soundFormat: FlvAudioCodecValue
	/** Sample rate */
	soundRate: FlvSampleRateValue
	/** Sample size (0=8-bit, 1=16-bit) */
	soundSize: number
	/** Sound type (0=mono, 1=stereo) */
	soundType: number
	/** AAC packet type (if AAC) */
	aacPacketType?: number
	/** Raw audio data */
	data: Uint8Array
}

/** FLV metadata */
export interface FlvMetadata {
	/** Duration in seconds */
	duration?: number
	/** Width */
	width?: number
	/** Height */
	height?: number
	/** Video codec ID */
	videocodecid?: number
	/** Audio codec ID */
	audiocodecid?: number
	/** Video data rate */
	videodatarate?: number
	/** Frame rate */
	framerate?: number
	/** Audio sample rate */
	audiosamplerate?: number
	/** Audio sample size */
	audiosamplesize?: number
	/** Is stereo */
	stereo?: boolean
	/** File size */
	filesize?: number
	/** Additional properties */
	[key: string]: unknown
}

/** FLV file info */
export interface FlvInfo {
	/** Header */
	header: FlvHeader
	/** Metadata */
	metadata: FlvMetadata
	/** Width */
	width: number
	/** Height */
	height: number
	/** Frame rate */
	frameRate: number
	/** Duration in seconds */
	duration: number
	/** Video codec */
	videoCodec?: FlvVideoCodecValue
	/** Audio codec */
	audioCodec?: FlvAudioCodecValue
	/** Has audio */
	hasAudio: boolean
	/** Has video */
	hasVideo: boolean
}

/** FLV video data */
export interface FlvVideo {
	/** File info */
	info: FlvInfo
	/** All tags */
	tags: FlvTag[]
	/** Video tags */
	videoTags: FlvVideoTag[]
	/** Audio tags */
	audioTags: FlvAudioTag[]
}

/** FLV encode options */
export interface FlvEncodeOptions {
	/** Frame rate (default: 30) */
	frameRate?: number
	/** JPEG quality for JPEG-based video (default: 85) */
	quality?: number
}

// FLV magic number
export const FLV_MAGIC = 0x464c56 // 'FLV'

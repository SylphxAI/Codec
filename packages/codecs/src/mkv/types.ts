/**
 * MKV/WebM (Matroska) types
 * EBML-based container format
 */

import type { ImageData } from '@sylphx/codec-core'

/**
 * EBML Element IDs (subset for Matroska)
 */
export const EbmlId = {
	// EBML Header
	EBML: 0x1a45dfa3,
	EBMLVersion: 0x4286,
	EBMLReadVersion: 0x42f7,
	EBMLMaxIDLength: 0x42f2,
	EBMLMaxSizeLength: 0x42f3,
	DocType: 0x4282,
	DocTypeVersion: 0x4287,
	DocTypeReadVersion: 0x4285,

	// Segment
	Segment: 0x18538067,

	// Segment Info
	Info: 0x1549a966,
	TimestampScale: 0x2ad7b1,
	Duration: 0x4489,
	MuxingApp: 0x4d80,
	WritingApp: 0x5741,

	// Tracks
	Tracks: 0x1654ae6b,
	TrackEntry: 0xae,
	TrackNumber: 0xd7,
	TrackUID: 0x73c5,
	TrackType: 0x83,
	FlagEnabled: 0xb9,
	FlagDefault: 0x88,
	FlagForced: 0x55aa,
	FlagLacing: 0x9c,
	DefaultDuration: 0x23e383,
	Name: 0x536e,
	Language: 0x22b59c,
	CodecID: 0x86,
	CodecPrivate: 0x63a2,
	CodecName: 0x258688,

	// Video
	Video: 0xe0,
	FlagInterlaced: 0x9a,
	PixelWidth: 0xb0,
	PixelHeight: 0xba,
	DisplayWidth: 0x54b0,
	DisplayHeight: 0x54ba,
	DisplayUnit: 0x54b2,

	// Audio
	Audio: 0xe1,
	SamplingFrequency: 0xb5,
	OutputSamplingFrequency: 0x78b5,
	Channels: 0x9f,
	BitDepth: 0x6264,

	// Cluster
	Cluster: 0x1f43b675,
	Timestamp: 0xe7,
	SimpleBlock: 0xa3,
	BlockGroup: 0xa0,
	Block: 0xa1,
	BlockDuration: 0x9b,

	// Cues (seek index)
	Cues: 0x1c53bb6b,
	CuePoint: 0xbb,
	CueTime: 0xb3,
	CueTrackPositions: 0xb7,
	CueTrack: 0xf7,
	CueClusterPosition: 0xf1,

	// Tags
	Tags: 0x1254c367,
	Tag: 0x7373,
	Targets: 0x63c0,
	SimpleTag: 0x67c8,
	TagName: 0x45a3,
	TagString: 0x4487,

	// Void/CRC
	Void: 0xec,
	CRC32: 0xbf,
} as const

/**
 * Track types
 */
export const MkvTrackType = {
	VIDEO: 1,
	AUDIO: 2,
	COMPLEX: 3,
	LOGO: 0x10,
	SUBTITLE: 0x11,
	BUTTONS: 0x12,
	CONTROL: 0x20,
} as const

/**
 * Common codec IDs
 */
export const MkvCodecId = {
	// Video
	V_MJPEG: 'V_MJPEG',
	V_UNCOMPRESSED: 'V_UNCOMPRESSED',
	V_VP8: 'V_VP8',
	V_VP9: 'V_VP9',
	V_AV1: 'V_AV1',
	V_MPEG4_ISO_AVC: 'V_MPEG4/ISO/AVC',
	V_MPEGH_ISO_HEVC: 'V_MPEGH/ISO/HEVC',

	// Audio
	A_PCM_INT_LIT: 'A_PCM/INT/LIT',
	A_PCM_INT_BIG: 'A_PCM/INT/BIG',
	A_PCM_FLOAT_IEEE: 'A_PCM/FLOAT/IEEE',
	A_OPUS: 'A_OPUS',
	A_VORBIS: 'A_VORBIS',
	A_AAC: 'A_AAC',
} as const

/**
 * EBML element structure
 */
export interface EbmlElement {
	id: number
	size: number
	dataOffset: number
	data?: Uint8Array
	children?: EbmlElement[]
}

/**
 * Track info
 */
export interface MkvTrack {
	number: number
	uid: number
	type: number
	codecId: string
	codecPrivate?: Uint8Array
	name?: string
	language?: string
	defaultDuration?: number
	// Video specific
	video?: {
		pixelWidth: number
		pixelHeight: number
		displayWidth?: number
		displayHeight?: number
	}
	// Audio specific
	audio?: {
		samplingFrequency: number
		channels: number
		bitDepth?: number
	}
}

/**
 * MKV file info
 */
export interface MkvInfo {
	docType: string
	docTypeVersion: number
	timestampScale: number
	duration?: number
	muxingApp?: string
	writingApp?: string
	tracks: MkvTrack[]
	width: number
	height: number
	hasVideo: boolean
	hasAudio: boolean
}

/**
 * Decoded MKV result
 */
export interface MkvDecodeResult {
	info: MkvInfo
	segments: EbmlElement[]
	clusters: MkvCluster[]
}

/**
 * Cluster with frames
 */
export interface MkvCluster {
	timestamp: number
	blocks: MkvBlock[]
}

/**
 * Block (frame data)
 */
export interface MkvBlock {
	trackNumber: number
	timestamp: number
	keyframe: boolean
	data: Uint8Array
}

/**
 * Encode options
 */
export interface MkvEncodeOptions {
	frameRate?: number
	timescale?: number
	quality?: number
	codecId?: string
	docType?: 'matroska' | 'webm'
}

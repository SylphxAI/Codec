/**
 * WebM types
 * WebM is a subset of Matroska/EBML container format
 * Restricted to VP8, VP9, or AV1 video codecs and Vorbis or Opus audio codecs
 */

import type { VideoData } from '@sylphx/codec-core'

/**
 * EBML Element IDs (subset for WebM)
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
	FlagLacing: 0x9c,
	DefaultDuration: 0x23e383,
	Name: 0x536e,
	Language: 0x22b59c,
	CodecID: 0x86,
	CodecPrivate: 0x63a2,
	CodecName: 0x258688,

	// Video
	Video: 0xe0,
	PixelWidth: 0xb0,
	PixelHeight: 0xba,
	DisplayWidth: 0x54b0,
	DisplayHeight: 0x54ba,

	// Audio
	Audio: 0xe1,
	SamplingFrequency: 0xb5,
	Channels: 0x9f,
	BitDepth: 0x6264,

	// Cluster
	Cluster: 0x1f43b675,
	Timestamp: 0xe7,
	SimpleBlock: 0xa3,
	BlockGroup: 0xa0,
	Block: 0xa1,

	// Void
	Void: 0xec,
} as const

/**
 * Track types
 */
export const WebmTrackType = {
	VIDEO: 1,
	AUDIO: 2,
	SUBTITLE: 0x11,
} as const

/**
 * WebM allowed codec IDs
 */
export const WebmCodecId = {
	// Video (WebM restriction)
	V_VP8: 'V_VP8',
	V_VP9: 'V_VP9',
	V_AV1: 'V_AV1',

	// Audio (WebM restriction)
	A_VORBIS: 'A_VORBIS',
	A_OPUS: 'A_OPUS',

	// For internal use (uncompressed frames)
	V_UNCOMPRESSED: 'V_UNCOMPRESSED',
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
export interface WebmTrack {
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
 * WebM file info
 */
export interface WebmInfo {
	docType: string
	docTypeVersion: number
	timestampScale: number
	duration?: number
	muxingApp?: string
	writingApp?: string
	tracks: WebmTrack[]
	width: number
	height: number
	hasVideo: boolean
	hasAudio: boolean
	fps?: number
}

/**
 * Decoded WebM result
 */
export interface WebmDecodeResult {
	info: WebmInfo
	segments: EbmlElement[]
	clusters: WebmCluster[]
}

/**
 * Cluster with frames
 */
export interface WebmCluster {
	timestamp: number
	blocks: WebmBlock[]
}

/**
 * Block (frame data)
 */
export interface WebmBlock {
	trackNumber: number
	timestamp: number
	keyframe: boolean
	data: Uint8Array
}

/**
 * Encode options
 */
export interface WebmEncodeOptions {
	frameRate?: number
	timescale?: number
	quality?: number
	codecId?: 'V_VP8' | 'V_VP9' | 'V_AV1' | 'V_UNCOMPRESSED'
}

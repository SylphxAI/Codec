/**
 * MKA (Matroska Audio) types
 * EBML-based audio container format
 */

import type { AudioData } from '@sylphx/codec-core'

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
export const MkaTrackType = {
	VIDEO: 1,
	AUDIO: 2,
	COMPLEX: 3,
	LOGO: 0x10,
	SUBTITLE: 0x11,
	BUTTONS: 0x12,
	CONTROL: 0x20,
} as const

/**
 * Common audio codec IDs
 */
export const MkaCodecId = {
	A_PCM_INT_LIT: 'A_PCM/INT/LIT',
	A_PCM_INT_BIG: 'A_PCM/INT/BIG',
	A_PCM_FLOAT_IEEE: 'A_PCM/FLOAT/IEEE',
	A_OPUS: 'A_OPUS',
	A_VORBIS: 'A_VORBIS',
	A_AAC: 'A_AAC',
	A_FLAC: 'A_FLAC',
	A_MP3: 'A_MPEG/L3',
	A_AC3: 'A_AC3',
	A_DTS: 'A_DTS',
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
 * Audio track info
 */
export interface MkaTrack {
	number: number
	uid: number
	type: number
	codecId: string
	codecPrivate?: Uint8Array
	name?: string
	language?: string
	defaultDuration?: number
	audio: {
		samplingFrequency: number
		channels: number
		bitDepth?: number
	}
}

/**
 * MKA file info
 */
export interface MkaInfo {
	docType: string
	docTypeVersion: number
	timestampScale: number
	duration?: number
	muxingApp?: string
	writingApp?: string
	tracks: MkaTrack[]
	sampleRate: number
	channels: number
	bitDepth?: number
}

/**
 * Decoded MKA result
 */
export interface MkaDecodeResult {
	info: MkaInfo
	segments: EbmlElement[]
	clusters: MkaCluster[]
}

/**
 * Cluster with audio blocks
 */
export interface MkaCluster {
	timestamp: number
	blocks: MkaBlock[]
}

/**
 * Block (audio frame data)
 */
export interface MkaBlock {
	trackNumber: number
	timestamp: number
	keyframe: boolean
	data: Uint8Array
}

/**
 * Encode options
 */
export interface MkaEncodeOptions {
	sampleRate?: number
	channels?: number
	bitDepth?: number
	timescale?: number
	quality?: number
	codecId?: string
}

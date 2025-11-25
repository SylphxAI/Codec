/**
 * M4A (MPEG-4 Audio) container types
 * Based on ISO Base Media File Format (ISO/IEC 14496-12)
 * M4A is essentially MP4 container with audio-only content
 */

import type { AudioData } from '@sylphx/codec-core'

/** M4A box (atom) types */
export const M4aBoxType = {
	// Container boxes
	FTYP: 'ftyp', // File type
	MOOV: 'moov', // Movie
	MDAT: 'mdat', // Media data
	FREE: 'free', // Free space
	SKIP: 'skip', // Skip

	// Movie boxes
	MVHD: 'mvhd', // Movie header
	TRAK: 'trak', // Track
	UDTA: 'udta', // User data

	// Track boxes
	TKHD: 'tkhd', // Track header
	MDIA: 'mdia', // Media
	EDTS: 'edts', // Edit list

	// Media boxes
	MDHD: 'mdhd', // Media header
	HDLR: 'hdlr', // Handler reference
	MINF: 'minf', // Media info

	// Media info boxes
	SMHD: 'smhd', // Sound media header
	DINF: 'dinf', // Data info
	STBL: 'stbl', // Sample table

	// Sample table boxes
	STSD: 'stsd', // Sample description
	STTS: 'stts', // Time to sample
	STSC: 'stsc', // Sample to chunk
	STSZ: 'stsz', // Sample size
	STCO: 'stco', // Chunk offset
	CO64: 'co64', // 64-bit chunk offset
	STSS: 'stss', // Sync sample
	CTTS: 'ctts', // Composition time to sample

	// Audio sample entries
	MP4A: 'mp4a', // AAC
	ALAC: 'alac', // Apple Lossless

	// Codec config
	ESDS: 'esds', // ES descriptor
} as const

export type M4aBoxTypeValue = (typeof M4aBoxType)[keyof typeof M4aBoxType]

/** M4A brand types */
export const M4aBrand = {
	M4A: 'M4A ', // iTunes audio (with trailing space)
	MP42: 'mp42', // MP4 v2
	ISOM: 'isom', // ISO Base Media
	ISO2: 'iso2', // ISO Base Media v2
} as const

export type M4aBrandValue = (typeof M4aBrand)[keyof typeof M4aBrand]

/** Handler types */
export const M4aHandlerType = {
	AUDIO: 'soun',
	META: 'meta',
} as const

export type M4aHandlerTypeValue = (typeof M4aHandlerType)[keyof typeof M4aHandlerType]

/** M4A box structure */
export interface M4aBox {
	/** Box type (4 characters) */
	type: string
	/** Box size (including header) */
	size: number
	/** Box data offset in file */
	offset: number
	/** Box data (excluding header) */
	data?: Uint8Array
	/** Child boxes (for container boxes) */
	children?: M4aBox[]
}

/** File type box (ftyp) */
export interface M4aFtyp {
	/** Major brand */
	majorBrand: string
	/** Minor version */
	minorVersion: number
	/** Compatible brands */
	compatibleBrands: string[]
}

/** Movie header box (mvhd) */
export interface M4aMvhd {
	/** Version */
	version: number
	/** Creation time */
	creationTime: number
	/** Modification time */
	modificationTime: number
	/** Timescale (units per second) */
	timescale: number
	/** Duration (in timescale units) */
	duration: number
	/** Preferred rate (16.16 fixed point) */
	rate: number
	/** Preferred volume (8.8 fixed point) */
	volume: number
	/** Next track ID */
	nextTrackId: number
}

/** Track header box (tkhd) */
export interface M4aTkhd {
	/** Version */
	version: number
	/** Flags */
	flags: number
	/** Creation time */
	creationTime: number
	/** Modification time */
	modificationTime: number
	/** Track ID */
	trackId: number
	/** Duration */
	duration: number
	/** Layer */
	layer: number
	/** Alternate group */
	alternateGroup: number
	/** Volume */
	volume: number
}

/** Media header box (mdhd) */
export interface M4aMdhd {
	/** Version */
	version: number
	/** Creation time */
	creationTime: number
	/** Modification time */
	modificationTime: number
	/** Timescale */
	timescale: number
	/** Duration */
	duration: number
	/** Language */
	language: string
}

/** Handler reference box (hdlr) */
export interface M4aHdlr {
	/** Version */
	version: number
	/** Handler type */
	handlerType: string
	/** Name */
	name: string
}

/** Sample description entry */
export interface M4aSampleEntry {
	/** Format (codec) */
	format: string
	/** Data reference index */
	dataReferenceIndex: number
	/** Channel count (audio) */
	channelCount?: number
	/** Sample size (audio) */
	sampleSize?: number
	/** Sample rate (audio) */
	sampleRate?: number
	/** Codec config data */
	codecConfig?: Uint8Array
}

/** Time to sample entry */
export interface M4aSttsEntry {
	/** Sample count */
	sampleCount: number
	/** Sample delta */
	sampleDelta: number
}

/** Sample to chunk entry */
export interface M4aStscEntry {
	/** First chunk */
	firstChunk: number
	/** Samples per chunk */
	samplesPerChunk: number
	/** Sample description index */
	sampleDescriptionIndex: number
}

/** Audio track info */
export interface M4aTrack {
	/** Track ID */
	trackId: number
	/** Duration in seconds */
	duration: number
	/** Timescale */
	timescale: number
	/** Codec */
	codec?: string
	/** Sample rate (audio) */
	sampleRate?: number
	/** Channel count (audio) */
	channelCount?: number
	/** Sample entries */
	sampleEntries: M4aSampleEntry[]
	/** Sample count */
	sampleCount: number
	/** Sample sizes */
	sampleSizes: number[]
	/** Chunk offsets */
	chunkOffsets: number[]
	/** Time to sample entries */
	timeToSample: M4aSttsEntry[]
	/** Sample to chunk entries */
	sampleToChunk: M4aStscEntry[]
	/** Sync samples (key frames) */
	syncSamples?: number[]
}

/** M4A file info */
export interface M4aInfo {
	/** File type */
	ftyp: M4aFtyp
	/** Movie header */
	mvhd: M4aMvhd
	/** Duration in seconds */
	duration: number
	/** Timescale */
	timescale: number
	/** Audio track */
	audioTrack?: M4aTrack
	/** Sample rate */
	sampleRate: number
	/** Channels */
	channels: number
	/** Codec */
	codec: string
	/** Bitrate (estimated) */
	bitrate?: number
}

/** M4A audio container */
export interface M4aAudio {
	/** File info */
	info: M4aInfo
	/** All boxes */
	boxes: M4aBox[]
	/** Raw mdat data */
	mdatData?: Uint8Array
}

/** M4A encode options */
export interface M4aEncodeOptions {
	/** Codec (default: 'aac') */
	codec?: 'aac' | 'alac'
	/** Sample rate (default: 44100) */
	sampleRate?: number
	/** Bitrate in kbps for AAC (default: 128) */
	bitrate?: number
	/** Brand (default: 'M4A ') */
	brand?: string
}

// Four-character code helper
export function fourCC(str: string): number {
	return (
		(str.charCodeAt(0) << 24) |
		(str.charCodeAt(1) << 16) |
		(str.charCodeAt(2) << 8) |
		str.charCodeAt(3)
	)
}

export function fourCCToString(code: number): string {
	return String.fromCharCode(
		(code >> 24) & 0xff,
		(code >> 16) & 0xff,
		(code >> 8) & 0xff,
		code & 0xff
	)
}

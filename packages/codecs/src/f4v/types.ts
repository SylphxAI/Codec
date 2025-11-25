/**
 * F4V (Flash Video MP4) container types
 * Based on ISO/IEC 14496-12 (ISOBMFF) with F4V-specific extensions
 */

/** F4V box (atom) types */
export const F4vBoxType = {
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
	VMHD: 'vmhd', // Video media header
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

	// Video sample entries
	AVC1: 'avc1', // H.264/AVC (primary for F4V)
	HVC1: 'hvc1', // H.265/HEVC
	MP4V: 'mp4v', // MPEG-4 Visual
	MJPA: 'mjpa', // Motion JPEG A
	MJPB: 'mjpb', // Motion JPEG B
	JPEG: 'jpeg', // JPEG

	// Audio sample entries
	MP4A: 'mp4a', // AAC (primary for F4V)
	AC3: 'ac-3', // AC-3
	EAC3: 'ec-3', // Enhanced AC-3

	// Codec config
	AVCC: 'avcC', // AVC configuration
	HVCC: 'hvcC', // HEVC configuration
	ESDS: 'esds', // ES descriptor
} as const

export type F4vBoxTypeValue = (typeof F4vBoxType)[keyof typeof F4vBoxType]

/** F4V brand types */
export const F4vBrand = {
	F4V: 'f4v ', // Flash Video MP4
	ISOM: 'isom', // ISO Base Media
	ISO2: 'iso2', // ISO Base Media v2
	MP41: 'mp41', // MP4 v1
	MP42: 'mp42', // MP4 v2
	AVC1: 'avc1', // AVC/H.264
} as const

export type F4vBrandValue = (typeof F4vBrand)[keyof typeof F4vBrand]

/** Handler types */
export const F4vHandlerType = {
	VIDEO: 'vide',
	AUDIO: 'soun',
	HINT: 'hint',
	META: 'meta',
	TEXT: 'text',
} as const

export type F4vHandlerTypeValue = (typeof F4vHandlerType)[keyof typeof F4vHandlerType]

/** F4V box structure */
export interface F4vBox {
	/** Box type (4 characters) */
	type: string
	/** Box size (including header) */
	size: number
	/** Box data offset in file */
	offset: number
	/** Box data (excluding header) */
	data?: Uint8Array
	/** Child boxes (for container boxes) */
	children?: F4vBox[]
}

/** File type box (ftyp) */
export interface F4vFtyp {
	/** Major brand */
	majorBrand: string
	/** Minor version */
	minorVersion: number
	/** Compatible brands */
	compatibleBrands: string[]
}

/** Movie header box (mvhd) */
export interface F4vMvhd {
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
export interface F4vTkhd {
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
	/** Width (16.16 fixed point) */
	width: number
	/** Height (16.16 fixed point) */
	height: number
}

/** Media header box (mdhd) */
export interface F4vMdhd {
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
export interface F4vHdlr {
	/** Version */
	version: number
	/** Handler type */
	handlerType: string
	/** Name */
	name: string
}

/** Sample description entry */
export interface F4vSampleEntry {
	/** Format (codec) */
	format: string
	/** Data reference index */
	dataReferenceIndex: number
	/** Width (video) */
	width?: number
	/** Height (video) */
	height?: number
	/** Horizontal resolution */
	horizResolution?: number
	/** Vertical resolution */
	vertResolution?: number
	/** Frame count */
	frameCount?: number
	/** Compressor name */
	compressorName?: string
	/** Depth */
	depth?: number
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
export interface F4vSttsEntry {
	/** Sample count */
	sampleCount: number
	/** Sample delta */
	sampleDelta: number
}

/** Sample to chunk entry */
export interface F4vStscEntry {
	/** First chunk */
	firstChunk: number
	/** Samples per chunk */
	samplesPerChunk: number
	/** Sample description index */
	sampleDescriptionIndex: number
}

/** Track info */
export interface F4vTrack {
	/** Track ID */
	trackId: number
	/** Track type */
	type: 'video' | 'audio' | 'other'
	/** Duration in seconds */
	duration: number
	/** Timescale */
	timescale: number
	/** Width (video) */
	width?: number
	/** Height (video) */
	height?: number
	/** Codec */
	codec?: string
	/** Sample rate (audio) */
	sampleRate?: number
	/** Channel count (audio) */
	channelCount?: number
	/** Sample entries */
	sampleEntries: F4vSampleEntry[]
	/** Sample count */
	sampleCount: number
	/** Sample sizes */
	sampleSizes: number[]
	/** Chunk offsets */
	chunkOffsets: number[]
	/** Time to sample entries */
	timeToSample: F4vSttsEntry[]
	/** Sample to chunk entries */
	sampleToChunk: F4vStscEntry[]
	/** Sync samples (key frames) */
	syncSamples?: number[]
}

/** F4V file info */
export interface F4vInfo {
	/** File type */
	ftyp: F4vFtyp
	/** Movie header */
	mvhd: F4vMvhd
	/** Duration in seconds */
	duration: number
	/** Timescale */
	timescale: number
	/** Tracks */
	tracks: F4vTrack[]
	/** Has video */
	hasVideo: boolean
	/** Has audio */
	hasAudio: boolean
	/** Video track */
	videoTrack?: F4vTrack
	/** Audio track */
	audioTrack?: F4vTrack
	/** Width */
	width: number
	/** Height */
	height: number
	/** Frame rate (estimated) */
	frameRate: number
}

/** F4V video data */
export interface F4vVideo {
	/** File info */
	info: F4vInfo
	/** All boxes */
	boxes: F4vBox[]
	/** Raw mdat data */
	mdatData?: Uint8Array
}

/** F4V encode options */
export interface F4vEncodeOptions {
	/** Frame rate (default: 30) */
	frameRate?: number
	/** Timescale (default: 30000) */
	timescale?: number
	/** JPEG quality (default: 85) */
	quality?: number
	/** Brand (default: f4v) */
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

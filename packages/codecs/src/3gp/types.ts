/**
 * 3GP (3rd Generation Partnership Project) container types
 * Based on ISO Base Media File Format (ISO/IEC 14496-12)
 * Designed for mobile multimedia applications
 */

/** 3GP box (atom) types */
export const ThreeGPBoxType = {
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

	// 3GP specific video codecs
	S263: 's263', // H.263
	H263: 'h263', // H.263
	AVC1: 'avc1', // H.264/AVC
	MP4V: 'mp4v', // MPEG-4 Visual

	// 3GP specific audio codecs
	SAMR: 'samr', // AMR Narrowband
	SAWB: 'sawb', // AMR Wideband
	MP4A: 'mp4a', // AAC

	// Codec config
	D263: 'd263', // H.263 configuration
	AVCC: 'avcC', // AVC configuration
	DAMR: 'damr', // AMR configuration
	ESDS: 'esds', // ES descriptor
} as const

export type ThreeGPBoxTypeValue = (typeof ThreeGPBoxType)[keyof typeof ThreeGPBoxType]

/** 3GP brand types */
export const ThreeGPBrand = {
	GP4: '3gp4', // 3GPP Release 4
	GP5: '3gp5', // 3GPP Release 5
	GP6: '3gp6', // 3GPP Release 6
	GP7: '3gp7', // 3GPP Release 7
	GP9: '3gp9', // 3GPP Release 9
	G2A: '3g2a', // 3GPP2 (CDMA)
	ISOM: 'isom', // ISO Base Media
} as const

export type ThreeGPBrandValue = (typeof ThreeGPBrand)[keyof typeof ThreeGPBrand]

/** Handler types */
export const ThreeGPHandlerType = {
	VIDEO: 'vide',
	AUDIO: 'soun',
	HINT: 'hint',
	META: 'meta',
	TEXT: 'text',
} as const

export type ThreeGPHandlerTypeValue =
	(typeof ThreeGPHandlerType)[keyof typeof ThreeGPHandlerType]

/** 3GP box structure */
export interface ThreeGPBox {
	/** Box type (4 characters) */
	type: string
	/** Box size (including header) */
	size: number
	/** Box data offset in file */
	offset: number
	/** Box data (excluding header) */
	data?: Uint8Array
	/** Child boxes (for container boxes) */
	children?: ThreeGPBox[]
}

/** File type box (ftyp) */
export interface ThreeGPFtyp {
	/** Major brand */
	majorBrand: string
	/** Minor version */
	minorVersion: number
	/** Compatible brands */
	compatibleBrands: string[]
}

/** Movie header box (mvhd) */
export interface ThreeGPMvhd {
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
export interface ThreeGPTkhd {
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
export interface ThreeGPMdhd {
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
export interface ThreeGPHdlr {
	/** Version */
	version: number
	/** Handler type */
	handlerType: string
	/** Name */
	name: string
}

/** Sample description entry */
export interface ThreeGPSampleEntry {
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
export interface ThreeGPSttsEntry {
	/** Sample count */
	sampleCount: number
	/** Sample delta */
	sampleDelta: number
}

/** Sample to chunk entry */
export interface ThreeGPStscEntry {
	/** First chunk */
	firstChunk: number
	/** Samples per chunk */
	samplesPerChunk: number
	/** Sample description index */
	sampleDescriptionIndex: number
}

/** Track info */
export interface ThreeGPTrack {
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
	sampleEntries: ThreeGPSampleEntry[]
	/** Sample count */
	sampleCount: number
	/** Sample sizes */
	sampleSizes: number[]
	/** Chunk offsets */
	chunkOffsets: number[]
	/** Time to sample entries */
	timeToSample: ThreeGPSttsEntry[]
	/** Sample to chunk entries */
	sampleToChunk: ThreeGPStscEntry[]
	/** Sync samples (key frames) */
	syncSamples?: number[]
}

/** 3GP file info */
export interface ThreeGPInfo {
	/** File type */
	ftyp: ThreeGPFtyp
	/** Movie header */
	mvhd: ThreeGPMvhd
	/** Duration in seconds */
	duration: number
	/** Timescale */
	timescale: number
	/** Tracks */
	tracks: ThreeGPTrack[]
	/** Has video */
	hasVideo: boolean
	/** Has audio */
	hasAudio: boolean
	/** Video track */
	videoTrack?: ThreeGPTrack
	/** Audio track */
	audioTrack?: ThreeGPTrack
	/** Width */
	width: number
	/** Height */
	height: number
	/** Frame rate (estimated) */
	frameRate: number
}

/** 3GP video data */
export interface ThreeGPVideo {
	/** File info */
	info: ThreeGPInfo
	/** All boxes */
	boxes: ThreeGPBox[]
	/** Raw mdat data */
	mdatData?: Uint8Array
}

/** 3GP encode options */
export interface ThreeGPEncodeOptions {
	/** Frame rate (default: 15) */
	frameRate?: number
	/** Timescale (default: 1000) */
	timescale?: number
	/** Brand (default: 3gp6) */
	brand?: string
	/** Video codec (default: h263) */
	videoCodec?: 'h263' | 'h264' | 'mp4v'
	/** Max width for mobile (default: 176) */
	maxWidth?: number
	/** Max height for mobile (default: 144) */
	maxHeight?: number
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

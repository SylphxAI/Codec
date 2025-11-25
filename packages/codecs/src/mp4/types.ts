/**
 * MP4/MOV (ISO Base Media File Format) container types
 * Based on ISO/IEC 14496-12
 */

/** MP4 box (atom) types */
export const Mp4BoxType = {
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
	AVC1: 'avc1', // H.264/AVC
	HVC1: 'hvc1', // H.265/HEVC
	MP4V: 'mp4v', // MPEG-4 Visual
	MJPA: 'mjpa', // Motion JPEG A
	MJPB: 'mjpb', // Motion JPEG B
	JPEG: 'jpeg', // JPEG

	// Audio sample entries
	MP4A: 'mp4a', // AAC
	AC3: 'ac-3', // AC-3
	EAC3: 'ec-3', // Enhanced AC-3

	// Codec config
	AVCC: 'avcC', // AVC configuration
	HVCC: 'hvcC', // HEVC configuration
	ESDS: 'esds', // ES descriptor
} as const

export type Mp4BoxTypeValue = (typeof Mp4BoxType)[keyof typeof Mp4BoxType]

/** MP4 brand types */
export const Mp4Brand = {
	ISOM: 'isom', // ISO Base Media
	ISO2: 'iso2', // ISO Base Media v2
	MP41: 'mp41', // MP4 v1
	MP42: 'mp42', // MP4 v2
	AVC1: 'avc1', // AVC/H.264
	QT: 'qt  ', // QuickTime
	M4V: 'M4V ', // iTunes video
	M4A: 'M4A ', // iTunes audio
} as const

export type Mp4BrandValue = (typeof Mp4Brand)[keyof typeof Mp4Brand]

/** Handler types */
export const Mp4HandlerType = {
	VIDEO: 'vide',
	AUDIO: 'soun',
	HINT: 'hint',
	META: 'meta',
	TEXT: 'text',
} as const

export type Mp4HandlerTypeValue = (typeof Mp4HandlerType)[keyof typeof Mp4HandlerType]

/** MP4 box structure */
export interface Mp4Box {
	/** Box type (4 characters) */
	type: string
	/** Box size (including header) */
	size: number
	/** Box data offset in file */
	offset: number
	/** Box data (excluding header) */
	data?: Uint8Array
	/** Child boxes (for container boxes) */
	children?: Mp4Box[]
}

/** File type box (ftyp) */
export interface Mp4Ftyp {
	/** Major brand */
	majorBrand: string
	/** Minor version */
	minorVersion: number
	/** Compatible brands */
	compatibleBrands: string[]
}

/** Movie header box (mvhd) */
export interface Mp4Mvhd {
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
export interface Mp4Tkhd {
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
export interface Mp4Mdhd {
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
export interface Mp4Hdlr {
	/** Version */
	version: number
	/** Handler type */
	handlerType: string
	/** Name */
	name: string
}

/** Sample description entry */
export interface Mp4SampleEntry {
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
export interface Mp4SttsEntry {
	/** Sample count */
	sampleCount: number
	/** Sample delta */
	sampleDelta: number
}

/** Sample to chunk entry */
export interface Mp4StscEntry {
	/** First chunk */
	firstChunk: number
	/** Samples per chunk */
	samplesPerChunk: number
	/** Sample description index */
	sampleDescriptionIndex: number
}

/** Track info */
export interface Mp4Track {
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
	sampleEntries: Mp4SampleEntry[]
	/** Sample count */
	sampleCount: number
	/** Sample sizes */
	sampleSizes: number[]
	/** Chunk offsets */
	chunkOffsets: number[]
	/** Time to sample entries */
	timeToSample: Mp4SttsEntry[]
	/** Sample to chunk entries */
	sampleToChunk: Mp4StscEntry[]
	/** Sync samples (key frames) */
	syncSamples?: number[]
}

/** MP4 file info */
export interface Mp4Info {
	/** File type */
	ftyp: Mp4Ftyp
	/** Movie header */
	mvhd: Mp4Mvhd
	/** Duration in seconds */
	duration: number
	/** Timescale */
	timescale: number
	/** Tracks */
	tracks: Mp4Track[]
	/** Has video */
	hasVideo: boolean
	/** Has audio */
	hasAudio: boolean
	/** Video track */
	videoTrack?: Mp4Track
	/** Audio track */
	audioTrack?: Mp4Track
	/** Width */
	width: number
	/** Height */
	height: number
	/** Frame rate (estimated) */
	frameRate: number
}

/** MP4 video data */
export interface Mp4Video {
	/** File info */
	info: Mp4Info
	/** All boxes */
	boxes: Mp4Box[]
	/** Raw mdat data */
	mdatData?: Uint8Array
}

/** MP4 encode options */
export interface Mp4EncodeOptions {
	/** Frame rate (default: 30) */
	frameRate?: number
	/** Timescale (default: 30000) */
	timescale?: number
	/** JPEG quality (default: 85) */
	quality?: number
	/** Brand (default: isom) */
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

/**
 * MOV/QuickTime container types
 * Based on ISO Base Media File Format (ISO/IEC 14496-12)
 * QuickTime adds proprietary extensions to ISOBMFF
 */

/** MOV atom (box) types */
export const MovAtomType = {
	// Container atoms
	FTYP: 'ftyp', // File type
	MOOV: 'moov', // Movie
	MDAT: 'mdat', // Media data
	FREE: 'free', // Free space
	SKIP: 'skip', // Skip
	WIDE: 'wide', // Wide (reserved space)

	// Movie atoms
	MVHD: 'mvhd', // Movie header
	TRAK: 'trak', // Track
	UDTA: 'udta', // User data

	// Track atoms
	TKHD: 'tkhd', // Track header
	MDIA: 'mdia', // Media
	EDTS: 'edts', // Edit list

	// Media atoms
	MDHD: 'mdhd', // Media header
	HDLR: 'hdlr', // Handler reference
	MINF: 'minf', // Media info

	// Media info atoms
	VMHD: 'vmhd', // Video media header
	SMHD: 'smhd', // Sound media header
	DINF: 'dinf', // Data info
	STBL: 'stbl', // Sample table

	// Sample table atoms
	STSD: 'stsd', // Sample description
	STTS: 'stts', // Time to sample
	STSC: 'stsc', // Sample to chunk
	STSZ: 'stsz', // Sample size
	STCO: 'stco', // Chunk offset
	CO64: 'co64', // 64-bit chunk offset
	STSS: 'stss', // Sync sample
	CTTS: 'ctts', // Composition time to sample

	// Video sample entries
	JPEG: 'jpeg', // Motion JPEG
	MJPA: 'mjpa', // Motion JPEG A
	MJPB: 'mjpb', // Motion JPEG B
	AVC1: 'avc1', // H.264/AVC
	HVC1: 'hvc1', // H.265/HEVC
	MP4V: 'mp4v', // MPEG-4 Visual
	APCH: 'apch', // Apple ProRes 422 HQ
	APCN: 'apcn', // Apple ProRes 422
	APCS: 'apcs', // Apple ProRes 422 LT
	APCO: 'apco', // Apple ProRes 422 Proxy
	AP4H: 'ap4h', // Apple ProRes 4444
	AP4X: 'ap4x', // Apple ProRes 4444 XQ

	// Audio sample entries
	MP4A: 'mp4a', // AAC
	LPCM: 'lpcm', // Linear PCM
	SOWT: 'sowt', // Little-endian PCM
	TWOS: 'twos', // Big-endian PCM
	AC3: 'ac-3', // AC-3
	EAC3: 'ec-3', // Enhanced AC-3

	// Codec config
	AVCC: 'avcC', // AVC configuration
	HVCC: 'hvcC', // HEVC configuration
	ESDS: 'esds', // ES descriptor
} as const

export type MovAtomTypeValue = (typeof MovAtomType)[keyof typeof MovAtomType]

/** QuickTime brand types */
export const MovBrand = {
	QT: 'qt  ', // QuickTime
	QT2001: 'qt2001', // QuickTime 2001
	QT2004: 'qt2004', // QuickTime 2004
	QT2005: 'qt2005', // QuickTime 2005
	QT2007: 'qt2007', // QuickTime 2007
	QTIF: 'qtif', // QuickTime Image File
	ISOM: 'isom', // ISO Base Media
	ISO2: 'iso2', // ISO Base Media v2
	M4V: 'M4V ', // iTunes video
	M4A: 'M4A ', // iTunes audio
} as const

export type MovBrandValue = (typeof MovBrand)[keyof typeof MovBrand]

/** Handler types */
export const MovHandlerType = {
	VIDEO: 'vide',
	AUDIO: 'soun',
	HINT: 'hint',
	META: 'meta',
	TEXT: 'text',
	TMCD: 'tmcd', // Timecode
} as const

export type MovHandlerTypeValue = (typeof MovHandlerType)[keyof typeof MovHandlerType]

/** MOV atom structure */
export interface MovAtom {
	/** Atom type (4 characters) */
	type: string
	/** Atom size (including header) */
	size: number
	/** Atom data offset in file */
	offset: number
	/** Atom data (excluding header) */
	data?: Uint8Array
	/** Child atoms (for container atoms) */
	children?: MovAtom[]
}

/** File type atom (ftyp) */
export interface MovFtyp {
	/** Major brand */
	majorBrand: string
	/** Minor version */
	minorVersion: number
	/** Compatible brands */
	compatibleBrands: string[]
}

/** Movie header atom (mvhd) */
export interface MovMvhd {
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

/** Track header atom (tkhd) */
export interface MovTkhd {
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

/** Media header atom (mdhd) */
export interface MovMdhd {
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

/** Handler reference atom (hdlr) */
export interface MovHdlr {
	/** Version */
	version: number
	/** Handler type */
	handlerType: string
	/** Name */
	name: string
}

/** Sample description entry */
export interface MovSampleEntry {
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
export interface MovSttsEntry {
	/** Sample count */
	sampleCount: number
	/** Sample delta */
	sampleDelta: number
}

/** Sample to chunk entry */
export interface MovStscEntry {
	/** First chunk */
	firstChunk: number
	/** Samples per chunk */
	samplesPerChunk: number
	/** Sample description index */
	sampleDescriptionIndex: number
}

/** Track info */
export interface MovTrack {
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
	sampleEntries: MovSampleEntry[]
	/** Sample count */
	sampleCount: number
	/** Sample sizes */
	sampleSizes: number[]
	/** Chunk offsets */
	chunkOffsets: number[]
	/** Time to sample entries */
	timeToSample: MovSttsEntry[]
	/** Sample to chunk entries */
	sampleToChunk: MovStscEntry[]
	/** Sync samples (key frames) */
	syncSamples?: number[]
}

/** MOV file info */
export interface MovInfo {
	/** File type */
	ftyp: MovFtyp
	/** Movie header */
	mvhd: MovMvhd
	/** Duration in seconds */
	duration: number
	/** Timescale */
	timescale: number
	/** Tracks */
	tracks: MovTrack[]
	/** Has video */
	hasVideo: boolean
	/** Has audio */
	hasAudio: boolean
	/** Video track */
	videoTrack?: MovTrack
	/** Audio track */
	audioTrack?: MovTrack
	/** Width */
	width: number
	/** Height */
	height: number
	/** Frame rate (estimated) */
	frameRate: number
}

/** MOV video data */
export interface MovVideo {
	/** File info */
	info: MovInfo
	/** All atoms */
	atoms: MovAtom[]
	/** Raw mdat data */
	mdatData?: Uint8Array
}

/** MOV encode options */
export interface MovEncodeOptions {
	/** Frame rate (default: 30) */
	frameRate?: number
	/** Timescale (default: 30000) */
	timescale?: number
	/** JPEG quality (default: 85) */
	quality?: number
	/** Brand (default: qt  ) */
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

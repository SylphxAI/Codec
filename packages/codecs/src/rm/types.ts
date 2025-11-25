/**
 * RealMedia (RM/RMVB) container format types
 * Chunk-based container for RealVideo and RealAudio streams
 */

/** RealMedia stream types */
export const RmStreamType = {
	/** Video stream (RealVideo) */
	VIDEO: 'VIDO',
	/** Audio stream (RealAudio) */
	AUDIO: 'SOUN',
	/** Data stream */
	DATA: 'DATA',
	/** Event stream */
	EVENT: 'EVNT',
} as const

export type RmStreamTypeValue = (typeof RmStreamType)[keyof typeof RmStreamType]

/** RealVideo codec types */
export const RealVideoCodec = {
	/** RealVideo 1.0 */
	RV10: 0x52563130, // 'RV10'
	/** RealVideo 2.0 */
	RV20: 0x52563230, // 'RV20'
	/** RealVideo 3.0 */
	RV30: 0x52563330, // 'RV30'
	/** RealVideo 4.0 */
	RV40: 0x52563430, // 'RV40'
} as const

export type RealVideoCodecValue = (typeof RealVideoCodec)[keyof typeof RealVideoCodec]

/** RealAudio codec types */
export const RealAudioCodec = {
	/** RealAudio 1.0 */
	RA10: 0x31344c50, // '.ra\xfd'
	/** RealAudio 2.0 */
	RA20: 0x32344c50, // '28_8'
	/** RealAudio 3.0 */
	RA30: 0x64647274, // 'dnet'
	/** RealAudio 4.0 */
	RA40: 0x73697072, // 'sipr'
	/** RealAudio Cook */
	COOK: 0x6b6f6f63, // 'cook'
	/** RealAudio AAC */
	AAC: 0x63616172, // 'raac'
} as const

export type RealAudioCodecValue = (typeof RealAudioCodec)[keyof typeof RealAudioCodec]

/** RealMedia file header (.RMF) */
export interface RmFileHeader {
	/** Magic number '.RMF' */
	magic: number
	/** File version (always 0) */
	version: number
	/** Number of headers */
	numHeaders: number
}

/** RealMedia properties header (PROP) */
export interface RmProperties {
	/** Maximum bitrate */
	maxBitRate: number
	/** Average bitrate */
	avgBitRate: number
	/** Maximum packet size */
	maxPacketSize: number
	/** Average packet size */
	avgPacketSize: number
	/** Number of packets */
	numPackets: number
	/** Duration in milliseconds */
	duration: number
	/** Preroll in milliseconds */
	preroll: number
	/** Index offset */
	indexOffset: number
	/** Data offset */
	dataOffset: number
	/** Number of streams */
	numStreams: number
	/** Flags */
	flags: number
}

/** RealMedia media properties (MDPR) */
export interface RmMediaProperties {
	/** Stream number */
	streamNumber: number
	/** Maximum bitrate */
	maxBitRate: number
	/** Average bitrate */
	avgBitRate: number
	/** Maximum packet size */
	maxPacketSize: number
	/** Average packet size */
	avgPacketSize: number
	/** Start time */
	startTime: number
	/** Preroll */
	preroll: number
	/** Duration */
	duration: number
	/** Stream name */
	streamName: string
	/** MIME type */
	mimeType: string
	/** Type-specific data */
	typeSpecificData: Uint8Array
}

/** RealVideo type-specific data */
export interface RealVideoSpecific {
	/** FourCC codec identifier */
	codec: number
	/** Width in pixels */
	width: number
	/** Height in pixels */
	height: number
	/** Frame rate (frames per second * 65536) */
	frameRate: number
	/** Bits per pixel */
	bitsPerPixel: number
}

/** RealAudio type-specific data */
export interface RealAudioSpecific {
	/** FourCC codec identifier */
	codec: number
	/** Sample rate */
	sampleRate: number
	/** Sample size (bits) */
	sampleSize: number
	/** Number of channels */
	channels: number
	/** Interleaver ID */
	interleaverId: number
	/** Codec-specific data */
	codecData: Uint8Array
}

/** RealMedia stream info */
export interface RmStream {
	/** Media properties */
	properties: RmMediaProperties
	/** Is video stream */
	isVideo: boolean
	/** Video-specific data (if video) */
	videoInfo?: RealVideoSpecific
	/** Audio-specific data (if audio) */
	audioInfo?: RealAudioSpecific
	/** Packets for this stream */
	packets: Array<{ timestamp: number; data: Uint8Array }>
}

/** RealMedia content description (CONT) */
export interface RmContentDescription {
	/** Title */
	title?: string
	/** Author */
	author?: string
	/** Copyright */
	copyright?: string
	/** Comment */
	comment?: string
}

/** RealMedia file info */
export interface RmInfo {
	/** File header */
	fileHeader: RmFileHeader
	/** Properties */
	properties: RmProperties
	/** Content description */
	contentDescription?: RmContentDescription
	/** Streams */
	streams: RmStream[]
	/** Width (from video stream) */
	width: number
	/** Height (from video stream) */
	height: number
	/** Frame rate */
	frameRate: number
	/** Duration in seconds */
	duration: number
	/** Has audio */
	hasAudio: boolean
	/** Audio sample rate */
	audioSampleRate?: number
	/** Audio channels */
	audioChannels?: number
}

/** RealMedia video data */
export interface RmVideo {
	/** File info */
	info: RmInfo
	/** Video packets (raw compressed data) */
	videoPackets: Array<{ timestamp: number; data: Uint8Array }>
	/** Audio packets (raw compressed data) */
	audioPackets?: Array<{ timestamp: number; data: Uint8Array }>
}

/** RealMedia encode options */
export interface RmEncodeOptions {
	/** Frame rate (default: 30) */
	frameRate?: number
	/** Video codec (default: RV40) */
	videoCodec?: RealVideoCodecValue | 'RV40' | 'RV30'
	/** Bitrate in kbps (default: 500) */
	bitrate?: number
	/** Title metadata */
	title?: string
	/** Author metadata */
	author?: string
	/** Copyright metadata */
	copyright?: string
	/** Comment metadata */
	comment?: string
}

// RealMedia chunk IDs (big-endian)
export const RM_MAGIC = 0x2e524d46 // '.RMF'
export const PROP_MAGIC = 0x50524f50 // 'PROP'
export const MDPR_MAGIC = 0x4d445052 // 'MDPR'
export const CONT_MAGIC = 0x434f4e54 // 'CONT'
export const DATA_MAGIC = 0x44415441 // 'DATA'
export const INDX_MAGIC = 0x494e4458 // 'INDX'

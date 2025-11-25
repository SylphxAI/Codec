/**
 * WMV (Windows Media Video) format types
 * Uses ASF (Advanced Systems Format) container with GUID-based structure
 */

/** GUID (128-bit globally unique identifier) */
export type GUID = Uint8Array // 16 bytes

/** ASF Object GUIDs (little-endian format) */
export const ASF_GUID = {
	/** ASF Header Object */
	HEADER: new Uint8Array([
		0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c,
	]),
	/** ASF File Properties Object */
	FILE_PROPERTIES: new Uint8Array([
		0xa1, 0xdc, 0xab, 0x8c, 0x47, 0xa9, 0xcf, 0x11, 0x8e, 0xe4, 0x00, 0xc0, 0x0c, 0x20, 0x53, 0x65,
	]),
	/** ASF Stream Properties Object */
	STREAM_PROPERTIES: new Uint8Array([
		0x91, 0x07, 0xdc, 0xb7, 0xb7, 0xa9, 0xcf, 0x11, 0x8e, 0xe6, 0x00, 0xc0, 0x0c, 0x20, 0x53, 0x65,
	]),
	/** ASF Header Extension Object */
	HEADER_EXTENSION: new Uint8Array([
		0xb5, 0x03, 0xbf, 0x5f, 0x2e, 0xa9, 0xcf, 0x11, 0x8e, 0xe3, 0x00, 0xc0, 0x0c, 0x20, 0x53, 0x65,
	]),
	/** ASF Content Description Object */
	CONTENT_DESCRIPTION: new Uint8Array([
		0x33, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c,
	]),
	/** ASF Data Object */
	DATA: new Uint8Array([
		0x36, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c,
	]),
	/** ASF Simple Index Object */
	INDEX: new Uint8Array([
		0x90, 0x08, 0x00, 0x33, 0xb1, 0xe5, 0xcf, 0x11, 0x89, 0xf4, 0x00, 0xa0, 0xc9, 0x03, 0x49, 0xcb,
	]),
	/** ASF Codec List Object */
	CODEC_LIST: new Uint8Array([
		0x40, 0x52, 0xd1, 0x86, 0x1d, 0x31, 0xd0, 0x11, 0xa3, 0xa4, 0x00, 0xa0, 0xc9, 0x03, 0x48, 0xf6,
	]),
	/** ASF Extended Stream Properties Object */
	EXTENDED_STREAM_PROPERTIES: new Uint8Array([
		0xcb, 0xa5, 0xe6, 0x14, 0x72, 0xc6, 0x32, 0x43, 0x83, 0x99, 0xa9, 0x69, 0x52, 0x06, 0x5b, 0x5a,
	]),
} as const

/** ASF Stream Type GUIDs */
export const ASF_STREAM_TYPE = {
	/** Video stream */
	VIDEO: new Uint8Array([
		0xc0, 0xef, 0x19, 0xbc, 0x4d, 0x5b, 0xcf, 0x11, 0xa8, 0xfd, 0x00, 0x80, 0x5f, 0x5c, 0x44, 0x2b,
	]),
	/** Audio stream */
	AUDIO: new Uint8Array([
		0x40, 0x9e, 0x69, 0xf8, 0x4d, 0x5b, 0xcf, 0x11, 0xa8, 0xfd, 0x00, 0x80, 0x5f, 0x5c, 0x44, 0x2b,
	]),
} as const

/** WMV video codecs (FourCC) */
export const WmvVideoCodec = {
	/** WMV1 (Windows Media Video 7) */
	WMV1: 0x31564d57, // 'WMV1'
	/** WMV2 (Windows Media Video 8) */
	WMV2: 0x32564d57, // 'WMV2'
	/** WMV3 (Windows Media Video 9) */
	WMV3: 0x33564d57, // 'WMV3'
	/** WMVA (Windows Media Video Advanced Profile) */
	WMVA: 0x41564d57, // 'WMVA'
	/** WVC1 (VC-1) */
	WVC1: 0x31435657, // 'WVC1'
} as const

export type WmvVideoCodecValue = (typeof WmvVideoCodec)[keyof typeof WmvVideoCodec]

/** ASF File Properties */
export interface AsfFileProperties {
	/** File ID (GUID) */
	fileId: GUID
	/** File size in bytes */
	fileSize: bigint
	/** Creation date (Windows FILETIME) */
	creationDate: bigint
	/** Total data packets */
	dataPacketsCount: bigint
	/** Play duration (100-nanosecond units) */
	playDuration: bigint
	/** Send duration (100-nanosecond units) */
	sendDuration: bigint
	/** Preroll (milliseconds) */
	preroll: bigint
	/** Flags */
	flags: number
	/** Minimum data packet size */
	minDataPacketSize: number
	/** Maximum data packet size */
	maxDataPacketSize: number
	/** Maximum bitrate */
	maxBitrate: number
}

/** BITMAPINFOHEADER for video stream */
export interface WmvBitmapInfo {
	/** Structure size */
	size: number
	/** Width */
	width: number
	/** Height */
	height: number
	/** Planes (always 1) */
	planes: number
	/** Bits per pixel */
	bitCount: number
	/** Compression (FourCC) */
	compression: number
	/** Image size in bytes */
	sizeImage: number
	/** X pixels per meter */
	xPelsPerMeter: number
	/** Y pixels per meter */
	yPelsPerMeter: number
	/** Colors used */
	clrUsed: number
	/** Important colors */
	clrImportant: number
}

/** WAVEFORMATEX for audio stream */
export interface WmvWaveFormat {
	/** Format tag */
	formatTag: number
	/** Number of channels */
	channels: number
	/** Samples per second */
	samplesPerSec: number
	/** Average bytes per second */
	avgBytesPerSec: number
	/** Block align */
	blockAlign: number
	/** Bits per sample */
	bitsPerSample: number
	/** Extra data size */
	cbSize: number
	/** Extra data */
	extraData?: Uint8Array
}

/** ASF Stream Properties */
export interface AsfStreamProperties {
	/** Stream type GUID */
	streamType: GUID
	/** Error correction type GUID */
	errorCorrectionType: GUID
	/** Time offset */
	timeOffset: bigint
	/** Type-specific data length */
	typeSpecificDataLength: number
	/** Error correction data length */
	errorCorrectionDataLength: number
	/** Flags */
	flags: number
	/** Stream number (1-127) */
	streamNumber: number
	/** Type-specific data (BITMAPINFOHEADER or WAVEFORMATEX) */
	typeSpecificData: Uint8Array
	/** Error correction data */
	errorCorrectionData: Uint8Array
	/** Is video stream */
	isVideo: boolean
	/** Parsed video format */
	videoFormat?: WmvBitmapInfo
	/** Parsed audio format */
	audioFormat?: WmvWaveFormat
}

/** ASF Header info */
export interface AsfHeader {
	/** Number of header objects */
	numberOfHeaderObjects: number
	/** Reserved1 */
	reserved1: number
	/** Reserved2 */
	reserved2: number
	/** File properties */
	fileProperties?: AsfFileProperties
	/** Stream properties */
	streams: AsfStreamProperties[]
	/** Header size */
	headerSize: bigint
}

/** WMV file info */
export interface WmvInfo {
	/** ASF header */
	header: AsfHeader
	/** Width (from video stream) */
	width: number
	/** Height (from video stream) */
	height: number
	/** Frame rate (estimated) */
	frameRate: number
	/** Duration in seconds */
	duration: number
	/** Total packets */
	totalPackets: number
	/** Has audio */
	hasAudio: boolean
	/** Audio sample rate */
	audioSampleRate?: number
	/** Audio channels */
	audioChannels?: number
	/** Video codec FourCC */
	videoCodec?: number
}

/** WMV video data */
export interface WmvVideo {
	/** File info */
	info: WmvInfo
	/** Video packet data (raw compressed) */
	videoPackets: Uint8Array[]
	/** Audio packet data (raw) */
	audioPackets?: Uint8Array[]
}

/** WMV encode options */
export interface WmvEncodeOptions {
	/** Frame rate (default: 30) */
	frameRate?: number
	/** Video codec (default: WMV3) */
	videoCodec?: WmvVideoCodecValue | 'WMV1' | 'WMV2' | 'WMV3'
	/** Bitrate in bits per second (default: 1000000) */
	bitrate?: number
}

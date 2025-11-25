/**
 * MPEG-TS (Transport Stream) types
 * Fixed-size packet-based container format
 */

/**
 * TS packet size
 */
export const TS_PACKET_SIZE = 188

/**
 * TS sync byte
 */
export const TS_SYNC_BYTE = 0x47

/**
 * Reserved PIDs
 */
export const TsPid = {
	PAT: 0x0000, // Program Association Table
	CAT: 0x0001, // Conditional Access Table
	TSDT: 0x0002, // Transport Stream Description Table
	NULL: 0x1fff, // Null packet (stuffing)
} as const

/**
 * Stream types
 */
export const TsStreamType = {
	MPEG1_VIDEO: 0x01,
	MPEG2_VIDEO: 0x02,
	MPEG1_AUDIO: 0x03,
	MPEG2_AUDIO: 0x04,
	PRIVATE_SECTIONS: 0x05,
	PES_PRIVATE: 0x06,
	MHEG: 0x07,
	DSM_CC: 0x08,
	H222_1: 0x09,
	H264: 0x1b,
	H265: 0x24,
	AAC: 0x0f,
	AAC_LATM: 0x11,
	MJPEG: 0x1c, // Motion JPEG
	JPEG: 0x21, // JPEG (per ATSC)
} as const

/**
 * Table IDs
 */
export const TsTableId = {
	PAT: 0x00,
	PMT: 0x02,
} as const

/**
 * TS packet structure
 */
export interface TsPacket {
	syncByte: number
	transportError: boolean
	payloadUnitStart: boolean
	transportPriority: boolean
	pid: number
	scrambling: number
	adaptationFieldControl: number
	continuityCounter: number
	adaptationField?: TsAdaptationField
	payload?: Uint8Array
}

/**
 * Adaptation field
 */
export interface TsAdaptationField {
	length: number
	discontinuity: boolean
	randomAccess: boolean
	priority: boolean
	pcrFlag: boolean
	opcrFlag: boolean
	splicingPointFlag: boolean
	privateDataFlag: boolean
	extensionFlag: boolean
	pcr?: number
	opcr?: number
	stuffingBytes: number
}

/**
 * Program Association Table entry
 */
export interface TsPatEntry {
	programNumber: number
	pid: number
}

/**
 * Program Map Table stream info
 */
export interface TsPmtStream {
	streamType: number
	pid: number
	descriptors: Uint8Array[]
}

/**
 * Program Map Table
 */
export interface TsPmt {
	programNumber: number
	pcrPid: number
	streams: TsPmtStream[]
}

/**
 * PES packet header
 */
export interface TsPesHeader {
	streamId: number
	packetLength: number
	scramblingControl: number
	priority: boolean
	dataAlignment: boolean
	copyright: boolean
	original: boolean
	ptsFlag: boolean
	dtsFlag: boolean
	pts?: number
	dts?: number
	headerLength: number
}

/**
 * TS file info
 */
export interface TsInfo {
	programs: TsPatEntry[]
	pmt?: TsPmt
	duration: number
	hasVideo: boolean
	hasAudio: boolean
	videoStreamType?: number
	audioStreamType?: number
}

/**
 * Decoded TS result
 */
export interface TsDecodeResult {
	info: TsInfo
	packets: TsPacket[]
	videoFrames: Uint8Array[]
	audioFrames: Uint8Array[]
}

/**
 * Encode options
 */
export interface TsEncodeOptions {
	programNumber?: number
	pmtPid?: number
	videoPid?: number
	pcrPid?: number
	frameRate?: number
}

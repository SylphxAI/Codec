/**
 * MPEG-PS (Program Stream) types
 * Variable-length pack-based container format (DVD/VOB)
 */

/**
 * Start codes
 */
export const PsStartCode = {
	PACK_HEADER: 0x000001ba,
	SYSTEM_HEADER: 0x000001bb,
	PROGRAM_STREAM_MAP: 0x000001bc,
	PRIVATE_STREAM_1: 0x000001bd,
	PADDING_STREAM: 0x000001be,
	PRIVATE_STREAM_2: 0x000001bf,
	// Video streams: 0x000001e0 - 0x000001ef
	// Audio streams: 0x000001c0 - 0x000001df
} as const

/**
 * Stream type constants
 */
export const PsStreamType = {
	MPEG1_VIDEO: 0x01,
	MPEG2_VIDEO: 0x02,
	MPEG1_AUDIO: 0x03,
	MPEG2_AUDIO: 0x04,
	PRIVATE_SECTIONS: 0x05,
	PES_PRIVATE: 0x06,
	H264: 0x1b,
	MJPEG: 0x1c,
	AAC: 0x0f,
	AC3: 0x81,
	DTS: 0x8a,
	LPCM: 0xa0,
} as const

/**
 * Pack header structure
 */
export interface PsPackHeader {
	scr: number // System Clock Reference (90kHz)
	scrExtension: number
	muxRate: number // in units of 50 bytes/second
	stuffingLength: number
}

/**
 * System header stream info
 */
export interface PsSystemHeaderStream {
	streamId: number
	bufferBoundScale: boolean
	bufferSizeBound: number
}

/**
 * System header structure
 */
export interface PsSystemHeader {
	rateBound: number
	audioBound: number
	fixedFlag: boolean
	cspsFlag: boolean
	systemAudioLockFlag: boolean
	systemVideoLockFlag: boolean
	videoBound: number
	packetRateRestriction: boolean
	streams: PsSystemHeaderStream[]
}

/**
 * PES packet header
 */
export interface PsPesHeader {
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
 * PES packet
 */
export interface PsPesPacket {
	header: PsPesHeader
	data: Uint8Array
}

/**
 * Pack structure (contains PES packets)
 */
export interface PsPack {
	header: PsPackHeader
	systemHeader?: PsSystemHeader
	pesPackets: PsPesPacket[]
}

/**
 * Stream info
 */
export interface PsStreamInfo {
	streamId: number
	streamType: number
	isVideo: boolean
	isAudio: boolean
}

/**
 * PS file info
 */
export interface PsInfo {
	duration: number
	streams: PsStreamInfo[]
	hasVideo: boolean
	hasAudio: boolean
	muxRate: number
	isMpeg2: boolean
}

/**
 * Decoded PS result
 */
export interface PsDecodeResult {
	info: PsInfo
	packs: PsPack[]
	videoFrames: Uint8Array[]
	audioFrames: Uint8Array[]
}

/**
 * Encode options
 */
export interface PsEncodeOptions {
	muxRate?: number // bytes/second
	frameRate?: number
	videoStreamId?: number
	audioStreamId?: number
}

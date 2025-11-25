/**
 * MPEG-1/2 Video types
 * Program Stream container with video elementary stream
 */

/**
 * MPEG start codes
 */
export const MpegStartCode = {
	PACK: 0x000001ba, // Pack header (MPEG-2 PS)
	SYSTEM: 0x000001bb, // System header
	PROGRAM_END: 0x000001b9, // Program end code
	// Video stream IDs: 0x000001E0 - 0x000001EF
	VIDEO: 0x000001e0,
	VIDEO_MIN: 0x000001e0,
	VIDEO_MAX: 0x000001ef,
	// Audio stream IDs: 0x000001C0 - 0x000001DF
	AUDIO_MIN: 0x000001c0,
	AUDIO_MAX: 0x000001df,
	// Video elementary stream codes
	SEQUENCE: 0x000001b3, // Sequence header
	GOP: 0x000001b8, // Group of Pictures
	PICTURE: 0x00000100, // Picture header
	EXTENSION: 0x000001b5, // Extension
	USER_DATA: 0x000001b2, // User data
	SEQUENCE_END: 0x000001b7, // Sequence end
	SLICE_START: 0x00000101, // First slice (0x01-0xAF)
	SLICE_END: 0x000001af, // Last slice
	// Padding
	PADDING: 0x000001be,
} as const

/**
 * MPEG-1/2 version
 */
export enum MpegVersion {
	MPEG1 = 1,
	MPEG2 = 2,
}

/**
 * Picture coding types (I, P, B frames)
 */
export enum PictureCodingType {
	FORBIDDEN = 0,
	I_FRAME = 1, // Intra-coded (keyframe)
	P_FRAME = 2, // Predictive-coded (forward prediction)
	B_FRAME = 3, // Bidirectionally predictive-coded
	D_FRAME = 4, // DC intra-coded (MPEG-1 only)
}

/**
 * Pack header structure (MPEG-2)
 */
export interface MpegPackHeader {
	version: MpegVersion
	systemClockReference: number // SCR in 90kHz units
	programMuxRate: number // In units of 50 bytes/second
}

/**
 * System header structure
 */
export interface MpegSystemHeader {
	rateBound: number
	audioBound: number
	videoBound: number
	fixedFlag: boolean
	cspsFlag: boolean
	systemAudioLockFlag: boolean
	systemVideoLockFlag: boolean
	streams: MpegStreamInfo[]
}

/**
 * Stream info in system header
 */
export interface MpegStreamInfo {
	streamId: number
	bufferBound: number
}

/**
 * PES (Packetized Elementary Stream) packet header
 */
export interface MpegPesHeader {
	streamId: number
	packetLength: number
	scramblingControl?: number
	priority?: boolean
	dataAlignment?: boolean
	copyright?: boolean
	original?: boolean
	ptsFlag?: boolean
	dtsFlag?: boolean
	pts?: number // Presentation timestamp in 90kHz units
	dts?: number // Decode timestamp in 90kHz units
	headerLength: number
}

/**
 * GOP (Group of Pictures) header
 */
export interface MpegGopHeader {
	timeCode: number
	closedGop: boolean
	brokenLink: boolean
	hours: number
	minutes: number
	seconds: number
	pictures: number
}

/**
 * Picture header (frame header)
 */
export interface MpegPictureHeader {
	temporalReference: number
	pictureCodingType: PictureCodingType
	vbvDelay: number
}

/**
 * Sequence header (video stream metadata)
 */
export interface MpegSequenceHeader {
	width: number
	height: number
	aspectRatio: number
	frameRate: number
	bitRate: number
	vbvBufferSize: number
	constrainedParametersFlag: boolean
}

/**
 * MPEG file info
 */
export interface MpegInfo {
	version: MpegVersion
	duration: number // milliseconds
	hasVideo: boolean
	hasAudio: boolean
	width: number
	height: number
	fps: number
	bitRate: number
	videoStreams: number[]
	audioStreams: number[]
}

/**
 * Decoded MPEG result
 */
export interface MpegDecodeResult {
	info: MpegInfo
	videoFrames: MpegVideoFrame[]
	audioFrames: MpegAudioFrame[]
}

/**
 * Video frame with metadata
 */
export interface MpegVideoFrame {
	data: Uint8Array
	pts: number // Presentation timestamp in 90kHz units
	dts?: number // Decode timestamp in 90kHz units
	type: PictureCodingType
	temporalReference: number
}

/**
 * Audio frame with metadata
 */
export interface MpegAudioFrame {
	data: Uint8Array
	pts: number
}

/**
 * Encode options
 */
export interface MpegEncodeOptions {
	version?: MpegVersion
	frameRate?: number
	bitRate?: number
	quality?: number
	gop?: number // GOP size (frames between keyframes)
}

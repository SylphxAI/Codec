/**
 * VOB (DVD Video) types
 * MPEG-2 Program Stream with DVD-specific navigation and subtitle packets
 */

/**
 * VOB start codes (extends MPEG-2 PS)
 */
export const VobStartCode = {
	// MPEG-2 PS codes
	PACK: 0x000001ba, // Pack header
	SYSTEM: 0x000001bb, // System header
	PROGRAM_END: 0x000001b9, // Program end code
	// Video stream IDs: 0x000001E0 - 0x000001EF
	VIDEO_MIN: 0x000001e0,
	VIDEO_MAX: 0x000001ef,
	// Audio stream IDs
	AUDIO_MIN: 0x000001c0, // MPEG audio
	AUDIO_MAX: 0x000001df,
	AC3_MIN: 0x000001bd, // Private stream 1 (AC3, DTS, subpictures, etc.)
	// DVD-specific
	PRIVATE_STREAM_1: 0x000001bd, // Subpictures, AC3, DTS, LPCM
	PRIVATE_STREAM_2: 0x000001bf, // Navigation packs
	PADDING: 0x000001be,
	// Video elementary stream codes
	SEQUENCE: 0x000001b3, // Sequence header
	GOP: 0x000001b8, // Group of Pictures
	PICTURE: 0x00000100, // Picture header
	EXTENSION: 0x000001b5, // Extension
	USER_DATA: 0x000001b2, // User data
	SEQUENCE_END: 0x000001b7, // Sequence end
} as const

/**
 * VOB version (MPEG-2 based)
 */
export enum VobVersion {
	MPEG2_PS = 2,
}

/**
 * Picture coding types (I, P, B frames)
 */
export enum PictureCodingType {
	FORBIDDEN = 0,
	I_FRAME = 1, // Intra-coded (keyframe)
	P_FRAME = 2, // Predictive-coded (forward prediction)
	B_FRAME = 3, // Bidirectionally predictive-coded
}

/**
 * DVD audio format types
 */
export enum DvdAudioFormat {
	AC3 = 0x80, // Dolby Digital (AC-3)
	DTS = 0x88, // DTS
	LPCM = 0xa0, // Linear PCM
	MPEG = 0xc0, // MPEG audio
}

/**
 * DVD subpicture (subtitle) format
 */
export enum DvdSubpictureFormat {
	SUBPICTURE = 0x20, // DVD subpicture stream
}

/**
 * Pack header structure (MPEG-2)
 */
export interface VobPackHeader {
	version: VobVersion
	systemClockReference: number // SCR in 90kHz units
	programMuxRate: number // In units of 50 bytes/second
	stuffingLength: number
}

/**
 * System header structure
 */
export interface VobSystemHeader {
	rateBound: number
	audioBound: number
	videoBound: number
	fixedFlag: boolean
	cspsFlag: boolean
	systemAudioLockFlag: boolean
	systemVideoLockFlag: boolean
	streams: VobStreamInfo[]
}

/**
 * Stream info in system header
 */
export interface VobStreamInfo {
	streamId: number
	bufferBound: number
}

/**
 * PES (Packetized Elementary Stream) packet header
 */
export interface VobPesHeader {
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
 * DVD Navigation Pack (NV_PCK)
 */
export interface VobNavigationPack {
	pci: VobPresentationControlInfo
	dsi: VobDataSearchInfo
}

/**
 * Presentation Control Information (PCI)
 */
export interface VobPresentationControlInfo {
	nv_pck_lbn: number // Logical block number
	vobu_cat: number // VOBU category
	vobu_s_ptm: number // VOBU start PTM
	vobu_e_ptm: number // VOBU end PTM
	vobu_se_e_ptm: number // VOBU sequence end PTM
}

/**
 * Data Search Information (DSI)
 */
export interface VobDataSearchInfo {
	dsi_gi: {
		nv_pck_scr: number // SCR of this navigation pack
		nv_pck_lbn: number // Logical block number
		vobu_ea: number // End address of VOBU
		vobu_1stref_ea: number // First reference end address
		vobu_2ndref_ea: number // Second reference end address
		vobu_3rdref_ea: number // Third reference end address
	}
}

/**
 * GOP (Group of Pictures) header
 */
export interface VobGopHeader {
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
export interface VobPictureHeader {
	temporalReference: number
	pictureCodingType: PictureCodingType
	vbvDelay: number
}

/**
 * Sequence header (video stream metadata)
 */
export interface VobSequenceHeader {
	width: number
	height: number
	aspectRatio: number
	frameRate: number
	bitRate: number
	vbvBufferSize: number
	constrainedParametersFlag: boolean
}

/**
 * VOB file info
 */
export interface VobInfo {
	version: VobVersion
	duration: number // milliseconds
	hasVideo: boolean
	hasAudio: boolean
	hasSubtitles: boolean
	hasNavigation: boolean
	width: number
	height: number
	fps: number
	bitRate: number
	videoStreams: number[]
	audioStreams: VobAudioStreamInfo[]
	subtitleStreams: number[]
}

/**
 * Audio stream information
 */
export interface VobAudioStreamInfo {
	streamId: number
	format: DvdAudioFormat
	language?: string
}

/**
 * Decoded VOB result
 */
export interface VobDecodeResult {
	info: VobInfo
	videoFrames: VobVideoFrame[]
	audioFrames: VobAudioFrame[]
	subtitleFrames: VobSubtitleFrame[]
	navigationPacks: VobNavigationPack[]
}

/**
 * Video frame with metadata
 */
export interface VobVideoFrame {
	data: Uint8Array
	pts: number // Presentation timestamp in 90kHz units
	dts?: number // Decode timestamp in 90kHz units
	type: PictureCodingType
	temporalReference: number
}

/**
 * Audio frame with metadata
 */
export interface VobAudioFrame {
	data: Uint8Array
	pts: number
	streamId: number
	format: DvdAudioFormat
}

/**
 * Subtitle frame with metadata
 */
export interface VobSubtitleFrame {
	data: Uint8Array
	pts: number
	streamId: number
}

/**
 * Encode options
 */
export interface VobEncodeOptions {
	frameRate?: number
	bitRate?: number
	quality?: number
	gop?: number // GOP size (frames between keyframes)
	includeNavigation?: boolean // Include DVD navigation packs
	aspectRatio?: number // DVD aspect ratio (4:3 = 1.33, 16:9 = 1.77)
}

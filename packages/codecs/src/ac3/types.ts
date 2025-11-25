/**
 * AC3 (Dolby Digital) audio codec types
 * Lossy audio compression format
 */

/**
 * AC3 sync word: 0x0B77
 */
export const AC3_SYNC_WORD = 0x0b77

/**
 * Supported sample rates (Hz)
 */
export const AC3_SAMPLE_RATES = [48000, 44100, 32000] as const

/**
 * Frame size codes (determines bitrate)
 * Each code corresponds to specific frame sizes at different sample rates
 */
export const AC3_FRAME_SIZES = [
	// 32 kbps
	[96, 69, 64],
	[96, 70, 64],
	// 40 kbps
	[120, 87, 80],
	[120, 88, 80],
	// 48 kbps
	[144, 104, 96],
	[144, 105, 96],
	// 56 kbps
	[168, 121, 112],
	[168, 122, 112],
	// 64 kbps
	[192, 139, 128],
	[192, 140, 128],
	// 80 kbps
	[240, 174, 160],
	[240, 175, 160],
	// 96 kbps
	[288, 208, 192],
	[288, 209, 192],
	// 112 kbps
	[336, 243, 224],
	[336, 244, 224],
	// 128 kbps
	[384, 278, 256],
	[384, 279, 256],
	// 160 kbps
	[480, 348, 320],
	[480, 349, 320],
	// 192 kbps
	[576, 417, 384],
	[576, 418, 384],
	// 224 kbps
	[672, 487, 448],
	[672, 488, 448],
	// 256 kbps
	[768, 557, 512],
	[768, 558, 512],
	// 320 kbps
	[960, 696, 640],
	[960, 697, 640],
	// 384 kbps
	[1152, 835, 768],
	[1152, 836, 768],
	// 448 kbps
	[1344, 975, 896],
	[1344, 976, 896],
	// 512 kbps
	[1536, 1114, 1024],
	[1536, 1115, 1024],
	// 576 kbps
	[1728, 1253, 1152],
	[1728, 1254, 1152],
	// 640 kbps
	[1920, 1393, 1280],
	[1920, 1394, 1280],
] as const

/**
 * Bitrates in kbps (derived from frame sizes)
 */
export const AC3_BITRATES = [
	32, 32, 40, 40, 48, 48, 56, 56, 64, 64, 80, 80, 96, 96, 112, 112, 128, 128, 160, 160, 192, 192, 224, 224, 256, 256,
	320, 320, 384, 384, 448, 448, 512, 512, 576, 576, 640, 640,
] as const

/**
 * AC3 channel mode
 */
export const AC3ChannelMode = {
	DUAL_MONO: 0, // 1+1 (Ch1, Ch2)
	MONO: 1, // 1/0 (C)
	STEREO: 2, // 2/0 (L, R)
	THREE_CHANNEL: 3, // 3/0 (L, C, R)
	SURROUND_2_1: 4, // 2/1 (L, R, S)
	SURROUND_3_1: 5, // 3/1 (L, C, R, S)
	SURROUND_2_2: 6, // 2/2 (L, R, SL, SR)
	SURROUND_3_2: 7, // 3/2 (L, C, R, SL, SR)
} as const

/**
 * AC3 stream info
 */
export interface AC3StreamInfo {
	sampleRate: number
	bitrate: number
	channels: number
	channelMode: number
	hasLfe: boolean // Low Frequency Effects channel (subwoofer)
	bitsPerSample: number
	frameSize: number
	totalFrames: number
	duration: number
}

/**
 * AC3 frame header
 */
export interface AC3FrameHeader {
	syncWord: number
	crc1: number
	sampleRateCode: number
	frameSizeCode: number
	sampleRate: number
	bitrate: number
	frameSize: number
	channelMode: number
	channels: number
	hasLfe: boolean
	bitsPerSample: number
	audioBlockCount: number // Always 6 for AC3
}

/**
 * AC3 audio block
 * Each frame contains 6 audio blocks, each with 256 samples
 */
export interface AC3AudioBlock {
	blockNumber: number
	samples: Int32Array[] // Per channel
}

/**
 * AC3 file info
 */
export interface AC3Info extends AC3StreamInfo {}

/**
 * Decoded AC3 result
 */
export interface AC3DecodeResult {
	info: AC3Info
	samples: Int32Array[] // One array per channel
}

/**
 * Audio data for encoding
 */
export interface AC3AudioData {
	samples: Int32Array[] // One array per channel
	sampleRate: number
	bitsPerSample: number
}

/**
 * AC3 encode options
 */
export interface AC3EncodeOptions {
	bitrate?: number // kbps (32-640), default 192
	channelMode?: number // AC3ChannelMode, auto-detect from channel count
	hasLfe?: boolean // Include LFE channel, default false
	copyright?: boolean // Copyright bit, default false
	originalBitstream?: boolean // Original bitstream, default true
}

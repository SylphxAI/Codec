/**
 * DTS (Digital Theater Systems) audio types
 * Multi-channel lossy audio compression format
 */

/**
 * DTS sync word: 0x7FFE8001 (32-bit, big-endian)
 */
export const DTS_SYNC_WORD = 0x7ffe8001

/**
 * DTS-HD sync word: 0x64582025 (32-bit, big-endian)
 */
export const DTS_HD_SYNC_WORD = 0x64582025

/**
 * Supported DTS sample rates (Hz)
 */
export const DTS_SAMPLE_RATES = [
	8000, 16000, 32000, 64000, 128000, // 0-4
	11025, 22050, 44100, 88200, 176400, // 5-9
	12000, 24000, 48000, 96000, 192000, // 10-14
] as const

/**
 * DTS frame types
 */
export const DtsFrameType = {
	TERMINATION: 0,
	NORMAL: 1,
} as const

/**
 * DTS audio channel arrangements
 */
export const DtsChannelArrangement = {
	MONO: 0, // A (mono)
	DUAL_MONO: 1, // A + B (dual mono)
	STEREO: 2, // L + R (stereo)
	STEREO_SUM_DIFF: 3, // (L+R) + (L-R) (sum-difference)
	LT_RT: 4, // LT + RT (left and right total)
	THREE_CHANNEL: 5, // C + L + R
	TWO_PLUS_ONE: 6, // L + R + S
	THREE_PLUS_ONE: 7, // C + L + R + S
	TWO_PLUS_TWO: 8, // L + R + SL + SR
	THREE_PLUS_TWO: 9, // C + L + R + SL + SR (5.0)
	FOUR_PLUS_ONE: 10, // CL + CR + L + R + S
	FOUR_PLUS_TWO: 11, // CL + CR + L + R + SL + SR
	THREE_PLUS_TWO_PLUS_ONE: 12, // C + L + R + LFE + SL + SR (5.1)
	THREE_PLUS_TWO_PLUS_TWO: 13, // C + L + R + SL1 + SL2 + SR1 + SR2
	ONE_PLUS_ONE: 14, // C + C
	USER_DEFINED: 15, // User defined
} as const

/**
 * DTS bitrate indices (kbps)
 */
export const DTS_BITRATES = [
	32, 56, 64, 96, 112, 128, 192, 224, 256, 320, 384, 448, 512, 576, 640, 754, 960, 1024, 1152,
	1280, 1344, 1408, 1411, 1472, 1536, 1920, 2048, 3072, 3840,
	// Open (variable bitrate)
	-1, -1, -1,
] as const

/**
 * DTS extension audio types
 */
export const DtsExtensionType = {
	NONE: 0,
	XCH: 2, // Extra channels
	X96: 6, // Extended bandwidth (96kHz)
	XXCH: 9, // Extra extra channels
	XBR: 12, // Extended bitrate
	LBR: 13, // Low bitrate
	XLL: 14, // Lossless
} as const

/**
 * DTS frame header
 */
export interface DtsFrameHeader {
	/** Frame type (0=termination, 1=normal) */
	frameType: number
	/** Number of PCM sample blocks (5-127, typical: 8) */
	sampleBlocks: number
	/** Primary frame byte size minus 1 */
	frameSize: number
	/** Audio channel arrangement */
	channelArrangement: number
	/** Core audio sample rate index */
	sampleRateIndex: number
	/** Sample rate in Hz */
	sampleRate: number
	/** Transmission bit rate index */
	bitrateIndex: number
	/** Bitrate in kbps (or -1 for variable) */
	bitrate: number
	/** Embedded dynamic range flag */
	dynamicRange: boolean
	/** Embedded time stamp flag */
	timestamp: boolean
	/** Auxiliary data flag */
	auxData: boolean
	/** HDCD mastering flag */
	hdcd: boolean
	/** Extension audio descriptor */
	extAudio: number
	/** Extended coding flag */
	extCoding: boolean
	/** Audio sync word insertion flag */
	aspf: boolean
	/** Low frequency effects (LFE) flag */
	lfe: boolean
	/** Predictor history flag switch */
	predictor: boolean
	/** Multirate interpolator switch */
	multirate: boolean
	/** Encoder software revision */
	version: number
	/** Copy history */
	copyHistory: number
	/** Source PCM resolution (16, 20, 24 bits) */
	pcmr: number
	/** Front sum/difference flag */
	sumDiff: boolean
	/** Surround sum/difference flag */
	surroundDiff: boolean
	/** Dialog normalization gain */
	dialogNorm: number
	/** CRC present */
	crcFlag: boolean
	/** Number of channels */
	channels: number
	/** Total PCM samples in frame */
	samplesPerFrame: number
}

/**
 * DTS subframe header
 */
export interface DtsSubframeHeader {
	/** Subband activity */
	subbandActivity: number[]
	/** High frequency VQ start subband */
	vqStartSubband: number[]
	/** Joint intensity coding index */
	jointIntensityIndex: number[]
	/** Transient mode code book */
	transientMode: number[]
	/** Scale factor code book */
	scaleFactorCodebook: number[]
	/** Bit allocation quantizer select */
	bitAllocation: number[]
	/** Quantization index codebook select */
	quantIndexCodebook: number[][]
	/** Scale factors */
	scaleFactors: number[][]
	/** Joint scale factors */
	jointScaleFactors: number[]
}

/**
 * DTS stream info
 */
export interface DtsInfo {
	/** Sample rate in Hz */
	sampleRate: number
	/** Number of channels */
	channels: number
	/** Bitrate in kbps (or -1 for variable) */
	bitrate: number
	/** Duration in seconds */
	duration: number
	/** Total number of frames */
	frameCount: number
	/** Channel arrangement */
	channelArrangement: number
	/** LFE channel present */
	lfe: boolean
	/** Source PCM resolution (16, 20, 24 bits) */
	pcmResolution: number
	/** Extension audio type */
	extensionType: number
	/** Is DTS-HD */
	isHD: boolean
}

/**
 * Decoded DTS result
 */
export interface DtsDecodeResult {
	/** Stream info */
	info: DtsInfo
	/** Decoded audio samples (Float32Array per channel, normalized -1 to 1) */
	samples: Float32Array[]
}

/**
 * Audio data for encoding
 */
export interface DtsAudioData {
	/** Audio samples (Float32Array per channel, normalized -1 to 1) */
	samples: Float32Array[]
	/** Sample rate in Hz */
	sampleRate: number
	/** Number of channels */
	channels: number
}

/**
 * DTS encode options
 */
export interface DtsEncodeOptions {
	/** Bitrate in kbps (default: 1536 for 5.1, 768 for stereo) */
	bitrate?: number
	/** Sample rate in Hz (default: 48000) */
	sampleRate?: number
	/** Channel arrangement (default: auto-detect from channel count) */
	channelArrangement?: number
	/** Include LFE channel (default: auto-detect) */
	lfe?: boolean
	/** PCM resolution (16, 20, 24 bits, default: 24) */
	pcmResolution?: number
	/** Dialog normalization (0-31, default: 0) */
	dialogNorm?: number
	/** Enable surround sum/difference encoding (default: true) */
	surroundDiff?: boolean
}

/**
 * DTS frame
 */
export interface DtsFrame {
	/** Frame header */
	header: DtsFrameHeader
	/** Subframe headers */
	subframes: DtsSubframeHeader[]
	/** Raw frame data */
	data: Uint8Array
	/** Decoded PCM samples (after decoding) */
	samples?: Float32Array[]
}

/**
 * Get channel count from channel arrangement
 */
export function getChannelCount(arrangement: number, lfe: boolean): number {
	const baseChannels = [
		1, // MONO
		2, // DUAL_MONO
		2, // STEREO
		2, // STEREO_SUM_DIFF
		2, // LT_RT
		3, // THREE_CHANNEL
		3, // TWO_PLUS_ONE
		4, // THREE_PLUS_ONE
		4, // TWO_PLUS_TWO
		5, // THREE_PLUS_TWO
		5, // FOUR_PLUS_ONE
		6, // FOUR_PLUS_TWO
		5, // THREE_PLUS_TWO_PLUS_ONE (without LFE in base)
		7, // THREE_PLUS_TWO_PLUS_TWO
		2, // ONE_PLUS_ONE
		0, // USER_DEFINED
	][arrangement]

	// LFE adds one channel if present (except arrangement 12 which includes it)
	if (arrangement === 12) {
		return baseChannels! + 1 // 5.1 is always 6 channels
	}

	return baseChannels! + (lfe ? 1 : 0)
}

/**
 * Get sample rate from index
 */
export function getSampleRate(index: number): number {
	if (index < 0 || index >= DTS_SAMPLE_RATES.length) {
		throw new Error(`Invalid sample rate index: ${index}`)
	}
	return DTS_SAMPLE_RATES[index]!
}

/**
 * Get bitrate from index
 */
export function getBitrate(index: number): number {
	if (index < 0 || index >= DTS_BITRATES.length) {
		throw new Error(`Invalid bitrate index: ${index}`)
	}
	return DTS_BITRATES[index]!
}

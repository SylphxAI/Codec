/**
 * ALAC (Apple Lossless Audio Codec) types
 * Lossless audio compression format, typically in M4A/MP4 container
 */

/**
 * ALAC magic cookie - identifies ALAC in container
 * In MP4/M4A: 'alac' atom
 */
export const ALAC_MAGIC = 0x616c6163 // 'alac'

/**
 * ALAC frame header constants
 */
export const ALAC_FRAME_LENGTH = 4096 // Default frame length
export const ALAC_MAX_CHANNELS = 8
export const ALAC_MAX_SAMPLE_SIZE = 32
export const ALAC_MIN_SAMPLE_SIZE = 8

/**
 * Channel layout constants
 */
export const AlacChannelLayout = {
	MONO: 1,
	STEREO: 2,
	TRIPLE: 3,
	QUAD: 4,
	PENTAGONAL: 5,
	HEXAGONAL: 6,
	OCTAGONAL: 8,
} as const

/**
 * Prediction type
 */
export const AlacPrediction = {
	NONE: 0,
	FIXED: 1,
	ADAPTIVE: 2,
} as const

/**
 * ALAC Specific Config (from 'alac' atom in container)
 */
export interface AlacSpecificConfig {
	frameLength: number // Frames per packet
	compatibleVersion: number // Version info
	bitDepth: number // Bits per sample
	pb: number // Rice history parameter b
	mb: number // Rice initial history
	kb: number // Rice parameter k modifier
	numChannels: number // Number of channels
	maxRun: number // Max run length
	maxFrameBytes: number // Max compressed frame size
	avgBitRate: number // Average bit rate
	sampleRate: number // Sample rate
}

/**
 * ALAC file info
 */
export interface AlacInfo {
	config: AlacSpecificConfig
	sampleRate: number
	channels: number
	bitDepth: number
	frameLength: number
	totalSamples: number
	duration: number
	avgBitRate?: number
}

/**
 * Decoded ALAC result
 */
export interface AlacDecodeResult {
	info: AlacInfo
	samples: Int32Array[] // One array per channel
}

/**
 * Audio data for encoding
 */
export interface AlacAudioData {
	samples: Int32Array[] // One array per channel
	sampleRate: number
	bitDepth: number
}

/**
 * Encode options
 */
export interface AlacEncodeOptions {
	frameLength?: number // Samples per frame, default 4096
	fastMode?: boolean // Fast encoding with less compression
	maxPredictionOrder?: number // Max LPC order for adaptive prediction
}

/**
 * Frame header info
 */
export interface AlacFrameHeader {
	numSamples: number // Samples in this frame
	channels: number // Number of channels
	uncompressed: boolean // Whether frame is uncompressed
	hasSize: boolean // Whether frame has size field
}

/**
 * Subframe info
 */
export interface AlacSubframe {
	predictionType: number
	predictionQuantization: number
	riceModifier: number
	coefficients?: Int32Array
	samples: Int32Array
}

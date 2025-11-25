/**
 * AAC (Advanced Audio Codec) types
 * Lossy audio compression format based on MDCT
 */

/**
 * AAC sync word: 0xFFF (12 bits)
 */
export const AAC_SYNC_WORD = 0xfff

/**
 * AAC profiles
 */
export const AacProfile = {
	MAIN: 0, // Main Profile
	LC: 1, // Low Complexity
	SSR: 2, // Scalable Sample Rate
	LTP: 3, // Long Term Prediction
	HE: 4, // High Efficiency (HE-AAC)
	HE_V2: 5, // High Efficiency v2 (HE-AAC v2)
} as const

/**
 * Supported AAC sample rates
 */
export const AAC_SAMPLE_RATES = [
	96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
] as const

/**
 * Channel configurations
 */
export const AacChannelConfig = {
	AOT_SPECIFIC: 0, // Defined in AudioSpecificConfig
	MONO: 1, // 1 channel: front-center
	STEREO: 2, // 2 channels: front-left, front-right
	THREE: 3, // 3 channels: front-center, front-left, front-right
	FOUR: 4, // 4 channels: front-center, front-left, front-right, back-center
	FIVE: 5, // 5 channels: front-center, front-left, front-right, back-left, back-right
	FIVE_ONE: 6, // 6 channels: 5.1 surround
	SEVEN_ONE: 7, // 8 channels: 7.1 surround
} as const

/**
 * ADTS header fixed part (28 bits without CRC, 44 bits with CRC)
 */
export interface AdtsHeader {
	syncWord: number // 12 bits - 0xFFF
	id: number // 1 bit - 0=MPEG-4, 1=MPEG-2
	layer: number // 2 bits - always 0
	protectionAbsent: number // 1 bit - 1=no CRC, 0=CRC present
	profile: number // 2 bits - profile - 1
	sampleRateIndex: number // 4 bits
	privateBit: number // 1 bit
	channelConfig: number // 3 bits
	originalCopy: number // 1 bit
	home: number // 1 bit
	// Variable part
	copyrightId: number // 1 bit
	copyrightStart: number // 1 bit
	frameLength: number // 13 bits - includes header
	bufferFullness: number // 11 bits - 0x7FF = VBR
	numRawDataBlocks: number // 2 bits - number of raw data blocks minus 1
}

/**
 * AAC stream info
 */
export interface AacInfo {
	profile: number
	sampleRate: number
	channels: number
	bitrate?: number
	duration?: number
	totalFrames?: number
	frameSize?: number
}

/**
 * Decoded AAC frame result
 */
export interface AacFrameData {
	samples: Float32Array[] // One array per channel
	header: AdtsHeader
}

/**
 * Decoded AAC result
 */
export interface AacDecodeResult {
	info: AacInfo
	samples: Float32Array[] // One array per channel
}

/**
 * Audio data for encoding
 */
export interface AacAudioData {
	samples: Float32Array[] // One array per channel
	sampleRate: number
	channels: number
}

/**
 * Encode options
 */
export interface AacEncodeOptions {
	profile?: number // AAC profile (default: LC)
	bitrate?: number // Target bitrate in kbps (default: 128)
	quality?: number // Quality 0-9 (0=best, default: 5)
	frameSize?: number // Samples per frame (1024 or 960, default: 1024)
}

/**
 * Spectral data (MDCT coefficients)
 */
export interface SpectralData {
	coefficients: Float32Array[] // One array per channel
	scaleFactors: number[]
	sectionInfo: SectionInfo[]
}

/**
 * Section information for Huffman coding
 */
export interface SectionInfo {
	codebookIndex: number
	startIndex: number
	endIndex: number
}

/**
 * Quantized spectral values
 */
export interface QuantizedSpectral {
	values: Int16Array[] // One array per channel
	scaleFactors: number[][]
	maxSfb: number // Maximum scale factor band
}

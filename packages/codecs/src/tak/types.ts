/**
 * TAK (Tom's Audio Kompressor) types
 * Lossless audio compression format with high compression ratios
 */

/**
 * TAK magic number: "tBaK"
 */
export const TAK_MAGIC = 0x7442614b

/**
 * TAK frame types
 */
export const TakFrameType = {
	STREAMINFO: 0,
	SEEKTABLE: 1,
	WAVEDATA: 2,
	ENCODER: 3,
	PADDING: 4,
	MD5: 5,
} as const

/**
 * TAK audio format info
 */
export interface TakFormat {
	dataType: number // 0 = integer PCM
	sampleRate: number
	channels: number
	bitsPerSample: number
	frameSize: number
	sampleCount: number
}

/**
 * TAK stream info
 */
export interface TakStreamInfo {
	format: TakFormat
	codecVersion: number
	frameSize: number
	restSize: number
	hasSeekTable: boolean
	hasMD5: boolean
}

/**
 * TAK seek point
 */
export interface TakSeekPoint {
	position: number // Byte position in file
	sample: number // Sample number
}

/**
 * TAK file info
 */
export interface TakInfo {
	streamInfo: TakStreamInfo
	seekTable?: TakSeekPoint[]
	md5?: Uint8Array
	encoder?: string
	sampleRate: number
	channels: number
	bitsPerSample: number
	totalSamples: number
	duration: number
}

/**
 * Decoded TAK result
 */
export interface TakDecodeResult {
	info: TakInfo
	samples: Int32Array[] // One array per channel
}

/**
 * Audio data for encoding
 */
export interface TakAudioData {
	samples: Int32Array[] // One array per channel
	sampleRate: number
	bitsPerSample: number
}

/**
 * Encode options
 */
export interface TakEncodeOptions {
	compressionLevel?: number // 0-4, default 2
	frameSize?: number // Samples per frame
	verifyEncoding?: boolean
}

/**
 * Frame header info
 */
export interface TakFrameHeader {
	frameType: number
	sampleCount: number
	channels: number
	bitsPerSample: number
	sampleRate: number
	crc: number
}

/**
 * WebP format types and constants
 */

// RIFF container
export const RIFF_SIGNATURE = 0x46464952 // 'RIFF' little-endian
export const WEBP_SIGNATURE = 0x50424557 // 'WEBP' little-endian

// Chunk types (4CC as little-endian u32)
export const CHUNK_VP8 = 0x20385056 // 'VP8 '
export const CHUNK_VP8L = 0x4c385056 // 'VP8L'
export const CHUNK_VP8X = 0x58385056 // 'VP8X'
export const CHUNK_ANIM = 0x4d494e41 // 'ANIM'
export const CHUNK_ANMF = 0x464d4e41 // 'ANMF'
export const CHUNK_ALPH = 0x48504c41 // 'ALPH'
export const CHUNK_ICCP = 0x50434349 // 'ICCP'
export const CHUNK_EXIF = 0x46495845 // 'EXIF'
export const CHUNK_XMP = 0x20504d58 // 'XMP '

// VP8L signature byte
export const VP8L_SIGNATURE = 0x2f

// VP8L transform types
export enum TransformType {
	Predictor = 0,
	ColorTransform = 1,
	SubtractGreen = 2,
	ColorIndexing = 3,
}

// VP8L prediction modes
export enum PredictionMode {
	Black = 0,
	Left = 1,
	Top = 2,
	TopRight = 3,
	Average = 4,
	PaethLeft = 5,
	PaethTop = 6,
	PaethAverage = 7,
	Average2 = 8,
	Average3 = 9,
	Average4 = 10,
	Select = 11,
	ClampAddSubFull = 12,
	ClampAddSubHalf = 13,
}

/**
 * WebP file header info
 */
export interface WebPHeader {
	fileSize: number
	hasAlpha: boolean
	hasAnimation: boolean
	hasICC: boolean
	hasExif: boolean
	hasXMP: boolean
	width: number
	height: number
}

/**
 * VP8L bitstream info
 */
export interface VP8LInfo {
	width: number
	height: number
	hasAlpha: boolean
	version: number
}

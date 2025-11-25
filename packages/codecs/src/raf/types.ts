/**
 * RAF (Fujifilm RAW) format types and constants
 */

// RAF signature
export const RAF_MAGIC = 'FUJIFILMCCD-RAW '

// RAF file structure offsets
export const RAF_HEADER_SIZE = 160
export const RAF_VERSION_OFFSET = 16
export const RAF_CAMERA_OFFSET = 24
export const RAF_DIRECTION_OFFSET = 72
export const RAF_JPEG_OFFSET = 84
export const RAF_JPEG_LENGTH = 88
export const RAF_CFA_OFFSET = 92
export const RAF_CFA_LENGTH = 96

// RAF version identifier
export const RAF_VERSION = '0100' // Standard RAF version

/**
 * RAF header structure
 */
export interface RAFHeader {
	magic: string
	version: string
	camera: string
	direction: string
	jpegImageOffset: number
	jpegImageLength: number
	cfaHeaderOffset: number
	cfaHeaderLength: number
}

/**
 * CFA (Color Filter Array) header
 */
export interface CFAHeader {
	width: number
	height: number
	bitsPerSample: number
	bayerPattern: number
	blackLevel: number
	whiteLevel: number
}

/**
 * Parsed RAF structure
 */
export interface RAFImage {
	header: RAFHeader
	jpegData?: Uint8Array
	rawData?: Uint8Array
	cfaHeader?: CFAHeader
}

/**
 * Bayer pattern types
 */
export enum BayerPattern {
	RGGB = 0, // Red-Green-Green-Blue
	GRBG = 1, // Green-Red-Blue-Green
	GBRG = 2, // Green-Blue-Red-Green
	BGGR = 3, // Blue-Green-Green-Red
}

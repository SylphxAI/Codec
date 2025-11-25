/**
 * QOI (Quite OK Image) format types and constants
 * https://qoiformat.org/qoi-specification.pdf
 */

// Magic bytes "qoif"
export const QOI_MAGIC = 0x716f6966

// Op codes
export const QOI_OP_RGB = 0xfe
export const QOI_OP_RGBA = 0xff
export const QOI_OP_INDEX = 0x00 // 00xxxxxx
export const QOI_OP_DIFF = 0x40 // 01xxxxxx
export const QOI_OP_LUMA = 0x80 // 10xxxxxx
export const QOI_OP_RUN = 0xc0 // 11xxxxxx

// Masks
export const QOI_MASK_2 = 0xc0

// Color space
export enum QoiColorSpace {
	SRGB = 0,
	Linear = 1,
}

// Channels
export enum QoiChannels {
	RGB = 3,
	RGBA = 4,
}

/**
 * QOI header structure (14 bytes)
 */
export interface QoiHeader {
	magic: number // "qoif"
	width: number // 32-bit big-endian
	height: number // 32-bit big-endian
	channels: QoiChannels // 3 = RGB, 4 = RGBA
	colorspace: QoiColorSpace // 0 = sRGB, 1 = linear
}

/**
 * RGBA pixel
 */
export interface QoiPixel {
	r: number
	g: number
	b: number
	a: number
}

/**
 * Calculate hash index for pixel
 */
export function qoiHash(pixel: QoiPixel): number {
	return (pixel.r * 3 + pixel.g * 5 + pixel.b * 7 + pixel.a * 11) % 64
}

/**
 * Compare two pixels for equality
 */
export function pixelsEqual(a: QoiPixel, b: QoiPixel): boolean {
	return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
}

/**
 * HDR (Radiance RGBE) format types and constants
 */

// HDR magic bytes
export const HDR_MAGIC = '#?RADIANCE'
export const HDR_MAGIC_ALT = '#?RGBE'

// Format identifiers
export const HDR_FORMAT_32BIT_RLE_RGBE = '32-bit_rle_rgbe'
export const HDR_FORMAT_32BIT_RLE_XYZE = '32-bit_rle_xyze'

/**
 * HDR header information
 */
export interface HdrHeader {
	format: string
	exposure: number
	gamma: number
	width: number
	height: number
}

/**
 * RGBE pixel (Red, Green, Blue, Exponent)
 */
export interface RgbePixel {
	r: number
	g: number
	b: number
	e: number
}

/**
 * Convert RGBE to linear RGB
 */
export function rgbeToRgb(rgbe: RgbePixel): { r: number; g: number; b: number } {
	if (rgbe.e === 0) {
		return { r: 0, g: 0, b: 0 }
	}

	const f = 2 ** (rgbe.e - 128 - 8)
	return {
		r: rgbe.r * f,
		g: rgbe.g * f,
		b: rgbe.b * f,
	}
}

/**
 * Convert linear RGB to RGBE
 */
export function rgbToRgbe(r: number, g: number, b: number): RgbePixel {
	const v = Math.max(r, g, b)

	if (v < 1e-32) {
		return { r: 0, g: 0, b: 0, e: 0 }
	}

	const e = Math.ceil(Math.log2(v)) + 128
	const f = 2 ** (e - 128 - 8)

	return {
		r: Math.min(255, Math.floor(r / f + 0.5)),
		g: Math.min(255, Math.floor(g / f + 0.5)),
		b: Math.min(255, Math.floor(b / f + 0.5)),
		e,
	}
}

/**
 * Tone map HDR value to 8-bit (simple Reinhard)
 */
export function toneMap(value: number): number {
	// Simple Reinhard tone mapping
	const mapped = value / (1 + value)
	// Gamma correction (sRGB)
	const gamma = mapped <= 0.0031308 ? mapped * 12.92 : 1.055 * mapped ** (1 / 2.4) - 0.055
	return Math.max(0, Math.min(255, Math.round(gamma * 255)))
}

/**
 * Inverse tone map 8-bit to linear (approximate)
 */
export function inverseToneMap(value: number): number {
	// Inverse gamma
	const normalized = value / 255
	const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
	// Inverse Reinhard (approximate, with small epsilon to avoid division by zero)
	return linear / Math.max(0.0001, 1 - linear)
}

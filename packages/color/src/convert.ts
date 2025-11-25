/**
 * Color space conversion utilities
 */

import type { CMYK, HSL, HSV, LAB, RGB } from './types'

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): HSL {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255

	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const l = (max + min) / 2

	if (max === min) {
		return [0, 0, l * 100]
	}

	const d = max - min
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

	let h = 0
	switch (max) {
		case rn:
			h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
			break
		case gn:
			h = ((bn - rn) / d + 2) / 6
			break
		case bn:
			h = ((rn - gn) / d + 4) / 6
			break
	}

	return [h * 360, s * 100, l * 100]
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(h: number, s: number, l: number): RGB {
	const hn = h / 360
	const sn = s / 100
	const ln = l / 100

	if (sn === 0) {
		const gray = Math.round(ln * 255)
		return [gray, gray, gray]
	}

	const hue2rgb = (p: number, q: number, t: number): number => {
		let tn = t
		if (tn < 0) tn += 1
		if (tn > 1) tn -= 1
		if (tn < 1 / 6) return p + (q - p) * 6 * tn
		if (tn < 1 / 2) return q
		if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6
		return p
	}

	const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
	const p = 2 * ln - q

	return [
		Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
		Math.round(hue2rgb(p, q, hn) * 255),
		Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
	]
}

/**
 * Convert RGB to HSV
 */
export function rgbToHsv(r: number, g: number, b: number): HSV {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255

	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const d = max - min

	const v = max
	const s = max === 0 ? 0 : d / max

	if (max === min) {
		return [0, s * 100, v * 100]
	}

	let h = 0
	switch (max) {
		case rn:
			h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
			break
		case gn:
			h = ((bn - rn) / d + 2) / 6
			break
		case bn:
			h = ((rn - gn) / d + 4) / 6
			break
	}

	return [h * 360, s * 100, v * 100]
}

/**
 * Convert HSV to RGB
 */
export function hsvToRgb(h: number, s: number, v: number): RGB {
	const hn = h / 360
	const sn = s / 100
	const vn = v / 100

	const i = Math.floor(hn * 6)
	const f = hn * 6 - i
	const p = vn * (1 - sn)
	const q = vn * (1 - f * sn)
	const t = vn * (1 - (1 - f) * sn)

	let rn = 0
	let gn = 0
	let bn = 0

	switch (i % 6) {
		case 0:
			rn = vn
			gn = t
			bn = p
			break
		case 1:
			rn = q
			gn = vn
			bn = p
			break
		case 2:
			rn = p
			gn = vn
			bn = t
			break
		case 3:
			rn = p
			gn = q
			bn = vn
			break
		case 4:
			rn = t
			gn = p
			bn = vn
			break
		case 5:
			rn = vn
			gn = p
			bn = q
			break
	}

	return [Math.round(rn * 255), Math.round(gn * 255), Math.round(bn * 255)]
}

/**
 * Convert RGB to CMYK
 */
export function rgbToCmyk(r: number, g: number, b: number): CMYK {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255

	const k = 1 - Math.max(rn, gn, bn)

	if (k === 1) {
		return [0, 0, 0, 100]
	}

	const c = (1 - rn - k) / (1 - k)
	const m = (1 - gn - k) / (1 - k)
	const y = (1 - bn - k) / (1 - k)

	return [c * 100, m * 100, y * 100, k * 100]
}

/**
 * Convert CMYK to RGB
 */
export function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
	const cn = c / 100
	const mn = m / 100
	const yn = y / 100
	const kn = k / 100

	return [
		Math.round(255 * (1 - cn) * (1 - kn)),
		Math.round(255 * (1 - mn) * (1 - kn)),
		Math.round(255 * (1 - yn) * (1 - kn)),
	]
}

/**
 * Convert RGB to LAB (CIE L*a*b*)
 */
export function rgbToLab(r: number, g: number, b: number): LAB {
	// First convert to XYZ
	let rn = r / 255
	let gn = g / 255
	let bn = b / 255

	// sRGB to linear
	rn = rn > 0.04045 ? ((rn + 0.055) / 1.055) ** 2.4 : rn / 12.92
	gn = gn > 0.04045 ? ((gn + 0.055) / 1.055) ** 2.4 : gn / 12.92
	bn = bn > 0.04045 ? ((bn + 0.055) / 1.055) ** 2.4 : bn / 12.92

	// RGB to XYZ (D65 illuminant)
	let x = (rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375) / 0.95047
	let y = (rn * 0.2126729 + gn * 0.7151522 + bn * 0.072175) / 1.0
	let z = (rn * 0.0193339 + gn * 0.119192 + bn * 0.9503041) / 1.08883

	// XYZ to LAB
	const epsilon = 0.008856
	const kappa = 903.3

	x = x > epsilon ? x ** (1 / 3) : (kappa * x + 16) / 116
	y = y > epsilon ? y ** (1 / 3) : (kappa * y + 16) / 116
	z = z > epsilon ? z ** (1 / 3) : (kappa * z + 16) / 116

	return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

/**
 * Convert LAB to RGB
 */
export function labToRgb(l: number, a: number, b: number): RGB {
	// LAB to XYZ
	const y = (l + 16) / 116
	const x = a / 500 + y
	const z = y - b / 200

	const epsilon = 0.008856
	const kappa = 903.3

	const x3 = x ** 3
	const y3 = y ** 3
	const z3 = z ** 3

	const xn = x3 > epsilon ? x3 : (116 * x - 16) / kappa
	const yn = y3 > epsilon ? y3 : (116 * y - 16) / kappa
	const zn = z3 > epsilon ? z3 : (116 * z - 16) / kappa

	// XYZ to RGB (D65 illuminant)
	let rn = xn * 0.95047 * 3.2404542 + yn * 1.0 * -1.5371385 + zn * 1.08883 * -0.4985314
	let gn = xn * 0.95047 * -0.969266 + yn * 1.0 * 1.8760108 + zn * 1.08883 * 0.041556
	let bn = xn * 0.95047 * 0.0556434 + yn * 1.0 * -0.2040259 + zn * 1.08883 * 1.0572252

	// Linear to sRGB
	rn = rn > 0.0031308 ? 1.055 * rn ** (1 / 2.4) - 0.055 : 12.92 * rn
	gn = gn > 0.0031308 ? 1.055 * gn ** (1 / 2.4) - 0.055 : 12.92 * gn
	bn = bn > 0.0031308 ? 1.055 * bn ** (1 / 2.4) - 0.055 : 12.92 * bn

	return [
		Math.max(0, Math.min(255, Math.round(rn * 255))),
		Math.max(0, Math.min(255, Math.round(gn * 255))),
		Math.max(0, Math.min(255, Math.round(bn * 255))),
	]
}

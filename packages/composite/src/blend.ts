/**
 * Blend mode implementations
 */

import type { BlendMode } from './types'

/**
 * Get blend function for a given mode
 */
export function getBlendFunction(mode: BlendMode): BlendFunction {
	return blendFunctions[mode]
}

type BlendFunction = (base: number, blend: number) => number

const blendFunctions: Record<BlendMode, BlendFunction> = {
	// Normal - just replaces
	normal: (_base, blend) => blend,

	// Darken modes
	darken: (base, blend) => Math.min(base, blend),

	multiply: (base, blend) => (base * blend) / 255,

	colorBurn: (base, blend) => {
		if (blend === 0) return 0
		return Math.max(0, 255 - ((255 - base) * 255) / blend)
	},

	linearBurn: (base, blend) => Math.max(0, base + blend - 255),

	// Lighten modes
	lighten: (base, blend) => Math.max(base, blend),

	screen: (base, blend) => 255 - ((255 - base) * (255 - blend)) / 255,

	colorDodge: (base, blend) => {
		if (blend === 255) return 255
		return Math.min(255, (base * 255) / (255 - blend))
	},

	linearDodge: (base, blend) => Math.min(255, base + blend),

	// Contrast modes
	overlay: (base, blend) => {
		return base < 128 ? (2 * base * blend) / 255 : 255 - (2 * (255 - base) * (255 - blend)) / 255
	},

	softLight: (base, blend) => {
		const b = base / 255
		const s = blend / 255
		let result: number
		if (s <= 0.5) {
			result = b - (1 - 2 * s) * b * (1 - b)
		} else {
			const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)
			result = b + (2 * s - 1) * (d - b)
		}
		return result * 255
	},

	hardLight: (base, blend) => {
		return blend < 128 ? (2 * base * blend) / 255 : 255 - (2 * (255 - base) * (255 - blend)) / 255
	},

	vividLight: (base, blend) => {
		if (blend < 128) {
			// Color burn
			const b = blend * 2
			if (b === 0) return 0
			return Math.max(0, 255 - ((255 - base) * 255) / b)
		}
		// Color dodge
		const b = (blend - 128) * 2
		if (b === 255) return 255
		return Math.min(255, (base * 255) / (255 - b))
	},

	linearLight: (base, blend) => {
		return Math.max(0, Math.min(255, base + 2 * blend - 255))
	},

	pinLight: (base, blend) => {
		if (blend < 128) {
			return Math.min(base, 2 * blend)
		}
		return Math.max(base, 2 * (blend - 128))
	},

	hardMix: (base, blend) => {
		return base + blend >= 255 ? 255 : 0
	},

	// Inversion modes
	difference: (base, blend) => Math.abs(base - blend),

	exclusion: (base, blend) => base + blend - (2 * base * blend) / 255,

	subtract: (base, blend) => Math.max(0, base - blend),

	divide: (base, blend) => {
		if (blend === 0) return 255
		return Math.min(255, (base * 255) / blend)
	},

	// Component modes - these need HSL conversion
	hue: (base, blend) => blend, // Placeholder - handled specially
	saturation: (base, blend) => blend,
	color: (base, blend) => blend,
	luminosity: (base, blend) => blend,
}

/**
 * Check if blend mode requires HSL conversion
 */
export function isComponentBlendMode(mode: BlendMode): boolean {
	return mode === 'hue' || mode === 'saturation' || mode === 'color' || mode === 'luminosity'
}

/**
 * Blend RGB colors using component blend modes (hue, saturation, color, luminosity)
 */
export function blendComponent(
	baseR: number,
	baseG: number,
	baseB: number,
	blendR: number,
	blendG: number,
	blendB: number,
	mode: BlendMode
): [number, number, number] {
	const baseHsl = rgbToHsl(baseR, baseG, baseB)
	const blendHsl = rgbToHsl(blendR, blendG, blendB)

	let resultH: number
	let resultS: number
	let resultL: number

	switch (mode) {
		case 'hue':
			resultH = blendHsl[0]
			resultS = baseHsl[1]
			resultL = baseHsl[2]
			break
		case 'saturation':
			resultH = baseHsl[0]
			resultS = blendHsl[1]
			resultL = baseHsl[2]
			break
		case 'color':
			resultH = blendHsl[0]
			resultS = blendHsl[1]
			resultL = baseHsl[2]
			break
		case 'luminosity':
			resultH = baseHsl[0]
			resultS = baseHsl[1]
			resultL = blendHsl[2]
			break
		default:
			return [blendR, blendG, blendB]
	}

	return hslToRgb(resultH, resultS, resultL)
}

// Simple RGB to HSL conversion
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255

	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const l = (max + min) / 2

	if (max === min) {
		return [0, 0, l]
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

	return [h, s, l]
}

// Simple HSL to RGB conversion
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	if (s === 0) {
		const gray = Math.round(l * 255)
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

	const q = l < 0.5 ? l * (1 + s) : l + s - l * s
	const p = 2 * l - q

	return [
		Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
		Math.round(hue2rgb(p, q, h) * 255),
		Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
	]
}

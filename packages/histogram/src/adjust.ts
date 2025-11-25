/**
 * Histogram-based adjustments
 */

import type { ImageData } from '@sylphx/codec-core'
import { calculateCDF, calculateHistogram, findPercentile } from './analyze'
import type { AutoContrastOptions, AutoLevelsOptions, EqualizeOptions } from './types'

/**
 * Auto-levels adjustment
 * Stretches histogram to use full range
 */
export function autoLevels(image: ImageData, options: AutoLevelsOptions = {}): ImageData {
	const { shadowClip = 0.1, highlightClip = 0.1, perChannel = false } = options
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	const histogram = calculateHistogram(image)

	if (perChannel) {
		// Calculate levels for each channel separately
		const rMin = findPercentile(histogram.red, shadowClip)
		const rMax = findPercentile(histogram.red, 100 - highlightClip)
		const gMin = findPercentile(histogram.green, shadowClip)
		const gMax = findPercentile(histogram.green, 100 - highlightClip)
		const bMin = findPercentile(histogram.blue, shadowClip)
		const bMax = findPercentile(histogram.blue, 100 - highlightClip)

		const rLut = createStretchLUT(rMin, rMax)
		const gLut = createStretchLUT(gMin, gMax)
		const bLut = createStretchLUT(bMin, bMax)

		for (let i = 0; i < data.length; i += 4) {
			output[i] = rLut[data[i]!]!
			output[i + 1] = gLut[data[i + 1]!]!
			output[i + 2] = bLut[data[i + 2]!]!
			output[i + 3] = data[i + 3]!
		}
	} else {
		// Use luminance for all channels
		const lMin = findPercentile(histogram.luminance, shadowClip)
		const lMax = findPercentile(histogram.luminance, 100 - highlightClip)
		const lut = createStretchLUT(lMin, lMax)

		for (let i = 0; i < data.length; i += 4) {
			output[i] = lut[data[i]!]!
			output[i + 1] = lut[data[i + 1]!]!
			output[i + 2] = lut[data[i + 2]!]!
			output[i + 3] = data[i + 3]!
		}
	}

	return { width, height, data: output }
}

/**
 * Auto-contrast adjustment
 */
export function autoContrast(image: ImageData, options: AutoContrastOptions = {}): ImageData {
	const { clip = 0.5 } = options
	return autoLevels(image, { shadowClip: clip, highlightClip: clip, perChannel: false })
}

/**
 * Histogram equalization
 */
export function equalize(image: ImageData, options: EqualizeOptions = {}): ImageData {
	const { perChannel = false } = options
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	const histogram = calculateHistogram(image)

	if (perChannel) {
		const rCdf = calculateCDF(histogram.red)
		const gCdf = calculateCDF(histogram.green)
		const bCdf = calculateCDF(histogram.blue)

		const rLut = createEqualizeLUT(rCdf)
		const gLut = createEqualizeLUT(gCdf)
		const bLut = createEqualizeLUT(bCdf)

		for (let i = 0; i < data.length; i += 4) {
			output[i] = rLut[data[i]!]!
			output[i + 1] = gLut[data[i + 1]!]!
			output[i + 2] = bLut[data[i + 2]!]!
			output[i + 3] = data[i + 3]!
		}
	} else {
		// Equalize luminance only
		const lCdf = calculateCDF(histogram.luminance)
		const lut = createEqualizeLUT(lCdf)

		for (let i = 0; i < data.length; i += 4) {
			const r = data[i]!
			const g = data[i + 1]!
			const b = data[i + 2]!

			// Calculate current luminance
			const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
			const newLum = lut[lum]!

			// Scale RGB to match new luminance
			if (lum === 0) {
				output[i] = newLum
				output[i + 1] = newLum
				output[i + 2] = newLum
			} else {
				const scale = newLum / lum
				output[i] = clamp(Math.round(r * scale))
				output[i + 1] = clamp(Math.round(g * scale))
				output[i + 2] = clamp(Math.round(b * scale))
			}
			output[i + 3] = data[i + 3]!
		}
	}

	return { width, height, data: output }
}

/**
 * Match histogram to reference image
 */
export function matchHistogram(image: ImageData, reference: ImageData): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	const srcHist = calculateHistogram(image)
	const refHist = calculateHistogram(reference)

	const rLut = createMatchLUT(srcHist.red, refHist.red)
	const gLut = createMatchLUT(srcHist.green, refHist.green)
	const bLut = createMatchLUT(srcHist.blue, refHist.blue)

	for (let i = 0; i < data.length; i += 4) {
		output[i] = rLut[data[i]!]!
		output[i + 1] = gLut[data[i + 1]!]!
		output[i + 2] = bLut[data[i + 2]!]!
		output[i + 3] = data[i + 3]!
	}

	return { width, height, data: output }
}

/**
 * Normalize image (stretch to 0-255)
 */
export function normalize(image: ImageData): ImageData {
	return autoLevels(image, { shadowClip: 0, highlightClip: 0, perChannel: true })
}

function createStretchLUT(min: number, max: number): Uint8Array {
	const lut = new Uint8Array(256)
	const range = max - min

	if (range <= 0) {
		// All same value
		for (let i = 0; i < 256; i++) {
			lut[i] = 128
		}
		return lut
	}

	for (let i = 0; i < 256; i++) {
		if (i <= min) {
			lut[i] = 0
		} else if (i >= max) {
			lut[i] = 255
		} else {
			lut[i] = Math.round(((i - min) / range) * 255)
		}
	}

	return lut
}

function createEqualizeLUT(cdf: Float64Array): Uint8Array {
	const lut = new Uint8Array(256)

	// Find first non-zero CDF value
	let cdfMin = 0
	for (let i = 0; i < 256; i++) {
		if (cdf[i]! > 0) {
			cdfMin = cdf[i]!
			break
		}
	}

	for (let i = 0; i < 256; i++) {
		lut[i] = Math.round(((cdf[i]! - cdfMin) / (1 - cdfMin)) * 255)
	}

	return lut
}

function createMatchLUT(srcHist: Uint32Array, refHist: Uint32Array): Uint8Array {
	const lut = new Uint8Array(256)
	const srcCdf = calculateCDF(srcHist)
	const refCdf = calculateCDF(refHist)

	for (let i = 0; i < 256; i++) {
		const srcVal = srcCdf[i]!
		// Find closest match in reference CDF
		let best = 0
		let bestDiff = Math.abs(refCdf[0]! - srcVal)

		for (let j = 1; j < 256; j++) {
			const diff = Math.abs(refCdf[j]! - srcVal)
			if (diff < bestDiff) {
				bestDiff = diff
				best = j
			}
		}

		lut[i] = best
	}

	return lut
}

function clamp(value: number): number {
	return Math.max(0, Math.min(255, value))
}

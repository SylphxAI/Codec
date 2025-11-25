/**
 * Color adjustment operations
 */

import type { ImageData } from '@mconv/core'
import { hslToRgb, rgbToHsl } from './convert'
import type { AdjustmentOptions, LevelsOptions } from './types'

/**
 * Apply multiple color adjustments to an image
 */
export function adjust(image: ImageData, options: AdjustmentOptions): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	const { brightness = 0, contrast = 0, saturation = 0, hue = 0, gamma = 1 } = options

	// Precompute contrast factor
	const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast))

	// Precompute gamma LUT
	const gammaLut = new Uint8Array(256)
	for (let i = 0; i < 256; i++) {
		gammaLut[i] = Math.round(255 * (i / 255) ** (1 / gamma))
	}

	for (let i = 0; i < data.length; i += 4) {
		let r = data[i]!
		let g = data[i + 1]!
		let b = data[i + 2]!
		const a = data[i + 3]!

		// Apply brightness
		if (brightness !== 0) {
			const factor = brightness / 100
			r = clamp(r + factor * 255)
			g = clamp(g + factor * 255)
			b = clamp(b + factor * 255)
		}

		// Apply contrast
		if (contrast !== 0) {
			r = clamp(contrastFactor * (r - 128) + 128)
			g = clamp(contrastFactor * (g - 128) + 128)
			b = clamp(contrastFactor * (b - 128) + 128)
		}

		// Apply saturation and hue in HSL space
		if (saturation !== 0 || hue !== 0) {
			const [h, s, l] = rgbToHsl(r, g, b)
			const newH = (h + hue + 360) % 360
			const newS = clamp(s + saturation, 0, 100)
			;[r, g, b] = hslToRgb(newH, newS, l)
		}

		// Apply gamma
		if (gamma !== 1) {
			r = gammaLut[r]!
			g = gammaLut[g]!
			b = gammaLut[b]!
		}

		output[i] = r
		output[i + 1] = g
		output[i + 2] = b
		output[i + 3] = a
	}

	return { width, height, data: output }
}

/**
 * Adjust brightness
 */
export function brightness(image: ImageData, amount: number): ImageData {
	return adjust(image, { brightness: amount })
}

/**
 * Adjust contrast
 */
export function contrast(image: ImageData, amount: number): ImageData {
	return adjust(image, { contrast: amount })
}

/**
 * Adjust saturation
 */
export function saturation(image: ImageData, amount: number): ImageData {
	return adjust(image, { saturation: amount })
}

/**
 * Rotate hue
 */
export function hueRotate(image: ImageData, degrees: number): ImageData {
	return adjust(image, { hue: degrees })
}

/**
 * Apply gamma correction
 */
export function gamma(image: ImageData, value: number): ImageData {
	return adjust(image, { gamma: value })
}

/**
 * Apply levels adjustment
 */
export function levels(image: ImageData, options: LevelsOptions): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	const {
		inputBlack = 0,
		inputWhite = 255,
		outputBlack = 0,
		outputWhite = 255,
		gamma: gammaValue = 1,
	} = options

	// Build lookup table
	const lut = new Uint8Array(256)
	const inputRange = inputWhite - inputBlack
	const outputRange = outputWhite - outputBlack

	for (let i = 0; i < 256; i++) {
		// Normalize to input range
		let value = (i - inputBlack) / inputRange
		value = Math.max(0, Math.min(1, value))

		// Apply gamma
		value = value ** (1 / gammaValue)

		// Map to output range
		value = value * outputRange + outputBlack

		lut[i] = Math.round(Math.max(0, Math.min(255, value)))
	}

	for (let i = 0; i < data.length; i += 4) {
		output[i] = lut[data[i]!]!
		output[i + 1] = lut[data[i + 1]!]!
		output[i + 2] = lut[data[i + 2]!]!
		output[i + 3] = data[i + 3]!
	}

	return { width, height, data: output }
}

/**
 * Invert colors
 */
export function invert(image: ImageData): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	for (let i = 0; i < data.length; i += 4) {
		output[i] = 255 - data[i]!
		output[i + 1] = 255 - data[i + 1]!
		output[i + 2] = 255 - data[i + 2]!
		output[i + 3] = data[i + 3]!
	}

	return { width, height, data: output }
}

/**
 * Convert to grayscale
 */
export function grayscale(
	image: ImageData,
	method: 'luminosity' | 'average' | 'lightness' = 'luminosity'
): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i]!
		const g = data[i + 1]!
		const b = data[i + 2]!

		let gray: number
		switch (method) {
			case 'luminosity':
				gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
				break
			case 'average':
				gray = Math.round((r + g + b) / 3)
				break
			case 'lightness':
				gray = Math.round((Math.max(r, g, b) + Math.min(r, g, b)) / 2)
				break
		}

		output[i] = gray
		output[i + 1] = gray
		output[i + 2] = gray
		output[i + 3] = data[i + 3]!
	}

	return { width, height, data: output }
}

/**
 * Apply sepia tone
 */
export function sepia(image: ImageData, amount = 100): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)
	const factor = amount / 100

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i]!
		const g = data[i + 1]!
		const b = data[i + 2]!

		const sepiaR = 0.393 * r + 0.769 * g + 0.189 * b
		const sepiaG = 0.349 * r + 0.686 * g + 0.168 * b
		const sepiaB = 0.272 * r + 0.534 * g + 0.131 * b

		output[i] = clamp(r + factor * (sepiaR - r))
		output[i + 1] = clamp(g + factor * (sepiaG - g))
		output[i + 2] = clamp(b + factor * (sepiaB - b))
		output[i + 3] = data[i + 3]!
	}

	return { width, height, data: output }
}

/**
 * Threshold to black and white
 */
export function threshold(image: ImageData, thresholdValue = 128): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i]!
		const g = data[i + 1]!
		const b = data[i + 2]!
		const gray = 0.299 * r + 0.587 * g + 0.114 * b
		const value = gray >= thresholdValue ? 255 : 0

		output[i] = value
		output[i + 1] = value
		output[i + 2] = value
		output[i + 3] = data[i + 3]!
	}

	return { width, height, data: output }
}

/**
 * Posterize (reduce color levels)
 */
export function posterize(image: ImageData, levelsCount = 4): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	const step = 255 / (levelsCount - 1)

	for (let i = 0; i < data.length; i += 4) {
		output[i] = Math.round(Math.round(data[i]! / step) * step)
		output[i + 1] = Math.round(Math.round(data[i + 1]! / step) * step)
		output[i + 2] = Math.round(Math.round(data[i + 2]! / step) * step)
		output[i + 3] = data[i + 3]!
	}

	return { width, height, data: output }
}

function clamp(value: number, min = 0, max = 255): number {
	return Math.max(min, Math.min(max, Math.round(value)))
}

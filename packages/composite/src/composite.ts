/**
 * Image compositing operations
 */

import type { ImageData } from '@sylphx/codec-core'
import { blendComponent, getBlendFunction, isComponentBlendMode } from './blend'
import type { BlendMode, CompositeOptions, Layer } from './types'

/**
 * Composite two images together
 */
export function composite(
	base: ImageData,
	overlay: ImageData,
	options: CompositeOptions = {}
): ImageData {
	const { x = 0, y = 0, blendMode = 'normal', opacity = 1 } = options

	const { width, height, data } = base
	const output = new Uint8Array(data)

	const useComponentBlend = isComponentBlendMode(blendMode)
	const blendFn = getBlendFunction(blendMode)

	for (let oy = 0; oy < overlay.height; oy++) {
		const destY = y + oy
		if (destY < 0 || destY >= height) continue

		for (let ox = 0; ox < overlay.width; ox++) {
			const destX = x + ox
			if (destX < 0 || destX >= width) continue

			const baseIdx = (destY * width + destX) * 4
			const overlayIdx = (oy * overlay.width + ox) * 4

			const baseR = data[baseIdx]!
			const baseG = data[baseIdx + 1]!
			const baseB = data[baseIdx + 2]!
			const baseA = data[baseIdx + 3]!

			const overlayR = overlay.data[overlayIdx]!
			const overlayG = overlay.data[overlayIdx + 1]!
			const overlayB = overlay.data[overlayIdx + 2]!
			const overlayA = overlay.data[overlayIdx + 3]!

			// Calculate effective alpha
			const effectiveAlpha = (overlayA / 255) * opacity

			if (effectiveAlpha === 0) continue

			// Apply blend mode
			let blendedR: number
			let blendedG: number
			let blendedB: number

			if (useComponentBlend) {
				;[blendedR, blendedG, blendedB] = blendComponent(
					baseR,
					baseG,
					baseB,
					overlayR,
					overlayG,
					overlayB,
					blendMode
				)
			} else {
				blendedR = blendFn(baseR, overlayR)
				blendedG = blendFn(baseG, overlayG)
				blendedB = blendFn(baseB, overlayB)
			}

			// Alpha compositing
			output[baseIdx] = Math.round(baseR * (1 - effectiveAlpha) + blendedR * effectiveAlpha)
			output[baseIdx + 1] = Math.round(baseG * (1 - effectiveAlpha) + blendedG * effectiveAlpha)
			output[baseIdx + 2] = Math.round(baseB * (1 - effectiveAlpha) + blendedB * effectiveAlpha)
			output[baseIdx + 3] = Math.max(baseA, Math.round(overlayA * opacity))
		}
	}

	return { width, height, data: output }
}

/**
 * Flatten multiple layers into a single image
 */
export function flattenLayers(layers: Layer[], width: number, height: number): ImageData {
	// Start with transparent background
	const output = new Uint8Array(width * height * 4)

	for (const layer of layers) {
		if (layer.visible === false) continue

		const { image, x = 0, y = 0, blendMode = 'normal', opacity = 1 } = layer

		const useComponentBlend = isComponentBlendMode(blendMode)
		const blendFn = getBlendFunction(blendMode)

		for (let ly = 0; ly < image.height; ly++) {
			const destY = y + ly
			if (destY < 0 || destY >= height) continue

			for (let lx = 0; lx < image.width; lx++) {
				const destX = x + lx
				if (destX < 0 || destX >= width) continue

				const destIdx = (destY * width + destX) * 4
				const srcIdx = (ly * image.width + lx) * 4

				const baseR = output[destIdx]!
				const baseG = output[destIdx + 1]!
				const baseB = output[destIdx + 2]!
				const baseA = output[destIdx + 3]!

				const layerR = image.data[srcIdx]!
				const layerG = image.data[srcIdx + 1]!
				const layerB = image.data[srcIdx + 2]!
				const layerA = image.data[srcIdx + 3]!

				const effectiveAlpha = (layerA / 255) * opacity

				if (effectiveAlpha === 0) continue

				let blendedR: number
				let blendedG: number
				let blendedB: number

				if (baseA === 0) {
					// No base, just use layer color
					blendedR = layerR
					blendedG = layerG
					blendedB = layerB
				} else if (useComponentBlend) {
					;[blendedR, blendedG, blendedB] = blendComponent(
						baseR,
						baseG,
						baseB,
						layerR,
						layerG,
						layerB,
						blendMode
					)
				} else {
					blendedR = blendFn(baseR, layerR)
					blendedG = blendFn(baseG, layerG)
					blendedB = blendFn(baseB, layerB)
				}

				// Porter-Duff over operation
				const outA = effectiveAlpha + (baseA / 255) * (1 - effectiveAlpha)
				if (outA > 0) {
					const baseContrib = (baseA / 255) * (1 - effectiveAlpha)
					output[destIdx] = Math.round((blendedR * effectiveAlpha + baseR * baseContrib) / outA)
					output[destIdx + 1] = Math.round((blendedG * effectiveAlpha + baseG * baseContrib) / outA)
					output[destIdx + 2] = Math.round((blendedB * effectiveAlpha + baseB * baseContrib) / outA)
					output[destIdx + 3] = Math.round(outA * 255)
				}
			}
		}
	}

	return { width, height, data: output }
}

/**
 * Apply a mask to an image (uses mask luminance as alpha)
 */
export function applyMask(image: ImageData, mask: ImageData): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4

			// Get mask luminance
			const maskX = Math.min(x, mask.width - 1)
			const maskY = Math.min(y, mask.height - 1)
			const maskIdx = (maskY * mask.width + maskX) * 4

			const maskR = mask.data[maskIdx]!
			const maskG = mask.data[maskIdx + 1]!
			const maskB = mask.data[maskIdx + 2]!
			const luminance = 0.299 * maskR + 0.587 * maskG + 0.114 * maskB

			output[idx] = data[idx]!
			output[idx + 1] = data[idx + 1]!
			output[idx + 2] = data[idx + 2]!
			output[idx + 3] = Math.round((data[idx + 3]! * luminance) / 255)
		}
	}

	return { width, height, data: output }
}

/**
 * Create alpha channel from color key (chroma key)
 */
export function chromaKey(
	image: ImageData,
	keyColor: [number, number, number],
	tolerance = 30
): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	const [keyR, keyG, keyB] = keyColor

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i]!
		const g = data[i + 1]!
		const b = data[i + 2]!

		// Calculate color distance
		const distance = Math.sqrt((r - keyR) ** 2 + (g - keyG) ** 2 + (b - keyB) ** 2)

		// Calculate alpha based on distance from key color
		let alpha: number
		if (distance <= tolerance) {
			alpha = 0
		} else if (distance <= tolerance * 2) {
			// Smooth falloff
			alpha = ((distance - tolerance) / tolerance) * 255
		} else {
			alpha = 255
		}

		output[i] = r
		output[i + 1] = g
		output[i + 2] = b
		output[i + 3] = Math.round(alpha)
	}

	return { width, height, data: output }
}

/**
 * Premultiply alpha
 */
export function premultiplyAlpha(image: ImageData): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3]! / 255
		output[i] = Math.round(data[i]! * a)
		output[i + 1] = Math.round(data[i + 1]! * a)
		output[i + 2] = Math.round(data[i + 2]! * a)
		output[i + 3] = data[i + 3]!
	}

	return { width, height, data: output }
}

/**
 * Unpremultiply alpha
 */
export function unpremultiplyAlpha(image: ImageData): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(data.length)

	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3]!
		if (a === 0) {
			output[i] = 0
			output[i + 1] = 0
			output[i + 2] = 0
		} else {
			output[i] = Math.min(255, Math.round((data[i]! * 255) / a))
			output[i + 1] = Math.min(255, Math.round((data[i + 1]! * 255) / a))
			output[i + 2] = Math.min(255, Math.round((data[i + 2]! * 255) / a))
		}
		output[i + 3] = a
	}

	return { width, height, data: output }
}

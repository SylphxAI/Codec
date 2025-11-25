/**
 * Image crop operations
 */

import type { ImageData } from '@mconv/core'
import type { CropOptions } from './types'

/**
 * Crop image to specified region
 */
export function crop(image: ImageData, options: CropOptions): ImageData {
	const { x, y, width: cropWidth, height: cropHeight } = options
	const { width, height, data } = image

	// Validate bounds
	if (x < 0 || y < 0 || x + cropWidth > width || y + cropHeight > height) {
		throw new Error(
			`Crop region (${x}, ${y}, ${cropWidth}x${cropHeight}) exceeds image bounds (${width}x${height})`
		)
	}

	if (cropWidth <= 0 || cropHeight <= 0) {
		throw new Error('Crop dimensions must be positive')
	}

	const output = new Uint8Array(cropWidth * cropHeight * 4)

	for (let cy = 0; cy < cropHeight; cy++) {
		const srcOffset = ((y + cy) * width + x) * 4
		const dstOffset = cy * cropWidth * 4
		output.set(data.subarray(srcOffset, srcOffset + cropWidth * 4), dstOffset)
	}

	return { width: cropWidth, height: cropHeight, data: output }
}

/**
 * Auto-crop image by removing uniform border
 * Returns the cropped image and the detected bounds
 */
export function autoCrop(
	image: ImageData,
	options: { tolerance?: number; backgroundColor?: [number, number, number, number] } = {}
): { image: ImageData; bounds: CropOptions } {
	const { tolerance = 0, backgroundColor } = options
	const { width, height, data } = image

	// Detect background color if not provided
	const bgColor = backgroundColor ?? [data[0]!, data[1]!, data[2]!, data[3]!]

	let minX = width
	let minY = height
	let maxX = 0
	let maxY = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4
			const r = data[idx]!
			const g = data[idx + 1]!
			const b = data[idx + 2]!
			const a = data[idx + 3]!

			const diff =
				Math.abs(r - bgColor[0]) +
				Math.abs(g - bgColor[1]) +
				Math.abs(b - bgColor[2]) +
				Math.abs(a - bgColor[3])

			if (diff > tolerance) {
				minX = Math.min(minX, x)
				minY = Math.min(minY, y)
				maxX = Math.max(maxX, x)
				maxY = Math.max(maxY, y)
			}
		}
	}

	// No content found
	if (maxX < minX || maxY < minY) {
		return {
			image: { width: 0, height: 0, data: new Uint8Array(0) },
			bounds: { x: 0, y: 0, width: 0, height: 0 },
		}
	}

	const bounds = {
		x: minX,
		y: minY,
		width: maxX - minX + 1,
		height: maxY - minY + 1,
	}

	return {
		image: crop(image, bounds),
		bounds,
	}
}

/**
 * Extend image canvas with padding
 */
export function extend(
	image: ImageData,
	padding: { top?: number; right?: number; bottom?: number; left?: number },
	fillColor: [number, number, number, number] = [0, 0, 0, 0]
): ImageData {
	const { top = 0, right = 0, bottom = 0, left = 0 } = padding
	const { width, height, data } = image

	const newWidth = width + left + right
	const newHeight = height + top + bottom

	const output = new Uint8Array(newWidth * newHeight * 4)

	// Fill with background color
	for (let i = 0; i < newWidth * newHeight; i++) {
		output[i * 4] = fillColor[0]
		output[i * 4 + 1] = fillColor[1]
		output[i * 4 + 2] = fillColor[2]
		output[i * 4 + 3] = fillColor[3]
	}

	// Copy original image
	for (let y = 0; y < height; y++) {
		const srcOffset = y * width * 4
		const dstOffset = ((y + top) * newWidth + left) * 4
		output.set(data.subarray(srcOffset, srcOffset + width * 4), dstOffset)
	}

	return { width: newWidth, height: newHeight, data: output }
}

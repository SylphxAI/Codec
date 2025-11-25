/**
 * Image rotation operations
 */

import type { ImageData } from '@mconv/core'
import type { RotateOptions } from './types'

/**
 * Rotate image by specified angle
 */
export function rotate(image: ImageData, options: RotateOptions): ImageData {
	const { angle, fillColor = [0, 0, 0, 0], expand = true } = options
	const { width, height, data } = image

	// Normalize angle to 0-360
	const normalizedAngle = ((angle % 360) + 360) % 360

	// Fast path for 90-degree rotations
	if (normalizedAngle === 90) return rotate90(image)
	if (normalizedAngle === 180) return rotate180(image)
	if (normalizedAngle === 270) return rotate270(image)
	if (normalizedAngle === 0) {
		return { width, height, data: new Uint8Array(data) }
	}

	// Arbitrary rotation
	return rotateArbitrary(image, normalizedAngle, fillColor, expand)
}

/**
 * Rotate 90 degrees clockwise
 */
export function rotate90(image: ImageData): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(width * height * 4)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			const dstIdx = (x * height + (height - 1 - y)) * 4

			output[dstIdx] = data[srcIdx]!
			output[dstIdx + 1] = data[srcIdx + 1]!
			output[dstIdx + 2] = data[srcIdx + 2]!
			output[dstIdx + 3] = data[srcIdx + 3]!
		}
	}

	return { width: height, height: width, data: output }
}

/**
 * Rotate 180 degrees
 */
export function rotate180(image: ImageData): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(width * height * 4)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			const dstIdx = ((height - 1 - y) * width + (width - 1 - x)) * 4

			output[dstIdx] = data[srcIdx]!
			output[dstIdx + 1] = data[srcIdx + 1]!
			output[dstIdx + 2] = data[srcIdx + 2]!
			output[dstIdx + 3] = data[srcIdx + 3]!
		}
	}

	return { width, height, data: output }
}

/**
 * Rotate 270 degrees clockwise (90 counter-clockwise)
 */
export function rotate270(image: ImageData): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(width * height * 4)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			const dstIdx = ((width - 1 - x) * height + y) * 4

			output[dstIdx] = data[srcIdx]!
			output[dstIdx + 1] = data[srcIdx + 1]!
			output[dstIdx + 2] = data[srcIdx + 2]!
			output[dstIdx + 3] = data[srcIdx + 3]!
		}
	}

	return { width: height, height: width, data: output }
}

/**
 * Rotate by arbitrary angle using bilinear interpolation
 */
function rotateArbitrary(
	image: ImageData,
	angleDegrees: number,
	fillColor: [number, number, number, number],
	expand: boolean
): ImageData {
	const { width, height, data } = image
	const angleRad = (angleDegrees * Math.PI) / 180
	const cos = Math.cos(angleRad)
	const sin = Math.sin(angleRad)

	// Calculate new dimensions
	let newWidth: number
	let newHeight: number

	if (expand) {
		// Calculate bounding box of rotated image
		const corners = [
			{ x: 0, y: 0 },
			{ x: width, y: 0 },
			{ x: width, y: height },
			{ x: 0, y: height },
		]

		const centerX = width / 2
		const centerY = height / 2

		const rotatedCorners = corners.map((c) => ({
			x: (c.x - centerX) * cos - (c.y - centerY) * sin + centerX,
			y: (c.x - centerX) * sin + (c.y - centerY) * cos + centerY,
		}))

		const minX = Math.min(...rotatedCorners.map((c) => c.x))
		const maxX = Math.max(...rotatedCorners.map((c) => c.x))
		const minY = Math.min(...rotatedCorners.map((c) => c.y))
		const maxY = Math.max(...rotatedCorners.map((c) => c.y))

		newWidth = Math.ceil(maxX - minX)
		newHeight = Math.ceil(maxY - minY)
	} else {
		newWidth = width
		newHeight = height
	}

	const output = new Uint8Array(newWidth * newHeight * 4)

	// Fill with background color
	for (let i = 0; i < newWidth * newHeight; i++) {
		output[i * 4] = fillColor[0]
		output[i * 4 + 1] = fillColor[1]
		output[i * 4 + 2] = fillColor[2]
		output[i * 4 + 3] = fillColor[3]
	}

	const srcCenterX = width / 2
	const srcCenterY = height / 2
	const dstCenterX = newWidth / 2
	const dstCenterY = newHeight / 2

	// Inverse rotation matrix
	const cosInv = Math.cos(-angleRad)
	const sinInv = Math.sin(-angleRad)

	for (let dstY = 0; dstY < newHeight; dstY++) {
		for (let dstX = 0; dstX < newWidth; dstX++) {
			// Map destination to source coordinates
			const dx = dstX - dstCenterX
			const dy = dstY - dstCenterY

			const srcX = dx * cosInv - dy * sinInv + srcCenterX
			const srcY = dx * sinInv + dy * cosInv + srcCenterY

			// Bilinear interpolation
			if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
				const x0 = Math.floor(srcX)
				const y0 = Math.floor(srcY)
				const fx = srcX - x0
				const fy = srcY - y0

				const dstIdx = (dstY * newWidth + dstX) * 4

				for (let c = 0; c < 4; c++) {
					const v00 = data[(y0 * width + x0) * 4 + c]!
					const v01 = data[(y0 * width + x0 + 1) * 4 + c]!
					const v10 = data[((y0 + 1) * width + x0) * 4 + c]!
					const v11 = data[((y0 + 1) * width + x0 + 1) * 4 + c]!

					const v0 = v00 * (1 - fx) + v01 * fx
					const v1 = v10 * (1 - fx) + v11 * fx
					const v = v0 * (1 - fy) + v1 * fy

					output[dstIdx + c] = Math.round(v)
				}
			}
		}
	}

	return { width: newWidth, height: newHeight, data: output }
}

/**
 * Image flip operations
 */

import type { ImageData } from '@sylphx/codec-core'
import type { FlipDirection } from './types'

/**
 * Flip image horizontally, vertically, or both
 */
export function flip(image: ImageData, direction: FlipDirection): ImageData {
	switch (direction) {
		case 'horizontal':
			return flipHorizontal(image)
		case 'vertical':
			return flipVertical(image)
		case 'both':
			return flipBoth(image)
	}
}

/**
 * Flip image horizontally (mirror)
 */
export function flipHorizontal(image: ImageData): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(width * height * 4)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			const dstIdx = (y * width + (width - 1 - x)) * 4

			output[dstIdx] = data[srcIdx]!
			output[dstIdx + 1] = data[srcIdx + 1]!
			output[dstIdx + 2] = data[srcIdx + 2]!
			output[dstIdx + 3] = data[srcIdx + 3]!
		}
	}

	return { width, height, data: output }
}

/**
 * Flip image vertically
 */
export function flipVertical(image: ImageData): ImageData {
	const { width, height, data } = image
	const output = new Uint8Array(width * height * 4)

	for (let y = 0; y < height; y++) {
		const srcOffset = y * width * 4
		const dstOffset = (height - 1 - y) * width * 4
		output.set(data.subarray(srcOffset, srcOffset + width * 4), dstOffset)
	}

	return { width, height, data: output }
}

/**
 * Flip image both horizontally and vertically (equivalent to 180° rotation)
 */
export function flipBoth(image: ImageData): ImageData {
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

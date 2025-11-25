/**
 * Farbfeld encoder
 * Encodes 8-bit RGBA to 16-bit RGBA
 */

import type { ImageData } from '@sylphx/codec-core'
import { FARBFELD_MAGIC } from './types'

/**
 * Encode image to Farbfeld format
 */
export function encodeFarbfeld(image: ImageData): Uint8Array {
	const { width, height, data } = image

	// Output size: 16 (header) + width * height * 8 (16-bit RGBA)
	const outputSize = 16 + width * height * 8
	const output = new Uint8Array(outputSize)
	const view = new DataView(output.buffer)

	// Write magic
	output.set(FARBFELD_MAGIC, 0)

	// Write dimensions (big-endian)
	view.setUint32(8, width, false)
	view.setUint32(12, height, false)

	// Write pixels (8-bit RGBA to 16-bit big-endian RGBA)
	let srcPos = 0
	let dstPos = 16

	for (let i = 0; i < width * height; i++) {
		// Convert 8-bit to 16-bit (replicate to fill)
		const r = data[srcPos]!
		const g = data[srcPos + 1]!
		const b = data[srcPos + 2]!
		const a = data[srcPos + 3]!

		// Expand 8-bit to 16-bit: val * 257 = (val << 8) | val
		view.setUint16(dstPos, (r << 8) | r, false)
		view.setUint16(dstPos + 2, (g << 8) | g, false)
		view.setUint16(dstPos + 4, (b << 8) | b, false)
		view.setUint16(dstPos + 6, (a << 8) | a, false)

		srcPos += 4
		dstPos += 8
	}

	return output
}

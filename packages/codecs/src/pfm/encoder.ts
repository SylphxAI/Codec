/**
 * PFM (Portable FloatMap) encoder
 * Encodes to color PFM (PF) format
 */

import type { ImageData } from '@sylphx/codec-core'
import type { PFMEncodeOptions } from './types'

/**
 * Encode image to PFM format
 */
export function encodePfm(image: ImageData, _options: PFMEncodeOptions = {}): Uint8Array {
	const { width, height, data } = image

	// Build header
	const header = `PF\n${width} ${height}\n-1.0\n` // -1.0 = little-endian, scale 1.0
	const headerBytes = new TextEncoder().encode(header)

	// Calculate data size (3 floats per pixel, 4 bytes per float)
	const floatDataSize = width * height * 3 * 4
	const output = new Uint8Array(headerBytes.length + floatDataSize)

	// Write header
	output.set(headerBytes, 0)

	// Write float data (bottom-to-top row order)
	const view = new DataView(output.buffer, headerBytes.length)
	let offset = 0

	for (let y = height - 1; y >= 0; y--) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4

			// Convert sRGB bytes to linear float
			const r = srgbToFloat(data[srcIdx]!)
			const g = srgbToFloat(data[srcIdx + 1]!)
			const b = srgbToFloat(data[srcIdx + 2]!)

			view.setFloat32(offset, r, true) // Little-endian
			view.setFloat32(offset + 4, g, true)
			view.setFloat32(offset + 8, b, true)
			offset += 12
		}
	}

	return output
}

/**
 * Convert sRGB byte to linear float
 */
function srgbToFloat(value: number): number {
	const normalized = value / 255
	// Remove gamma
	return normalized ** 2.2
}

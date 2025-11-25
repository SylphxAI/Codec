/**
 * Farbfeld decoder
 * Decodes 16-bit RGBA to 8-bit RGBA
 */

import type { ImageData } from '@mconv/core'
import { FARBFELD_MAGIC } from './types'

/**
 * Decode Farbfeld image to RGBA
 */
export function decodeFarbfeld(data: Uint8Array): ImageData {
	// Check magic
	for (let i = 0; i < 8; i++) {
		if (data[i] !== FARBFELD_MAGIC[i]) {
			throw new Error('Invalid Farbfeld file: wrong magic number')
		}
	}

	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	// Read dimensions (big-endian)
	const width = view.getUint32(8, false)
	const height = view.getUint32(12, false)

	if (width === 0 || height === 0) {
		throw new Error('Invalid Farbfeld dimensions')
	}

	// Expected data size: 16 (header) + width * height * 8 (16-bit RGBA)
	const expectedSize = 16 + width * height * 8
	if (data.length < expectedSize) {
		throw new Error('Farbfeld file truncated')
	}

	// Decode pixels (16-bit big-endian RGBA to 8-bit RGBA)
	const pixels = new Uint8Array(width * height * 4)
	let srcPos = 16
	let dstPos = 0

	for (let i = 0; i < width * height; i++) {
		// Read 16-bit channels and convert to 8-bit
		const r = view.getUint16(srcPos, false)
		const g = view.getUint16(srcPos + 2, false)
		const b = view.getUint16(srcPos + 4, false)
		const a = view.getUint16(srcPos + 6, false)

		// Convert 16-bit to 8-bit (>> 8)
		pixels[dstPos] = r >> 8
		pixels[dstPos + 1] = g >> 8
		pixels[dstPos + 2] = b >> 8
		pixels[dstPos + 3] = a >> 8

		srcPos += 8
		dstPos += 4
	}

	return { width, height, data: pixels }
}

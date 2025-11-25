/**
 * PIX (Alias/Wavefront) decoder
 * Simple uncompressed RGB format
 */

import type { ImageData } from '@mconv/core'

/**
 * Decode PIX image to RGBA
 */
export function decodePix(data: Uint8Array): ImageData {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	// Read header (10 bytes)
	const width = view.getUint16(0, false) // Big-endian
	const height = view.getUint16(2, false)
	const xOffset = view.getUint16(4, false)
	const yOffset = view.getUint16(6, false)
	const depth = view.getUint16(8, false) // Bits per pixel

	if (width === 0 || height === 0) {
		throw new Error('Invalid PIX dimensions')
	}

	if (depth !== 24) {
		throw new Error(`Unsupported PIX depth: ${depth} (only 24-bit supported)`)
	}

	const pixels = new Uint8Array(width * height * 4)
	let srcPos = 10

	// PIX uses RLE compression for RGB data
	let dstPos = 0
	const totalPixels = width * height

	while (dstPos < totalPixels * 4 && srcPos < data.length) {
		const count = data[srcPos++]!

		if (count < 128) {
			// Literal run: count+1 pixels
			const literalCount = count + 1
			for (let i = 0; i < literalCount && dstPos < totalPixels * 4; i++) {
				pixels[dstPos++] = data[srcPos++]! // R
				pixels[dstPos++] = data[srcPos++]! // G
				pixels[dstPos++] = data[srcPos++]! // B
				pixels[dstPos++] = 255 // A
			}
		} else {
			// RLE run: 257-count pixels of same color
			const runLength = 257 - count
			const r = data[srcPos++]!
			const g = data[srcPos++]!
			const b = data[srcPos++]!

			for (let i = 0; i < runLength && dstPos < totalPixels * 4; i++) {
				pixels[dstPos++] = r
				pixels[dstPos++] = g
				pixels[dstPos++] = b
				pixels[dstPos++] = 255
			}
		}
	}

	return { width, height, data: pixels }
}

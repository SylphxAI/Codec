/**
 * WBMP (Wireless Bitmap) encoder
 * Simple monochrome format used for mobile devices
 */

import type { ImageData } from '@mconv/core'
import type { WBMPEncodeOptions } from './types'

/**
 * Encode image to WBMP format
 */
export function encodeWbmp(image: ImageData, options: WBMPEncodeOptions = {}): Uint8Array {
	const { width, height, data } = image
	const threshold = options.threshold ?? 128

	// Calculate output size
	const rowBytes = Math.ceil(width / 8)
	const headerSize = 1 + 1 + getMultiByteIntSize(width) + getMultiByteIntSize(height)
	const dataSize = rowBytes * height
	const output = new Uint8Array(headerSize + dataSize)

	let pos = 0

	// Type (0 for Type 0 WBMP)
	output[pos++] = 0

	// Fixed header byte
	output[pos++] = 0

	// Width
	pos += writeMultiByteInt(output, pos, width)

	// Height
	pos += writeMultiByteInt(output, pos, height)

	// Pixel data
	for (let y = 0; y < height; y++) {
		for (let bytePos = 0; bytePos < rowBytes; bytePos++) {
			let byte = 0

			for (let bit = 0; bit < 8; bit++) {
				const x = bytePos * 8 + bit
				if (x >= width) break

				const pixelPos = (y * width + x) * 4
				// Convert to grayscale
				const gray =
					(data[pixelPos]! * 0.299 + data[pixelPos + 1]! * 0.587 + data[pixelPos + 2]! * 0.114) *
					(data[pixelPos + 3]! / 255)

				// 1 = white (>= threshold), 0 = black (< threshold)
				if (gray >= threshold) {
					byte |= 1 << (7 - bit) // MSB first
				}
			}

			output[pos++] = byte
		}
	}

	return output
}

/**
 * Get size needed for multi-byte integer
 */
function getMultiByteIntSize(value: number): number {
	if (value < 0x80) return 1
	if (value < 0x4000) return 2
	if (value < 0x200000) return 3
	if (value < 0x10000000) return 4
	return 5
}

/**
 * Write multi-byte integer
 */
function writeMultiByteInt(output: Uint8Array, pos: number, value: number): number {
	const size = getMultiByteIntSize(value)

	for (let i = size - 1; i >= 0; i--) {
		const byte = (value >> (i * 7)) & 0x7f
		output[pos + (size - 1 - i)] = byte | (i > 0 ? 0x80 : 0)
	}

	return size
}

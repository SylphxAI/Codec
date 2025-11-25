/**
 * WBMP (Wireless Bitmap) decoder
 * Simple monochrome format used for mobile devices
 */

import type { ImageData } from '@mconv/core'

/**
 * Decode WBMP image to RGBA
 */
export function decodeWbmp(data: Uint8Array): ImageData {
	let pos = 0

	// Type field (must be 0 for Type 0 WBMP)
	const type = readMultiByteInt(data, pos)
	pos += type.bytes
	if (type.value !== 0) {
		throw new Error(`Unsupported WBMP type: ${type.value}`)
	}

	// Fixed header byte (usually 0)
	const fixedHeader = readMultiByteInt(data, pos)
	pos += fixedHeader.bytes

	// Width
	const widthResult = readMultiByteInt(data, pos)
	pos += widthResult.bytes
	const width = widthResult.value

	// Height
	const heightResult = readMultiByteInt(data, pos)
	pos += heightResult.bytes
	const height = heightResult.value

	if (width === 0 || height === 0) {
		throw new Error('Invalid WBMP dimensions')
	}

	// Pixel data (1 bit per pixel, MSB first)
	const rowBytes = Math.ceil(width / 8)
	const pixels = new Uint8Array(width * height * 4)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const byteIdx = y * rowBytes + Math.floor(x / 8)
			const bitIdx = 7 - (x % 8) // MSB first

			if (pos + byteIdx >= data.length) {
				throw new Error('WBMP data truncated')
			}

			const bit = (data[pos + byteIdx]! >> bitIdx) & 1
			const color = bit ? 255 : 0 // 1 = white, 0 = black

			const pixelPos = (y * width + x) * 4
			pixels[pixelPos] = color
			pixels[pixelPos + 1] = color
			pixels[pixelPos + 2] = color
			pixels[pixelPos + 3] = 255
		}
	}

	return { width, height, data: pixels }
}

/**
 * Read multi-byte integer (WBMP uses variable-length encoding)
 * MSB of each byte indicates if more bytes follow
 */
function readMultiByteInt(data: Uint8Array, pos: number): { value: number; bytes: number } {
	let value = 0
	let bytes = 0

	do {
		if (pos + bytes >= data.length) {
			throw new Error('WBMP header truncated')
		}
		const byte = data[pos + bytes]!
		value = (value << 7) | (byte & 0x7f)
		bytes++
		if ((byte & 0x80) === 0) break
	} while (bytes < 5) // Max 5 bytes for 32-bit value

	return { value, bytes }
}

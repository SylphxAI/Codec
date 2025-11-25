/**
 * XBM (X BitMap) decoder
 * Parses C-style XBM format to RGBA (black/white)
 */

import type { ImageData } from '@sylphx/codec-core'

/**
 * Decode XBM image to RGBA
 */
export function decodeXbm(data: Uint8Array): ImageData {
	const text = new TextDecoder().decode(data)

	// Extract width
	const widthMatch = text.match(/#define\s+\w+_width\s+(\d+)/)
	if (!widthMatch) {
		throw new Error('Invalid XBM: missing width')
	}
	const width = Number.parseInt(widthMatch[1]!, 10)

	// Extract height
	const heightMatch = text.match(/#define\s+\w+_height\s+(\d+)/)
	if (!heightMatch) {
		throw new Error('Invalid XBM: missing height')
	}
	const height = Number.parseInt(heightMatch[1]!, 10)

	// Extract bytes
	const bytesMatch = text.match(/\{([^}]+)\}/)
	if (!bytesMatch) {
		throw new Error('Invalid XBM: missing data')
	}

	// Parse hex values
	const hexValues = bytesMatch[1]!.match(/0x[0-9a-fA-F]+/g)
	if (!hexValues) {
		throw new Error('Invalid XBM: no hex values found')
	}

	const bytes = hexValues.map((hex) => Number.parseInt(hex, 16))

	// Decode pixels
	const pixels = new Uint8Array(width * height * 4)
	const rowBytes = Math.ceil(width / 8)

	let byteIdx = 0
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const bytePos = Math.floor(x / 8)
			const bitPos = x % 8

			const byte = bytes[y * rowBytes + bytePos]
			if (byte === undefined) {
				throw new Error('Invalid XBM: data truncated')
			}

			// XBM uses LSB first within each byte
			const bit = (byte >> bitPos) & 1
			const color = bit ? 0 : 255 // 1 = black (foreground), 0 = white (background)

			const pos = (y * width + x) * 4
			pixels[pos] = color
			pixels[pos + 1] = color
			pixels[pos + 2] = color
			pixels[pos + 3] = 255
		}
		byteIdx += rowBytes
	}

	return { width, height, data: pixels }
}

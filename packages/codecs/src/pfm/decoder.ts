/**
 * PFM (Portable FloatMap) decoder
 * Supports color (PF) and grayscale (Pf) variants
 */

import type { ImageData } from '@sylphx/codec-core'

/**
 * Decode PFM image to RGBA
 */
export function decodePfm(data: Uint8Array): ImageData {
	let pos = 0

	// Read magic
	if (data[pos] !== 0x50) {
		// 'P'
		throw new Error('Invalid PFM: wrong magic number')
	}
	pos++

	const formatByte = data[pos++]!
	const isColor = formatByte === 0x46 // 'F' = color, 'f' = grayscale
	const isGrayscale = formatByte === 0x66

	if (!isColor && !isGrayscale) {
		throw new Error('Invalid PFM: must be PF (color) or Pf (grayscale)')
	}

	// Skip whitespace
	pos = skipWhitespace(data, pos)

	// Read width
	const widthEnd = findWhitespace(data, pos)
	const width = Number.parseInt(new TextDecoder().decode(data.subarray(pos, widthEnd)), 10)
	pos = skipWhitespace(data, widthEnd)

	// Read height
	const heightEnd = findWhitespace(data, pos)
	const height = Number.parseInt(new TextDecoder().decode(data.subarray(pos, heightEnd)), 10)
	pos = skipWhitespace(data, heightEnd)

	// Read scale/endianness
	const scaleEnd = findWhitespace(data, pos)
	const scale = Number.parseFloat(new TextDecoder().decode(data.subarray(pos, scaleEnd)))
	pos = scaleEnd

	// Skip single whitespace after scale (newline)
	if (data[pos] === 0x0a || data[pos] === 0x0d) {
		pos++
		if (data[pos] === 0x0a) pos++ // Handle CRLF
	}

	const isLittleEndian = scale < 0
	const absoluteScale = Math.abs(scale)

	if (width <= 0 || height <= 0) {
		throw new Error('Invalid PFM dimensions')
	}

	// Read float data
	const channels = isColor ? 3 : 1
	const floatsPerRow = width * channels
	const bytesPerRow = floatsPerRow * 4
	const pixels = new Uint8Array(width * height * 4)

	const view = new DataView(data.buffer, data.byteOffset + pos, data.byteLength - pos)

	// PFM stores rows bottom-to-top
	for (let y = 0; y < height; y++) {
		const srcRow = height - 1 - y // Bottom-to-top
		const srcOffset = srcRow * bytesPerRow

		for (let x = 0; x < width; x++) {
			const dstIdx = (y * width + x) * 4
			const srcIdx = x * channels * 4

			if (isColor) {
				const r = view.getFloat32(srcOffset + srcIdx, isLittleEndian)
				const g = view.getFloat32(srcOffset + srcIdx + 4, isLittleEndian)
				const b = view.getFloat32(srcOffset + srcIdx + 8, isLittleEndian)

				// Convert HDR to LDR with tone mapping
				pixels[dstIdx] = floatToSrgb(r * absoluteScale)
				pixels[dstIdx + 1] = floatToSrgb(g * absoluteScale)
				pixels[dstIdx + 2] = floatToSrgb(b * absoluteScale)
			} else {
				const gray = view.getFloat32(srcOffset + srcIdx, isLittleEndian)
				const value = floatToSrgb(gray * absoluteScale)
				pixels[dstIdx] = value
				pixels[dstIdx + 1] = value
				pixels[dstIdx + 2] = value
			}
			pixels[dstIdx + 3] = 255
		}
	}

	return { width, height, data: pixels }
}

/**
 * Convert HDR float value to sRGB byte with simple tone mapping
 */
function floatToSrgb(value: number): number {
	// Simple Reinhard tone mapping
	const mapped = value / (1 + value)
	// Apply gamma
	const gamma = mapped ** (1 / 2.2)
	return Math.max(0, Math.min(255, Math.round(gamma * 255)))
}

function skipWhitespace(data: Uint8Array, start: number): number {
	let pos = start
	while (
		pos < data.length &&
		(data[pos] === 0x20 || data[pos] === 0x09 || data[pos] === 0x0a || data[pos] === 0x0d)
	) {
		pos++
	}
	return pos
}

function findWhitespace(data: Uint8Array, start: number): number {
	let pos = start
	while (
		pos < data.length &&
		data[pos] !== 0x20 &&
		data[pos] !== 0x09 &&
		data[pos] !== 0x0a &&
		data[pos] !== 0x0d
	) {
		pos++
	}
	return pos
}

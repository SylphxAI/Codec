import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import { PCX_SIGNATURE, PcxEncoding, PcxVersion } from './types'

/**
 * Encode ImageData to PCX (24-bit true color with RLE)
 */
export function encodePcx(image: ImageData, _options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	// Calculate bytes per line (must be even)
	const bytesPerLine = width + (width % 2)

	// Pre-allocate output buffer (header + worst case RLE + padding)
	const maxSize = 128 + height * bytesPerLine * 3 * 2 + 1024
	const output = new Uint8Array(maxSize)
	let pos = 0

	// Write header
	output[pos++] = PCX_SIGNATURE // Signature
	output[pos++] = PcxVersion.V30 // Version 3.0
	output[pos++] = PcxEncoding.RLE // RLE encoding
	output[pos++] = 8 // Bits per pixel per plane

	// xMin, yMin
	output[pos++] = 0
	output[pos++] = 0
	output[pos++] = 0
	output[pos++] = 0

	// xMax (width - 1)
	output[pos++] = (width - 1) & 0xff
	output[pos++] = ((width - 1) >> 8) & 0xff

	// yMax (height - 1)
	output[pos++] = (height - 1) & 0xff
	output[pos++] = ((height - 1) >> 8) & 0xff

	// hDpi, vDpi (72 DPI)
	output[pos++] = 72
	output[pos++] = 0
	output[pos++] = 72
	output[pos++] = 0

	// 16-color palette (48 bytes) - not used for 24-bit
	for (let i = 0; i < 48; i++) {
		output[pos++] = 0
	}

	output[pos++] = 0 // Reserved

	output[pos++] = 3 // Number of planes (RGB)

	// Bytes per line (must be even)
	output[pos++] = bytesPerLine & 0xff
	output[pos++] = (bytesPerLine >> 8) & 0xff

	// Palette type (1 = color)
	output[pos++] = 1
	output[pos++] = 0

	// Screen size
	output[pos++] = width & 0xff
	output[pos++] = (width >> 8) & 0xff
	output[pos++] = height & 0xff
	output[pos++] = (height >> 8) & 0xff

	// Fill rest of header with zeros (to byte 128)
	while (pos < 128) {
		output[pos++] = 0
	}

	// Encode scanlines
	for (let y = 0; y < height; y++) {
		// Encode R plane
		pos = encodePlane(data, y, width, 0, bytesPerLine, output, pos)
		// Encode G plane
		pos = encodePlane(data, y, width, 1, bytesPerLine, output, pos)
		// Encode B plane
		pos = encodePlane(data, y, width, 2, bytesPerLine, output, pos)
	}

	return output.slice(0, pos)
}

/**
 * Encode a single color plane with RLE
 */
function encodePlane(
	data: Uint8Array,
	y: number,
	width: number,
	channel: number,
	bytesPerLine: number,
	output: Uint8Array,
	startPos: number
): number {
	let pos = startPos

	// Extract channel data for this row
	const row = new Uint8Array(bytesPerLine)
	for (let x = 0; x < width; x++) {
		row[x] = data[(y * width + x) * 4 + channel]!
	}
	// Pad with zeros if needed
	for (let x = width; x < bytesPerLine; x++) {
		row[x] = 0
	}

	// RLE encode
	let x = 0
	while (x < bytesPerLine) {
		const value = row[x]!
		let count = 1

		// Count run length (max 63)
		while (x + count < bytesPerLine && row[x + count] === value && count < 63) {
			count++
		}

		if (count > 1 || (value & 0xc0) === 0xc0) {
			// Write RLE pair
			output[pos++] = 0xc0 | count
			output[pos++] = value
		} else {
			// Write single byte
			output[pos++] = value
		}

		x += count
	}

	return pos
}

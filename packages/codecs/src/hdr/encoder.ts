import type { EncodeOptions, ImageData } from '@mconv/core'
import { HDR_FORMAT_32BIT_RLE_RGBE, inverseToneMap, rgbToRgbe } from './types'

/**
 * Encode ImageData to HDR (Radiance RGBE)
 */
export function encodeHdr(image: ImageData, _options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	// Build header
	const header = `${[
		'#?RADIANCE',
		`FORMAT=${HDR_FORMAT_32BIT_RLE_RGBE}`,
		'',
		`-Y ${height} +X ${width}`,
	].join('\n')}\n`

	const headerBytes = new TextEncoder().encode(header)

	// Pre-allocate output (worst case: header + uncompressed data)
	const maxSize = headerBytes.length + height * width * 4 * 2
	const output = new Uint8Array(maxSize)
	let pos = 0

	// Write header
	output.set(headerBytes, pos)
	pos += headerBytes.length

	// Encode scanlines
	for (let y = 0; y < height; y++) {
		// Convert to RGBE
		const scanline = new Uint8Array(width * 4)
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4

			// Convert sRGB to linear HDR
			const r = inverseToneMap(data[srcIdx]!)
			const g = inverseToneMap(data[srcIdx + 1]!)
			const b = inverseToneMap(data[srcIdx + 2]!)

			const rgbe = rgbToRgbe(r, g, b)
			scanline[x * 4] = rgbe.r
			scanline[x * 4 + 1] = rgbe.g
			scanline[x * 4 + 2] = rgbe.b
			scanline[x * 4 + 3] = rgbe.e
		}

		// Encode scanline with new RLE format
		pos = encodeScanline(scanline, width, output, pos)
	}

	return output.slice(0, pos)
}

/**
 * Encode a single scanline with RLE
 */
function encodeScanline(
	scanline: Uint8Array,
	width: number,
	output: Uint8Array,
	startPos: number
): number {
	let pos = startPos

	// Write scanline header
	output[pos++] = 0x02
	output[pos++] = 0x02
	output[pos++] = (width >> 8) & 0xff
	output[pos++] = width & 0xff

	// Encode each channel separately
	for (let channel = 0; channel < 4; channel++) {
		let x = 0
		while (x < width) {
			// Try to find a run
			let runLength = 1
			const value = scanline[x * 4 + channel]!

			while (
				x + runLength < width &&
				runLength < 127 &&
				scanline[(x + runLength) * 4 + channel] === value
			) {
				runLength++
			}

			if (runLength > 2) {
				// RLE run
				output[pos++] = runLength + 128
				output[pos++] = value
				x += runLength
			} else {
				// Raw data - just write 1 byte at a time for simplicity
				output[pos++] = 1
				output[pos++] = value
				x++
			}
		}
	}

	return pos
}

/**
 * PIX (Alias/Wavefront) encoder
 * Encodes with RLE compression
 */

import type { ImageData } from '@sylphx/codec-core'
import type { PIXEncodeOptions } from './types'

/**
 * Encode image to PIX format with RLE compression
 */
export function encodePix(image: ImageData, _options: PIXEncodeOptions = {}): Uint8Array {
	const { width, height, data } = image

	// Build header
	const header = new Uint8Array(10)
	const headerView = new DataView(header.buffer)
	headerView.setUint16(0, width, false) // Big-endian
	headerView.setUint16(2, height, false)
	headerView.setUint16(4, 0, false) // X offset
	headerView.setUint16(6, 0, false) // Y offset
	headerView.setUint16(8, 24, false) // Bits per pixel

	// RLE compress the data
	const compressed: number[] = []
	let pos = 0
	const totalPixels = width * height

	while (pos < totalPixels) {
		const r = data[pos * 4]!
		const g = data[pos * 4 + 1]!
		const b = data[pos * 4 + 2]!

		// Count consecutive identical pixels
		let runLength = 1
		while (
			pos + runLength < totalPixels &&
			runLength < 127 &&
			data[(pos + runLength) * 4] === r &&
			data[(pos + runLength) * 4 + 1] === g &&
			data[(pos + runLength) * 4 + 2] === b
		) {
			runLength++
		}

		if (runLength >= 3) {
			// Use RLE
			compressed.push(257 - runLength, r, g, b)
			pos += runLength
		} else {
			// Use literal run - find how many non-repeating pixels
			let literalCount = 1
			while (pos + literalCount < totalPixels && literalCount < 128) {
				// Check if next 3 pixels are same (worth switching to RLE)
				const nextR = data[(pos + literalCount) * 4]!
				const nextG = data[(pos + literalCount) * 4 + 1]!
				const nextB = data[(pos + literalCount) * 4 + 2]!

				let sameCount = 1
				for (let k = 1; k < 3 && pos + literalCount + k < totalPixels; k++) {
					if (
						data[(pos + literalCount + k) * 4] === nextR &&
						data[(pos + literalCount + k) * 4 + 1] === nextG &&
						data[(pos + literalCount + k) * 4 + 2] === nextB
					) {
						sameCount++
					} else {
						break
					}
				}

				if (sameCount >= 3) break
				literalCount++
			}

			compressed.push(literalCount - 1)
			for (let i = 0; i < literalCount; i++) {
				compressed.push(data[(pos + i) * 4]!, data[(pos + i) * 4 + 1]!, data[(pos + i) * 4 + 2]!)
			}
			pos += literalCount
		}
	}

	// Combine header and data
	const output = new Uint8Array(header.length + compressed.length)
	output.set(header, 0)
	output.set(new Uint8Array(compressed), header.length)

	return output
}

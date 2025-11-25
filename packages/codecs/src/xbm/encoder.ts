/**
 * XBM (X BitMap) encoder
 * Encodes RGBA to C-style XBM format (monochrome)
 */

import type { ImageData } from '@mconv/core'
import type { XBMEncodeOptions } from './types'

/**
 * Encode image to XBM format
 */
export function encodeXbm(image: ImageData, options: XBMEncodeOptions = {}): Uint8Array {
	const { width, height, data } = image
	const name = options.name ?? 'image'
	const threshold = options.threshold ?? 128

	const lines: string[] = []

	// Header
	lines.push(`#define ${name}_width ${width}`)
	lines.push(`#define ${name}_height ${height}`)
	lines.push(`static unsigned char ${name}_bits[] = {`)

	// Encode pixels
	const rowBytes = Math.ceil(width / 8)
	const hexValues: string[] = []

	for (let y = 0; y < height; y++) {
		for (let bytePos = 0; bytePos < rowBytes; bytePos++) {
			let byte = 0

			for (let bit = 0; bit < 8; bit++) {
				const x = bytePos * 8 + bit
				if (x >= width) break

				const pos = (y * width + x) * 4
				// Convert to grayscale and threshold
				const gray =
					(data[pos]! * 0.299 + data[pos + 1]! * 0.587 + data[pos + 2]! * 0.114) *
					(data[pos + 3]! / 255)

				// 1 = foreground (dark), 0 = background (light)
				if (gray < threshold) {
					byte |= 1 << bit // LSB first
				}
			}

			hexValues.push(`0x${byte.toString(16).padStart(2, '0')}`)
		}
	}

	// Format hex values into lines
	const valuesPerLine = 12
	for (let i = 0; i < hexValues.length; i += valuesPerLine) {
		const slice = hexValues.slice(i, Math.min(i + valuesPerLine, hexValues.length))
		const isLast = i + valuesPerLine >= hexValues.length
		lines.push(`   ${slice.join(', ')}${isLast ? '' : ','}`)
	}

	lines.push('};')

	return new TextEncoder().encode(lines.join('\n'))
}

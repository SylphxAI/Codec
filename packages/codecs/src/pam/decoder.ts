/**
 * PAM (Portable Arbitrary Map) decoder
 * Extension of PNM supporting arbitrary depth and alpha
 */

import type { ImageData } from '@sylphx/codec-core'
import type { PAMTupleType } from './types'

/**
 * Decode PAM image to RGBA
 */
export function decodePam(data: Uint8Array): ImageData {
	let pos = 0

	// Read magic "P7"
	if (data[pos++] !== 0x50 || data[pos++] !== 0x37) {
		throw new Error('Invalid PAM: wrong magic number')
	}

	// Skip whitespace
	pos = skipWhitespace(data, pos)

	// Read header fields
	let width = 0
	let height = 0
	let depth = 0
	let maxval = 255
	let tupleType: PAMTupleType = 'RGB'

	while (pos < data.length) {
		// Read field name
		const lineEnd = findLineEnd(data, pos)
		const line = new TextDecoder().decode(data.subarray(pos, lineEnd)).trim()
		pos = lineEnd + 1

		if (line === 'ENDHDR') {
			break
		}

		if (line.startsWith('#')) {
			continue // Comment
		}

		const [field, value] = line.split(/\s+/)

		switch (field) {
			case 'WIDTH':
				width = Number.parseInt(value!, 10)
				break
			case 'HEIGHT':
				height = Number.parseInt(value!, 10)
				break
			case 'DEPTH':
				depth = Number.parseInt(value!, 10)
				break
			case 'MAXVAL':
				maxval = Number.parseInt(value!, 10)
				break
			case 'TUPLTYPE':
				tupleType = value as PAMTupleType
				break
		}
	}

	if (width === 0 || height === 0 || depth === 0) {
		throw new Error('Invalid PAM: missing required header fields')
	}

	// Decode pixel data (binary only)
	const bytesPerSample = maxval > 255 ? 2 : 1
	const pixels = new Uint8Array(width * height * 4)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const dstPos = (y * width + x) * 4
			const samples: number[] = []

			for (let d = 0; d < depth; d++) {
				let value: number
				if (bytesPerSample === 2) {
					value = (data[pos]! << 8) | data[pos + 1]!
					pos += 2
				} else {
					value = data[pos++]!
				}
				// Normalize to 0-255
				samples.push(Math.round((value * 255) / maxval))
			}

			// Convert based on tuple type
			switch (tupleType) {
				case 'BLACKANDWHITE': {
					const bw = samples[0]! > 0 ? 0 : 255
					pixels[dstPos] = bw
					pixels[dstPos + 1] = bw
					pixels[dstPos + 2] = bw
					pixels[dstPos + 3] = 255
					break
				}

				case 'BLACKANDWHITE_ALPHA': {
					const bwa = samples[0]! > 0 ? 0 : 255
					pixels[dstPos] = bwa
					pixels[dstPos + 1] = bwa
					pixels[dstPos + 2] = bwa
					pixels[dstPos + 3] = samples[1]!
					break
				}

				case 'GRAYSCALE':
					pixels[dstPos] = samples[0]!
					pixels[dstPos + 1] = samples[0]!
					pixels[dstPos + 2] = samples[0]!
					pixels[dstPos + 3] = 255
					break

				case 'GRAYSCALE_ALPHA':
					pixels[dstPos] = samples[0]!
					pixels[dstPos + 1] = samples[0]!
					pixels[dstPos + 2] = samples[0]!
					pixels[dstPos + 3] = samples[1]!
					break

				case 'RGB':
					pixels[dstPos] = samples[0]!
					pixels[dstPos + 1] = samples[1]!
					pixels[dstPos + 2] = samples[2]!
					pixels[dstPos + 3] = 255
					break
				default:
					pixels[dstPos] = samples[0]!
					pixels[dstPos + 1] = samples[1] ?? samples[0]!
					pixels[dstPos + 2] = samples[2] ?? samples[0]!
					pixels[dstPos + 3] = samples[3] ?? 255
					break
			}
		}
	}

	return { width, height, data: pixels }
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

function findLineEnd(data: Uint8Array, start: number): number {
	let pos = start
	while (pos < data.length && data[pos] !== 0x0a && data[pos] !== 0x0d) {
		pos++
	}
	return pos
}

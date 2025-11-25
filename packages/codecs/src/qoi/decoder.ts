import type { ImageData } from '@sylphx/codec-core'
import {
	QOI_MAGIC,
	QOI_MASK_2,
	QOI_OP_DIFF,
	QOI_OP_INDEX,
	QOI_OP_LUMA,
	QOI_OP_RGB,
	QOI_OP_RGBA,
	QOI_OP_RUN,
	type QoiHeader,
	type QoiPixel,
	qoiHash,
} from './types'

/**
 * Decode QOI to ImageData
 */
export function decodeQoi(data: Uint8Array): ImageData {
	const header = readHeader(data)
	const { width, height } = header

	if (width === 0 || height === 0) {
		throw new Error('Invalid QOI dimensions')
	}

	const output = new Uint8Array(width * height * 4)
	const index: QoiPixel[] = Array(64)
		.fill(null)
		.map(() => ({ r: 0, g: 0, b: 0, a: 0 }))
	let pixel: QoiPixel = { r: 0, g: 0, b: 0, a: 255 }

	let pos = 14 // Start after header
	let outPos = 0
	const endPos = data.length - 8 // End marker is 8 bytes

	while (pos < endPos && outPos < output.length) {
		const byte = data[pos++]!

		if (byte === QOI_OP_RGB) {
			pixel = {
				r: data[pos++]!,
				g: data[pos++]!,
				b: data[pos++]!,
				a: pixel.a,
			}
		} else if (byte === QOI_OP_RGBA) {
			pixel = {
				r: data[pos++]!,
				g: data[pos++]!,
				b: data[pos++]!,
				a: data[pos++]!,
			}
		} else {
			const op = byte & QOI_MASK_2

			if (op === QOI_OP_INDEX) {
				const idx = byte & 0x3f
				pixel = { ...index[idx]! }
			} else if (op === QOI_OP_DIFF) {
				const dr = ((byte >> 4) & 0x03) - 2
				const dg = ((byte >> 2) & 0x03) - 2
				const db = (byte & 0x03) - 2
				pixel = {
					r: (pixel.r + dr + 256) % 256,
					g: (pixel.g + dg + 256) % 256,
					b: (pixel.b + db + 256) % 256,
					a: pixel.a,
				}
			} else if (op === QOI_OP_LUMA) {
				const dg = (byte & 0x3f) - 32
				const byte2 = data[pos++]!
				const dr = dg + ((byte2 >> 4) & 0x0f) - 8
				const db = dg + (byte2 & 0x0f) - 8
				pixel = {
					r: (pixel.r + dr + 256) % 256,
					g: (pixel.g + dg + 256) % 256,
					b: (pixel.b + db + 256) % 256,
					a: pixel.a,
				}
			} else if (op === QOI_OP_RUN) {
				let run = (byte & 0x3f) + 1
				while (run-- > 0 && outPos < output.length) {
					output[outPos++] = pixel.r
					output[outPos++] = pixel.g
					output[outPos++] = pixel.b
					output[outPos++] = pixel.a
				}
				index[qoiHash(pixel)] = { ...pixel }
				continue
			}
		}

		// Store pixel in hash table
		index[qoiHash(pixel)] = { ...pixel }

		// Output pixel
		output[outPos++] = pixel.r
		output[outPos++] = pixel.g
		output[outPos++] = pixel.b
		output[outPos++] = pixel.a
	}

	return { width, height, data: output }
}

/**
 * Read QOI header
 */
function readHeader(data: Uint8Array): QoiHeader {
	if (data.length < 14) {
		throw new Error('Invalid QOI: too small')
	}

	const magic = (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!

	if (magic !== QOI_MAGIC) {
		throw new Error('Invalid QOI: bad magic')
	}

	return {
		magic,
		width: (data[4]! << 24) | (data[5]! << 16) | (data[6]! << 8) | data[7]!,
		height: (data[8]! << 24) | (data[9]! << 16) | (data[10]! << 8) | data[11]!,
		channels: data[12]!,
		colorspace: data[13]!,
	}
}

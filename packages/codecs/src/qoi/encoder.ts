import type { ImageData } from '@sylphx/codec-core'
import {
	QOI_MAGIC,
	QOI_OP_DIFF,
	QOI_OP_INDEX,
	QOI_OP_LUMA,
	QOI_OP_RGB,
	QOI_OP_RGBA,
	QOI_OP_RUN,
	QoiChannels,
	QoiColorSpace,
	type QoiPixel,
	pixelsEqual,
	qoiHash,
} from './types'

/**
 * Encode ImageData to QOI
 */
export function encodeQoi(image: ImageData): Uint8Array {
	const { width, height, data } = image

	// Check if image has alpha
	let hasAlpha = false
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] !== 255) {
			hasAlpha = true
			break
		}
	}

	const channels = hasAlpha ? QoiChannels.RGBA : QoiChannels.RGB

	// Pre-allocate output buffer (worst case: header + pixels * 5 + end marker)
	const maxSize = 14 + width * height * 5 + 8
	const output = new Uint8Array(maxSize)
	let pos = 0

	// Write header
	output[pos++] = (QOI_MAGIC >> 24) & 0xff
	output[pos++] = (QOI_MAGIC >> 16) & 0xff
	output[pos++] = (QOI_MAGIC >> 8) & 0xff
	output[pos++] = QOI_MAGIC & 0xff
	output[pos++] = (width >> 24) & 0xff
	output[pos++] = (width >> 16) & 0xff
	output[pos++] = (width >> 8) & 0xff
	output[pos++] = width & 0xff
	output[pos++] = (height >> 24) & 0xff
	output[pos++] = (height >> 16) & 0xff
	output[pos++] = (height >> 8) & 0xff
	output[pos++] = height & 0xff
	output[pos++] = channels
	output[pos++] = QoiColorSpace.SRGB

	// Initialize state
	const index: QoiPixel[] = Array(64)
		.fill(null)
		.map(() => ({ r: 0, g: 0, b: 0, a: 0 }))
	let prev: QoiPixel = { r: 0, g: 0, b: 0, a: 255 }
	let run = 0

	const numPixels = width * height

	for (let i = 0; i < numPixels; i++) {
		const srcIdx = i * 4
		const pixel: QoiPixel = {
			r: data[srcIdx]!,
			g: data[srcIdx + 1]!,
			b: data[srcIdx + 2]!,
			a: data[srcIdx + 3]!,
		}

		if (pixelsEqual(pixel, prev)) {
			run++
			if (run === 62 || i === numPixels - 1) {
				output[pos++] = QOI_OP_RUN | (run - 1)
				run = 0
			}
		} else {
			if (run > 0) {
				output[pos++] = QOI_OP_RUN | (run - 1)
				run = 0
			}

			const hashIdx = qoiHash(pixel)

			if (pixelsEqual(index[hashIdx]!, pixel)) {
				output[pos++] = QOI_OP_INDEX | hashIdx
			} else {
				index[hashIdx] = { ...pixel }

				if (pixel.a === prev.a) {
					const dr = pixel.r - prev.r
					const dg = pixel.g - prev.g
					const db = pixel.b - prev.b

					const dgr = dr - dg
					const dgb = db - dg

					if (dr >= -2 && dr <= 1 && dg >= -2 && dg <= 1 && db >= -2 && db <= 1) {
						output[pos++] = QOI_OP_DIFF | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2)
					} else if (dgr >= -8 && dgr <= 7 && dg >= -32 && dg <= 31 && dgb >= -8 && dgb <= 7) {
						output[pos++] = QOI_OP_LUMA | (dg + 32)
						output[pos++] = ((dgr + 8) << 4) | (dgb + 8)
					} else {
						output[pos++] = QOI_OP_RGB
						output[pos++] = pixel.r
						output[pos++] = pixel.g
						output[pos++] = pixel.b
					}
				} else {
					output[pos++] = QOI_OP_RGBA
					output[pos++] = pixel.r
					output[pos++] = pixel.g
					output[pos++] = pixel.b
					output[pos++] = pixel.a
				}
			}
		}

		prev = pixel
	}

	// Write end marker (7 bytes of 0x00, 1 byte of 0x01)
	for (let i = 0; i < 7; i++) {
		output[pos++] = 0x00
	}
	output[pos++] = 0x01

	return output.slice(0, pos)
}

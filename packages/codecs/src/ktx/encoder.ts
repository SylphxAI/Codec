/**
 * KTX (Khronos Texture) encoder
 * Encodes to KTX1 format with uncompressed RGBA
 */

import type { ImageData } from '@sylphx/codec-core'
import type { KTXEncodeOptions } from './types'
import { GL_RGBA, GL_RGBA8, GL_UNSIGNED_BYTE, KTX1_MAGIC } from './types'

/**
 * Encode image to KTX format (uncompressed RGBA8)
 */
export function encodeKtx(image: ImageData, _options: KTXEncodeOptions = {}): Uint8Array {
	const { width, height, data } = image

	// Calculate sizes
	const rowBytes = width * 4
	const rowPadding = (4 - (rowBytes % 4)) % 4
	const paddedRowBytes = rowBytes + rowPadding
	const imageSize = paddedRowBytes * height

	// Header: 64 bytes + key-value (0) + imageSize (4) + image data
	const headerSize = 64
	const output = new Uint8Array(headerSize + 4 + imageSize)
	const view = new DataView(output.buffer)

	// Write magic number
	output.set(KTX1_MAGIC, 0)

	// Write header (little-endian)
	view.setUint32(12, 0x04030201, true) // Endianness
	view.setUint32(16, GL_UNSIGNED_BYTE, true) // glType
	view.setUint32(20, 1, true) // glTypeSize
	view.setUint32(24, GL_RGBA, true) // glFormat
	view.setUint32(28, GL_RGBA8, true) // glInternalFormat
	view.setUint32(32, GL_RGBA, true) // glBaseInternalFormat
	view.setUint32(36, width, true) // pixelWidth
	view.setUint32(40, height, true) // pixelHeight
	view.setUint32(44, 0, true) // pixelDepth
	view.setUint32(48, 0, true) // numberOfArrayElements
	view.setUint32(52, 1, true) // numberOfFaces
	view.setUint32(56, 1, true) // numberOfMipmapLevels
	view.setUint32(60, 0, true) // bytesOfKeyValueData

	// Write image size
	view.setUint32(64, imageSize, true)

	// Write pixel data with row padding
	let dstPos = 68

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcPos = (y * width + x) * 4
			output[dstPos++] = data[srcPos]!
			output[dstPos++] = data[srcPos + 1]!
			output[dstPos++] = data[srcPos + 2]!
			output[dstPos++] = data[srcPos + 3]!
		}
		// Add row padding
		for (let p = 0; p < rowPadding; p++) {
			output[dstPos++] = 0
		}
	}

	return output
}

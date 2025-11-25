/**
 * Sun Raster encoder
 * Supports uncompressed and RLE compressed 24-bit RGB
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	RAS_MAGIC,
	RMT_NONE,
	RT_BYTE_ENCODED,
	RT_FORMAT_RGB,
	type SunRasterEncodeOptions,
} from './types'

/**
 * Encode image to Sun Raster format
 */
export function encodeSunRaster(
	image: ImageData,
	options: SunRasterEncodeOptions = {}
): Uint8Array {
	const { width, height, data } = image
	const compress = options.compress ?? false

	// Convert to RGB data (pad rows to 16-bit boundary)
	const depth = 24
	const rowBytes = width * 3
	const paddedRowBytes = (rowBytes + 1) & ~1
	const rgbData = new Uint8Array(paddedRowBytes * height)

	for (let y = 0; y < height; y++) {
		const rowStart = y * paddedRowBytes

		for (let x = 0; x < width; x++) {
			const srcPos = (y * width + x) * 4
			const dstPos = rowStart + x * 3

			rgbData[dstPos] = data[srcPos]! // R
			rgbData[dstPos + 1] = data[srcPos + 1]! // G
			rgbData[dstPos + 2] = data[srcPos + 2]! // B
		}
	}

	let pixelData: Uint8Array
	let rasType: number

	if (compress) {
		pixelData = encodeRLE(rgbData)
		rasType = RT_BYTE_ENCODED
	} else {
		pixelData = rgbData
		rasType = RT_FORMAT_RGB
	}

	// Build output
	const headerSize = 32
	const output = new Uint8Array(headerSize + pixelData.length)
	const view = new DataView(output.buffer)

	// Write header
	view.setUint32(0, RAS_MAGIC, false) // Magic
	view.setUint32(4, width, false) // Width
	view.setUint32(8, height, false) // Height
	view.setUint32(12, depth, false) // Depth
	view.setUint32(16, pixelData.length, false) // Length
	view.setUint32(20, rasType, false) // Type
	view.setUint32(24, RMT_NONE, false) // Map type
	view.setUint32(28, 0, false) // Map length

	// Write pixel data
	output.set(pixelData, headerSize)

	return output
}

/**
 * Encode data with RLE compression
 */
function encodeRLE(data: Uint8Array): Uint8Array {
	const output: number[] = []
	let i = 0

	while (i < data.length) {
		const byte = data[i]!

		// Count consecutive identical bytes
		let runLength = 1
		while (i + runLength < data.length && runLength < 256 && data[i + runLength] === byte) {
			runLength++
		}

		if (runLength >= 3 || byte === 0x80) {
			// Use RLE encoding
			if (runLength === 1 && byte === 0x80) {
				// Literal 0x80
				output.push(0x80, 0x00)
			} else {
				// Repeat run
				output.push(0x80, runLength - 1, byte)
			}
			i += runLength
		} else {
			// Literal byte(s)
			if (byte === 0x80) {
				output.push(0x80, 0x00)
			} else {
				output.push(byte)
			}
			i++
		}
	}

	return new Uint8Array(output)
}

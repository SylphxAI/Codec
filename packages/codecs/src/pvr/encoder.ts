/**
 * PVR (PowerVR) texture encoder
 * Encodes to uncompressed RGBA8888 format
 */

import type { ImageData } from '@mconv/core'
import type { PVREncodeOptions } from './types'
import { PVR3_MAGIC } from './types'

/**
 * Encode image to PVR format (uncompressed RGBA8888)
 */
export function encodePvr(image: ImageData, _options: PVREncodeOptions = {}): Uint8Array {
	const { width, height, data } = image

	// Header size: 52 bytes, no metadata
	const headerSize = 52
	const dataSize = width * height * 4
	const output = new Uint8Array(headerSize + dataSize)
	const view = new DataView(output.buffer)

	// Write header
	view.setUint32(0, PVR3_MAGIC, true) // Version/Magic
	view.setUint32(4, 0, true) // Flags

	// Pixel format: RGBA8888 uncompressed
	// Low 32 bits: bits per channel (8,8,8,8)
	// High 32 bits: channel order ('r','g','b','a' = 0x72, 0x67, 0x62, 0x61)
	const pixelFormatLow = 0x08080808 // 8 bits each
	const pixelFormatHigh = 0x61626772 // 'rgba' reversed
	view.setUint32(8, pixelFormatLow, true)
	view.setUint32(12, pixelFormatHigh, true)

	view.setUint32(16, 0, true) // Color space (linear)
	view.setUint32(20, 0, true) // Channel type (unsigned byte normalized)
	view.setUint32(24, height, true) // Height
	view.setUint32(28, width, true) // Width
	view.setUint32(32, 1, true) // Depth
	view.setUint32(36, 1, true) // Num surfaces
	view.setUint32(40, 1, true) // Num faces
	view.setUint32(44, 1, true) // Mipmap count
	view.setUint32(48, 0, true) // Metadata size

	// Write pixel data (RGBA)
	output.set(data, headerSize)

	return output
}

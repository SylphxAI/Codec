/**
 * VTF (Valve Texture Format) encoder
 * Encodes to uncompressed RGBA8888 format
 */

import type { ImageData } from '@sylphx/codec-core'
import type { VTFEncodeOptions } from './types'
import { VTF_FORMAT, VTF_MAGIC } from './types'

/**
 * Encode image to VTF format (uncompressed RGBA8888)
 */
export function encodeVtf(image: ImageData, _options: VTFEncodeOptions = {}): Uint8Array {
	const { width, height, data } = image

	// VTF 7.2 header size
	const headerSize = 80
	const imageSize = width * height * 4
	const output = new Uint8Array(headerSize + imageSize)
	const view = new DataView(output.buffer)

	// Write header
	view.setUint32(0, VTF_MAGIC, true) // Magic
	view.setUint32(4, 7, true) // Version major
	view.setUint32(8, 2, true) // Version minor
	view.setUint32(12, headerSize, true) // Header size
	view.setUint16(16, width, true) // Width
	view.setUint16(18, height, true) // Height
	view.setUint32(20, 0, true) // Flags
	view.setUint16(24, 1, true) // Frames
	view.setUint16(26, 0, true) // First frame
	// Padding (4 bytes at 28)
	view.setFloat32(32, 0.5, true) // Reflectivity R
	view.setFloat32(36, 0.5, true) // Reflectivity G
	view.setFloat32(40, 0.5, true) // Reflectivity B
	// Padding (4 bytes at 44)
	view.setFloat32(48, 1.0, true) // Bump scale
	view.setUint32(52, VTF_FORMAT.RGBA8888, true) // High-res format
	output[56] = 1 // Mipmap count
	view.setUint32(57, 0xffffffff, true) // Low-res format (none)
	output[61] = 0 // Low-res width
	output[62] = 0 // Low-res height
	view.setUint16(63, 1, true) // Depth

	// Write pixel data
	output.set(data, headerSize)

	return output
}

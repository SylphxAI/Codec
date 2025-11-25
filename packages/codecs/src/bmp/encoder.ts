import type { ImageData } from '@sylphx/codec-core'

/**
 * Write little-endian uint16
 */
function writeU16(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
}

/**
 * Write little-endian uint32
 */
function writeU32(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

/**
 * Encode ImageData to BMP format (32-bit RGBA)
 */
export function encodeBmp(image: ImageData): Uint8Array {
	const { width, height, data } = image

	// We'll use 32-bit BITMAPV4HEADER for alpha support
	const headerSize = 14 // File header
	const dibSize = 108 // BITMAPV4HEADER
	const dataOffset = headerSize + dibSize

	// Row stride (32-bit = 4 bytes per pixel, already 4-byte aligned)
	const rowStride = width * 4
	const pixelDataSize = rowStride * height

	const fileSize = dataOffset + pixelDataSize
	const output = new Uint8Array(fileSize)

	// File header (14 bytes)
	output[0] = 0x42 // 'B'
	output[1] = 0x4d // 'M'
	writeU32(output, 2, fileSize)
	writeU16(output, 6, 0) // Reserved
	writeU16(output, 8, 0) // Reserved
	writeU32(output, 10, dataOffset)

	// BITMAPV4HEADER (108 bytes)
	writeU32(output, 14, dibSize)
	writeU32(output, 18, width)
	writeU32(output, 22, height) // Positive = bottom-up
	writeU16(output, 26, 1) // Planes
	writeU16(output, 28, 32) // Bits per pixel
	writeU32(output, 30, 3) // BI_BITFIELDS
	writeU32(output, 34, pixelDataSize)
	writeU32(output, 38, 2835) // X pixels per meter (~72 DPI)
	writeU32(output, 42, 2835) // Y pixels per meter
	writeU32(output, 46, 0) // Colors used
	writeU32(output, 50, 0) // Important colors

	// Bit masks for RGBA
	writeU32(output, 54, 0x00ff0000) // Red mask
	writeU32(output, 58, 0x0000ff00) // Green mask
	writeU32(output, 62, 0x000000ff) // Blue mask
	writeU32(output, 66, 0xff000000) // Alpha mask

	// Color space (LCS_sRGB)
	writeU32(output, 70, 0x73524742) // 'sRGB'

	// CIEXYZTRIPLE endpoints (36 bytes) - zeros for sRGB
	for (let i = 74; i < 110; i++) {
		output[i] = 0
	}

	// Gamma values (12 bytes) - zeros
	for (let i = 110; i < 122; i++) {
		output[i] = 0
	}

	// Write pixel data (bottom-up)
	for (let y = 0; y < height; y++) {
		const srcY = height - 1 - y // Flip vertically
		const srcRowOffset = srcY * width * 4
		const dstRowOffset = dataOffset + y * rowStride

		for (let x = 0; x < width; x++) {
			const srcIdx = srcRowOffset + x * 4
			const dstIdx = dstRowOffset + x * 4

			// RGBA -> BGRA
			output[dstIdx] = data[srcIdx + 2]! // B
			output[dstIdx + 1] = data[srcIdx + 1]! // G
			output[dstIdx + 2] = data[srcIdx]! // R
			output[dstIdx + 3] = data[srcIdx + 3]! // A
		}
	}

	return output
}

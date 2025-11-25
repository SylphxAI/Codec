/**
 * CUR encoder - Windows Cursor format
 */

import type { ImageData } from '@mconv/core'
import { encodePng } from '../png'
import type { CurEncodeOptions, CursorImage } from './types'

/**
 * Encode ImageData to CUR format
 */
export function encodeCur(image: ImageData, options: CurEncodeOptions = {}): Uint8Array {
	const { hotspotX = 0, hotspotY = 0, usePng = true } = options

	const cursor: CursorImage = {
		...image,
		hotspotX,
		hotspotY,
	}

	return encodeCursorFile([cursor], usePng)
}

/**
 * Encode multiple cursor images to CUR file
 */
export function encodeCursorFile(cursors: CursorImage[], usePng = true): Uint8Array {
	if (cursors.length === 0) {
		throw new Error('No cursors to encode')
	}

	// Encode each cursor image
	const encodedImages: Uint8Array[] = []
	for (const cursor of cursors) {
		if (usePng) {
			encodedImages.push(encodePng(cursor))
		} else {
			encodedImages.push(encodeBmpDib(cursor))
		}
	}

	// Calculate total size
	const headerSize = 6 // ICONDIR
	const entriesSize = cursors.length * 16 // ICONDIRENTRY * count
	let dataSize = 0
	for (const img of encodedImages) {
		dataSize += img.length
	}

	const totalSize = headerSize + entriesSize + dataSize
	const output = new Uint8Array(totalSize)

	// Write ICONDIR header
	writeU16LE(output, 0, 0) // Reserved
	writeU16LE(output, 2, 2) // Type: 2 = CUR
	writeU16LE(output, 4, cursors.length)

	// Calculate offsets
	let dataOffset = headerSize + entriesSize

	// Write entries
	for (let i = 0; i < cursors.length; i++) {
		const cursor = cursors[i]!
		const imageData = encodedImages[i]!
		const entryOffset = 6 + i * 16

		// Width/height (0 means 256)
		output[entryOffset] = cursor.width >= 256 ? 0 : cursor.width
		output[entryOffset + 1] = cursor.height >= 256 ? 0 : cursor.height
		output[entryOffset + 2] = 0 // Color count (0 for >= 256)
		output[entryOffset + 3] = 0 // Reserved

		// For CUR: planes = hotspotX, bitCount = hotspotY
		writeU16LE(output, entryOffset + 4, cursor.hotspotX)
		writeU16LE(output, entryOffset + 6, cursor.hotspotY)

		writeU32LE(output, entryOffset + 8, imageData.length)
		writeU32LE(output, entryOffset + 12, dataOffset)

		// Copy image data
		output.set(imageData, dataOffset)
		dataOffset += imageData.length
	}

	return output
}

function writeU16LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

/**
 * Encode as BMP DIB (32-bit RGBA)
 */
function encodeBmpDib(image: ImageData): Uint8Array {
	const { width, height, data } = image

	// BITMAPINFOHEADER (40 bytes) + XOR mask + AND mask
	const rowSize = width * 4 // 32-bit
	const xorMaskSize = rowSize * height
	const andRowSize = Math.ceil(width / 32) * 4
	const andMaskSize = andRowSize * height

	const headerSize = 40
	const totalSize = headerSize + xorMaskSize + andMaskSize
	const output = new Uint8Array(totalSize)

	// BITMAPINFOHEADER
	writeU32LE(output, 0, 40) // biSize
	writeU32LE(output, 4, width) // biWidth
	writeU32LE(output, 8, height * 2) // biHeight (doubled for XOR + AND)
	writeU16LE(output, 12, 1) // biPlanes
	writeU16LE(output, 14, 32) // biBitCount
	writeU32LE(output, 16, 0) // biCompression (BI_RGB)
	writeU32LE(output, 20, xorMaskSize + andMaskSize) // biSizeImage
	writeU32LE(output, 24, 0) // biXPelsPerMeter
	writeU32LE(output, 28, 0) // biYPelsPerMeter
	writeU32LE(output, 32, 0) // biClrUsed
	writeU32LE(output, 36, 0) // biClrImportant

	// XOR mask (bottom-up)
	for (let y = 0; y < height; y++) {
		const srcY = height - 1 - y
		for (let x = 0; x < width; x++) {
			const srcIdx = (srcY * width + x) * 4
			const dstIdx = headerSize + y * rowSize + x * 4

			output[dstIdx] = data[srcIdx + 2]! // B
			output[dstIdx + 1] = data[srcIdx + 1]! // G
			output[dstIdx + 2] = data[srcIdx]! // R
			output[dstIdx + 3] = data[srcIdx + 3]! // A
		}
	}

	// AND mask (transparency) - bottom-up
	const andOffset = headerSize + xorMaskSize
	for (let y = 0; y < height; y++) {
		const srcY = height - 1 - y
		for (let x = 0; x < width; x++) {
			const srcIdx = (srcY * width + x) * 4
			const alpha = data[srcIdx + 3]!

			// If transparent (alpha < 128), set AND bit
			if (alpha < 128) {
				const byteIdx = andOffset + y * andRowSize + Math.floor(x / 8)
				const bitIdx = 7 - (x % 8)
				output[byteIdx] |= 1 << bitIdx
			}
		}
	}

	return output
}

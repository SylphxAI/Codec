/**
 * CUR decoder - Windows Cursor format
 */

import type { ImageData } from '@mconv/core'
import { parseIco } from '../ico/decoder'
import { CUR_TYPE } from '../ico/types'
import { decodePng } from '../png'
import type { CursorFile, CursorImage } from './types'

/**
 * Decode CUR to ImageData (returns largest cursor)
 */
export function decodeCur(data: Uint8Array): ImageData {
	const cursor = decodeCursorFile(data)

	if (cursor.cursors.length === 0) {
		throw new Error('No cursors in CUR file')
	}

	// Find largest
	let largest = cursor.cursors[0]!
	for (const cur of cursor.cursors) {
		if (cur.width * cur.height > largest.width * largest.height) {
			largest = cur
		}
	}

	return {
		width: largest.width,
		height: largest.height,
		data: largest.data,
	}
}

/**
 * Decode CUR file with hotspot information
 */
export function decodeCursorFile(data: Uint8Array): CursorFile {
	const ico = parseIco(data)

	if (ico.type !== 'cur') {
		throw new Error('Not a CUR file')
	}

	const cursors: CursorImage[] = []

	for (let i = 0; i < ico.entries.length; i++) {
		const entry = ico.entries[i]!
		const imageData = ico.images[i]!

		// Decode the image
		const decoded = decodeImageData(imageData, entry)

		// For CUR, planes = hotspotX, bitCount = hotspotY
		cursors.push({
			width: decoded.width,
			height: decoded.height,
			data: decoded.data,
			hotspotX: entry.planes,
			hotspotY: entry.bitCount,
		})
	}

	return { cursors }
}

/**
 * Check if data is a CUR file
 */
export function isCur(data: Uint8Array): boolean {
	if (data.length < 6) return false

	const reserved = data[0]! | (data[1]! << 8)
	const type = data[2]! | (data[3]! << 8)

	return reserved === 0 && type === CUR_TYPE
}

// PNG signature
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function isPng(data: Uint8Array): boolean {
	if (data.length < 8) return false
	for (let i = 0; i < 8; i++) {
		if (data[i] !== PNG_SIG[i]) return false
	}
	return true
}

interface Entry {
	width: number
	height: number
	planes: number
	bitCount: number
}

function decodeImageData(data: Uint8Array, entry: Entry): ImageData {
	if (isPng(data)) {
		return decodePng(data)
	}

	// BMP DIB format
	return decodeBmpDib(data, entry)
}

function readU16LE(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8)
}

function readU32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
	)
}

function decodeBmpDib(data: Uint8Array, entry: Entry): ImageData {
	const dibHeaderSize = readU32LE(data, 0)
	const width = readU32LE(data, 4)
	const dibHeight = readU32LE(data, 8)
	const height = dibHeight / 2

	const bitCount = readU16LE(data, 14)
	const compression = readU32LE(data, 16)

	if (compression !== 0) {
		throw new Error(`Unsupported compression: ${compression}`)
	}

	const actualWidth = width || entry.width || 256
	const actualHeight = height || entry.height || 256

	let pixelOffset = dibHeaderSize
	const colorTable: number[][] = []

	if (bitCount <= 8) {
		const numColors = 1 << bitCount
		for (let i = 0; i < numColors; i++) {
			const b = data[pixelOffset + i * 4]!
			const g = data[pixelOffset + i * 4 + 1]!
			const r = data[pixelOffset + i * 4 + 2]!
			colorTable.push([r, g, b])
		}
		pixelOffset += numColors * 4
	}

	const rowSize = Math.ceil((actualWidth * bitCount) / 32) * 4
	const xorMaskSize = rowSize * actualHeight
	const xorMask = data.slice(pixelOffset, pixelOffset + xorMaskSize)

	const andRowSize = Math.ceil(actualWidth / 32) * 4
	const andMask = data.slice(
		pixelOffset + xorMaskSize,
		pixelOffset + xorMaskSize + andRowSize * actualHeight
	)

	const output = new Uint8Array(actualWidth * actualHeight * 4)

	for (let y = 0; y < actualHeight; y++) {
		const srcY = actualHeight - 1 - y

		for (let x = 0; x < actualWidth; x++) {
			const outIdx = (y * actualWidth + x) * 4
			let r = 0
			let g = 0
			let b = 0
			let a = 255

			if (bitCount === 32) {
				const srcIdx = srcY * rowSize + x * 4
				b = xorMask[srcIdx]!
				g = xorMask[srcIdx + 1]!
				r = xorMask[srcIdx + 2]!
				a = xorMask[srcIdx + 3]!
			} else if (bitCount === 24) {
				const srcIdx = srcY * rowSize + x * 3
				b = xorMask[srcIdx]!
				g = xorMask[srcIdx + 1]!
				r = xorMask[srcIdx + 2]!
			} else if (bitCount === 8) {
				const idx = xorMask[srcY * rowSize + x]!
				const c = colorTable[idx]!
				r = c[0]!
				g = c[1]!
				b = c[2]!
			} else if (bitCount === 4) {
				const byte = xorMask[srcY * rowSize + Math.floor(x / 2)]!
				const idx = x % 2 === 0 ? (byte >> 4) & 0x0f : byte & 0x0f
				const c = colorTable[idx]!
				r = c[0]!
				g = c[1]!
				b = c[2]!
			} else if (bitCount === 1) {
				const byte = xorMask[srcY * rowSize + Math.floor(x / 8)]!
				const bit = 7 - (x % 8)
				const idx = (byte >> bit) & 1
				const c = colorTable[idx]!
				r = c[0]!
				g = c[1]!
				b = c[2]!
			}

			if (bitCount !== 32 && andMask.length > 0) {
				const andIdx = srcY * andRowSize + Math.floor(x / 8)
				const andByte = andMask[andIdx]!
				const andBit = 7 - (x % 8)
				if ((andByte >> andBit) & 1) {
					a = 0
				}
			}

			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = a
		}
	}

	return { width: actualWidth, height: actualHeight, data: output }
}

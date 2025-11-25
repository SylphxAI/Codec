import type { ImageData } from '@mconv/core'
import { decodeBmp } from '../bmp'
import { decodePng } from '../png'
import {
	CUR_TYPE,
	ICO_TYPE,
	type IcoImage,
	type IconDir,
	type IconDirEntry,
	PNG_SIGNATURE,
} from './types'

/**
 * Read 16-bit little-endian value
 */
function readU16LE(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8)
}

/**
 * Read 32-bit little-endian value
 */
function readU32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
	)
}

/**
 * Decode ICO to ImageData
 * Returns the largest image in the ICO file
 */
export function decodeIco(data: Uint8Array): ImageData {
	const ico = parseIco(data)

	if (ico.entries.length === 0) {
		throw new Error('No images in ICO file')
	}

	// Find largest image
	let largestIdx = 0
	let largestSize = 0

	for (let i = 0; i < ico.entries.length; i++) {
		const entry = ico.entries[i]!
		const w = entry.width || 256
		const h = entry.height || 256
		const size = w * h

		if (size > largestSize) {
			largestSize = size
			largestIdx = i
		}
	}

	return decodeIcoImage(ico.images[largestIdx]!, ico.entries[largestIdx]!)
}

/**
 * Parse ICO file structure
 */
export function parseIco(data: Uint8Array): IcoImage {
	// Read ICONDIR header
	const header = readIconDir(data)

	if (header.reserved !== 0) {
		throw new Error('Invalid ICO file: reserved must be 0')
	}

	if (header.type !== ICO_TYPE && header.type !== CUR_TYPE) {
		throw new Error(`Invalid ICO file: unknown type ${header.type}`)
	}

	// Read entries
	const entries: IconDirEntry[] = []
	const images: Uint8Array[] = []

	for (let i = 0; i < header.count; i++) {
		const entryOffset = 6 + i * 16
		const entry = readIconDirEntry(data, entryOffset)
		entries.push(entry)

		// Extract image data
		const imageData = data.slice(entry.imageOffset, entry.imageOffset + entry.bytesInRes)
		images.push(imageData)
	}

	return {
		type: header.type === ICO_TYPE ? 'ico' : 'cur',
		entries,
		images,
	}
}

/**
 * Read ICONDIR header
 */
function readIconDir(data: Uint8Array): IconDir {
	return {
		reserved: readU16LE(data, 0),
		type: readU16LE(data, 2),
		count: readU16LE(data, 4),
	}
}

/**
 * Read ICONDIRENTRY
 */
function readIconDirEntry(data: Uint8Array, offset: number): IconDirEntry {
	return {
		width: data[offset]!,
		height: data[offset + 1]!,
		colorCount: data[offset + 2]!,
		reserved: data[offset + 3]!,
		planes: readU16LE(data, offset + 4),
		bitCount: readU16LE(data, offset + 6),
		bytesInRes: readU32LE(data, offset + 8),
		imageOffset: readU32LE(data, offset + 12),
	}
}

/**
 * Decode a single ICO image (PNG or BMP DIB)
 */
function decodeIcoImage(imageData: Uint8Array, entry: IconDirEntry): ImageData {
	// Check if it's a PNG
	if (isPng(imageData)) {
		return decodePng(imageData)
	}

	// Otherwise it's a BMP DIB (no file header)
	return decodeBmpDib(imageData, entry)
}

/**
 * Check if data starts with PNG signature
 */
function isPng(data: Uint8Array): boolean {
	if (data.length < 8) return false
	for (let i = 0; i < 8; i++) {
		if (data[i] !== PNG_SIGNATURE[i]) return false
	}
	return true
}

/**
 * Decode BMP DIB (Device Independent Bitmap) format
 * ICO stores BMP without the file header, just the DIB
 */
function decodeBmpDib(data: Uint8Array, entry: IconDirEntry): ImageData {
	// DIB header starts immediately
	const dibHeaderSize = readU32LE(data, 0)

	// Read dimensions from DIB header
	const width = readU32LE(data, 4)
	// Height in ICO is doubled (includes AND mask)
	const dibHeight = readU32LE(data, 8)
	const height = dibHeight / 2

	const planes = readU16LE(data, 12)
	const bitCount = readU16LE(data, 14)
	const compression = readU32LE(data, 16)

	if (compression !== 0) {
		throw new Error(`Unsupported BMP compression in ICO: ${compression}`)
	}

	// Use entry dimensions if DIB dimensions are 0
	const actualWidth = width || entry.width || 256
	const actualHeight = height || entry.height || 256

	// Calculate pixel data offset
	let pixelOffset = dibHeaderSize

	// Handle color table for <= 8 bit images
	let colorTable: number[][] = []
	if (bitCount <= 8) {
		const numColors = 1 << bitCount
		colorTable = []
		for (let i = 0; i < numColors; i++) {
			const b = data[pixelOffset + i * 4]!
			const g = data[pixelOffset + i * 4 + 1]!
			const r = data[pixelOffset + i * 4 + 2]!
			colorTable.push([r, g, b])
		}
		pixelOffset += numColors * 4
	}

	// Read XOR mask (color data)
	const rowSize = Math.ceil((actualWidth * bitCount) / 32) * 4
	const xorMaskSize = rowSize * actualHeight
	const xorMask = data.slice(pixelOffset, pixelOffset + xorMaskSize)

	// Read AND mask (transparency)
	const andRowSize = Math.ceil(actualWidth / 32) * 4
	const andMask = data.slice(
		pixelOffset + xorMaskSize,
		pixelOffset + xorMaskSize + andRowSize * actualHeight
	)

	// Decode pixels
	const output = new Uint8Array(actualWidth * actualHeight * 4)

	for (let y = 0; y < actualHeight; y++) {
		// BMP is bottom-up
		const srcY = actualHeight - 1 - y

		for (let x = 0; x < actualWidth; x++) {
			const outIdx = (y * actualWidth + x) * 4
			let r = 0
			let g = 0
			let b = 0
			let a = 255

			// Get color from XOR mask
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
				const srcIdx = srcY * rowSize + x
				const colorIdx = xorMask[srcIdx]!
				const color = colorTable[colorIdx]!
				r = color[0]!
				g = color[1]!
				b = color[2]!
			} else if (bitCount === 4) {
				const srcIdx = srcY * rowSize + Math.floor(x / 2)
				const byte = xorMask[srcIdx]!
				const colorIdx = x % 2 === 0 ? (byte >> 4) & 0x0f : byte & 0x0f
				const color = colorTable[colorIdx]!
				r = color[0]!
				g = color[1]!
				b = color[2]!
			} else if (bitCount === 1) {
				const srcIdx = srcY * rowSize + Math.floor(x / 8)
				const byte = xorMask[srcIdx]!
				const bit = 7 - (x % 8)
				const colorIdx = (byte >> bit) & 1
				const color = colorTable[colorIdx]!
				r = color[0]!
				g = color[1]!
				b = color[2]!
			}

			// Apply AND mask for transparency (if not 32-bit with alpha)
			if (bitCount !== 32 && andMask.length > 0) {
				const andIdx = srcY * andRowSize + Math.floor(x / 8)
				const andByte = andMask[andIdx]!
				const andBit = 7 - (x % 8)
				if ((andByte >> andBit) & 1) {
					a = 0 // Transparent
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

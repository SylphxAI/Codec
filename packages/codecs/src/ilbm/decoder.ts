/**
 * ILBM (InterLeaved BitMap) decoder
 * Decodes IFF ILBM and PBM images
 */

import type { ImageData } from '@mconv/core'
import {
	BMHD_MAGIC,
	BODY_MAGIC,
	CAMG_EHB,
	CAMG_HAM,
	CAMG_MAGIC,
	CMAP_MAGIC,
	FORM_MAGIC,
	ILBM_MAGIC,
	IlbmCompression,
	PBM_MAGIC,
	type IffChunk,
	type IlbmCompressionType,
	type IlbmHeader,
	type IlbmInfo,
	type IlbmMaskingType,
} from './types'

/**
 * Check if data is an IFF ILBM file
 */
export function isIlbm(data: Uint8Array): boolean {
	if (data.length < 12) return false
	const form = readU32BE(data, 0)
	const type = readU32BE(data, 8)
	return form === FORM_MAGIC && (type === ILBM_MAGIC || type === PBM_MAGIC)
}

/**
 * Parse ILBM header
 */
export function parseIlbmHeader(data: Uint8Array): IlbmHeader {
	if (!isIlbm(data)) {
		throw new Error('Invalid ILBM: bad magic number')
	}

	const chunks = parseChunks(data)
	const bmhd = chunks.find((c) => c.type === BMHD_MAGIC)

	if (!bmhd || bmhd.data.length < 20) {
		throw new Error('Invalid ILBM: missing BMHD chunk')
	}

	return {
		width: readU16BE(bmhd.data, 0),
		height: readU16BE(bmhd.data, 2),
		xOrigin: readI16BE(bmhd.data, 4),
		yOrigin: readI16BE(bmhd.data, 6),
		numPlanes: bmhd.data[8]!,
		masking: bmhd.data[9]! as IlbmMaskingType,
		compression: bmhd.data[10]! as IlbmCompressionType,
		transparentColor: readU16BE(bmhd.data, 12),
		xAspect: bmhd.data[14]!,
		yAspect: bmhd.data[15]!,
		pageWidth: readU16BE(bmhd.data, 16),
		pageHeight: readU16BE(bmhd.data, 18),
	}
}

/**
 * Parse ILBM info
 */
export function parseIlbmInfo(data: Uint8Array): IlbmInfo {
	const header = parseIlbmHeader(data)
	const chunks = parseChunks(data)

	// Check for CAMG (Amiga display mode)
	const camg = chunks.find((c) => c.type === CAMG_MAGIC)
	let displayMode = 0
	if (camg && camg.data.length >= 4) {
		displayMode = readU32BE(camg.data, 0)
	}

	const isHAM = (displayMode & CAMG_HAM) !== 0
	const isEHB = (displayMode & CAMG_EHB) !== 0

	return {
		width: header.width,
		height: header.height,
		numColors: 1 << header.numPlanes,
		numPlanes: header.numPlanes,
		isHAM,
		isEHB,
		hasTransparency: header.masking !== 0,
		compression: header.compression,
	}
}

/**
 * Decode ILBM image
 */
export function decodeIlbm(data: Uint8Array): ImageData {
	const header = parseIlbmHeader(data)
	const info = parseIlbmInfo(data)
	const chunks = parseChunks(data)
	const isPBM = readU32BE(data, 8) === PBM_MAGIC

	// Get palette
	const cmap = chunks.find((c) => c.type === CMAP_MAGIC)
	const palette = cmap ? parsePalette(cmap.data, info.isEHB) : createGrayPalette(info.numColors)

	// Get body data
	const body = chunks.find((c) => c.type === BODY_MAGIC)
	if (!body) {
		throw new Error('Invalid ILBM: missing BODY chunk')
	}

	// Decompress if needed
	let bodyData = body.data
	if (header.compression === IlbmCompression.BYTERUN1) {
		bodyData = decompressByteRun1(body.data, header.width, header.height, header.numPlanes, isPBM)
	}

	// Convert to RGBA
	if (isPBM) {
		return decodePBM(bodyData, header, palette)
	}

	if (info.isHAM) {
		return decodeHAM(bodyData, header, palette)
	}

	return decodeILBM(bodyData, header, palette)
}

/**
 * Parse IFF chunks
 */
function parseChunks(data: Uint8Array): IffChunk[] {
	const chunks: IffChunk[] = []
	let offset = 12 // Skip FORM header + type

	while (offset < data.length - 8) {
		const type = readU32BE(data, offset)
		const size = readU32BE(data, offset + 4)

		if (offset + 8 + size > data.length) break

		chunks.push({
			type,
			data: data.slice(offset + 8, offset + 8 + size),
		})

		// Chunks are word-aligned
		offset += 8 + size
		if (size % 2 === 1) offset++
	}

	return chunks
}

/**
 * Parse color palette
 */
function parsePalette(data: Uint8Array, isEHB: boolean): Uint8Array {
	const numColors = data.length / 3
	const totalColors = isEHB ? numColors * 2 : numColors
	const palette = new Uint8Array(totalColors * 3)

	// Copy original colors
	for (let i = 0; i < numColors; i++) {
		palette[i * 3] = data[i * 3]!
		palette[i * 3 + 1] = data[i * 3 + 1]!
		palette[i * 3 + 2] = data[i * 3 + 2]!
	}

	// For EHB mode, generate half-brightness copies
	if (isEHB) {
		for (let i = 0; i < numColors; i++) {
			palette[(numColors + i) * 3] = data[i * 3]! >> 1
			palette[(numColors + i) * 3 + 1] = data[i * 3 + 1]! >> 1
			palette[(numColors + i) * 3 + 2] = data[i * 3 + 2]! >> 1
		}
	}

	return palette
}

/**
 * Create grayscale palette
 */
function createGrayPalette(numColors: number): Uint8Array {
	const palette = new Uint8Array(numColors * 3)
	for (let i = 0; i < numColors; i++) {
		const gray = Math.round((i / (numColors - 1)) * 255)
		palette[i * 3] = gray
		palette[i * 3 + 1] = gray
		palette[i * 3 + 2] = gray
	}
	return palette
}

/**
 * Decompress ByteRun1 RLE data
 */
function decompressByteRun1(
	data: Uint8Array,
	width: number,
	height: number,
	numPlanes: number,
	isPBM: boolean
): Uint8Array {
	const rowBytes = Math.ceil(width / 8)
	const outputSize = isPBM ? width * height : rowBytes * numPlanes * height
	const output = new Uint8Array(outputSize)

	let inPos = 0
	let outPos = 0

	while (inPos < data.length && outPos < outputSize) {
		const n = data[inPos]!
		inPos++

		if (n < 128) {
			// Copy n+1 bytes literally
			const count = n + 1
			for (let i = 0; i < count && outPos < outputSize; i++) {
				output[outPos++] = data[inPos++]!
			}
		} else if (n > 128) {
			// Repeat next byte (257-n) times
			const count = 257 - n
			const value = data[inPos++]!
			for (let i = 0; i < count && outPos < outputSize; i++) {
				output[outPos++] = value
			}
		}
		// n === 128 is a no-op
	}

	return output
}

/**
 * Decode standard interleaved ILBM
 */
function decodeILBM(data: Uint8Array, header: IlbmHeader, palette: Uint8Array): ImageData {
	const { width, height, numPlanes } = header
	const output = new Uint8Array(width * height * 4)
	const rowBytes = Math.ceil(width / 8)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const byteIndex = Math.floor(x / 8)
			const bitIndex = 7 - (x % 8)

			// Build color index from bitplanes
			let colorIndex = 0
			for (let p = 0; p < numPlanes; p++) {
				const planeOffset = y * rowBytes * numPlanes + p * rowBytes + byteIndex
				const bit = (data[planeOffset]! >> bitIndex) & 1
				colorIndex |= bit << p
			}

			// Get color from palette
			const outIdx = (y * width + x) * 4
			output[outIdx] = palette[colorIndex * 3]!
			output[outIdx + 1] = palette[colorIndex * 3 + 1]!
			output[outIdx + 2] = palette[colorIndex * 3 + 2]!
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

/**
 * Decode HAM (Hold And Modify) mode
 */
function decodeHAM(data: Uint8Array, header: IlbmHeader, palette: Uint8Array): ImageData {
	const { width, height, numPlanes } = header
	const output = new Uint8Array(width * height * 4)
	const rowBytes = Math.ceil(width / 8)
	const colorBits = numPlanes - 2 // HAM uses 2 bits for mode

	for (let y = 0; y < height; y++) {
		let r = 0,
			g = 0,
			b = 0

		for (let x = 0; x < width; x++) {
			const byteIndex = Math.floor(x / 8)
			const bitIndex = 7 - (x % 8)

			// Build value from bitplanes
			let value = 0
			for (let p = 0; p < numPlanes; p++) {
				const planeOffset = y * rowBytes * numPlanes + p * rowBytes + byteIndex
				const bit = (data[planeOffset]! >> bitIndex) & 1
				value |= bit << p
			}

			// HAM mode: top 2 bits select mode, bottom bits are value
			const mode = value >> colorBits
			const colorValue = value & ((1 << colorBits) - 1)

			switch (mode) {
				case 0:
					// Use palette color
					r = palette[colorValue * 3]!
					g = palette[colorValue * 3 + 1]!
					b = palette[colorValue * 3 + 2]!
					break
				case 1:
					// Modify blue
					b = colorValue << (8 - colorBits)
					break
				case 2:
					// Modify red
					r = colorValue << (8 - colorBits)
					break
				case 3:
					// Modify green
					g = colorValue << (8 - colorBits)
					break
			}

			const outIdx = (y * width + x) * 4
			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

/**
 * Decode PBM (chunky pixel) format
 */
function decodePBM(data: Uint8Array, header: IlbmHeader, palette: Uint8Array): ImageData {
	const { width, height } = header
	const output = new Uint8Array(width * height * 4)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const colorIndex = data[y * width + x]!
			const outIdx = (y * width + x) * 4
			output[outIdx] = palette[colorIndex * 3]!
			output[outIdx + 1] = palette[colorIndex * 3 + 1]!
			output[outIdx + 2] = palette[colorIndex * 3 + 2]!
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

// Binary reading helpers
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

function readI16BE(data: Uint8Array, offset: number): number {
	const u = readU16BE(data, offset)
	return u > 0x7fff ? u - 0x10000 : u
}

function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) >>> 0) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

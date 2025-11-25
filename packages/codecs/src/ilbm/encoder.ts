/**
 * ILBM (InterLeaved BitMap) encoder
 * Encodes images to IFF ILBM format
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	BMHD_MAGIC,
	BODY_MAGIC,
	CMAP_MAGIC,
	FORM_MAGIC,
	ILBM_MAGIC,
	IlbmCompression,
	IlbmMasking,
	type IlbmEncodeOptions,
} from './types'

/**
 * Encode image to ILBM
 */
export function encodeIlbm(image: ImageData, options: IlbmEncodeOptions = {}): Uint8Array {
	const { compress = true } = options
	const { width, height, data } = image

	// Quantize to palette (max 256 colors)
	const { palette, indexed, numPlanes } = quantizeImage(image, options.numPlanes)

	// Build chunks
	const chunks: Uint8Array[] = []

	// BMHD chunk
	chunks.push(createBMHD(width, height, numPlanes, compress))

	// CMAP chunk
	chunks.push(createCMAP(palette))

	// BODY chunk
	const bodyData = encodeBody(indexed, width, height, numPlanes, compress)
	chunks.push(createChunk(BODY_MAGIC, bodyData))

	// Calculate total size
	let dataSize = 4 // ILBM type
	for (const chunk of chunks) {
		dataSize += chunk.length
	}

	// Build FORM
	const output = new Uint8Array(8 + dataSize)
	writeU32BE(output, 0, FORM_MAGIC)
	writeU32BE(output, 4, dataSize)
	writeU32BE(output, 8, ILBM_MAGIC)

	let offset = 12
	for (const chunk of chunks) {
		output.set(chunk, offset)
		offset += chunk.length
	}

	return output
}

/**
 * Quantize image to indexed palette
 */
function quantizeImage(
	image: ImageData,
	targetPlanes?: number
): { palette: Uint8Array; indexed: Uint8Array; numPlanes: number } {
	const { width, height, data } = image
	const maxColors = targetPlanes ? 1 << targetPlanes : 256

	// Collect unique colors (simplified quantization)
	const colorCounts = new Map<number, number>()

	for (let i = 0; i < data.length; i += 4) {
		// Reduce to 4 bits per channel for better quantization
		const r = data[i]! >> 4
		const g = data[i + 1]! >> 4
		const b = data[i + 2]! >> 4
		const key = (r << 8) | (g << 4) | b
		colorCounts.set(key, (colorCounts.get(key) || 0) + 1)
	}

	// Sort by frequency and take top colors
	const sortedColors = Array.from(colorCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, maxColors)
		.map(([key]) => key)

	// Ensure power of 2 colors - use targetPlanes if specified
	const numColors = targetPlanes
		? 1 << targetPlanes
		: Math.max(2, 1 << Math.ceil(Math.log2(sortedColors.length)))

	// Build palette
	const palette = new Uint8Array(numColors * 3)
	for (let i = 0; i < sortedColors.length; i++) {
		const key = sortedColors[i]!
		palette[i * 3] = ((key >> 8) & 0xf) << 4
		palette[i * 3 + 1] = ((key >> 4) & 0xf) << 4
		palette[i * 3 + 2] = (key & 0xf) << 4
	}

	// Build color lookup
	const colorLookup = new Map<number, number>()
	for (let i = 0; i < sortedColors.length; i++) {
		colorLookup.set(sortedColors[i]!, i)
	}

	// Index pixels
	const indexed = new Uint8Array(width * height)
	for (let i = 0; i < data.length / 4; i++) {
		const r = data[i * 4]! >> 4
		const g = data[i * 4 + 1]! >> 4
		const b = data[i * 4 + 2]! >> 4
		const key = (r << 8) | (g << 4) | b

		let colorIdx = colorLookup.get(key)
		if (colorIdx === undefined) {
			colorIdx = findNearestColor(r << 4, g << 4, b << 4, palette, sortedColors.length)
		}

		indexed[i] = colorIdx
	}

	const numPlanes = Math.ceil(Math.log2(numColors))
	return { palette, indexed, numPlanes }
}

/**
 * Find nearest color in palette
 */
function findNearestColor(r: number, g: number, b: number, palette: Uint8Array, count: number): number {
	let best = 0
	let bestDist = Number.MAX_VALUE

	for (let i = 0; i < count; i++) {
		const pr = palette[i * 3]!
		const pg = palette[i * 3 + 1]!
		const pb = palette[i * 3 + 2]!
		const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
		if (dist < bestDist) {
			bestDist = dist
			best = i
		}
	}

	return best
}

/**
 * Create BMHD chunk
 */
function createBMHD(
	width: number,
	height: number,
	numPlanes: number,
	compress: boolean
): Uint8Array {
	const data = new Uint8Array(20)

	writeU16BE(data, 0, width)
	writeU16BE(data, 2, height)
	writeI16BE(data, 4, 0) // xOrigin
	writeI16BE(data, 6, 0) // yOrigin
	data[8] = numPlanes
	data[9] = IlbmMasking.NONE
	data[10] = compress ? IlbmCompression.BYTERUN1 : IlbmCompression.NONE
	data[11] = 0 // pad
	writeU16BE(data, 12, 0) // transparentColor
	data[14] = 1 // xAspect
	data[15] = 1 // yAspect
	writeU16BE(data, 16, width) // pageWidth
	writeU16BE(data, 18, height) // pageHeight

	return createChunk(BMHD_MAGIC, data)
}

/**
 * Create CMAP chunk
 */
function createCMAP(palette: Uint8Array): Uint8Array {
	return createChunk(CMAP_MAGIC, palette)
}

/**
 * Encode body data (interleaved bitplanes)
 */
function encodeBody(
	indexed: Uint8Array,
	width: number,
	height: number,
	numPlanes: number,
	compress: boolean
): Uint8Array {
	const rowBytes = Math.ceil(width / 8)
	const planeData = new Uint8Array(rowBytes * numPlanes * height)

	// Convert indexed to interleaved bitplanes
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const colorIndex = indexed[y * width + x]!
			const byteIndex = Math.floor(x / 8)
			const bitIndex = 7 - (x % 8)

			// Set bits in each plane
			for (let p = 0; p < numPlanes; p++) {
				const bit = (colorIndex >> p) & 1
				const planeOffset = y * rowBytes * numPlanes + p * rowBytes + byteIndex
				planeData[planeOffset] |= bit << bitIndex
			}
		}
	}

	if (!compress) {
		return planeData
	}

	// ByteRun1 compression
	return compressByteRun1(planeData)
}

/**
 * ByteRun1 RLE compression
 */
function compressByteRun1(data: Uint8Array): Uint8Array {
	const output: number[] = []
	let i = 0

	while (i < data.length) {
		// Check for run
		let runLength = 1
		while (i + runLength < data.length && runLength < 128 && data[i + runLength] === data[i]) {
			runLength++
		}

		if (runLength >= 3) {
			// Encode run
			output.push(257 - runLength)
			output.push(data[i]!)
			i += runLength
		} else {
			// Literal sequence
			let litLength = 1
			while (i + litLength < data.length && litLength < 128) {
				// Check if next bytes form a run
				if (
					i + litLength + 2 < data.length &&
					data[i + litLength] === data[i + litLength + 1] &&
					data[i + litLength] === data[i + litLength + 2]
				) {
					break
				}
				litLength++
			}

			output.push(litLength - 1)
			for (let j = 0; j < litLength; j++) {
				output.push(data[i + j]!)
			}
			i += litLength
		}
	}

	return new Uint8Array(output)
}

/**
 * Create IFF chunk
 */
function createChunk(type: number, data: Uint8Array): Uint8Array {
	const padded = data.length % 2 === 1
	const chunk = new Uint8Array(8 + data.length + (padded ? 1 : 0))

	writeU32BE(chunk, 0, type)
	writeU32BE(chunk, 4, data.length)
	chunk.set(data, 8)

	return chunk
}

// Binary writing helpers
function writeU16BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 8) & 0xff
	data[offset + 1] = value & 0xff
}

function writeI16BE(data: Uint8Array, offset: number, value: number): void {
	writeU16BE(data, offset, value < 0 ? value + 0x10000 : value)
}

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 24) & 0xff
	data[offset + 1] = (value >> 16) & 0xff
	data[offset + 2] = (value >> 8) & 0xff
	data[offset + 3] = value & 0xff
}

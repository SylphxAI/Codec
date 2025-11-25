import type { ImageData } from '@sylphx/codec-core'
import { VP8LBitReader, buildHuffmanTable, decodeHuffman, readHuffmanCodeLength } from './bitstream'
import {
	CHUNK_VP8,
	CHUNK_VP8L,
	CHUNK_VP8X,
	RIFF_SIGNATURE,
	TransformType,
	VP8L_SIGNATURE,
	WEBP_SIGNATURE,
} from './types'

/**
 * Read 32-bit little-endian value
 */
function readU32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
	)
}

/**
 * Decode WebP to ImageData
 */
export function decodeWebP(data: Uint8Array): ImageData {
	// Verify RIFF header
	if (readU32LE(data, 0) !== RIFF_SIGNATURE) {
		throw new Error('Invalid WebP signature: not a RIFF file')
	}

	// const fileSize = readU32LE(data, 4) + 8

	// Verify WEBP signature
	if (readU32LE(data, 8) !== WEBP_SIGNATURE) {
		throw new Error('Invalid WebP signature: not a WEBP file')
	}

	// Parse chunks
	let pos = 12

	while (pos < data.length) {
		const chunkType = readU32LE(data, pos)
		const chunkSize = readU32LE(data, pos + 4)
		const chunkData = data.slice(pos + 8, pos + 8 + chunkSize)

		switch (chunkType) {
			case CHUNK_VP8L:
				return decodeVP8L(chunkData)

			case CHUNK_VP8:
				throw new Error('Lossy VP8 WebP not yet supported')

			case CHUNK_VP8X:
				// Extended format - continue to find VP8/VP8L chunk
				break

			default:
				// Skip unknown chunks
				break
		}

		// Move to next chunk (padded to even boundary)
		pos += 8 + chunkSize + (chunkSize & 1)
	}

	throw new Error('No image data found in WebP')
}

/**
 * Decode VP8L (lossless) bitstream
 */
function decodeVP8L(data: Uint8Array): ImageData {
	// Check signature
	if (data[0] !== VP8L_SIGNATURE) {
		throw new Error('Invalid VP8L signature')
	}

	const reader = new VP8LBitReader(data, 1)

	// Read image size
	const width = reader.readBits(14) + 1
	const height = reader.readBits(14) + 1
	const hasAlpha = reader.readBit() === 1
	const version = reader.readBits(3)

	if (version !== 0) {
		throw new Error(`Unsupported VP8L version: ${version}`)
	}

	// Read transforms
	const transforms: Transform[] = []
	while (reader.readBit()) {
		const transform = readTransform(reader, width, height)
		transforms.unshift(transform) // Reverse order for decoding
	}

	// Read color cache size
	let colorCacheSize = 0
	if (reader.readBit()) {
		const colorCacheBits = reader.readBits(4)
		if (colorCacheBits > 11) {
			throw new Error(`Invalid color cache bits: ${colorCacheBits}`)
		}
		colorCacheSize = 1 << colorCacheBits
	}

	// Decode image data
	const pixels = decodeImageData(reader, width, height, colorCacheSize)

	// Apply inverse transforms
	let result = pixels
	for (const transform of transforms) {
		result = applyInverseTransform(result, transform, width, height)
	}

	// Convert ARGB to RGBA
	const output = new Uint8Array(width * height * 4)
	for (let i = 0; i < width * height; i++) {
		const argb = result[i]!
		output[i * 4] = (argb >> 16) & 0xff // R
		output[i * 4 + 1] = (argb >> 8) & 0xff // G
		output[i * 4 + 2] = argb & 0xff // B
		output[i * 4 + 3] = hasAlpha ? (argb >> 24) & 0xff : 255 // A
	}

	return { width, height, data: output }
}

interface Transform {
	type: TransformType
	data?: Uint32Array
	bits?: number
	numColors?: number
}

/**
 * Read a transform from the bitstream
 */
function readTransform(_reader: VP8LBitReader, _width: number, _height: number): Transform {
	// Simplified - just handle SubtractGreen for basic decoding
	throw new Error('Transforms not yet fully supported')
}

/**
 * Decode image data using entropy coding
 */
function decodeImageData(
	reader: VP8LBitReader,
	width: number,
	height: number,
	colorCacheSize: number
): Uint32Array {
	const numPixels = width * height
	const pixels = new Uint32Array(numPixels)

	// Color cache
	const colorCache = colorCacheSize > 0 ? new Uint32Array(colorCacheSize) : null

	// Read meta Huffman codes indicator
	const useMetaHuffman = reader.readBit()

	let huffmanTables: HuffmanGroup[]

	if (useMetaHuffman) {
		throw new Error('Meta Huffman codes not yet supported')
	}
	// Single Huffman group for entire image
	huffmanTables = [readHuffmanGroup(reader, colorCacheSize)]

	// Decode pixels
	let pixelIdx = 0
	while (pixelIdx < numPixels) {
		const group = huffmanTables[0]!
		const code = decodeHuffman(reader, group.green)

		if (code < 256) {
			// Literal
			const green = code
			const red = decodeHuffman(reader, group.red)
			const blue = decodeHuffman(reader, group.blue)
			const alpha = decodeHuffman(reader, group.alpha)

			const pixel = (alpha << 24) | (red << 16) | (green << 8) | blue
			pixels[pixelIdx++] = pixel

			if (colorCache) {
				const hash = (pixel * 0x1e35a7bd) >>> (32 - Math.log2(colorCacheSize))
				colorCache[hash] = pixel
			}
		} else if (code < 256 + 24) {
			// Backward reference
			const lengthCode = code - 256
			const length = decodeLengthOrDistance(reader, lengthCode)

			const distanceCode = decodeHuffman(reader, group.distance)
			const distance = decodeLengthOrDistance(reader, distanceCode)

			// Copy pixels
			for (let i = 0; i < length && pixelIdx < numPixels; i++) {
				const srcIdx = pixelIdx - distance
				if (srcIdx < 0) {
					pixels[pixelIdx++] = 0xff000000 // Black with alpha
				} else {
					const pixel = pixels[srcIdx]!
					pixels[pixelIdx++] = pixel

					if (colorCache) {
						const hash = (pixel * 0x1e35a7bd) >>> (32 - Math.log2(colorCacheSize))
						colorCache[hash] = pixel
					}
				}
			}
		} else if (colorCache) {
			// Color cache lookup
			const cacheIdx = code - 256 - 24
			if (cacheIdx < colorCacheSize) {
				const pixel = colorCache[cacheIdx]!
				pixels[pixelIdx++] = pixel
			}
		}
	}

	return pixels
}

interface HuffmanGroup {
	green: { codes: number[]; lengths: number[] }
	red: { codes: number[]; lengths: number[] }
	blue: { codes: number[]; lengths: number[] }
	alpha: { codes: number[]; lengths: number[] }
	distance: { codes: number[]; lengths: number[] }
}

/**
 * Read a Huffman group (5 Huffman codes)
 */
function readHuffmanGroup(reader: VP8LBitReader, colorCacheSize: number): HuffmanGroup {
	// Green/length/cache: 256 literals + 24 length codes + cache size
	const greenSize = 256 + 24 + colorCacheSize
	const greenLengths = readHuffmanCodeLength(reader, greenSize)

	// Red, Blue, Alpha: 256 symbols each
	const redLengths = readHuffmanCodeLength(reader, 256)
	const blueLengths = readHuffmanCodeLength(reader, 256)
	const alphaLengths = readHuffmanCodeLength(reader, 256)

	// Distance: 40 symbols
	const distanceLengths = readHuffmanCodeLength(reader, 40)

	return {
		green: buildHuffmanTable(greenLengths),
		red: buildHuffmanTable(redLengths),
		blue: buildHuffmanTable(blueLengths),
		alpha: buildHuffmanTable(alphaLengths),
		distance: buildHuffmanTable(distanceLengths),
	}
}

/**
 * Decode length or distance from extra bits
 */
function decodeLengthOrDistance(reader: VP8LBitReader, code: number): number {
	// Length/distance prefix codes
	const extraBits = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]
	const offsets = [
		1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
		3073,
	]

	if (code < extraBits.length) {
		const extra = extraBits[code]!
		const offset = offsets[code]!
		return offset + reader.readBits(extra)
	}

	return code + 1
}

/**
 * Apply inverse transform
 */
function applyInverseTransform(
	pixels: Uint32Array,
	transform: Transform,
	_width: number,
	_height: number
): Uint32Array {
	switch (transform.type) {
		case TransformType.SubtractGreen:
			// Add green back to red and blue
			for (let i = 0; i < pixels.length; i++) {
				const pixel = pixels[i]!
				const green = (pixel >> 8) & 0xff
				let red = (pixel >> 16) & 0xff
				let blue = pixel & 0xff

				red = (red + green) & 0xff
				blue = (blue + green) & 0xff

				pixels[i] = (pixel & 0xff00ff00) | (red << 16) | blue
			}
			return pixels

		default:
			return pixels
	}
}

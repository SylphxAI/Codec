/**
 * Sun Raster decoder
 * Supports uncompressed and RLE compressed formats
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	RAS_MAGIC,
	RMT_EQUAL_RGB,
	RMT_NONE,
	RT_BYTE_ENCODED,
	RT_FORMAT_RGB,
	RT_STANDARD,
} from './types'

/**
 * Decode Sun Raster image to RGBA
 */
export function decodeSunRaster(data: Uint8Array): ImageData {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	// Read header (32 bytes)
	const magic = view.getUint32(0, false) // Big-endian
	if (magic !== RAS_MAGIC) {
		throw new Error('Invalid Sun Raster: wrong magic number')
	}

	const width = view.getUint32(4, false)
	const height = view.getUint32(8, false)
	const depth = view.getUint32(12, false)
	const rasType = view.getUint32(20, false)
	const mapType = view.getUint32(24, false)
	const mapLength = view.getUint32(28, false)

	if (width === 0 || height === 0) {
		throw new Error('Invalid Sun Raster dimensions')
	}

	// Read colormap if present
	let colormap: Uint8Array | null = null
	let headerEnd = 32

	if (mapType === RMT_EQUAL_RGB && mapLength > 0) {
		colormap = data.subarray(32, 32 + mapLength)
		headerEnd = 32 + mapLength
	} else if (mapType !== RMT_NONE && mapLength > 0) {
		headerEnd = 32 + mapLength // Skip unknown colormap types
	}

	// Decode pixel data
	let pixelData: Uint8Array

	if (rasType === RT_BYTE_ENCODED) {
		pixelData = decodeRLE(data.subarray(headerEnd), width, height, depth)
	} else {
		pixelData = data.subarray(headerEnd)
	}

	// Convert to RGBA
	const isRgb = rasType === RT_FORMAT_RGB
	return convertToRGBA(pixelData, width, height, depth, colormap, isRgb)
}

/**
 * Decode RLE compressed data
 */
function decodeRLE(data: Uint8Array, width: number, height: number, depth: number): Uint8Array {
	const bytesPerPixel = Math.ceil(depth / 8)
	const rowBytes = Math.ceil((width * depth) / 8)
	const paddedRowBytes = (rowBytes + 1) & ~1 // Pad to 16-bit boundary
	const output = new Uint8Array(paddedRowBytes * height)

	let srcPos = 0
	let dstPos = 0

	while (dstPos < output.length && srcPos < data.length) {
		const byte = data[srcPos++]!

		if (byte === 0x80) {
			// Escape byte
			const count = data[srcPos++]!

			if (count === 0) {
				// Literal 0x80
				output[dstPos++] = 0x80
			} else {
				// Repeat next byte (count + 1) times
				const value = data[srcPos++]!
				for (let i = 0; i <= count && dstPos < output.length; i++) {
					output[dstPos++] = value
				}
			}
		} else {
			output[dstPos++] = byte
		}
	}

	return output
}

/**
 * Convert pixel data to RGBA
 */
function convertToRGBA(
	data: Uint8Array,
	width: number,
	height: number,
	depth: number,
	colormap: Uint8Array | null,
	isRgb: boolean
): ImageData {
	const pixels = new Uint8Array(width * height * 4)
	const rowBytes = Math.ceil((width * depth) / 8)
	const paddedRowBytes = (rowBytes + 1) & ~1

	for (let y = 0; y < height; y++) {
		const rowStart = y * paddedRowBytes

		for (let x = 0; x < width; x++) {
			const dstPos = (y * width + x) * 4

			if (depth === 1) {
				// 1-bit monochrome
				const byteIdx = Math.floor(x / 8)
				const bitIdx = 7 - (x % 8)
				const bit = (data[rowStart + byteIdx]! >> bitIdx) & 1
				const color = bit ? 0 : 255 // 1 = black, 0 = white
				pixels[dstPos] = color
				pixels[dstPos + 1] = color
				pixels[dstPos + 2] = color
				pixels[dstPos + 3] = 255
			} else if (depth === 8) {
				// 8-bit indexed or grayscale
				const idx = data[rowStart + x]!

				if (colormap) {
					const mapSize = colormap.length / 3
					pixels[dstPos] = colormap[idx]! // R
					pixels[dstPos + 1] = colormap[mapSize + idx]! // G
					pixels[dstPos + 2] = colormap[mapSize * 2 + idx]! // B
					pixels[dstPos + 3] = 255
				} else {
					pixels[dstPos] = idx
					pixels[dstPos + 1] = idx
					pixels[dstPos + 2] = idx
					pixels[dstPos + 3] = 255
				}
			} else if (depth === 24) {
				// 24-bit RGB or BGR
				const srcPos = rowStart + x * 3

				if (isRgb) {
					pixels[dstPos] = data[srcPos]!
					pixels[dstPos + 1] = data[srcPos + 1]!
					pixels[dstPos + 2] = data[srcPos + 2]!
				} else {
					// BGR
					pixels[dstPos] = data[srcPos + 2]!
					pixels[dstPos + 1] = data[srcPos + 1]!
					pixels[dstPos + 2] = data[srcPos]!
				}
				pixels[dstPos + 3] = 255
			} else if (depth === 32) {
				// 32-bit ARGB or ABGR
				const srcPos = rowStart + x * 4

				if (isRgb) {
					pixels[dstPos] = data[srcPos + 1]! // R
					pixels[dstPos + 1] = data[srcPos + 2]! // G
					pixels[dstPos + 2] = data[srcPos + 3]! // B
					pixels[dstPos + 3] = data[srcPos]! // A
				} else {
					pixels[dstPos] = data[srcPos + 3]! // R
					pixels[dstPos + 1] = data[srcPos + 2]! // G
					pixels[dstPos + 2] = data[srcPos + 1]! // B
					pixels[dstPos + 3] = data[srcPos]! // A
				}
			} else {
				throw new Error(`Unsupported Sun Raster depth: ${depth}`)
			}
		}
	}

	return { width, height, data: pixels }
}

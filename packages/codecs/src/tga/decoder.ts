import type { ImageData } from '@sylphx/codec-core'
import {
	ORIGIN_BOTTOM_RIGHT,
	ORIGIN_MASK,
	ORIGIN_TOP_LEFT,
	ORIGIN_TOP_RIGHT,
	type TgaHeader,
	TgaImageType,
} from './types'

/**
 * Decode TGA to ImageData
 */
export function decodeTga(data: Uint8Array): ImageData {
	const header = readHeader(data)
	const { width, height, pixelDepth, imageType, imageDescriptor } = header

	if (width === 0 || height === 0) {
		throw new Error('Invalid TGA dimensions')
	}

	// Skip header and image ID
	let offset = 18 + header.idLength

	// Read color map if present
	let colorMap: Uint8Array | null = null
	if (header.colorMapType === 1) {
		const entrySize = Math.ceil(header.colorMapDepth / 8)
		const mapSize = header.colorMapLength * entrySize
		colorMap = data.slice(offset, offset + mapSize)
		offset += mapSize
	}

	// Read pixel data
	const isRLE = imageType >= 8
	const pixelData = isRLE ? decodeRLE(data, offset, width * height, pixelDepth) : data.slice(offset)

	// Convert to RGBA
	const output = new Uint8Array(width * height * 4)
	const origin = imageDescriptor & ORIGIN_MASK
	const flipY = origin === ORIGIN_TOP_LEFT || origin === ORIGIN_TOP_RIGHT
	const flipX = origin === ORIGIN_TOP_RIGHT || origin === ORIGIN_BOTTOM_RIGHT

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcY = flipY ? y : height - 1 - y
			const srcX = flipX ? width - 1 - x : x
			const srcIdx = srcY * width + srcX
			const dstIdx = (y * width + x) * 4

			const pixel = readPixel(pixelData, srcIdx, pixelDepth, imageType, colorMap, header)
			output[dstIdx] = pixel.r
			output[dstIdx + 1] = pixel.g
			output[dstIdx + 2] = pixel.b
			output[dstIdx + 3] = pixel.a
		}
	}

	return { width, height, data: output }
}

/**
 * Read TGA header
 */
function readHeader(data: Uint8Array): TgaHeader {
	if (data.length < 18) {
		throw new Error('Invalid TGA: too small')
	}

	return {
		idLength: data[0]!,
		colorMapType: data[1]!,
		imageType: data[2]! as TgaImageType,
		colorMapOrigin: data[3]! | (data[4]! << 8),
		colorMapLength: data[5]! | (data[6]! << 8),
		colorMapDepth: data[7]!,
		xOrigin: data[8]! | (data[9]! << 8),
		yOrigin: data[10]! | (data[11]! << 8),
		width: data[12]! | (data[13]! << 8),
		height: data[14]! | (data[15]! << 8),
		pixelDepth: data[16]!,
		imageDescriptor: data[17]!,
	}
}

/**
 * Decode RLE-compressed pixel data
 */
function decodeRLE(
	data: Uint8Array,
	offset: number,
	numPixels: number,
	pixelDepth: number
): Uint8Array {
	const bytesPerPixel = Math.ceil(pixelDepth / 8)
	const output = new Uint8Array(numPixels * bytesPerPixel)
	let srcPos = offset
	let dstPos = 0

	while (dstPos < output.length && srcPos < data.length) {
		const packet = data[srcPos++]!
		const count = (packet & 0x7f) + 1

		if (packet & 0x80) {
			// RLE packet: repeat single pixel
			const pixel = data.slice(srcPos, srcPos + bytesPerPixel)
			srcPos += bytesPerPixel

			for (let i = 0; i < count && dstPos < output.length; i++) {
				output.set(pixel, dstPos)
				dstPos += bytesPerPixel
			}
		} else {
			// Raw packet: copy pixels directly
			const bytes = count * bytesPerPixel
			for (let i = 0; i < bytes && dstPos < output.length; i++) {
				output[dstPos++] = data[srcPos++]!
			}
		}
	}

	return output
}

/**
 * Read a single pixel and convert to RGBA
 */
function readPixel(
	data: Uint8Array,
	index: number,
	pixelDepth: number,
	imageType: TgaImageType,
	colorMap: Uint8Array | null,
	header: TgaHeader
): { r: number; g: number; b: number; a: number } {
	const baseType = imageType % 8

	if (baseType === TgaImageType.ColorMapped && colorMap) {
		// Color-mapped
		const mapIdx = data[index]! - header.colorMapOrigin
		const entrySize = Math.ceil(header.colorMapDepth / 8)
		const entryOffset = mapIdx * entrySize

		return readColorValue(colorMap, entryOffset, header.colorMapDepth)
	}

	if (baseType === TgaImageType.Grayscale) {
		// Grayscale
		const bytesPerPixel = Math.ceil(pixelDepth / 8)
		const offset = index * bytesPerPixel
		const gray = data[offset]!
		const alpha = pixelDepth === 16 ? data[offset + 1]! : 255

		return { r: gray, g: gray, b: gray, a: alpha }
	}

	// True color
	const bytesPerPixel = Math.ceil(pixelDepth / 8)
	const offset = index * bytesPerPixel

	return readColorValue(data, offset, pixelDepth)
}

/**
 * Read color value from bytes
 */
function readColorValue(
	data: Uint8Array,
	offset: number,
	depth: number
): { r: number; g: number; b: number; a: number } {
	if (depth === 32) {
		return {
			b: data[offset]!,
			g: data[offset + 1]!,
			r: data[offset + 2]!,
			a: data[offset + 3]!,
		}
	}

	if (depth === 24) {
		return {
			b: data[offset]!,
			g: data[offset + 1]!,
			r: data[offset + 2]!,
			a: 255,
		}
	}

	if (depth === 16 || depth === 15) {
		// 5-5-5 or 5-6-5 format
		const value = data[offset]! | (data[offset + 1]! << 8)
		const r = (((value >> 10) & 0x1f) * 255) / 31
		const g = (((value >> 5) & 0x1f) * 255) / 31
		const b = ((value & 0x1f) * 255) / 31
		const a = depth === 16 && value & 0x8000 ? 255 : 255

		return {
			r: Math.round(r),
			g: Math.round(g),
			b: Math.round(b),
			a,
		}
	}

	if (depth === 8) {
		const gray = data[offset]!
		return { r: gray, g: gray, b: gray, a: 255 }
	}

	return { r: 0, g: 0, b: 0, a: 255 }
}

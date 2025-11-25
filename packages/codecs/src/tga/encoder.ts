import type { EncodeOptions, ImageData } from '@mconv/core'
import { ORIGIN_TOP_LEFT, TgaImageType } from './types'

/**
 * Encode ImageData to TGA
 */
export function encodeTga(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image
	const useRLE = options?.quality !== 100 // Use RLE unless quality=100

	// Check if image has alpha
	let hasAlpha = false
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] !== 255) {
			hasAlpha = true
			break
		}
	}

	const pixelDepth = hasAlpha ? 32 : 24
	const bytesPerPixel = pixelDepth / 8
	const imageType = useRLE ? TgaImageType.TrueColorRLE : TgaImageType.TrueColor

	// Build header
	const header = new Uint8Array(18)
	header[0] = 0 // ID length
	header[1] = 0 // Color map type
	header[2] = imageType
	// Color map spec (5 bytes) - all zeros for true color
	header[8] = 0 // X origin
	header[9] = 0
	header[10] = 0 // Y origin
	header[11] = 0
	header[12] = width & 0xff
	header[13] = (width >> 8) & 0xff
	header[14] = height & 0xff
	header[15] = (height >> 8) & 0xff
	header[16] = pixelDepth
	header[17] = ORIGIN_TOP_LEFT | (hasAlpha ? 8 : 0) // Descriptor: top-left origin + alpha bits

	// Convert RGBA to BGR(A) and encode
	const rawPixels = new Uint8Array(width * height * bytesPerPixel)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			const dstIdx = (y * width + x) * bytesPerPixel

			rawPixels[dstIdx] = data[srcIdx + 2]! // B
			rawPixels[dstIdx + 1] = data[srcIdx + 1]! // G
			rawPixels[dstIdx + 2] = data[srcIdx]! // R
			if (hasAlpha) {
				rawPixels[dstIdx + 3] = data[srcIdx + 3]! // A
			}
		}
	}

	// Apply RLE compression if enabled
	const pixelData = useRLE ? encodeRLE(rawPixels, bytesPerPixel) : rawPixels

	// Combine header and pixel data
	const output = new Uint8Array(header.length + pixelData.length)
	output.set(header, 0)
	output.set(pixelData, header.length)

	return output
}

/**
 * Encode pixel data with RLE compression
 */
function encodeRLE(data: Uint8Array, bytesPerPixel: number): Uint8Array {
	const output: number[] = []
	const numPixels = data.length / bytesPerPixel
	let pos = 0

	while (pos < numPixels) {
		const startPos = pos
		const startOffset = pos * bytesPerPixel

		// Check for run of identical pixels
		let runLength = 1
		while (
			runLength < 128 &&
			pos + runLength < numPixels &&
			pixelsEqual(data, startOffset, (pos + runLength) * bytesPerPixel, bytesPerPixel)
		) {
			runLength++
		}

		if (runLength > 1) {
			// RLE packet
			output.push(0x80 | (runLength - 1))
			for (let i = 0; i < bytesPerPixel; i++) {
				output.push(data[startOffset + i]!)
			}
			pos += runLength
		} else {
			// Raw packet - find run of different pixels
			let rawLength = 1
			while (
				rawLength < 128 &&
				pos + rawLength < numPixels &&
				!pixelsEqual(
					data,
					(pos + rawLength - 1) * bytesPerPixel,
					(pos + rawLength) * bytesPerPixel,
					bytesPerPixel
				)
			) {
				rawLength++
			}

			// Don't include the last pixel if it starts a run
			if (rawLength > 1 && pos + rawLength < numPixels) {
				rawLength--
			}

			output.push(rawLength - 1)
			for (let i = 0; i < rawLength * bytesPerPixel; i++) {
				output.push(data[startOffset + i]!)
			}
			pos += rawLength
		}
	}

	return new Uint8Array(output)
}

/**
 * Compare two pixels for equality
 */
function pixelsEqual(
	data: Uint8Array,
	offset1: number,
	offset2: number,
	bytesPerPixel: number
): boolean {
	for (let i = 0; i < bytesPerPixel; i++) {
		if (data[offset1 + i] !== data[offset2 + i]) return false
	}
	return true
}

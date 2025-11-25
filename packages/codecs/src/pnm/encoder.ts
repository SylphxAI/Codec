import type { EncodeOptions, ImageData } from '@mconv/core'

/**
 * Encode ImageData to PPM (P6 binary format)
 */
export function encodePpm(image: ImageData, _options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	// Create header
	const header = `P6\n${width} ${height}\n255\n`
	const headerBytes = new TextEncoder().encode(header)

	// Create pixel data (RGB only, no alpha)
	const pixelData = new Uint8Array(width * height * 3)
	let dstIdx = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			pixelData[dstIdx++] = data[srcIdx]! // R
			pixelData[dstIdx++] = data[srcIdx + 1]! // G
			pixelData[dstIdx++] = data[srcIdx + 2]! // B
		}
	}

	// Combine header and pixel data
	const output = new Uint8Array(headerBytes.length + pixelData.length)
	output.set(headerBytes, 0)
	output.set(pixelData, headerBytes.length)

	return output
}

/**
 * Encode ImageData to PGM (P5 binary format)
 */
export function encodePgm(image: ImageData, _options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	// Create header
	const header = `P5\n${width} ${height}\n255\n`
	const headerBytes = new TextEncoder().encode(header)

	// Create pixel data (grayscale)
	const pixelData = new Uint8Array(width * height)
	let dstIdx = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			// Convert to grayscale using luminance formula
			const gray = Math.round(
				0.299 * data[srcIdx]! + 0.587 * data[srcIdx + 1]! + 0.114 * data[srcIdx + 2]!
			)
			pixelData[dstIdx++] = gray
		}
	}

	// Combine header and pixel data
	const output = new Uint8Array(headerBytes.length + pixelData.length)
	output.set(headerBytes, 0)
	output.set(pixelData, headerBytes.length)

	return output
}

/**
 * Encode ImageData to PBM (P4 binary format)
 */
export function encodePbm(image: ImageData, _options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	// Create header
	const header = `P4\n${width} ${height}\n`
	const headerBytes = new TextEncoder().encode(header)

	// Create pixel data (packed bits, MSB first)
	const rowBytes = Math.ceil(width / 8)
	const pixelData = new Uint8Array(height * rowBytes)
	let dstIdx = 0

	for (let y = 0; y < height; y++) {
		let currentByte = 0
		let bitPos = 0

		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			// Convert to grayscale and threshold
			const gray = Math.round(
				0.299 * data[srcIdx]! + 0.587 * data[srcIdx + 1]! + 0.114 * data[srcIdx + 2]!
			)
			const bit = gray < 128 ? 1 : 0 // 1 = black, 0 = white

			currentByte |= bit << (7 - bitPos)
			bitPos++

			if (bitPos === 8) {
				pixelData[dstIdx++] = currentByte
				currentByte = 0
				bitPos = 0
			}
		}

		// Flush remaining bits in row
		if (bitPos > 0) {
			pixelData[dstIdx++] = currentByte
		}
	}

	// Combine header and pixel data
	const output = new Uint8Array(headerBytes.length + pixelData.length)
	output.set(headerBytes, 0)
	output.set(pixelData, headerBytes.length)

	return output
}

/**
 * Default PNM encoder (outputs PPM)
 */
export function encodePnm(image: ImageData, options?: EncodeOptions): Uint8Array {
	return encodePpm(image, options)
}

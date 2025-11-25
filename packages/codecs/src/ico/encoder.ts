import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import { encodePng } from '../png'
import { ICO_TYPE } from './types'

/**
 * Write 16-bit little-endian value
 */
function writeU16LE(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff]
}

/**
 * Write 32-bit little-endian value
 */
function writeU32LE(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]
}

/**
 * Encode ImageData to ICO
 * Uses PNG format for the embedded image (modern ICO)
 */
export function encodeIco(image: ImageData, _options?: EncodeOptions): Uint8Array {
	const { width, height } = image

	// Validate dimensions
	if (width > 256 || height > 256) {
		throw new Error(`ICO image dimensions must be <= 256 (got ${width}x${height})`)
	}

	// Encode image as PNG
	const pngData = encodePng(image)

	const output: number[] = []

	// ICONDIR header
	output.push(...writeU16LE(0)) // Reserved
	output.push(...writeU16LE(ICO_TYPE)) // Type (1 = ICO)
	output.push(...writeU16LE(1)) // Number of images

	// ICONDIRENTRY
	output.push(width === 256 ? 0 : width) // Width (0 = 256)
	output.push(height === 256 ? 0 : height) // Height (0 = 256)
	output.push(0) // Color count (0 = no palette)
	output.push(0) // Reserved
	output.push(...writeU16LE(1)) // Color planes
	output.push(...writeU16LE(32)) // Bits per pixel
	output.push(...writeU32LE(pngData.length)) // Image size
	output.push(...writeU32LE(22)) // Offset to image data (6 + 16 = 22)

	// PNG image data
	for (const byte of pngData) {
		output.push(byte)
	}

	return new Uint8Array(output)
}

/**
 * Encode multiple images into a single ICO file
 */
export function encodeIcoMulti(images: ImageData[], _options?: EncodeOptions): Uint8Array {
	if (images.length === 0) {
		throw new Error('At least one image is required')
	}

	// Validate and encode all images
	const encodedImages: Uint8Array[] = []

	for (const image of images) {
		if (image.width > 256 || image.height > 256) {
			throw new Error(`ICO image dimensions must be <= 256 (got ${image.width}x${image.height})`)
		}
		encodedImages.push(encodePng(image))
	}

	const output: number[] = []

	// ICONDIR header
	output.push(...writeU16LE(0)) // Reserved
	output.push(...writeU16LE(ICO_TYPE)) // Type (1 = ICO)
	output.push(...writeU16LE(images.length)) // Number of images

	// Calculate offsets
	const headerSize = 6
	const entrySize = 16
	let imageOffset = headerSize + entrySize * images.length

	// ICONDIRENTRY for each image
	for (let i = 0; i < images.length; i++) {
		const image = images[i]!
		const pngData = encodedImages[i]!

		output.push(image.width === 256 ? 0 : image.width)
		output.push(image.height === 256 ? 0 : image.height)
		output.push(0) // Color count
		output.push(0) // Reserved
		output.push(...writeU16LE(1)) // Color planes
		output.push(...writeU16LE(32)) // Bits per pixel
		output.push(...writeU32LE(pngData.length)) // Image size
		output.push(...writeU32LE(imageOffset)) // Offset

		imageOffset += pngData.length
	}

	// Append all image data
	for (const pngData of encodedImages) {
		for (const byte of pngData) {
			output.push(byte)
		}
	}

	return new Uint8Array(output)
}

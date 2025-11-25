import type { ImageData } from '@sylphx/codec-core'

/**
 * BMP compression types
 */
const BI_RGB = 0
const BI_RLE8 = 1
const BI_RLE4 = 2
const BI_BITFIELDS = 3

/**
 * Read little-endian uint16
 */
function readU16(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8)
}

/**
 * Read little-endian uint32
 */
function readU32(data: Uint8Array, offset: number): number {
	return (
		(data[offset]! |
			(data[offset + 1]! << 8) |
			(data[offset + 2]! << 16) |
			(data[offset + 3]! << 24)) >>>
		0
	)
}

/**
 * Read little-endian int32
 */
function readI32(data: Uint8Array, offset: number): number {
	const val = readU32(data, offset)
	return val > 0x7fffffff ? val - 0x100000000 : val
}

/**
 * Decode BMP file to ImageData
 */
export function decodeBmp(data: Uint8Array): ImageData {
	// Validate signature
	if (data[0] !== 0x42 || data[1] !== 0x4d) {
		throw new Error('Invalid BMP signature')
	}

	// File header (14 bytes)
	const dataOffset = readU32(data, 10)

	// DIB header
	const dibSize = readU32(data, 14)
	if (dibSize < 40) {
		throw new Error(`Unsupported DIB header size: ${dibSize}`)
	}

	const width = readI32(data, 18)
	const height = readI32(data, 22)
	const bitsPerPixel = readU16(data, 28)
	const compression = readU32(data, 30)

	// Handle negative height (top-down bitmap)
	const topDown = height < 0
	const absHeight = Math.abs(height)

	if (width <= 0 || absHeight <= 0) {
		throw new Error(`Invalid dimensions: ${width}x${absHeight}`)
	}

	// Validate compression
	if (compression !== BI_RGB && compression !== BI_BITFIELDS) {
		if (compression === BI_RLE8 || compression === BI_RLE4) {
			throw new Error('RLE compression not yet supported')
		}
		throw new Error(`Unsupported compression: ${compression}`)
	}

	// Read color table for indexed formats
	let colorTable: Uint8Array | null = null
	if (bitsPerPixel <= 8) {
		const colorCount = 1 << bitsPerPixel
		const colorTableOffset = 14 + dibSize
		colorTable = data.slice(colorTableOffset, colorTableOffset + colorCount * 4)
	}

	// Read bit masks for BITFIELDS
	let rMask = 0x00ff0000
	let gMask = 0x0000ff00
	let bMask = 0x000000ff
	let aMask = 0xff000000

	if (compression === BI_BITFIELDS && dibSize >= 52) {
		rMask = readU32(data, 54)
		gMask = readU32(data, 58)
		bMask = readU32(data, 62)
		if (dibSize >= 56) {
			aMask = readU32(data, 66)
		}
	}

	// Calculate row stride (padded to 4 bytes)
	const rowStride = Math.floor((bitsPerPixel * width + 31) / 32) * 4

	// Output RGBA buffer
	const output = new Uint8Array(width * absHeight * 4)

	// Decode pixels
	for (let y = 0; y < absHeight; y++) {
		const srcY = topDown ? y : absHeight - 1 - y
		const srcRowOffset = dataOffset + srcY * rowStride
		const dstRowOffset = y * width * 4

		for (let x = 0; x < width; x++) {
			const dstIdx = dstRowOffset + x * 4
			let r = 0
			let g = 0
			let b = 0
			let a = 255

			switch (bitsPerPixel) {
				case 1: {
					const byteIdx = srcRowOffset + Math.floor(x / 8)
					const bitIdx = 7 - (x % 8)
					const colorIdx = (data[byteIdx]! >> bitIdx) & 1
					const tableIdx = colorIdx * 4
					b = colorTable![tableIdx]!
					g = colorTable![tableIdx + 1]!
					r = colorTable![tableIdx + 2]!
					break
				}

				case 4: {
					const byteIdx = srcRowOffset + Math.floor(x / 2)
					const nibble = x % 2 === 0 ? (data[byteIdx]! >> 4) & 0x0f : data[byteIdx]! & 0x0f
					const tableIdx = nibble * 4
					b = colorTable![tableIdx]!
					g = colorTable![tableIdx + 1]!
					r = colorTable![tableIdx + 2]!
					break
				}

				case 8: {
					const colorIdx = data[srcRowOffset + x]!
					const tableIdx = colorIdx * 4
					b = colorTable![tableIdx]!
					g = colorTable![tableIdx + 1]!
					r = colorTable![tableIdx + 2]!
					break
				}

				case 16: {
					const pixelOffset = srcRowOffset + x * 2
					const pixel = readU16(data, pixelOffset)
					// Default 5-5-5 format
					r = ((pixel >> 10) & 0x1f) << 3
					g = ((pixel >> 5) & 0x1f) << 3
					b = (pixel & 0x1f) << 3
					break
				}

				case 24: {
					const pixelOffset = srcRowOffset + x * 3
					b = data[pixelOffset]!
					g = data[pixelOffset + 1]!
					r = data[pixelOffset + 2]!
					break
				}

				case 32: {
					const pixelOffset = srcRowOffset + x * 4
					if (compression === BI_BITFIELDS) {
						const pixel = readU32(data, pixelOffset)
						r = applyMask(pixel, rMask)
						g = applyMask(pixel, gMask)
						b = applyMask(pixel, bMask)
						a = aMask ? applyMask(pixel, aMask) : 255
					} else {
						b = data[pixelOffset]!
						g = data[pixelOffset + 1]!
						r = data[pixelOffset + 2]!
						a = data[pixelOffset + 3]!
					}
					break
				}

				default:
					throw new Error(`Unsupported bits per pixel: ${bitsPerPixel}`)
			}

			output[dstIdx] = r
			output[dstIdx + 1] = g
			output[dstIdx + 2] = b
			output[dstIdx + 3] = a
		}
	}

	return {
		width,
		height: absHeight,
		data: output,
	}
}

/**
 * Apply bit mask and normalize to 0-255
 */
function applyMask(value: number, mask: number): number {
	if (mask === 0) return 0

	// Use unsigned operations to avoid infinite loop with high bit masks (e.g., 0xff000000)
	let m = mask >>> 0 // Convert to unsigned 32-bit

	// Find shift amount (trailing zeros)
	let shift = 0
	while ((m & 1) === 0) {
		shift++
		m = m >>> 1
	}

	// Count bits in mask
	let bits = 0
	let temp = m
	while (temp) {
		bits += temp & 1
		temp = temp >>> 1
	}

	// Extract value and scale to 8 bits
	const extracted = ((value & mask) >>> shift) & 0xff
	return bits >= 8 ? extracted >>> (bits - 8) : extracted << (8 - bits)
}

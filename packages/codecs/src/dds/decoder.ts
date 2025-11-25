/**
 * DDS (DirectDraw Surface) decoder
 * Supports uncompressed and DXT1/DXT3/DXT5 compressed formats
 */

import type { ImageData } from '@mconv/core'
import {
	DDPF_ALPHAPIXELS,
	DDPF_FOURCC,
	DDPF_LUMINANCE,
	DDPF_RGB,
	type DDSHeader,
	type DDSPixelFormat,
	DDS_MAGIC,
	FOURCC_DXT1,
	FOURCC_DXT3,
	FOURCC_DXT5,
} from './types'

/**
 * Decode DDS image to RGBA
 */
export function decodeDds(data: Uint8Array): ImageData {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
	let pos = 0

	// Read magic number
	const magic = view.getUint32(pos, true)
	pos += 4

	if (magic !== DDS_MAGIC) {
		throw new Error('Invalid DDS file: wrong magic number')
	}

	// Read header
	const header = readHeader(view, pos)
	pos += 124

	const { width, height } = header

	// Determine format and decode
	const pixelFormat = header.pixelFormat

	if (pixelFormat.flags & DDPF_FOURCC) {
		// Compressed format
		switch (pixelFormat.fourCC) {
			case FOURCC_DXT1:
				return decodeDXT1(data.subarray(pos), width, height)
			case FOURCC_DXT3:
				return decodeDXT3(data.subarray(pos), width, height)
			case FOURCC_DXT5:
				return decodeDXT5(data.subarray(pos), width, height)
			default:
				throw new Error(`Unsupported DDS format: FourCC 0x${pixelFormat.fourCC.toString(16)}`)
		}
	}
	if (pixelFormat.flags & DDPF_RGB) {
		// Uncompressed RGB(A)
		return decodeUncompressed(data.subarray(pos), width, height, pixelFormat)
	}
	if (pixelFormat.flags & DDPF_LUMINANCE) {
		// Luminance format
		return decodeLuminance(data.subarray(pos), width, height, pixelFormat)
	}
	throw new Error('Unsupported DDS pixel format')
}

function readHeader(view: DataView, pos: number): DDSHeader {
	const size = view.getUint32(pos, true)
	if (size !== 124) {
		throw new Error(`Invalid DDS header size: ${size}`)
	}

	return {
		size,
		flags: view.getUint32(pos + 4, true),
		height: view.getUint32(pos + 8, true),
		width: view.getUint32(pos + 12, true),
		pitchOrLinearSize: view.getUint32(pos + 16, true),
		depth: view.getUint32(pos + 20, true),
		mipMapCount: view.getUint32(pos + 24, true),
		reserved1: [],
		pixelFormat: readPixelFormat(view, pos + 72),
		caps: view.getUint32(pos + 104, true),
		caps2: view.getUint32(pos + 108, true),
		caps3: view.getUint32(pos + 112, true),
		caps4: view.getUint32(pos + 116, true),
		reserved2: view.getUint32(pos + 120, true),
	}
}

function readPixelFormat(view: DataView, pos: number): DDSPixelFormat {
	return {
		size: view.getUint32(pos, true),
		flags: view.getUint32(pos + 4, true),
		fourCC: view.getUint32(pos + 8, true),
		rgbBitCount: view.getUint32(pos + 12, true),
		rBitMask: view.getUint32(pos + 16, true),
		gBitMask: view.getUint32(pos + 20, true),
		bBitMask: view.getUint32(pos + 24, true),
		aBitMask: view.getUint32(pos + 28, true),
	}
}

/**
 * Decode uncompressed RGB(A) format
 */
function decodeUncompressed(
	data: Uint8Array,
	width: number,
	height: number,
	pf: DDSPixelFormat
): ImageData {
	const pixels = new Uint8Array(width * height * 4)
	const bytesPerPixel = pf.rgbBitCount / 8
	const hasAlpha = (pf.flags & DDPF_ALPHAPIXELS) !== 0

	// Calculate bit shifts for each channel
	const rShift = countTrailingZeros(pf.rBitMask)
	const gShift = countTrailingZeros(pf.gBitMask)
	const bShift = countTrailingZeros(pf.bBitMask)
	const aShift = hasAlpha ? countTrailingZeros(pf.aBitMask) : 0

	const rBits = countBits(pf.rBitMask)
	const gBits = countBits(pf.gBitMask)
	const bBits = countBits(pf.bBitMask)
	const aBits = hasAlpha ? countBits(pf.aBitMask) : 0

	let srcPos = 0
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let pixel = 0
			for (let b = 0; b < bytesPerPixel; b++) {
				pixel |= data[srcPos++]! << (b * 8)
			}

			const dstPos = (y * width + x) * 4
			pixels[dstPos] = expandBits((pixel & pf.rBitMask) >>> rShift, rBits)
			pixels[dstPos + 1] = expandBits((pixel & pf.gBitMask) >>> gShift, gBits)
			pixels[dstPos + 2] = expandBits((pixel & pf.bBitMask) >>> bShift, bBits)
			pixels[dstPos + 3] = hasAlpha ? expandBits((pixel & pf.aBitMask) >>> aShift, aBits) : 255
		}
	}

	return { width, height, data: pixels }
}

/**
 * Decode luminance format
 */
function decodeLuminance(
	data: Uint8Array,
	width: number,
	height: number,
	pf: DDSPixelFormat
): ImageData {
	const pixels = new Uint8Array(width * height * 4)
	const bytesPerPixel = pf.rgbBitCount / 8
	const hasAlpha = (pf.flags & DDPF_ALPHAPIXELS) !== 0

	const lShift = countTrailingZeros(pf.rBitMask)
	const lBits = countBits(pf.rBitMask)
	const aShift = hasAlpha ? countTrailingZeros(pf.aBitMask) : 0
	const aBits = hasAlpha ? countBits(pf.aBitMask) : 0

	let srcPos = 0
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let pixel = 0
			for (let b = 0; b < bytesPerPixel; b++) {
				pixel |= data[srcPos++]! << (b * 8)
			}

			const lum = expandBits((pixel & pf.rBitMask) >>> lShift, lBits)
			const dstPos = (y * width + x) * 4
			pixels[dstPos] = lum
			pixels[dstPos + 1] = lum
			pixels[dstPos + 2] = lum
			pixels[dstPos + 3] = hasAlpha ? expandBits((pixel & pf.aBitMask) >>> aShift, aBits) : 255
		}
	}

	return { width, height, data: pixels }
}

/**
 * Decode DXT1 compressed format (BC1)
 */
function decodeDXT1(data: Uint8Array, width: number, height: number): ImageData {
	const pixels = new Uint8Array(width * height * 4)
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	const blocksX = Math.ceil(width / 4)
	const blocksY = Math.ceil(height / 4)

	let srcPos = 0
	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			// Read 8-byte block
			const color0 = view.getUint16(srcPos, true)
			const color1 = view.getUint16(srcPos + 2, true)
			const indices = view.getUint32(srcPos + 4, true)
			srcPos += 8

			// Decode colors
			const colors = decodeDXT1Colors(color0, color1)

			// Apply to pixels
			for (let py = 0; py < 4; py++) {
				for (let px = 0; px < 4; px++) {
					const x = bx * 4 + px
					const y = by * 4 + py

					if (x < width && y < height) {
						const idx = (indices >>> ((py * 4 + px) * 2)) & 0x3
						const color = colors[idx]!
						const dstPos = (y * width + x) * 4
						pixels[dstPos] = color[0]
						pixels[dstPos + 1] = color[1]
						pixels[dstPos + 2] = color[2]
						pixels[dstPos + 3] = color[3]
					}
				}
			}
		}
	}

	return { width, height, data: pixels }
}

/**
 * Decode DXT1 color palette
 */
function decodeDXT1Colors(c0: number, c1: number): [number, number, number, number][] {
	const r0 = (((c0 >> 11) & 0x1f) * 255) / 31
	const g0 = (((c0 >> 5) & 0x3f) * 255) / 63
	const b0 = ((c0 & 0x1f) * 255) / 31

	const r1 = (((c1 >> 11) & 0x1f) * 255) / 31
	const g1 = (((c1 >> 5) & 0x3f) * 255) / 63
	const b1 = ((c1 & 0x1f) * 255) / 31

	const colors: [number, number, number, number][] = [
		[Math.round(r0), Math.round(g0), Math.round(b0), 255],
		[Math.round(r1), Math.round(g1), Math.round(b1), 255],
		[0, 0, 0, 255],
		[0, 0, 0, 255],
	]

	if (c0 > c1) {
		// Opaque mode
		colors[2] = [
			Math.round((2 * r0 + r1) / 3),
			Math.round((2 * g0 + g1) / 3),
			Math.round((2 * b0 + b1) / 3),
			255,
		]
		colors[3] = [
			Math.round((r0 + 2 * r1) / 3),
			Math.round((g0 + 2 * g1) / 3),
			Math.round((b0 + 2 * b1) / 3),
			255,
		]
	} else {
		// 1-bit alpha mode
		colors[2] = [
			Math.round((r0 + r1) / 2),
			Math.round((g0 + g1) / 2),
			Math.round((b0 + b1) / 2),
			255,
		]
		colors[3] = [0, 0, 0, 0] // Transparent
	}

	return colors
}

/**
 * Decode DXT3 compressed format (BC2)
 */
function decodeDXT3(data: Uint8Array, width: number, height: number): ImageData {
	const pixels = new Uint8Array(width * height * 4)
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	const blocksX = Math.ceil(width / 4)
	const blocksY = Math.ceil(height / 4)

	let srcPos = 0
	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			// Read 16-byte block
			// First 8 bytes: explicit alpha
			const alphas: number[] = []
			for (let i = 0; i < 8; i++) {
				const byte = data[srcPos + i]!
				alphas.push((byte & 0x0f) * 17) // Expand 4-bit to 8-bit
				alphas.push(((byte >> 4) & 0x0f) * 17)
			}
			srcPos += 8

			// Next 8 bytes: color block (same as DXT1)
			const color0 = view.getUint16(srcPos, true)
			const color1 = view.getUint16(srcPos + 2, true)
			const indices = view.getUint32(srcPos + 4, true)
			srcPos += 8

			const colors = decodeDXT1ColorsOpaque(color0, color1)

			// Apply to pixels
			for (let py = 0; py < 4; py++) {
				for (let px = 0; px < 4; px++) {
					const x = bx * 4 + px
					const y = by * 4 + py

					if (x < width && y < height) {
						const idx = (indices >>> ((py * 4 + px) * 2)) & 0x3
						const color = colors[idx]!
						const alpha = alphas[py * 4 + px]!
						const dstPos = (y * width + x) * 4
						pixels[dstPos] = color[0]
						pixels[dstPos + 1] = color[1]
						pixels[dstPos + 2] = color[2]
						pixels[dstPos + 3] = alpha
					}
				}
			}
		}
	}

	return { width, height, data: pixels }
}

/**
 * Decode DXT5 compressed format (BC3)
 */
function decodeDXT5(data: Uint8Array, width: number, height: number): ImageData {
	const pixels = new Uint8Array(width * height * 4)
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	const blocksX = Math.ceil(width / 4)
	const blocksY = Math.ceil(height / 4)

	let srcPos = 0
	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			// Read 16-byte block
			// First 8 bytes: interpolated alpha
			const alpha0 = data[srcPos]!
			const alpha1 = data[srcPos + 1]!
			const alphaIndices = readAlphaIndices(data, srcPos + 2)
			srcPos += 8

			const alphas = decodeAlphaPalette(alpha0, alpha1)

			// Next 8 bytes: color block (same as DXT1)
			const color0 = view.getUint16(srcPos, true)
			const color1 = view.getUint16(srcPos + 2, true)
			const indices = view.getUint32(srcPos + 4, true)
			srcPos += 8

			const colors = decodeDXT1ColorsOpaque(color0, color1)

			// Apply to pixels
			for (let py = 0; py < 4; py++) {
				for (let px = 0; px < 4; px++) {
					const x = bx * 4 + px
					const y = by * 4 + py

					if (x < width && y < height) {
						const colorIdx = (indices >>> ((py * 4 + px) * 2)) & 0x3
						const alphaIdx = alphaIndices[py * 4 + px]!
						const color = colors[colorIdx]!
						const dstPos = (y * width + x) * 4
						pixels[dstPos] = color[0]
						pixels[dstPos + 1] = color[1]
						pixels[dstPos + 2] = color[2]
						pixels[dstPos + 3] = alphas[alphaIdx]!
					}
				}
			}
		}
	}

	return { width, height, data: pixels }
}

/**
 * Decode DXT1 colors in opaque mode (for DXT3/DXT5)
 */
function decodeDXT1ColorsOpaque(c0: number, c1: number): [number, number, number][] {
	const r0 = (((c0 >> 11) & 0x1f) * 255) / 31
	const g0 = (((c0 >> 5) & 0x3f) * 255) / 63
	const b0 = ((c0 & 0x1f) * 255) / 31

	const r1 = (((c1 >> 11) & 0x1f) * 255) / 31
	const g1 = (((c1 >> 5) & 0x3f) * 255) / 63
	const b1 = ((c1 & 0x1f) * 255) / 31

	return [
		[Math.round(r0), Math.round(g0), Math.round(b0)],
		[Math.round(r1), Math.round(g1), Math.round(b1)],
		[Math.round((2 * r0 + r1) / 3), Math.round((2 * g0 + g1) / 3), Math.round((2 * b0 + b1) / 3)],
		[Math.round((r0 + 2 * r1) / 3), Math.round((g0 + 2 * g1) / 3), Math.round((b0 + 2 * b1) / 3)],
	]
}

/**
 * Read 6-byte alpha indices for DXT5
 */
function readAlphaIndices(data: Uint8Array, pos: number): number[] {
	// 48 bits = 16 x 3-bit indices
	const bits = data[pos]! | (data[pos + 1]! << 8) | (data[pos + 2]! << 16) | (data[pos + 3]! << 24)
	const bitsHigh = data[pos + 4]! | (data[pos + 5]! << 8)

	const indices: number[] = []
	for (let i = 0; i < 16; i++) {
		const bitPos = i * 3
		if (bitPos < 32) {
			if (bitPos + 3 <= 32) {
				indices.push((bits >>> bitPos) & 0x7)
			} else {
				// Spans boundary
				const lowBits = bits >>> bitPos
				const highBits = bitsHigh << (32 - bitPos)
				indices.push((lowBits | highBits) & 0x7)
			}
		} else {
			indices.push((bitsHigh >>> (bitPos - 32)) & 0x7)
		}
	}
	return indices
}

/**
 * Decode DXT5 alpha palette
 */
function decodeAlphaPalette(a0: number, a1: number): number[] {
	const alphas = [a0, a1, 0, 0, 0, 0, 0, 0]

	if (a0 > a1) {
		// 6 interpolated values
		for (let i = 1; i <= 6; i++) {
			alphas[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7)
		}
	} else {
		// 4 interpolated values + 0 and 255
		for (let i = 1; i <= 4; i++) {
			alphas[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5)
		}
		alphas[6] = 0
		alphas[7] = 255
	}

	return alphas
}

/**
 * Count trailing zeros in a number
 */
function countTrailingZeros(value: number): number {
	if (value === 0) return 32
	let n = value
	let count = 0
	while ((n & 1) === 0) {
		count++
		n >>>= 1
	}
	return count
}

/**
 * Count number of set bits
 */
function countBits(value: number): number {
	let n = value
	let count = 0
	while (n) {
		count += n & 1
		n >>>= 1
	}
	return count
}

/**
 * Expand n-bit value to 8-bit
 */
function expandBits(value: number, bits: number): number {
	if (bits === 0) return 0
	if (bits === 8) return value
	// Replicate bits to fill 8 bits
	const shift = 8 - bits
	return (value << shift) | (value >>> (bits - shift))
}

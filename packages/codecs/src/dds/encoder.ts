/**
 * DDS (DirectDraw Surface) encoder
 * Supports uncompressed RGBA and DXT1/DXT5 compressed formats
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	DDPF_ALPHAPIXELS,
	DDPF_FOURCC,
	DDPF_RGB,
	DDSCAPS_TEXTURE,
	DDSD_CAPS,
	DDSD_HEIGHT,
	DDSD_LINEARSIZE,
	DDSD_PIXELFORMAT,
	DDSD_WIDTH,
	type DDSEncodeOptions,
	type DDSFormat,
	DDS_MAGIC,
	FOURCC_DXT1,
	FOURCC_DXT5,
} from './types'

/**
 * Encode image to DDS format
 */
export function encodeDds(image: ImageData, options: DDSEncodeOptions = {}): Uint8Array {
	const format = options.format ?? 'rgba'
	const { width, height, data } = image

	switch (format) {
		case 'rgba':
		case 'bgra':
			return encodeUncompressedRGBA(width, height, data, format === 'bgra')
		case 'rgb':
		case 'bgr':
			return encodeUncompressedRGB(width, height, data, format === 'bgr')
		case 'dxt1':
			return encodeDXT1(width, height, data)
		case 'dxt5':
			return encodeDXT5(width, height, data)
		default:
			throw new Error(`Unsupported DDS format: ${format}`)
	}
}

/**
 * Encode uncompressed RGBA/BGRA
 */
function encodeUncompressedRGBA(
	width: number,
	height: number,
	data: Uint8Array,
	bgra: boolean
): Uint8Array {
	const headerSize = 128 // 4 bytes magic + 124 bytes header
	const dataSize = width * height * 4
	const buffer = new Uint8Array(headerSize + dataSize)
	const view = new DataView(buffer.buffer)

	// Write header
	writeHeader(view, width, height, {
		flags: DDPF_RGB | DDPF_ALPHAPIXELS,
		rgbBitCount: 32,
		rBitMask: bgra ? 0x00ff0000 : 0x000000ff,
		gBitMask: 0x0000ff00,
		bBitMask: bgra ? 0x000000ff : 0x00ff0000,
		aBitMask: 0xff000000,
	})

	// Write pixel data
	let pos = headerSize
	for (let i = 0; i < width * height; i++) {
		const srcPos = i * 4
		if (bgra) {
			buffer[pos++] = data[srcPos + 2]! // B
			buffer[pos++] = data[srcPos + 1]! // G
			buffer[pos++] = data[srcPos]! // R
			buffer[pos++] = data[srcPos + 3]! // A
		} else {
			buffer[pos++] = data[srcPos]! // R
			buffer[pos++] = data[srcPos + 1]! // G
			buffer[pos++] = data[srcPos + 2]! // B
			buffer[pos++] = data[srcPos + 3]! // A
		}
	}

	return buffer
}

/**
 * Encode uncompressed RGB/BGR
 */
function encodeUncompressedRGB(
	width: number,
	height: number,
	data: Uint8Array,
	bgr: boolean
): Uint8Array {
	const headerSize = 128
	const dataSize = width * height * 3
	const buffer = new Uint8Array(headerSize + dataSize)
	const view = new DataView(buffer.buffer)

	writeHeader(view, width, height, {
		flags: DDPF_RGB,
		rgbBitCount: 24,
		rBitMask: bgr ? 0x00ff0000 : 0x000000ff,
		gBitMask: 0x0000ff00,
		bBitMask: bgr ? 0x000000ff : 0x00ff0000,
		aBitMask: 0,
	})

	// Write pixel data
	let pos = headerSize
	for (let i = 0; i < width * height; i++) {
		const srcPos = i * 4
		if (bgr) {
			buffer[pos++] = data[srcPos + 2]! // B
			buffer[pos++] = data[srcPos + 1]! // G
			buffer[pos++] = data[srcPos]! // R
		} else {
			buffer[pos++] = data[srcPos]! // R
			buffer[pos++] = data[srcPos + 1]! // G
			buffer[pos++] = data[srcPos + 2]! // B
		}
	}

	return buffer
}

/**
 * Encode DXT1 compressed format
 */
function encodeDXT1(width: number, height: number, data: Uint8Array): Uint8Array {
	const blocksX = Math.ceil(width / 4)
	const blocksY = Math.ceil(height / 4)
	const blockDataSize = blocksX * blocksY * 8

	const headerSize = 128
	const buffer = new Uint8Array(headerSize + blockDataSize)
	const view = new DataView(buffer.buffer)

	writeHeader(
		view,
		width,
		height,
		{
			flags: DDPF_FOURCC,
			fourCC: FOURCC_DXT1,
			rgbBitCount: 0,
			rBitMask: 0,
			gBitMask: 0,
			bBitMask: 0,
			aBitMask: 0,
		},
		blockDataSize
	)

	// Encode blocks
	let pos = headerSize
	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			const block = extractBlock(data, width, height, bx * 4, by * 4)
			const encoded = encodeDXT1Block(block)

			view.setUint16(pos, encoded.color0, true)
			view.setUint16(pos + 2, encoded.color1, true)
			view.setUint32(pos + 4, encoded.indices, true)
			pos += 8
		}
	}

	return buffer
}

/**
 * Encode DXT5 compressed format
 */
function encodeDXT5(width: number, height: number, data: Uint8Array): Uint8Array {
	const blocksX = Math.ceil(width / 4)
	const blocksY = Math.ceil(height / 4)
	const blockDataSize = blocksX * blocksY * 16

	const headerSize = 128
	const buffer = new Uint8Array(headerSize + blockDataSize)
	const view = new DataView(buffer.buffer)

	writeHeader(
		view,
		width,
		height,
		{
			flags: DDPF_FOURCC,
			fourCC: FOURCC_DXT5,
			rgbBitCount: 0,
			rBitMask: 0,
			gBitMask: 0,
			bBitMask: 0,
			aBitMask: 0,
		},
		blockDataSize
	)

	// Encode blocks
	let pos = headerSize
	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			const block = extractBlock(data, width, height, bx * 4, by * 4)
			const colorEncoded = encodeDXT1Block(block)
			const alphaEncoded = encodeDXT5Alpha(block)

			// Write alpha block (8 bytes)
			buffer[pos] = alphaEncoded.alpha0
			buffer[pos + 1] = alphaEncoded.alpha1
			writeAlphaIndices(buffer, pos + 2, alphaEncoded.indices)
			pos += 8

			// Write color block (8 bytes)
			view.setUint16(pos, colorEncoded.color0, true)
			view.setUint16(pos + 2, colorEncoded.color1, true)
			view.setUint32(pos + 4, colorEncoded.indices, true)
			pos += 8
		}
	}

	return buffer
}

interface PixelFormatParams {
	flags: number
	fourCC?: number
	rgbBitCount: number
	rBitMask: number
	gBitMask: number
	bBitMask: number
	aBitMask: number
}

function writeHeader(
	view: DataView,
	width: number,
	height: number,
	pf: PixelFormatParams,
	linearSize?: number
): void {
	let pos = 0

	// Magic number
	view.setUint32(pos, DDS_MAGIC, true)
	pos += 4

	// Header size
	view.setUint32(pos, 124, true)
	pos += 4

	// Flags
	let flags = DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT
	if (linearSize !== undefined) {
		flags |= DDSD_LINEARSIZE
	}
	view.setUint32(pos, flags, true)
	pos += 4

	// Height
	view.setUint32(pos, height, true)
	pos += 4

	// Width
	view.setUint32(pos, width, true)
	pos += 4

	// Pitch or linear size
	view.setUint32(pos, linearSize ?? width * (pf.rgbBitCount / 8), true)
	pos += 4

	// Depth
	view.setUint32(pos, 0, true)
	pos += 4

	// Mipmap count
	view.setUint32(pos, 0, true)
	pos += 4

	// Reserved1 (11 DWORDs)
	for (let i = 0; i < 11; i++) {
		view.setUint32(pos, 0, true)
		pos += 4
	}

	// Pixel format
	// Size
	view.setUint32(pos, 32, true)
	pos += 4

	// Flags
	view.setUint32(pos, pf.flags, true)
	pos += 4

	// FourCC
	view.setUint32(pos, pf.fourCC ?? 0, true)
	pos += 4

	// RGB bit count
	view.setUint32(pos, pf.rgbBitCount, true)
	pos += 4

	// Bit masks
	view.setUint32(pos, pf.rBitMask, true)
	pos += 4
	view.setUint32(pos, pf.gBitMask, true)
	pos += 4
	view.setUint32(pos, pf.bBitMask, true)
	pos += 4
	view.setUint32(pos, pf.aBitMask, true)
	pos += 4

	// Caps
	view.setUint32(pos, DDSCAPS_TEXTURE, true)
	pos += 4

	// Caps2, Caps3, Caps4, Reserved2
	for (let i = 0; i < 4; i++) {
		view.setUint32(pos, 0, true)
		pos += 4
	}
}

/**
 * Extract 4x4 block of pixels
 */
function extractBlock(
	data: Uint8Array,
	width: number,
	height: number,
	startX: number,
	startY: number
): number[][] {
	const block: number[][] = []

	for (let y = 0; y < 4; y++) {
		for (let x = 0; x < 4; x++) {
			const px = Math.min(startX + x, width - 1)
			const py = Math.min(startY + y, height - 1)
			const pos = (py * width + px) * 4
			block.push([data[pos]!, data[pos + 1]!, data[pos + 2]!, data[pos + 3]!])
		}
	}

	return block
}

/**
 * Encode a single DXT1 block
 */
function encodeDXT1Block(block: number[][]): {
	color0: number
	color1: number
	indices: number
} {
	// Find min and max colors (simple approach)
	let minR = 255
	let minG = 255
	let minB = 255
	let maxR = 0
	let maxG = 0
	let maxB = 0

	for (const pixel of block) {
		minR = Math.min(minR, pixel[0]!)
		minG = Math.min(minG, pixel[1]!)
		minB = Math.min(minB, pixel[2]!)
		maxR = Math.max(maxR, pixel[0]!)
		maxG = Math.max(maxG, pixel[1]!)
		maxB = Math.max(maxB, pixel[2]!)
	}

	// Convert to RGB565
	const color0 = rgb565(maxR, maxG, maxB)
	const color1 = rgb565(minR, minG, minB)

	// Ensure color0 > color1 for opaque mode
	const c0 = Math.max(color0, color1)
	const c1 = Math.min(color0, color1)

	// Build color palette
	const palette = buildDXT1Palette(c0, c1)

	// Find best index for each pixel
	let indices = 0
	for (let i = 0; i < 16; i++) {
		const pixel = block[i]!
		const idx = findClosestColor(pixel, palette)
		indices |= idx << (i * 2)
	}

	return { color0: c0, color1: c1, indices }
}

/**
 * Convert RGB to RGB565
 */
function rgb565(r: number, g: number, b: number): number {
	const r5 = Math.round((r * 31) / 255)
	const g6 = Math.round((g * 63) / 255)
	const b5 = Math.round((b * 31) / 255)
	return (r5 << 11) | (g6 << 5) | b5
}

/**
 * Build DXT1 color palette from two endpoint colors
 */
function buildDXT1Palette(c0: number, c1: number): [number, number, number, number][] {
	const r0 = (((c0 >> 11) & 0x1f) * 255) / 31
	const g0 = (((c0 >> 5) & 0x3f) * 255) / 63
	const b0 = ((c0 & 0x1f) * 255) / 31

	const r1 = (((c1 >> 11) & 0x1f) * 255) / 31
	const g1 = (((c1 >> 5) & 0x3f) * 255) / 63
	const b1 = ((c1 & 0x1f) * 255) / 31

	return [
		[Math.round(r0), Math.round(g0), Math.round(b0), 255],
		[Math.round(r1), Math.round(g1), Math.round(b1), 255],
		[
			Math.round((2 * r0 + r1) / 3),
			Math.round((2 * g0 + g1) / 3),
			Math.round((2 * b0 + b1) / 3),
			255,
		],
		[
			Math.round((r0 + 2 * r1) / 3),
			Math.round((g0 + 2 * g1) / 3),
			Math.round((b0 + 2 * b1) / 3),
			255,
		],
	]
}

/**
 * Find closest color in palette
 */
function findClosestColor(pixel: number[], palette: [number, number, number, number][]): number {
	let bestIdx = 0
	let bestDist = Number.POSITIVE_INFINITY

	for (let i = 0; i < palette.length; i++) {
		const p = palette[i]!
		const dr = pixel[0]! - p[0]
		const dg = pixel[1]! - p[1]
		const db = pixel[2]! - p[2]
		const dist = dr * dr + dg * dg + db * db

		if (dist < bestDist) {
			bestDist = dist
			bestIdx = i
		}
	}

	return bestIdx
}

/**
 * Encode DXT5 alpha block
 */
function encodeDXT5Alpha(block: number[][]): {
	alpha0: number
	alpha1: number
	indices: number[]
} {
	// Find min and max alpha
	let minA = 255
	let maxA = 0

	for (const pixel of block) {
		minA = Math.min(minA, pixel[3]!)
		maxA = Math.max(maxA, pixel[3]!)
	}

	// Use 8-value interpolation if range is large enough
	const alpha0 = maxA
	const alpha1 = minA

	// Build alpha palette
	const palette = buildAlphaPalette(alpha0, alpha1)

	// Find best index for each pixel
	const indices: number[] = []
	for (const pixel of block) {
		const alpha = pixel[3]!
		let bestIdx = 0
		let bestDist = Number.POSITIVE_INFINITY

		for (let i = 0; i < palette.length; i++) {
			const dist = Math.abs(alpha - palette[i]!)
			if (dist < bestDist) {
				bestDist = dist
				bestIdx = i
			}
		}

		indices.push(bestIdx)
	}

	return { alpha0, alpha1, indices }
}

/**
 * Build DXT5 alpha palette
 */
function buildAlphaPalette(a0: number, a1: number): number[] {
	const palette = [a0, a1, 0, 0, 0, 0, 0, 0]

	if (a0 > a1) {
		for (let i = 1; i <= 6; i++) {
			palette[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7)
		}
	} else {
		for (let i = 1; i <= 4; i++) {
			palette[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5)
		}
		palette[6] = 0
		palette[7] = 255
	}

	return palette
}

/**
 * Write 6-byte alpha indices
 */
function writeAlphaIndices(buffer: Uint8Array, pos: number, indices: number[]): void {
	// Pack 16 x 3-bit indices into 6 bytes
	let bits = 0
	let bitsHigh = 0

	for (let i = 0; i < 16; i++) {
		const idx = indices[i]!
		const bitPos = i * 3
		if (bitPos < 32) {
			bits |= idx << bitPos
			if (bitPos + 3 > 32) {
				bitsHigh |= idx >>> (32 - bitPos)
			}
		} else {
			bitsHigh |= idx << (bitPos - 32)
		}
	}

	buffer[pos] = bits & 0xff
	buffer[pos + 1] = (bits >>> 8) & 0xff
	buffer[pos + 2] = (bits >>> 16) & 0xff
	buffer[pos + 3] = (bits >>> 24) & 0xff
	buffer[pos + 4] = bitsHigh & 0xff
	buffer[pos + 5] = (bitsHigh >>> 8) & 0xff
}

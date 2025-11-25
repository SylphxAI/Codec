/**
 * VTF (Valve Texture Format) decoder
 * Supports common uncompressed and DXT formats
 */

import type { ImageData } from '@mconv/core'
import { VTF_FORMAT, VTF_MAGIC } from './types'

/**
 * Decode VTF texture to RGBA
 */
export function decodeVtf(data: Uint8Array): ImageData {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	// Check magic
	const magic = view.getUint32(0, true)
	if (magic !== VTF_MAGIC) {
		throw new Error('Invalid VTF: wrong magic number')
	}

	// Read version
	const versionMajor = view.getUint32(4, true)
	const versionMinor = view.getUint32(8, true)

	// Read header
	const headerSize = view.getUint32(12, true)
	const width = view.getUint16(16, true)
	const height = view.getUint16(18, true)
	const flags = view.getUint32(20, true)
	const frames = view.getUint16(24, true)
	const firstFrame = view.getUint16(26, true)

	// Skip padding (4 bytes)
	const reflectivityR = view.getFloat32(32, true)
	const reflectivityG = view.getFloat32(36, true)
	const reflectivityB = view.getFloat32(40, true)
	// Skip padding (4 bytes)

	const bumpScale = view.getFloat32(48, true)
	const highResFormat = view.getUint32(52, true)
	const mipmapCount = data[56]!
	const lowResFormat = view.getUint32(57, true)
	const lowResWidth = data[61]!
	const lowResHeight = data[62]!

	// For v7.2+, there's depth
	let depth = 1
	if (versionMajor >= 7 && versionMinor >= 2) {
		depth = view.getUint16(63, true)
	}

	if (width === 0 || height === 0) {
		throw new Error('Invalid VTF dimensions')
	}

	// Calculate offset to high-res data
	// Skip low-res image and mipmap chain
	let dataOffset = headerSize

	// Skip low-res thumbnail if present
	if (lowResWidth > 0 && lowResHeight > 0) {
		const lowResSize = getImageSize(lowResFormat, lowResWidth, lowResHeight)
		dataOffset += lowResSize
	}

	// Skip mipmap chain (from smallest to largest, we want the largest)
	for (let mip = mipmapCount - 1; mip > 0; mip--) {
		const mipWidth = Math.max(1, width >> mip)
		const mipHeight = Math.max(1, height >> mip)
		const mipSize = getImageSize(highResFormat, mipWidth, mipHeight)
		dataOffset += mipSize * frames * depth
	}

	// Decode the high-res image
	const pixels = new Uint8Array(width * height * 4)
	const imageData = data.subarray(dataOffset)

	switch (highResFormat) {
		case VTF_FORMAT.RGBA8888:
			decodeRGBA8888(imageData, pixels, width, height)
			break
		case VTF_FORMAT.ABGR8888:
			decodeABGR8888(imageData, pixels, width, height)
			break
		case VTF_FORMAT.RGB888:
			decodeRGB888(imageData, pixels, width, height)
			break
		case VTF_FORMAT.BGR888:
		case VTF_FORMAT.BGR888_BLUESCREEN:
			decodeBGR888(imageData, pixels, width, height)
			break
		case VTF_FORMAT.ARGB8888:
			decodeARGB8888(imageData, pixels, width, height)
			break
		case VTF_FORMAT.BGRA8888:
		case VTF_FORMAT.BGRX8888:
			decodeBGRA8888(imageData, pixels, width, height)
			break
		case VTF_FORMAT.I8:
			decodeI8(imageData, pixels, width, height)
			break
		case VTF_FORMAT.IA88:
			decodeIA88(imageData, pixels, width, height)
			break
		case VTF_FORMAT.A8:
			decodeA8(imageData, pixels, width, height)
			break
		case VTF_FORMAT.DXT1:
		case VTF_FORMAT.DXT1_ONEBITALPHA:
			decodeDXT1(imageData, pixels, width, height)
			break
		case VTF_FORMAT.DXT5:
			decodeDXT5(imageData, pixels, width, height)
			break
		default:
			throw new Error(`Unsupported VTF format: ${highResFormat}`)
	}

	return { width, height, data: pixels }
}

function getImageSize(format: number, width: number, height: number): number {
	switch (format) {
		case VTF_FORMAT.RGBA8888:
		case VTF_FORMAT.ABGR8888:
		case VTF_FORMAT.ARGB8888:
		case VTF_FORMAT.BGRA8888:
		case VTF_FORMAT.BGRX8888:
		case VTF_FORMAT.UVWQ8888:
		case VTF_FORMAT.UVLX8888:
			return width * height * 4
		case VTF_FORMAT.RGB888:
		case VTF_FORMAT.BGR888:
		case VTF_FORMAT.BGR888_BLUESCREEN:
		case VTF_FORMAT.RGB888_BLUESCREEN:
			return width * height * 3
		case VTF_FORMAT.RGB565:
		case VTF_FORMAT.BGR565:
		case VTF_FORMAT.BGRA4444:
		case VTF_FORMAT.BGRX5551:
		case VTF_FORMAT.BGRA5551:
		case VTF_FORMAT.IA88:
		case VTF_FORMAT.UV88:
			return width * height * 2
		case VTF_FORMAT.I8:
		case VTF_FORMAT.A8:
		case VTF_FORMAT.P8:
			return width * height
		case VTF_FORMAT.DXT1:
		case VTF_FORMAT.DXT1_ONEBITALPHA:
			return Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * 8
		case VTF_FORMAT.DXT3:
		case VTF_FORMAT.DXT5:
			return Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * 16
		case VTF_FORMAT.RGBA16161616:
		case VTF_FORMAT.RGBA16161616F:
			return width * height * 8
		default:
			return width * height * 4
	}
}

function decodeRGBA8888(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	for (let i = 0; i < width * height; i++) {
		dst[i * 4] = src[i * 4]!
		dst[i * 4 + 1] = src[i * 4 + 1]!
		dst[i * 4 + 2] = src[i * 4 + 2]!
		dst[i * 4 + 3] = src[i * 4 + 3]!
	}
}

function decodeABGR8888(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	for (let i = 0; i < width * height; i++) {
		dst[i * 4] = src[i * 4 + 3]! // R
		dst[i * 4 + 1] = src[i * 4 + 2]! // G
		dst[i * 4 + 2] = src[i * 4 + 1]! // B
		dst[i * 4 + 3] = src[i * 4]! // A
	}
}

function decodeRGB888(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	for (let i = 0; i < width * height; i++) {
		dst[i * 4] = src[i * 3]!
		dst[i * 4 + 1] = src[i * 3 + 1]!
		dst[i * 4 + 2] = src[i * 3 + 2]!
		dst[i * 4 + 3] = 255
	}
}

function decodeBGR888(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	for (let i = 0; i < width * height; i++) {
		dst[i * 4] = src[i * 3 + 2]! // R
		dst[i * 4 + 1] = src[i * 3 + 1]! // G
		dst[i * 4 + 2] = src[i * 3]! // B
		dst[i * 4 + 3] = 255
	}
}

function decodeARGB8888(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	for (let i = 0; i < width * height; i++) {
		dst[i * 4] = src[i * 4 + 1]! // R
		dst[i * 4 + 1] = src[i * 4 + 2]! // G
		dst[i * 4 + 2] = src[i * 4 + 3]! // B
		dst[i * 4 + 3] = src[i * 4]! // A
	}
}

function decodeBGRA8888(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	for (let i = 0; i < width * height; i++) {
		dst[i * 4] = src[i * 4 + 2]! // R
		dst[i * 4 + 1] = src[i * 4 + 1]! // G
		dst[i * 4 + 2] = src[i * 4]! // B
		dst[i * 4 + 3] = src[i * 4 + 3]! // A
	}
}

function decodeI8(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	for (let i = 0; i < width * height; i++) {
		const lum = src[i]!
		dst[i * 4] = lum
		dst[i * 4 + 1] = lum
		dst[i * 4 + 2] = lum
		dst[i * 4 + 3] = 255
	}
}

function decodeIA88(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	for (let i = 0; i < width * height; i++) {
		const lum = src[i * 2]!
		dst[i * 4] = lum
		dst[i * 4 + 1] = lum
		dst[i * 4 + 2] = lum
		dst[i * 4 + 3] = src[i * 2 + 1]!
	}
}

function decodeA8(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	for (let i = 0; i < width * height; i++) {
		dst[i * 4] = 255
		dst[i * 4 + 1] = 255
		dst[i * 4 + 2] = 255
		dst[i * 4 + 3] = src[i]!
	}
}

function decodeDXT1(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	const blocksX = Math.ceil(width / 4)
	const blocksY = Math.ceil(height / 4)
	const view = new DataView(src.buffer, src.byteOffset, src.byteLength)

	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			const blockIdx = (by * blocksX + bx) * 8
			const c0 = view.getUint16(blockIdx, true)
			const c1 = view.getUint16(blockIdx + 2, true)
			const indices = view.getUint32(blockIdx + 4, true)

			const colors = [rgb565ToRgb888(c0), rgb565ToRgb888(c1), [0, 0, 0], [0, 0, 0]] as [
				number,
				number,
				number,
			][]

			if (c0 > c1) {
				colors[2] = [
					Math.round((2 * colors[0][0] + colors[1][0]) / 3),
					Math.round((2 * colors[0][1] + colors[1][1]) / 3),
					Math.round((2 * colors[0][2] + colors[1][2]) / 3),
				]
				colors[3] = [
					Math.round((colors[0][0] + 2 * colors[1][0]) / 3),
					Math.round((colors[0][1] + 2 * colors[1][1]) / 3),
					Math.round((colors[0][2] + 2 * colors[1][2]) / 3),
				]
			} else {
				colors[2] = [
					Math.round((colors[0][0] + colors[1][0]) / 2),
					Math.round((colors[0][1] + colors[1][1]) / 2),
					Math.round((colors[0][2] + colors[1][2]) / 2),
				]
				colors[3] = [0, 0, 0]
			}

			for (let py = 0; py < 4; py++) {
				for (let px = 0; px < 4; px++) {
					const x = bx * 4 + px
					const y = by * 4 + py

					if (x < width && y < height) {
						const idx = (py * 4 + px) * 2
						const colorIdx = (indices >> idx) & 3
						const dstPos = (y * width + x) * 4

						dst[dstPos] = colors[colorIdx]![0]
						dst[dstPos + 1] = colors[colorIdx]![1]
						dst[dstPos + 2] = colors[colorIdx]![2]
						dst[dstPos + 3] = c0 <= c1 && colorIdx === 3 ? 0 : 255
					}
				}
			}
		}
	}
}

function decodeDXT5(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	const blocksX = Math.ceil(width / 4)
	const blocksY = Math.ceil(height / 4)
	const view = new DataView(src.buffer, src.byteOffset, src.byteLength)

	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			const blockIdx = (by * blocksX + bx) * 16

			const a0 = src[blockIdx]!
			const a1 = src[blockIdx + 1]!
			const alphaIndices =
				BigInt(src[blockIdx + 2]!) |
				(BigInt(src[blockIdx + 3]!) << 8n) |
				(BigInt(src[blockIdx + 4]!) << 16n) |
				(BigInt(src[blockIdx + 5]!) << 24n) |
				(BigInt(src[blockIdx + 6]!) << 32n) |
				(BigInt(src[blockIdx + 7]!) << 40n)

			const alphas: number[] = [a0, a1, 0, 0, 0, 0, 0, 0]

			if (a0 > a1) {
				for (let i = 2; i < 8; i++) {
					alphas[i] = Math.round(((8 - i) * a0 + (i - 1) * a1) / 7)
				}
			} else {
				for (let i = 2; i < 6; i++) {
					alphas[i] = Math.round(((6 - i) * a0 + (i - 1) * a1) / 5)
				}
				alphas[6] = 0
				alphas[7] = 255
			}

			const c0 = view.getUint16(blockIdx + 8, true)
			const c1 = view.getUint16(blockIdx + 10, true)
			const indices = view.getUint32(blockIdx + 12, true)

			const colors = [
				rgb565ToRgb888(c0),
				rgb565ToRgb888(c1),
				[
					Math.round((2 * rgb565ToRgb888(c0)[0] + rgb565ToRgb888(c1)[0]) / 3),
					Math.round((2 * rgb565ToRgb888(c0)[1] + rgb565ToRgb888(c1)[1]) / 3),
					Math.round((2 * rgb565ToRgb888(c0)[2] + rgb565ToRgb888(c1)[2]) / 3),
				],
				[
					Math.round((rgb565ToRgb888(c0)[0] + 2 * rgb565ToRgb888(c1)[0]) / 3),
					Math.round((rgb565ToRgb888(c0)[1] + 2 * rgb565ToRgb888(c1)[1]) / 3),
					Math.round((rgb565ToRgb888(c0)[2] + 2 * rgb565ToRgb888(c1)[2]) / 3),
				],
			] as [number, number, number][]

			for (let py = 0; py < 4; py++) {
				for (let px = 0; px < 4; px++) {
					const x = bx * 4 + px
					const y = by * 4 + py

					if (x < width && y < height) {
						const pixelIdx = py * 4 + px
						const colorIdx = (indices >> (pixelIdx * 2)) & 3
						const alphaIdx = Number((alphaIndices >> BigInt(pixelIdx * 3)) & 7n)
						const dstPos = (y * width + x) * 4

						dst[dstPos] = colors[colorIdx]![0]
						dst[dstPos + 1] = colors[colorIdx]![1]
						dst[dstPos + 2] = colors[colorIdx]![2]
						dst[dstPos + 3] = alphas[alphaIdx]!
					}
				}
			}
		}
	}
}

function rgb565ToRgb888(c: number): [number, number, number] {
	const r = ((c >> 11) & 0x1f) << 3
	const g = ((c >> 5) & 0x3f) << 2
	const b = (c & 0x1f) << 3
	return [r | (r >> 5), g | (g >> 6), b | (b >> 5)]
}

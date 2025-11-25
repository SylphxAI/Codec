/**
 * KTX (Khronos Texture) decoder
 * Supports KTX1 format with uncompressed textures
 */

import type { ImageData } from '@mconv/core'
import {
	GL_ALPHA,
	GL_LUMINANCE,
	GL_LUMINANCE_ALPHA,
	GL_RGB,
	GL_RGBA,
	GL_UNSIGNED_BYTE,
	KTX1_MAGIC,
} from './types'

/**
 * Decode KTX texture to RGBA
 */
export function decodeKtx(data: Uint8Array): ImageData {
	// Verify magic number
	for (let i = 0; i < 12; i++) {
		if (data[i] !== KTX1_MAGIC[i]) {
			throw new Error('Invalid KTX: wrong magic number')
		}
	}

	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	// Check endianness
	const endianness = view.getUint32(12, true)
	const littleEndian = endianness === 0x04030201

	// Read header
	const glType = view.getUint32(16, littleEndian)
	const glTypeSize = view.getUint32(20, littleEndian)
	const glFormat = view.getUint32(24, littleEndian)
	const glInternalFormat = view.getUint32(28, littleEndian)
	const glBaseInternalFormat = view.getUint32(32, littleEndian)
	const width = view.getUint32(36, littleEndian)
	const height = view.getUint32(40, littleEndian)
	const depth = view.getUint32(44, littleEndian)
	const numArrayElements = view.getUint32(48, littleEndian)
	const numFaces = view.getUint32(52, littleEndian)
	const numMipLevels = view.getUint32(56, littleEndian)
	const bytesOfKeyValueData = view.getUint32(60, littleEndian)

	if (width === 0 || height === 0) {
		throw new Error('Invalid KTX dimensions')
	}

	// Skip key-value data
	let pos = 64 + bytesOfKeyValueData

	// Read first mip level size
	const imageSize = view.getUint32(pos, littleEndian)
	pos += 4

	// Determine source format
	const format = glFormat || glBaseInternalFormat

	// Only support uncompressed unsigned byte formats for now
	if (glType !== GL_UNSIGNED_BYTE && glType !== 0) {
		throw new Error(`Unsupported KTX type: 0x${glType.toString(16)}`)
	}

	const pixels = new Uint8Array(width * height * 4)
	const srcData = data.subarray(pos, pos + imageSize)

	switch (format) {
		case GL_RGBA:
			decodeRGBA(srcData, pixels, width, height)
			break
		case GL_RGB:
			decodeRGB(srcData, pixels, width, height)
			break
		case GL_LUMINANCE:
			decodeLuminance(srcData, pixels, width, height)
			break
		case GL_LUMINANCE_ALPHA:
			decodeLuminanceAlpha(srcData, pixels, width, height)
			break
		case GL_ALPHA:
			decodeAlpha(srcData, pixels, width, height)
			break
		default:
			throw new Error(`Unsupported KTX format: 0x${format.toString(16)}`)
	}

	return { width, height, data: pixels }
}

function decodeRGBA(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	const rowPadding = (4 - ((width * 4) % 4)) % 4
	let srcPos = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const dstPos = (y * width + x) * 4
			dst[dstPos] = src[srcPos++]!
			dst[dstPos + 1] = src[srcPos++]!
			dst[dstPos + 2] = src[srcPos++]!
			dst[dstPos + 3] = src[srcPos++]!
		}
		srcPos += rowPadding
	}
}

function decodeRGB(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	const rowPadding = (4 - ((width * 3) % 4)) % 4
	let srcPos = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const dstPos = (y * width + x) * 4
			dst[dstPos] = src[srcPos++]!
			dst[dstPos + 1] = src[srcPos++]!
			dst[dstPos + 2] = src[srcPos++]!
			dst[dstPos + 3] = 255
		}
		srcPos += rowPadding
	}
}

function decodeLuminance(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	const rowPadding = (4 - (width % 4)) % 4
	let srcPos = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const dstPos = (y * width + x) * 4
			const lum = src[srcPos++]!
			dst[dstPos] = lum
			dst[dstPos + 1] = lum
			dst[dstPos + 2] = lum
			dst[dstPos + 3] = 255
		}
		srcPos += rowPadding
	}
}

function decodeLuminanceAlpha(
	src: Uint8Array,
	dst: Uint8Array,
	width: number,
	height: number
): void {
	const rowPadding = (4 - ((width * 2) % 4)) % 4
	let srcPos = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const dstPos = (y * width + x) * 4
			const lum = src[srcPos++]!
			dst[dstPos] = lum
			dst[dstPos + 1] = lum
			dst[dstPos + 2] = lum
			dst[dstPos + 3] = src[srcPos++]!
		}
		srcPos += rowPadding
	}
}

function decodeAlpha(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	const rowPadding = (4 - (width % 4)) % 4
	let srcPos = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const dstPos = (y * width + x) * 4
			dst[dstPos] = 255
			dst[dstPos + 1] = 255
			dst[dstPos + 2] = 255
			dst[dstPos + 3] = src[srcPos++]!
		}
		srcPos += rowPadding
	}
}

/**
 * PVR (PowerVR) texture decoder
 * Supports PVR v3 format with common uncompressed formats
 */

import type { ImageData } from '@mconv/core'
import { PVR3_MAGIC, PVR_PIXEL_FORMAT } from './types'

/**
 * Decode PVR texture to RGBA
 */
export function decodePvr(data: Uint8Array): ImageData {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	// Read header (52 bytes)
	const version = view.getUint32(0, true)

	if (version !== PVR3_MAGIC) {
		throw new Error('Invalid PVR: wrong magic number or unsupported version')
	}

	const flags = view.getUint32(4, true)
	const pixelFormat = view.getBigUint64(8, true)
	const colorSpace = view.getUint32(16, true)
	const channelType = view.getUint32(20, true)
	const height = view.getUint32(24, true)
	const width = view.getUint32(28, true)
	const depth = view.getUint32(32, true)
	const numSurfaces = view.getUint32(36, true)
	const numFaces = view.getUint32(40, true)
	const mipMapCount = view.getUint32(44, true)
	const metadataSize = view.getUint32(48, true)

	if (width === 0 || height === 0) {
		throw new Error('Invalid PVR dimensions')
	}

	// Skip metadata
	const pixelDataStart = 52 + metadataSize

	// Decode based on pixel format
	const pixels = new Uint8Array(width * height * 4)

	// Check for uncompressed formats (high 32 bits describe channels)
	const formatHigh = Number(pixelFormat >> 32n)
	const formatLow = Number(pixelFormat & 0xffffffffn)

	if (formatHigh !== 0) {
		// Uncompressed format - channel layout in high bits
		decodeUncompressed(data.subarray(pixelDataStart), pixels, width, height, pixelFormat)
	} else {
		// Compressed format
		switch (pixelFormat) {
			case PVR_PIXEL_FORMAT.DXT1:
				decodeDXT1(data.subarray(pixelDataStart), pixels, width, height)
				break
			case PVR_PIXEL_FORMAT.DXT5:
				decodeDXT5(data.subarray(pixelDataStart), pixels, width, height)
				break
			case PVR_PIXEL_FORMAT.ETC1:
				decodeETC1(data.subarray(pixelDataStart), pixels, width, height)
				break
			default:
				throw new Error(`Unsupported PVR pixel format: ${pixelFormat}`)
		}
	}

	return { width, height, data: pixels }
}

/**
 * Decode uncompressed PVR data
 */
function decodeUncompressed(
	src: Uint8Array,
	dst: Uint8Array,
	width: number,
	height: number,
	pixelFormat: bigint
): void {
	// Parse channel layout from high 32 bits
	// Each byte represents a channel: 'r'=0x72, 'g'=0x67, 'b'=0x62, 'a'=0x61
	const formatBytes = [
		Number((pixelFormat >> 32n) & 0xffn),
		Number((pixelFormat >> 40n) & 0xffn),
		Number((pixelFormat >> 48n) & 0xffn),
		Number((pixelFormat >> 56n) & 0xffn),
	]

	// Parse bits per channel from low 32 bits
	const bitsPerChannel = [
		Number(pixelFormat & 0xffn),
		Number((pixelFormat >> 8n) & 0xffn),
		Number((pixelFormat >> 16n) & 0xffn),
		Number((pixelFormat >> 24n) & 0xffn),
	]

	// Calculate bytes per pixel
	const totalBits = bitsPerChannel.reduce((a, b) => a + b, 0)
	const bytesPerPixel = Math.ceil(totalBits / 8)

	// Determine channel mapping
	const channelMap: Record<string, { index: number; bits: number }> = {}
	let channelCount = 0

	for (let i = 0; i < 4; i++) {
		if (formatBytes[i] !== 0) {
			const char = String.fromCharCode(formatBytes[i])
			channelMap[char] = { index: channelCount, bits: bitsPerChannel[i] }
			channelCount++
		}
	}

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcPos = (y * width + x) * bytesPerPixel
			const dstPos = (y * width + x) * 4

			// Read pixel value
			let pixelValue = 0n
			for (let b = 0; b < bytesPerPixel; b++) {
				pixelValue |= BigInt(src[srcPos + b]!) << BigInt(b * 8)
			}

			// Extract channels
			let bitOffset = 0
			const channels: number[] = [0, 0, 0, 255]

			for (let i = 0; i < channelCount; i++) {
				const char = Object.keys(channelMap).find((k) => channelMap[k]!.index === i)!
				const bits = channelMap[char]!.bits
				const mask = (1n << BigInt(bits)) - 1n
				const value = Number((pixelValue >> BigInt(bitOffset)) & mask)
				const normalized = Math.round((value * 255) / ((1 << bits) - 1))

				switch (char) {
					case 'r':
						channels[0] = normalized
						break
					case 'g':
						channels[1] = normalized
						break
					case 'b':
						channels[2] = normalized
						break
					case 'a':
						channels[3] = normalized
						break
				}

				bitOffset += bits
			}

			dst[dstPos] = channels[0]!
			dst[dstPos + 1] = channels[1]!
			dst[dstPos + 2] = channels[2]!
			dst[dstPos + 3] = channels[3]!
		}
	}
}

/**
 * Decode DXT1 compressed data
 */
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

			// Expand RGB565 to RGB888
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
				colors[3] = [0, 0, 0] // Transparent black
			}

			// Apply colors to block
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

/**
 * Decode DXT5 compressed data
 */
function decodeDXT5(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	const blocksX = Math.ceil(width / 4)
	const blocksY = Math.ceil(height / 4)
	const view = new DataView(src.buffer, src.byteOffset, src.byteLength)

	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			const blockIdx = (by * blocksX + bx) * 16

			// Alpha block
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

			// Color block (same as DXT1)
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

			// Apply to block
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

/**
 * Decode ETC1 compressed data
 */
function decodeETC1(src: Uint8Array, dst: Uint8Array, width: number, height: number): void {
	const blocksX = Math.ceil(width / 4)
	const blocksY = Math.ceil(height / 4)

	// ETC1 modifier tables
	const modifierTable = [
		[2, 8],
		[5, 17],
		[9, 29],
		[13, 42],
		[18, 60],
		[24, 80],
		[33, 106],
		[47, 183],
	]

	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			const blockIdx = (by * blocksX + bx) * 8

			// Read block (big-endian)
			const high =
				(src[blockIdx]! << 24) |
				(src[blockIdx + 1]! << 16) |
				(src[blockIdx + 2]! << 8) |
				src[blockIdx + 3]!
			const low =
				(src[blockIdx + 4]! << 24) |
				(src[blockIdx + 5]! << 16) |
				(src[blockIdx + 6]! << 8) |
				src[blockIdx + 7]!

			const diffBit = (high >> 1) & 1
			const flipBit = high & 1

			let baseR1: number
			let baseG1: number
			let baseB1: number
			let baseR2: number
			let baseG2: number
			let baseB2: number

			if (diffBit) {
				// Differential mode
				const r = (high >> 27) & 0x1f
				const g = (high >> 19) & 0x1f
				const b = (high >> 11) & 0x1f
				const dr = signExtend3((high >> 24) & 0x7)
				const dg = signExtend3((high >> 16) & 0x7)
				const db = signExtend3((high >> 8) & 0x7)

				baseR1 = extend5to8(r)
				baseG1 = extend5to8(g)
				baseB1 = extend5to8(b)
				baseR2 = extend5to8(r + dr)
				baseG2 = extend5to8(g + dg)
				baseB2 = extend5to8(b + db)
			} else {
				// Individual mode
				baseR1 = extend4to8((high >> 28) & 0xf)
				baseG1 = extend4to8((high >> 20) & 0xf)
				baseB1 = extend4to8((high >> 12) & 0xf)
				baseR2 = extend4to8((high >> 24) & 0xf)
				baseG2 = extend4to8((high >> 16) & 0xf)
				baseB2 = extend4to8((high >> 8) & 0xf)
			}

			const table1 = (high >> 5) & 0x7
			const table2 = (high >> 2) & 0x7

			// Decode pixels
			for (let py = 0; py < 4; py++) {
				for (let px = 0; px < 4; px++) {
					const x = bx * 4 + px
					const y = by * 4 + py

					if (x < width && y < height) {
						const pixelIdx = py * 4 + px
						const msb = (low >> (pixelIdx + 16)) & 1
						const lsb = (low >> pixelIdx) & 1
						const modifierIdx = (msb << 1) | lsb

						// Select subblock
						const useSecond = flipBit ? py >= 2 : px >= 2

						const baseR = useSecond ? baseR2 : baseR1
						const baseG = useSecond ? baseG2 : baseG1
						const baseB = useSecond ? baseB2 : baseB1
						const table = useSecond ? table2 : table1

						const modifier = getETC1Modifier(table, modifierIdx, modifierTable)

						const dstPos = (y * width + x) * 4
						dst[dstPos] = clamp(baseR + modifier)
						dst[dstPos + 1] = clamp(baseG + modifier)
						dst[dstPos + 2] = clamp(baseB + modifier)
						dst[dstPos + 3] = 255
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

function signExtend3(value: number): number {
	return value > 3 ? value - 8 : value
}

function extend4to8(value: number): number {
	return (value << 4) | value
}

function extend5to8(value: number): number {
	return (value << 3) | (value >> 2)
}

function getETC1Modifier(tableIdx: number, modifierIdx: number, table: number[][]): number {
	const modifiers = table[tableIdx]!
	switch (modifierIdx) {
		case 0:
			return modifiers[0]!
		case 1:
			return -modifiers[0]!
		case 2:
			return modifiers[1]!
		case 3:
			return -modifiers[1]!
		default:
			return 0
	}
}

function clamp(value: number): number {
	return Math.max(0, Math.min(255, value))
}

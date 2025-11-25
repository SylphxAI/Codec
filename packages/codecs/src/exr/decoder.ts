/**
 * OpenEXR decoder
 * Supports: Scanline images, NONE/RLE compression, HALF/FLOAT pixel types
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	type ExrBox2i,
	type ExrChannel,
	ExrCompression,
	type ExrHeader,
	ExrLineOrder,
	ExrPixelType,
} from './types'

const EXR_MAGIC = 0x01312f76
const EXR_VERSION_FLAG_TILED = 0x200
const EXR_VERSION_FLAG_LONG_NAMES = 0x400
const EXR_VERSION_FLAG_DEEP = 0x800
const EXR_VERSION_FLAG_MULTIPART = 0x1000

/**
 * Decode EXR to ImageData (converts HDR to 8-bit with tone mapping)
 */
export function decodeExr(data: Uint8Array): ImageData {
	const header = parseHeader(data)
	const pixels = decodePixels(data, header)

	// Convert HDR float to 8-bit with simple tone mapping
	const width = header.dataWindow.xMax - header.dataWindow.xMin + 1
	const height = header.dataWindow.yMax - header.dataWindow.yMin + 1
	const output = new Uint8Array(width * height * 4)

	for (let i = 0; i < width * height; i++) {
		const r = pixels[i * 4]!
		const g = pixels[i * 4 + 1]!
		const b = pixels[i * 4 + 2]!
		const a = pixels[i * 4 + 3]!

		// Simple Reinhard tone mapping
		output[i * 4] = Math.min(255, Math.max(0, Math.round((r / (1 + r)) * 255)))
		output[i * 4 + 1] = Math.min(255, Math.max(0, Math.round((g / (1 + g)) * 255)))
		output[i * 4 + 2] = Math.min(255, Math.max(0, Math.round((b / (1 + b)) * 255)))
		output[i * 4 + 3] = Math.min(255, Math.max(0, Math.round(a * 255)))
	}

	return { width, height, data: output }
}

/**
 * Decode EXR to HDR float data
 */
export function decodeExrHdr(data: Uint8Array): {
	width: number
	height: number
	data: Float32Array
} {
	const header = parseHeader(data)
	const pixels = decodePixels(data, header)

	const width = header.dataWindow.xMax - header.dataWindow.xMin + 1
	const height = header.dataWindow.yMax - header.dataWindow.yMin + 1

	return { width, height, data: pixels }
}

/**
 * Check if data is an EXR file
 */
export function isExr(data: Uint8Array): boolean {
	if (data.length < 8) return false
	const magic = readU32LE(data, 0)
	return magic === EXR_MAGIC
}

/**
 * Parse EXR header
 */
export function parseHeader(data: Uint8Array): ExrHeader {
	let offset = 0

	// Magic number
	const magic = readU32LE(data, offset)
	if (magic !== EXR_MAGIC) {
		throw new Error('Not an EXR file')
	}
	offset += 4

	// Version and flags
	const versionField = readU32LE(data, offset)
	offset += 4

	const version = versionField & 0xff
	const isTiled = (versionField & EXR_VERSION_FLAG_TILED) !== 0
	const hasLongNames = (versionField & EXR_VERSION_FLAG_LONG_NAMES) !== 0
	const hasDeepData = (versionField & EXR_VERSION_FLAG_DEEP) !== 0
	const isMultiPart = (versionField & EXR_VERSION_FLAG_MULTIPART) !== 0

	if (isTiled) {
		throw new Error('Tiled EXR not supported')
	}

	// Parse attributes
	const channels: ExrChannel[] = []
	let compression = ExrCompression.NONE
	let dataWindow: ExrBox2i = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 }
	let displayWindow: ExrBox2i = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 }
	let lineOrder = ExrLineOrder.INCREASING_Y
	let pixelAspectRatio = 1
	let screenWindowCenter: [number, number] = [0, 0]
	let screenWindowWidth = 1

	while (offset < data.length) {
		// Read attribute name
		const nameEnd = data.indexOf(0, offset)
		if (nameEnd === offset) {
			offset++ // End of header
			break
		}

		const name = readString(data, offset, nameEnd - offset)
		offset = nameEnd + 1

		// Read type name
		const typeEnd = data.indexOf(0, offset)
		const typeName = readString(data, offset, typeEnd - offset)
		offset = typeEnd + 1

		// Read size
		const size = readU32LE(data, offset)
		offset += 4

		// Parse value based on type
		switch (name) {
			case 'channels':
				offset = parseChannels(data, offset, channels)
				break
			case 'compression':
				compression = data[offset]!
				offset += size
				break
			case 'dataWindow':
				dataWindow = parseBox2i(data, offset)
				offset += size
				break
			case 'displayWindow':
				displayWindow = parseBox2i(data, offset)
				offset += size
				break
			case 'lineOrder':
				lineOrder = data[offset]!
				offset += size
				break
			case 'pixelAspectRatio':
				pixelAspectRatio = readF32LE(data, offset)
				offset += size
				break
			case 'screenWindowCenter':
				screenWindowCenter = [readF32LE(data, offset), readF32LE(data, offset + 4)]
				offset += size
				break
			case 'screenWindowWidth':
				screenWindowWidth = readF32LE(data, offset)
				offset += size
				break
			default:
				offset += size
		}
	}

	return {
		version,
		isTiled,
		hasLongNames,
		hasDeepData,
		isMultiPart,
		channels,
		compression,
		dataWindow,
		displayWindow,
		lineOrder,
		pixelAspectRatio,
		screenWindowCenter,
		screenWindowWidth,
	}
}

function parseChannels(data: Uint8Array, startOffset: number, channels: ExrChannel[]): number {
	let pos = startOffset
	while (data[pos] !== 0) {
		const nameEnd = data.indexOf(0, pos)
		const name = readString(data, pos, nameEnd - pos)
		pos = nameEnd + 1

		const pixelType = readU32LE(data, pos) as ExrPixelType
		pos += 4

		const pLinear = data[pos]!
		pos += 1

		pos += 3 // reserved

		const xSampling = readU32LE(data, pos)
		pos += 4

		const ySampling = readU32LE(data, pos)
		pos += 4

		channels.push({ name, pixelType, pLinear, xSampling, ySampling })
	}

	return pos + 1 // Skip null terminator
}

function parseBox2i(data: Uint8Array, offset: number): ExrBox2i {
	return {
		xMin: readI32LE(data, offset),
		yMin: readI32LE(data, offset + 4),
		xMax: readI32LE(data, offset + 8),
		yMax: readI32LE(data, offset + 12),
	}
}

function decodePixels(data: Uint8Array, header: ExrHeader): Float32Array {
	const width = header.dataWindow.xMax - header.dataWindow.xMin + 1
	const height = header.dataWindow.yMax - header.dataWindow.yMin + 1
	const pixels = new Float32Array(width * height * 4)

	// Initialize alpha to 1
	for (let i = 0; i < width * height; i++) {
		pixels[i * 4 + 3] = 1
	}

	// Find offset table (after header)
	let offset = findOffsetTable(data)

	// Read offset table
	const offsets: bigint[] = []
	for (let y = 0; y < height; y++) {
		offsets.push(readU64LE(data, offset))
		offset += 8
	}

	// Decode scanlines
	for (let y = 0; y < height; y++) {
		const scanlineOffset = Number(offsets[y]!)
		decodeScanline(data, scanlineOffset, header, pixels, y, width)
	}

	return pixels
}

function findOffsetTable(data: Uint8Array): number {
	let offset = 8 // Skip magic and version

	// Skip header attributes
	while (offset < data.length) {
		const nameEnd = data.indexOf(0, offset)
		if (nameEnd === offset) {
			return offset + 1
		}
		offset = nameEnd + 1

		const typeEnd = data.indexOf(0, offset)
		offset = typeEnd + 1

		const size = readU32LE(data, offset)
		offset += 4 + size
	}

	return offset
}

function decodeScanline(
	data: Uint8Array,
	startOffset: number,
	header: ExrHeader,
	pixels: Float32Array,
	y: number,
	width: number
): void {
	let pos = startOffset
	const yCoord = readI32LE(data, pos)
	pos += 4

	const pixelDataSize = readU32LE(data, pos)
	pos += 4

	let scanlineData: Uint8Array

	if (header.compression === ExrCompression.NONE) {
		scanlineData = data.slice(pos, pos + pixelDataSize)
	} else if (header.compression === ExrCompression.RLE) {
		scanlineData = decodeRle(data, pos, pixelDataSize)
	} else {
		// Unsupported compression - fill with zeros
		scanlineData = new Uint8Array(width * header.channels.length * 4)
	}

	// Decode channel data
	let dataOffset = 0
	for (const channel of header.channels) {
		const channelIdx = getChannelIndex(channel.name)
		if (channelIdx < 0) {
			dataOffset += width * getPixelTypeSize(channel.pixelType)
			continue
		}

		for (let x = 0; x < width; x++) {
			const pixelIdx = (y * width + x) * 4 + channelIdx
			const value = readPixelValue(scanlineData, dataOffset, channel.pixelType)
			pixels[pixelIdx] = value
			dataOffset += getPixelTypeSize(channel.pixelType)
		}
	}
}

function getChannelIndex(name: string): number {
	switch (name.toUpperCase()) {
		case 'R':
			return 0
		case 'G':
			return 1
		case 'B':
			return 2
		case 'A':
			return 3
		default:
			return -1
	}
}

function getPixelTypeSize(type: ExrPixelType): number {
	switch (type) {
		case ExrPixelType.UINT:
			return 4
		case ExrPixelType.HALF:
			return 2
		case ExrPixelType.FLOAT:
			return 4
		default:
			return 4
	}
}

function readPixelValue(data: Uint8Array, offset: number, type: ExrPixelType): number {
	switch (type) {
		case ExrPixelType.UINT:
			return readU32LE(data, offset) / 4294967295
		case ExrPixelType.HALF:
			return halfToFloat(readU16LE(data, offset))
		case ExrPixelType.FLOAT:
			return readF32LE(data, offset)
		default:
			return 0
	}
}

function decodeRle(data: Uint8Array, startOffset: number, compressedSize: number): Uint8Array {
	const result: number[] = []
	const end = startOffset + compressedSize
	let pos = startOffset

	while (pos < end) {
		const count = data[pos]!
		pos++

		if (count < 128) {
			// Literal run
			for (let i = 0; i <= count; i++) {
				result.push(data[pos]!)
				pos++
			}
		} else {
			// RLE run
			const value = data[pos]!
			pos++
			const runLength = 256 - count + 1
			for (let i = 0; i < runLength; i++) {
				result.push(value)
			}
		}
	}

	return new Uint8Array(result)
}

// Half-precision float conversion
function halfToFloat(h: number): number {
	const sign = (h >> 15) & 1
	const exponent = (h >> 10) & 0x1f
	const mantissa = h & 0x3ff

	if (exponent === 0) {
		if (mantissa === 0) {
			return sign === 0 ? 0 : -0
		}
		// Denormalized
		const f = mantissa / 1024
		return sign === 0 ? f * 2 ** -14 : -f * 2 ** -14
	}

	if (exponent === 31) {
		if (mantissa === 0) {
			return sign === 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
		}
		return Number.NaN
	}

	const f = 1 + mantissa / 1024
	const result = f * 2 ** (exponent - 15)
	return sign === 0 ? result : -result
}

// Binary reading helpers
function readU16LE(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8)
}

function readU32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! |
		(data[offset + 1]! << 8) |
		(data[offset + 2]! << 16) |
		((data[offset + 3]! << 24) >>> 0)
	)
}

function readI32LE(data: Uint8Array, offset: number): number {
	const u = readU32LE(data, offset)
	return u > 0x7fffffff ? u - 0x100000000 : u
}

function readU64LE(data: Uint8Array, offset: number): bigint {
	const lo = BigInt(readU32LE(data, offset))
	const hi = BigInt(readU32LE(data, offset + 4))
	return lo | (hi << 32n)
}

function readF32LE(data: Uint8Array, offset: number): number {
	const buf = new ArrayBuffer(4)
	const view = new DataView(buf)
	view.setUint8(0, data[offset]!)
	view.setUint8(1, data[offset + 1]!)
	view.setUint8(2, data[offset + 2]!)
	view.setUint8(3, data[offset + 3]!)
	return view.getFloat32(0, true)
}

function readString(data: Uint8Array, offset: number, length: number): string {
	let str = ''
	for (let i = 0; i < length; i++) {
		str += String.fromCharCode(data[offset + i]!)
	}
	return str
}

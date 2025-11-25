/**
 * Adobe Photoshop (PSD) decoder
 * Decodes flattened composite image from PSD files
 * Supports: PSD v1, 8/16-bit, RGB/Grayscale/CMYK
 */

import type { ImageData } from '@mconv/core'
import { PsdColorMode, PsdCompression, type PsdHeader, type PsdInfo, type PsdLayer } from './types'

const PSD_SIGNATURE = '8BPS'

/**
 * Check if data is a PSD file
 */
export function isPsd(data: Uint8Array): boolean {
	if (data.length < 4) return false
	return (
		data[0] === 0x38 && // '8'
		data[1] === 0x42 && // 'B'
		data[2] === 0x50 && // 'P'
		data[3] === 0x53 // 'S'
	)
}

/**
 * Parse PSD header and info
 */
export function parsePsd(data: Uint8Array): PsdInfo {
	const header = parseHeader(data)
	const layers = parseLayers(data, header)
	const hasAlpha = header.channels > 3 && header.colorMode === PsdColorMode.RGB

	return { header, layers, hasAlpha }
}

/**
 * Decode PSD to ImageData (flattened composite)
 */
export function decodePsd(data: Uint8Array): ImageData {
	const header = parseHeader(data)

	if (header.version !== 1) {
		throw new Error(`PSD version ${header.version} not supported (only v1)`)
	}

	if (header.depth !== 8 && header.depth !== 16) {
		throw new Error(`PSD bit depth ${header.depth} not supported`)
	}

	// Skip to image data section
	let offset = 26 // Header size

	// Skip Color Mode Data
	const colorModeLen = readU32BE(data, offset)
	offset += 4 + colorModeLen

	// Skip Image Resources
	const resourcesLen = readU32BE(data, offset)
	offset += 4 + resourcesLen

	// Skip Layer and Mask Info
	const layerMaskLen = readU32BE(data, offset)
	offset += 4 + layerMaskLen

	// Image Data Section
	const compression = readU16BE(data, offset) as PsdCompression
	offset += 2

	const { width, height, channels, depth, colorMode } = header

	// Decode image data based on compression
	let channelData: Uint8Array[]

	if (compression === PsdCompression.RAW) {
		channelData = decodeRaw(data, offset, width, height, channels, depth)
	} else if (compression === PsdCompression.RLE) {
		channelData = decodeRle(data, offset, width, height, channels, depth)
	} else {
		throw new Error(`PSD compression ${compression} not supported`)
	}

	// Convert to RGBA
	const output = new Uint8Array(width * height * 4)

	if (colorMode === PsdColorMode.RGB) {
		convertRgbToRgba(channelData, output, width, height, channels, depth)
	} else if (colorMode === PsdColorMode.GRAYSCALE) {
		convertGrayscaleToRgba(channelData, output, width, height, channels, depth)
	} else if (colorMode === PsdColorMode.CMYK) {
		convertCmykToRgba(channelData, output, width, height, depth)
	} else {
		throw new Error(`PSD color mode ${colorMode} not supported`)
	}

	return { width, height, data: output }
}

function parseHeader(data: Uint8Array): PsdHeader {
	if (data.length < 26) {
		throw new Error('Invalid PSD: file too short')
	}

	const signature = String.fromCharCode(data[0]!, data[1]!, data[2]!, data[3]!)
	if (signature !== PSD_SIGNATURE) {
		throw new Error('Invalid PSD: bad signature')
	}

	const version = readU16BE(data, 4)
	// Skip 6 reserved bytes
	const channels = readU16BE(data, 12)
	const height = readU32BE(data, 14)
	const width = readU32BE(data, 18)
	const depth = readU16BE(data, 22)
	const colorMode = readU16BE(data, 24) as PsdColorMode

	return { signature, version, channels, height, width, depth, colorMode }
}

function parseLayers(data: Uint8Array, header: PsdHeader): PsdLayer[] {
	const layers: PsdLayer[] = []

	let offset = 26

	// Skip Color Mode Data
	const colorModeLen = readU32BE(data, offset)
	offset += 4 + colorModeLen

	// Skip Image Resources
	const resourcesLen = readU32BE(data, offset)
	offset += 4 + resourcesLen

	// Layer and Mask Info
	const layerMaskLen = readU32BE(data, offset)
	offset += 4

	if (layerMaskLen === 0) {
		return layers
	}

	// Layer Info
	const layerInfoLen = readU32BE(data, offset)
	offset += 4

	if (layerInfoLen === 0) {
		return layers
	}

	// Layer count (can be negative if first alpha channel contains transparency)
	const layerCount = Math.abs(readI16BE(data, offset))
	offset += 2

	// Parse layer records
	for (let i = 0; i < layerCount; i++) {
		const top = readI32BE(data, offset)
		const left = readI32BE(data, offset + 4)
		const bottom = readI32BE(data, offset + 8)
		const right = readI32BE(data, offset + 12)
		offset += 16

		const numChannels = readU16BE(data, offset)
		offset += 2

		// Skip channel info (6 bytes per channel)
		offset += numChannels * 6

		// Blend mode signature
		offset += 4 // '8BIM'

		// Blend mode key
		const blendMode = String.fromCharCode(
			data[offset]!,
			data[offset + 1]!,
			data[offset + 2]!,
			data[offset + 3]!
		)
		offset += 4

		const opacity = data[offset]!
		offset += 1

		const clipping = data[offset]!
		offset += 1

		const flags = data[offset]!
		offset += 1

		const visible = (flags & 0x02) === 0

		offset += 1 // filler

		// Extra data length
		const extraLen = readU32BE(data, offset)
		offset += 4

		// Parse layer name from extra data
		let name = `Layer ${i + 1}`

		if (extraLen > 0) {
			const extraStart = offset

			// Layer mask data
			const maskLen = readU32BE(data, offset)
			offset += 4 + maskLen

			// Blending ranges
			const blendLen = readU32BE(data, offset)
			offset += 4 + blendLen

			// Layer name (Pascal string)
			const nameLen = data[offset]!
			offset += 1

			if (nameLen > 0 && offset + nameLen <= data.length) {
				name = ''
				for (let j = 0; j < nameLen; j++) {
					name += String.fromCharCode(data[offset + j]!)
				}
			}

			// Skip to end of extra data
			offset = extraStart + extraLen
		}

		layers.push({ name, top, left, bottom, right, opacity, visible, blendMode })
	}

	return layers
}

function decodeRaw(
	data: Uint8Array,
	offset: number,
	width: number,
	height: number,
	channels: number,
	depth: number
): Uint8Array[] {
	const bytesPerPixel = depth === 16 ? 2 : 1
	const bytesPerRow = width * bytesPerPixel
	const channelData: Uint8Array[] = []

	for (let ch = 0; ch < channels; ch++) {
		const channel = new Uint8Array(width * height * bytesPerPixel)

		for (let y = 0; y < height; y++) {
			const srcOffset = offset + ch * (bytesPerRow * height) + y * bytesPerRow
			const dstOffset = y * bytesPerRow
			channel.set(data.slice(srcOffset, srcOffset + bytesPerRow), dstOffset)
		}

		channelData.push(channel)
	}

	return channelData
}

function decodeRle(
	data: Uint8Array,
	startOffset: number,
	width: number,
	height: number,
	channels: number,
	depth: number
): Uint8Array[] {
	const bytesPerPixel = depth === 16 ? 2 : 1
	const bytesPerRow = width * bytesPerPixel
	const channelData: Uint8Array[] = []
	let pos = startOffset

	// Read row byte counts for all channels
	const rowCounts: number[][] = []
	for (let ch = 0; ch < channels; ch++) {
		const counts: number[] = []
		for (let y = 0; y < height; y++) {
			counts.push(readU16BE(data, pos))
			pos += 2
		}
		rowCounts.push(counts)
	}

	// Decode each channel
	for (let ch = 0; ch < channels; ch++) {
		const channel = new Uint8Array(width * height * bytesPerPixel)

		for (let y = 0; y < height; y++) {
			const rowLen = rowCounts[ch]![y]!
			const row = decodeRleRow(data, pos, rowLen, bytesPerRow)
			channel.set(row, y * bytesPerRow)
			pos += rowLen
		}

		channelData.push(channel)
	}

	return channelData
}

function decodeRleRow(
	data: Uint8Array,
	offset: number,
	compressedLen: number,
	uncompressedLen: number
): Uint8Array {
	const result = new Uint8Array(uncompressedLen)
	let srcPos = offset
	let dstPos = 0
	const end = offset + compressedLen

	while (srcPos < end && dstPos < uncompressedLen) {
		const count = data[srcPos]!
		srcPos++

		if (count < 128) {
			// Literal run: copy (count + 1) bytes
			const len = count + 1
			for (let i = 0; i < len && dstPos < uncompressedLen; i++) {
				result[dstPos++] = data[srcPos++]!
			}
		} else if (count > 128) {
			// RLE run: repeat next byte (257 - count) times
			const len = 257 - count
			const value = data[srcPos++]!
			for (let i = 0; i < len && dstPos < uncompressedLen; i++) {
				result[dstPos++] = value
			}
		}
		// count === 128 is a no-op
	}

	return result
}

function convertRgbToRgba(
	channelData: Uint8Array[],
	output: Uint8Array,
	width: number,
	height: number,
	channels: number,
	depth: number
): void {
	const scale = depth === 16 ? 1 / 257 : 1 // Scale 16-bit to 8-bit
	const bytesPerPixel = depth === 16 ? 2 : 1

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * bytesPerPixel
			const dstIdx = (y * width + x) * 4

			if (depth === 16) {
				output[dstIdx] = Math.round(readU16BE(channelData[0]!, srcIdx) * scale)
				output[dstIdx + 1] = Math.round(readU16BE(channelData[1]!, srcIdx) * scale)
				output[dstIdx + 2] = Math.round(readU16BE(channelData[2]!, srcIdx) * scale)
				output[dstIdx + 3] =
					channels >= 4 ? Math.round(readU16BE(channelData[3]!, srcIdx) * scale) : 255
			} else {
				output[dstIdx] = channelData[0]![srcIdx]!
				output[dstIdx + 1] = channelData[1]![srcIdx]!
				output[dstIdx + 2] = channelData[2]![srcIdx]!
				output[dstIdx + 3] = channels >= 4 ? channelData[3]![srcIdx]! : 255
			}
		}
	}
}

function convertGrayscaleToRgba(
	channelData: Uint8Array[],
	output: Uint8Array,
	width: number,
	height: number,
	channels: number,
	depth: number
): void {
	const scale = depth === 16 ? 1 / 257 : 1
	const bytesPerPixel = depth === 16 ? 2 : 1

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * bytesPerPixel
			const dstIdx = (y * width + x) * 4

			let gray: number
			let alpha: number

			if (depth === 16) {
				gray = Math.round(readU16BE(channelData[0]!, srcIdx) * scale)
				alpha = channels >= 2 ? Math.round(readU16BE(channelData[1]!, srcIdx) * scale) : 255
			} else {
				gray = channelData[0]![srcIdx]!
				alpha = channels >= 2 ? channelData[1]![srcIdx]! : 255
			}

			output[dstIdx] = gray
			output[dstIdx + 1] = gray
			output[dstIdx + 2] = gray
			output[dstIdx + 3] = alpha
		}
	}
}

function convertCmykToRgba(
	channelData: Uint8Array[],
	output: Uint8Array,
	width: number,
	height: number,
	depth: number
): void {
	const scale = depth === 16 ? 1 / 65535 : 1 / 255
	const bytesPerPixel = depth === 16 ? 2 : 1

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * bytesPerPixel
			const dstIdx = (y * width + x) * 4

			let c: number
			let m: number
			let yVal: number
			let k: number

			if (depth === 16) {
				c = readU16BE(channelData[0]!, srcIdx) * scale
				m = readU16BE(channelData[1]!, srcIdx) * scale
				yVal = readU16BE(channelData[2]!, srcIdx) * scale
				k = readU16BE(channelData[3]!, srcIdx) * scale
			} else {
				c = channelData[0]![srcIdx]! * scale
				m = channelData[1]![srcIdx]! * scale
				yVal = channelData[2]![srcIdx]! * scale
				k = channelData[3]![srcIdx]! * scale
			}

			// CMYK is inverted in PSD (0 = max, 255 = min)
			c = 1 - c
			m = 1 - m
			yVal = 1 - yVal
			k = 1 - k

			// Convert CMYK to RGB
			const r = (1 - c) * (1 - k)
			const g = (1 - m) * (1 - k)
			const b = (1 - yVal) * (1 - k)

			output[dstIdx] = Math.round(r * 255)
			output[dstIdx + 1] = Math.round(g * 255)
			output[dstIdx + 2] = Math.round(b * 255)
			output[dstIdx + 3] = 255
		}
	}
}

// Binary reading helpers (Big Endian)
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

function readI16BE(data: Uint8Array, offset: number): number {
	const u = readU16BE(data, offset)
	return u > 0x7fff ? u - 0x10000 : u
}

function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) |
			(data[offset + 1]! << 16) |
			(data[offset + 2]! << 8) |
			data[offset + 3]!) >>>
		0
	)
}

function readI32BE(data: Uint8Array, offset: number): number {
	const u = readU32BE(data, offset)
	return u > 0x7fffffff ? u - 0x100000000 : u
}

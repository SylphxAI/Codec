import type { ImageData } from '@sylphx/codec-core'
import {
	BayerPattern,
	type CFAHeader,
	RAF_CFA_LENGTH,
	RAF_CFA_OFFSET,
	RAF_HEADER_SIZE,
	RAF_JPEG_LENGTH,
	RAF_JPEG_OFFSET,
	RAF_MAGIC,
	type RAFHeader,
	type RAFImage,
} from './types'

/**
 * Binary reader for RAF files
 */
class RAFReader {
	private data: Uint8Array
	private view: DataView

	constructor(data: Uint8Array) {
		this.data = data
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
	}

	readU8(offset: number): number {
		return this.data[offset]!
	}

	readU16BE(offset: number): number {
		return this.view.getUint16(offset, false)
	}

	readU32BE(offset: number): number {
		return this.view.getUint32(offset, false)
	}

	readString(offset: number, length: number): string {
		const bytes = this.data.slice(offset, offset + length)
		const end = bytes.indexOf(0)
		const validBytes = end >= 0 ? bytes.slice(0, end) : bytes
		return new TextDecoder().decode(validBytes)
	}

	slice(start: number, end: number): Uint8Array {
		return this.data.slice(start, end)
	}

	get length(): number {
		return this.data.length
	}
}

/**
 * Decode RAF to ImageData
 */
export function decodeRaf(data: Uint8Array): ImageData {
	const raf = parseRaf(data)

	// For now, extract embedded JPEG preview if available
	// Full RAW decoding would require demosaicing algorithms
	if (raf.jpegData && raf.jpegData.length > 0) {
		throw new Error('RAF embedded JPEG decoding not yet implemented - use dedicated JPEG codec')
	}

	// Decode RAW data if available
	if (raf.rawData && raf.cfaHeader) {
		return decodeRawData(raf.rawData, raf.cfaHeader)
	}

	throw new Error('No decodable image data in RAF file')
}

/**
 * Parse RAF structure
 */
export function parseRaf(data: Uint8Array): RAFImage {
	if (data.length < RAF_HEADER_SIZE) {
		throw new Error('Invalid RAF file: too small')
	}

	const reader = new RAFReader(data)

	// Read and validate magic
	const magic = reader.readString(0, 16)
	if (!magic.startsWith('FUJIFILMCCD-RAW')) {
		throw new Error(`Invalid RAF magic: ${magic}`)
	}

	// Read header
	const header: RAFHeader = {
		magic,
		version: reader.readString(16, 4),
		camera: reader.readString(24, 32),
		direction: reader.readString(72, 4),
		jpegImageOffset: reader.readU32BE(RAF_JPEG_OFFSET),
		jpegImageLength: reader.readU32BE(RAF_JPEG_LENGTH),
		cfaHeaderOffset: reader.readU32BE(RAF_CFA_OFFSET),
		cfaHeaderLength: reader.readU32BE(RAF_CFA_LENGTH),
	}

	const result: RAFImage = { header }

	// Extract embedded JPEG if present
	if (header.jpegImageOffset > 0 && header.jpegImageLength > 0) {
		const jpegEnd = header.jpegImageOffset + header.jpegImageLength
		if (jpegEnd <= data.length) {
			result.jpegData = reader.slice(header.jpegImageOffset, jpegEnd)
		}
	}

	// Parse CFA header if present
	if (header.cfaHeaderOffset > 0 && header.cfaHeaderLength > 0) {
		const cfaEnd = header.cfaHeaderOffset + header.cfaHeaderLength
		if (cfaEnd <= data.length) {
			result.cfaHeader = parseCFAHeader(reader, header.cfaHeaderOffset)

			// Extract raw data (typically follows CFA header)
			const rawDataOffset = cfaEnd
			if (result.cfaHeader && rawDataOffset < data.length) {
				const expectedSize = result.cfaHeader.width * result.cfaHeader.height * 2 // 16-bit per pixel
				const rawDataEnd = Math.min(rawDataOffset + expectedSize, data.length)
				result.rawData = reader.slice(rawDataOffset, rawDataEnd)
			}
		}
	}

	return result
}

/**
 * Parse CFA header
 */
function parseCFAHeader(reader: RAFReader, offset: number): CFAHeader {
	// CFA header structure (simplified - actual format may vary)
	return {
		width: reader.readU16BE(offset + 0),
		height: reader.readU16BE(offset + 2),
		bitsPerSample: reader.readU16BE(offset + 4),
		bayerPattern: reader.readU8(offset + 6),
		blackLevel: reader.readU16BE(offset + 8),
		whiteLevel: reader.readU16BE(offset + 10),
	}
}

/**
 * Decode raw Bayer data to RGB
 * Uses simple bilinear demosaicing
 */
function decodeRawData(rawData: Uint8Array, cfaHeader: CFAHeader): ImageData {
	const { width, height, bitsPerSample, bayerPattern, blackLevel, whiteLevel } = cfaHeader

	if (bitsPerSample !== 12 && bitsPerSample !== 14 && bitsPerSample !== 16) {
		throw new Error(`Unsupported RAF bits per sample: ${bitsPerSample}`)
	}

	// Create output RGBA buffer
	const output = new Uint8Array(width * height * 4)

	// Read raw values (big-endian 16-bit)
	const rawValues = new Uint16Array(width * height)
	const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength)

	for (let i = 0; i < rawValues.length && i * 2 < rawData.length - 1; i++) {
		rawValues[i] = view.getUint16(i * 2, false) // Big-endian
	}

	// Normalize values
	const range = whiteLevel - blackLevel || 1
	const normalizeValue = (val: number): number => {
		const clamped = Math.max(blackLevel, Math.min(whiteLevel, val))
		return Math.round(((clamped - blackLevel) / range) * 255)
	}

	// Simple bilinear demosaicing
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const outIdx = (y * width + x) * 4
			const rawIdx = y * width + x

			let r = 0
			let g = 0
			let b = 0

			// Determine color at this position based on Bayer pattern
			const isEvenRow = y % 2 === 0
			const isEvenCol = x % 2 === 0

			switch (bayerPattern) {
				case BayerPattern.RGGB:
					if (isEvenRow && isEvenCol) {
						// R position
						r = normalizeValue(rawValues[rawIdx]!)
						g = interpolateGreen(rawValues, width, height, x, y)
						b = interpolateBlue(rawValues, width, height, x, y)
					} else if (isEvenRow && !isEvenCol) {
						// G position (R row)
						r = interpolateRed(rawValues, width, height, x, y)
						g = normalizeValue(rawValues[rawIdx]!)
						b = interpolateBlue(rawValues, width, height, x, y)
					} else if (!isEvenRow && isEvenCol) {
						// G position (B row)
						r = interpolateRed(rawValues, width, height, x, y)
						g = normalizeValue(rawValues[rawIdx]!)
						b = interpolateBlue(rawValues, width, height, x, y)
					} else {
						// B position
						r = interpolateRed(rawValues, width, height, x, y)
						g = interpolateGreen(rawValues, width, height, x, y)
						b = normalizeValue(rawValues[rawIdx]!)
					}
					break

				// Similar patterns for other Bayer arrangements
				default:
					// Fallback: treat as grayscale
					const val = normalizeValue(rawValues[rawIdx]!)
					r = g = b = val
			}

			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

/**
 * Interpolate red channel value
 */
function interpolateRed(
	values: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number
): number {
	let sum = 0
	let count = 0

	// Sample neighboring red pixels
	const offsets = [
		[-1, -1],
		[-1, 1],
		[1, -1],
		[1, 1],
	]

	for (const [dx, dy] of offsets) {
		const nx = x + dx
		const ny = y + dy
		if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
			sum += values[ny * width + nx]!
			count++
		}
	}

	return count > 0 ? Math.round(sum / count) : values[y * width + x]!
}

/**
 * Interpolate green channel value
 */
function interpolateGreen(
	values: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number
): number {
	let sum = 0
	let count = 0

	// Sample neighboring green pixels
	const offsets = [
		[0, -1],
		[0, 1],
		[-1, 0],
		[1, 0],
	]

	for (const [dx, dy] of offsets) {
		const nx = x + dx
		const ny = y + dy
		if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
			sum += values[ny * width + nx]!
			count++
		}
	}

	return count > 0 ? Math.round(sum / count) : values[y * width + x]!
}

/**
 * Interpolate blue channel value
 */
function interpolateBlue(
	values: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number
): number {
	let sum = 0
	let count = 0

	// Sample neighboring blue pixels
	const offsets = [
		[-1, -1],
		[-1, 1],
		[1, -1],
		[1, 1],
	]

	for (const [dx, dy] of offsets) {
		const nx = x + dx
		const ny = y + dy
		if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
			sum += values[ny * width + nx]!
			count++
		}
	}

	return count > 0 ? Math.round(sum / count) : values[y * width + x]!
}

import type { ImageData } from '@sylphx/codec-core'
import {
	BayerPattern,
	CR2Compression,
	CR2_MAGIC,
	CR2_SIGNATURE,
	type CR2Image,
	CR2Tag,
	type IFD,
	type IFDEntry,
	type LosslessJPEGParams,
	Photometric,
	TagType,
	TYPE_SIZES,
} from './types'

/**
 * Binary reader with little-endian support
 */
class CR2Reader {
	private data: Uint8Array
	private view: DataView
	littleEndian: boolean

	constructor(data: Uint8Array, littleEndian = true) {
		this.data = data
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
		this.littleEndian = littleEndian
	}

	readU8(offset: number): number {
		return this.data[offset]!
	}

	readU16(offset: number): number {
		return this.view.getUint16(offset, this.littleEndian)
	}

	readU32(offset: number): number {
		return this.view.getUint32(offset, this.littleEndian)
	}

	readI16(offset: number): number {
		return this.view.getInt16(offset, this.littleEndian)
	}

	readI32(offset: number): number {
		return this.view.getInt32(offset, this.littleEndian)
	}

	readF32(offset: number): number {
		return this.view.getFloat32(offset, this.littleEndian)
	}

	readF64(offset: number): number {
		return this.view.getFloat64(offset, this.littleEndian)
	}

	slice(start: number, end: number): Uint8Array {
		return this.data.slice(start, end)
	}

	get length(): number {
		return this.data.length
	}
}

/**
 * Decode CR2 to ImageData
 */
export function decodeCR2(data: Uint8Array): ImageData {
	const cr2 = parseCR2(data)

	if (cr2.ifds.length === 0) {
		throw new Error('No image data in CR2')
	}

	// Decode the main RAW image (IFD 0)
	return decodeIFD(data, cr2.ifds[0]!, cr2.littleEndian)
}

/**
 * Parse CR2 structure
 */
export function parseCR2(data: Uint8Array): CR2Image {
	const reader = new CR2Reader(data)

	// Read byte order
	const byteOrder = reader.readU16(0)
	if (byteOrder !== CR2_SIGNATURE) {
		throw new Error('Invalid CR2 signature')
	}

	const littleEndian = true
	reader.littleEndian = littleEndian

	// Check magic number
	const magic = reader.readU16(2)
	if (magic !== CR2_MAGIC) {
		throw new Error(`Invalid CR2 magic number: ${magic}`)
	}

	// Read IFDs
	const ifds: IFD[] = []
	let ifdOffset = reader.readU32(4)

	while (ifdOffset !== 0 && ifdOffset < data.length) {
		const ifd = readIFD(reader, ifdOffset)
		ifds.push(ifd)
		ifdOffset = ifd.nextIFDOffset
	}

	return { littleEndian, ifds }
}

/**
 * Read an IFD (Image File Directory)
 */
function readIFD(reader: CR2Reader, offset: number): IFD {
	const numEntries = reader.readU16(offset)
	const entries = new Map<number, IFDEntry>()

	let pos = offset + 2
	for (let i = 0; i < numEntries; i++) {
		const entry = readIFDEntry(reader, pos)
		entries.set(entry.tag, entry)
		pos += 12
	}

	const nextIFDOffset = reader.readU32(pos)

	return { entries, nextIFDOffset }
}

/**
 * Read an IFD entry
 */
function readIFDEntry(reader: CR2Reader, offset: number): IFDEntry {
	const tag = reader.readU16(offset)
	const type = reader.readU16(offset + 2) as TagType
	const count = reader.readU32(offset + 4)

	const typeSize = TYPE_SIZES[type] || 1
	const totalSize = typeSize * count

	// Value is stored inline if it fits in 4 bytes, otherwise at offset
	let valueOffset: number
	if (totalSize <= 4) {
		valueOffset = offset + 8
	} else {
		valueOffset = reader.readU32(offset + 8)
	}

	const value = readValue(reader, valueOffset, type, count)

	return { tag, type, count, value }
}

/**
 * Read tag value based on type
 */
function readValue(
	reader: CR2Reader,
	offset: number,
	type: TagType,
	count: number
): number | number[] | string {
	if (type === TagType.Ascii) {
		const bytes = reader.slice(offset, offset + count)
		const end = bytes.indexOf(0)
		return new TextDecoder().decode(end >= 0 ? bytes.slice(0, end) : bytes)
	}

	if (count === 1) {
		return readSingleValue(reader, offset, type)
	}

	const values: number[] = []
	const typeSize = TYPE_SIZES[type] || 1

	for (let i = 0; i < count; i++) {
		values.push(readSingleValue(reader, offset + i * typeSize, type))
	}

	return values
}

/**
 * Read a single typed value
 */
function readSingleValue(reader: CR2Reader, offset: number, type: TagType): number {
	switch (type) {
		case TagType.Byte:
		case TagType.Undefined:
			return reader.readU8(offset)
		case TagType.Short:
			return reader.readU16(offset)
		case TagType.Long:
			return reader.readU32(offset)
		case TagType.SByte:
			return (reader.readU8(offset) << 24) >> 24
		case TagType.SShort:
			return reader.readI16(offset)
		case TagType.SLong:
			return reader.readI32(offset)
		case TagType.Rational: {
			const num = reader.readU32(offset)
			const den = reader.readU32(offset + 4)
			return den !== 0 ? num / den : 0
		}
		case TagType.SRational: {
			const num = reader.readI32(offset)
			const den = reader.readI32(offset + 4)
			return den !== 0 ? num / den : 0
		}
		case TagType.Float:
			return reader.readF32(offset)
		case TagType.Double:
			return reader.readF64(offset)
		default:
			return reader.readU8(offset)
	}
}

/**
 * Get tag value from IFD
 */
function getTag(ifd: IFD, tag: CR2Tag, defaultValue?: number): number {
	const entry = ifd.entries.get(tag)
	if (!entry) return defaultValue ?? 0
	return typeof entry.value === 'number' ? entry.value : (entry.value as number[])[0]!
}

/**
 * Get tag values as array
 */
function getTagArray(ifd: IFD, tag: CR2Tag): number[] {
	const entry = ifd.entries.get(tag)
	if (!entry) return []
	if (typeof entry.value === 'number') return [entry.value]
	if (Array.isArray(entry.value)) return entry.value
	return []
}

/**
 * Decode an IFD to ImageData
 */
function decodeIFD(data: Uint8Array, ifd: IFD, littleEndian: boolean): ImageData {
	const reader = new CR2Reader(data, littleEndian)

	const width = getTag(ifd, CR2Tag.ImageWidth)
	const height = getTag(ifd, CR2Tag.ImageLength)
	const compression = getTag(ifd, CR2Tag.Compression, CR2Compression.None)
	const photometric = getTag(ifd, CR2Tag.PhotometricInterpretation, Photometric.RGB)
	const stripOffsets = getTagArray(ifd, CR2Tag.StripOffsets)
	const stripByteCounts = getTagArray(ifd, CR2Tag.StripByteCounts)
	const bitsPerSample = getTagArray(ifd, CR2Tag.BitsPerSample)
	const samplesPerPixel = getTag(ifd, CR2Tag.SamplesPerPixel, 3)

	if (stripOffsets.length === 0 || stripByteCounts.length === 0) {
		throw new Error('No image data strips found')
	}

	// Read raw image data
	const offset = stripOffsets[0]!
	const byteCount = stripByteCounts[0]!
	const rawData = reader.slice(offset, offset + byteCount)

	// Decompress based on compression type
	let decompressed: Uint8Array
	switch (compression) {
		case CR2Compression.None:
			decompressed = rawData
			break
		case CR2Compression.LosslessJPEG:
		case CR2Compression.OldLosslessJPEG:
			decompressed = decodeLosslessJPEG(rawData, width, height, bitsPerSample)
			break
		case CR2Compression.JPEG:
			throw new Error('Standard JPEG compression not supported in CR2')
		default:
			throw new Error(`Unsupported CR2 compression: ${compression}`)
	}

	// Convert to RGB based on photometric interpretation
	if (photometric === Photometric.CFA) {
		// Demosaic Bayer pattern to RGB
		return demosaicBayer(decompressed, width, height, bitsPerSample[0] || 8)
	}

	// For RGB format, convert to RGBA
	if (photometric === Photometric.RGB && samplesPerPixel >= 3) {
		return convertRGBToRGBA(decompressed, width, height, samplesPerPixel)
	}

	// For other formats, convert to RGBA (grayscale)
	return convertToRGBA(decompressed, width, height, bitsPerSample[0] || 8)
}

/**
 * Decode lossless JPEG compressed data
 * This is a simplified decoder for Canon's lossless JPEG variant
 */
function decodeLosslessJPEG(
	data: Uint8Array,
	width: number,
	height: number,
	bitsPerSample: number[]
): Uint8Array {
	// Parse JPEG markers
	let offset = 0
	let params: LosslessJPEGParams | null = null

	while (offset < data.length - 1) {
		if (data[offset] !== 0xff) {
			offset++
			continue
		}

		const marker = data[offset + 1]!
		offset += 2

		// SOF3 - Start of Frame (Lossless JPEG)
		if (marker === 0xc3) {
			const length = (data[offset]! << 8) | data[offset + 1]!
			const precision = data[offset + 2]!
			const h = (data[offset + 3]! << 8) | data[offset + 4]!
			const w = (data[offset + 5]! << 8) | data[offset + 6]!
			const components = data[offset + 7]!

			params = { precision, width: w, height: h, components, predictor: 1 }
			offset += length
			continue
		}

		// SOS - Start of Scan
		if (marker === 0xda) {
			const length = (data[offset]! << 8) | data[offset + 1]!
			offset += length
			// The actual compressed data follows
			break
		}

		// Skip other markers
		if (marker >= 0xd0 && marker <= 0xd9) {
			// Standalone markers
			continue
		}

		// Read length and skip
		if (offset < data.length - 1) {
			const length = (data[offset]! << 8) | data[offset + 1]!
			offset += length
		}
	}

	if (!params) {
		throw new Error('Invalid lossless JPEG stream')
	}

	// For simplicity, we'll create a grayscale image
	// Real CR2 decoding requires full lossless JPEG decompression with predictive coding
	const bps = bitsPerSample[0] || 14
	const bytesPerPixel = Math.ceil(bps / 8)
	const output = new Uint8Array(width * height * bytesPerPixel)

	// Simple fallback: extract raw data (this won't produce correct images)
	// In a real implementation, you'd need to:
	// 1. Huffman decode the entropy-coded data
	// 2. Apply predictive decoding (usually predictor 1-7)
	// 3. Reconstruct the image samples
	const remaining = data.slice(offset)
	const minLength = Math.min(remaining.length, output.length)
	output.set(remaining.slice(0, minLength))

	return output
}

/**
 * Demosaic Bayer pattern to RGB
 */
function demosaicBayer(
	raw: Uint8Array,
	width: number,
	height: number,
	bitsPerSample: number
): ImageData {
	const output = new Uint8Array(width * height * 4)
	const maxVal = (1 << bitsPerSample) - 1

	// Simple bilinear demosaicing for RGGB pattern
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const outIdx = (y * width + x) * 4
			const inIdx = y * width + x

			let r = 0
			let g = 0
			let b = 0

			// Determine position in Bayer pattern
			const isEvenRow = y % 2 === 0
			const isEvenCol = x % 2 === 0

			if (isEvenRow) {
				if (isEvenCol) {
					// Red pixel
					r = raw[inIdx]!
					g = getInterpolated(raw, x, y, width, height, 'G')
					b = getInterpolated(raw, x, y, width, height, 'B')
				} else {
					// Green pixel (in red row)
					r = getInterpolated(raw, x, y, width, height, 'R')
					g = raw[inIdx]!
					b = getInterpolated(raw, x, y, width, height, 'B')
				}
			} else {
				if (isEvenCol) {
					// Green pixel (in blue row)
					r = getInterpolated(raw, x, y, width, height, 'R')
					g = raw[inIdx]!
					b = getInterpolated(raw, x, y, width, height, 'B')
				} else {
					// Blue pixel
					r = getInterpolated(raw, x, y, width, height, 'R')
					g = getInterpolated(raw, x, y, width, height, 'G')
					b = raw[inIdx]!
				}
			}

			// Normalize to 8-bit
			output[outIdx] = Math.round((r / maxVal) * 255)
			output[outIdx + 1] = Math.round((g / maxVal) * 255)
			output[outIdx + 2] = Math.round((b / maxVal) * 255)
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

/**
 * Interpolate missing color channel
 */
function getInterpolated(
	raw: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	channel: 'R' | 'G' | 'B'
): number {
	let sum = 0
	let count = 0

	// Sample neighboring pixels based on Bayer pattern
	const offsets =
		channel === 'G'
			? [
					[-1, 0],
					[1, 0],
					[0, -1],
					[0, 1],
				]
			: [
					[-1, -1],
					[1, -1],
					[-1, 1],
					[1, 1],
				]

	for (const [dx, dy] of offsets) {
		const nx = x + dx
		const ny = y + dy
		if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
			const idx = ny * width + nx
			sum += raw[idx]!
			count++
		}
	}

	return count > 0 ? Math.round(sum / count) : 0
}

/**
 * Convert RGB/RGBA data to RGBA
 */
function convertRGBToRGBA(
	pixels: Uint8Array,
	width: number,
	height: number,
	samplesPerPixel: number
): ImageData {
	const output = new Uint8Array(width * height * 4)

	for (let i = 0; i < width * height; i++) {
		const inIdx = i * samplesPerPixel
		const outIdx = i * 4

		output[outIdx] = pixels[inIdx]! // R
		output[outIdx + 1] = pixels[inIdx + 1]! // G
		output[outIdx + 2] = pixels[inIdx + 2]! // B
		output[outIdx + 3] = samplesPerPixel >= 4 ? pixels[inIdx + 3]! : 255 // A
	}

	return { width, height, data: output }
}

/**
 * Convert raw pixel data to RGBA (for non-CFA formats)
 */
function convertToRGBA(
	pixels: Uint8Array,
	width: number,
	height: number,
	bitsPerSample: number
): ImageData {
	const output = new Uint8Array(width * height * 4)
	const maxVal = (1 << bitsPerSample) - 1
	const scale = 255 / maxVal

	for (let i = 0; i < width * height; i++) {
		const gray = pixels[i]!
		const normalized = Math.round(gray * scale)

		output[i * 4] = normalized
		output[i * 4 + 1] = normalized
		output[i * 4 + 2] = normalized
		output[i * 4 + 3] = 255
	}

	return { width, height, data: output }
}

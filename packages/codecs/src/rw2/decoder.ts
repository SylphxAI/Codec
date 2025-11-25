import type { ImageData } from '@sylphx/codec-core'
import {
	type IFD,
	type IFDEntry,
	Photometric,
	RW2_MAGIC,
	RW2_SIGNATURE,
	type RW2Image,
	RW2Tag,
	TIFF_BIG_ENDIAN,
	TIFF_LITTLE_ENDIAN,
	TYPE_SIZES,
	Tag,
	TagType,
} from './types'

/**
 * Binary reader with endianness support
 */
class RW2Reader {
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
 * Decode RW2 to ImageData
 */
export function decodeRW2(data: Uint8Array): ImageData {
	const rw2 = parseRW2(data)

	if (rw2.ifds.length === 0) {
		throw new Error('No image data in RW2')
	}

	// Panasonic RW2 typically has:
	// IFD 0: Preview/thumbnail (JPEG)
	// IFD 1: Full RAW image
	// Decode the largest IFD (usually the RAW data)
	const ifdToUse = rw2.ifds.length > 1 ? rw2.ifds[1]! : rw2.ifds[0]!

	return decodeIFD(data, ifdToUse, rw2.littleEndian)
}

/**
 * Parse RW2 structure
 */
export function parseRW2(data: Uint8Array): RW2Image {
	const reader = new RW2Reader(data)

	// Read byte order
	const byteOrder = reader.readU16(0)
	let littleEndian: boolean

	if (byteOrder === TIFF_LITTLE_ENDIAN || byteOrder === RW2_SIGNATURE) {
		littleEndian = true
	} else if (byteOrder === TIFF_BIG_ENDIAN) {
		littleEndian = false
	} else {
		throw new Error('Invalid RW2 byte order')
	}

	reader.littleEndian = littleEndian

	// Check magic number (RW2 uses 0x0055 instead of standard TIFF 0x002A)
	const magic = reader.readU16(2)
	if (magic !== RW2_MAGIC) {
		throw new Error(`Invalid RW2 magic number: ${magic}`)
	}

	// Read IFDs
	const ifds: IFD[] = []
	let ifdOffset = reader.readU32(4)

	while (ifdOffset !== 0 && ifdOffset < data.length) {
		const ifd = readIFD(reader, ifdOffset)
		ifds.push(ifd)
		ifdOffset = ifd.nextIFDOffset
	}

	return { littleEndian, isBigTiff: false, ifds }
}

/**
 * Read an IFD (Image File Directory)
 */
function readIFD(reader: RW2Reader, offset: number): IFD {
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
function readIFDEntry(reader: RW2Reader, offset: number): IFDEntry {
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
	reader: RW2Reader,
	offset: number,
	type: TagType,
	count: number
): number | number[] | string {
	if (type === TagType.Ascii) {
		const bytes = reader.slice(offset, offset + count)
		// Remove null terminator
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
function readSingleValue(reader: RW2Reader, offset: number, type: TagType): number {
	switch (type) {
		case TagType.Byte:
		case TagType.Undefined:
			return reader.readU8(offset)
		case TagType.Short:
			return reader.readU16(offset)
		case TagType.Long:
			return reader.readU32(offset)
		case TagType.SByte:
			return (reader.readU8(offset) << 24) >> 24 // Sign extend
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
function getTag(ifd: IFD, tag: RW2Tag, defaultValue?: number): number {
	const entry = ifd.entries.get(tag)
	if (!entry) return defaultValue ?? 0
	return typeof entry.value === 'number' ? entry.value : (entry.value as number[])[0]!
}

/**
 * Get tag values as array
 */
function getTagArray(ifd: IFD, tag: RW2Tag): number[] {
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
	const reader = new RW2Reader(data, littleEndian)

	const width = getTag(ifd, RW2Tag.ImageWidth)
	const height = getTag(ifd, RW2Tag.ImageLength)
	const bitsPerSample = getTagArray(ifd, RW2Tag.BitsPerSample)
	const compression = getTag(ifd, RW2Tag.Compression, 1)
	const photometric = getTag(ifd, RW2Tag.PhotometricInterpretation, Photometric.RGB)
	const samplesPerPixel = getTag(ifd, RW2Tag.SamplesPerPixel, 1)

	// RW2 can store strip offsets in standard or alternative tags
	let stripOffsets = getTagArray(ifd, RW2Tag.StripOffsets)
	if (stripOffsets.length === 0) {
		stripOffsets = getTagArray(ifd, RW2Tag.StripOffsets2)
	}

	let stripByteCounts = getTagArray(ifd, RW2Tag.StripByteCounts)
	if (stripByteCounts.length === 0) {
		stripByteCounts = getTagArray(ifd, RW2Tag.StripByteCounts2)
	}

	// Handle case where RAW data is in JPEG preview
	if (stripOffsets.length === 0 || stripByteCounts.length === 0) {
		// Try to extract JPEG preview if available
		const jpegEntry = ifd.entries.get(RW2Tag.PanasonicJPEGImage)
		if (jpegEntry && Array.isArray(jpegEntry.value) && jpegEntry.value.length >= 2) {
			const jpegOffset = jpegEntry.value[0]!
			const jpegLength = jpegEntry.value[1]!
			// For now, we'll return a simple placeholder
			// Real implementation would decode the JPEG thumbnail
			return createPlaceholder(width || 160, height || 120)
		}
		throw new Error('No image data found in RW2 IFD')
	}

	// Read strip data
	const strips: Uint8Array[] = []
	for (let i = 0; i < stripOffsets.length; i++) {
		const offset = stripOffsets[i]!
		const byteCount = stripByteCounts[i]!
		const stripData = reader.slice(offset, offset + byteCount)
		strips.push(stripData)
	}

	// Combine strips
	const totalSize = strips.reduce((sum, strip) => sum + strip.length, 0)
	const allPixels = new Uint8Array(totalSize)
	let offset = 0
	for (const strip of strips) {
		allPixels.set(strip, offset)
		offset += strip.length
	}

	// Convert to RGBA
	return convertToRGBA(allPixels, width, height, photometric, samplesPerPixel, bitsPerSample)
}

/**
 * Convert raw pixel data to RGBA
 */
function convertToRGBA(
	pixels: Uint8Array,
	width: number,
	height: number,
	photometric: Photometric,
	samplesPerPixel: number,
	bitsPerSample: number[]
): ImageData {
	const output = new Uint8Array(width * height * 4)
	const bps = bitsPerSample[0] || 8

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const outIdx = (y * width + x) * 4
			const inIdx = (y * width + x) * samplesPerPixel

			let r = 0
			let g = 0
			let b = 0
			let a = 255

			switch (photometric) {
				case Photometric.BlackIsZero: {
					const gray = pixels[inIdx] || 0
					const maxVal = (1 << bps) - 1
					const normalized = Math.round((gray / maxVal) * 255)
					r = g = b = normalized
					break
				}

				case Photometric.RGB:
					r = pixels[inIdx] || 0
					g = pixels[inIdx + 1] || 0
					b = pixels[inIdx + 2] || 0
					if (samplesPerPixel >= 4) {
						a = pixels[inIdx + 3] || 255
					}
					break

				case 32803: // CFA (Color Filter Array) - Bayer pattern
					// Simple demosaic - just use the raw value as grayscale
					// Real implementation would apply proper Bayer demosaicing
					r = g = b = pixels[inIdx] || 0
					break

				default:
					// Treat as grayscale
					r = g = b = pixels[inIdx] || 0
			}

			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = a
		}
	}

	return { width, height, data: output }
}

/**
 * Create a placeholder image when actual data cannot be decoded
 */
function createPlaceholder(width: number, height: number): ImageData {
	const data = new Uint8Array(width * height * 4)

	// Create a simple gray checkerboard pattern
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4
			const checker = ((x >> 3) + (y >> 3)) & 1
			const gray = checker ? 180 : 140
			data[idx] = gray
			data[idx + 1] = gray
			data[idx + 2] = gray
			data[idx + 3] = 255
		}
	}

	return { width, height, data }
}

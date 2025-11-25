import type { ImageData } from '@sylphx/codec-core'
import {
	CFAPattern,
	type IFD,
	type IFDEntry,
	type NefImage,
	type NefMetadata,
	NEF_BIG_ENDIAN,
	NEF_LITTLE_ENDIAN,
	NEF_MAGIC,
	NefCompression,
	NefTag,
	Photometric,
	TYPE_SIZES,
	TagType,
} from './types'

/**
 * Binary reader with endianness support
 */
class NefReader {
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
 * Decode NEF to ImageData
 */
export function decodeNef(data: Uint8Array): ImageData {
	const nef = parseNef(data)

	if (nef.ifds.length === 0) {
		throw new Error('No image data in NEF')
	}

	// NEF files typically have multiple IFDs:
	// IFD0: Full-size preview or RAW data
	// IFD1: JPEG thumbnail
	// SubIFDs: RAW sensor data

	// Try to decode the main image (usually IFD0)
	return decodeIFD(data, nef.ifds[0]!, nef.littleEndian)
}

/**
 * Parse NEF structure
 */
export function parseNef(data: Uint8Array): NefImage {
	const reader = new NefReader(data)

	// Read byte order
	const byteOrder = reader.readU16(0)
	let littleEndian: boolean

	if (byteOrder === NEF_LITTLE_ENDIAN) {
		littleEndian = true
	} else if (byteOrder === NEF_BIG_ENDIAN) {
		littleEndian = false
	} else {
		throw new Error('Invalid NEF byte order')
	}

	reader.littleEndian = littleEndian

	// Check magic number
	const magic = reader.readU16(2)
	if (magic !== NEF_MAGIC) {
		throw new Error(`Invalid NEF magic number: ${magic}`)
	}

	// Read IFDs
	const ifds: IFD[] = []
	let ifdOffset = reader.readU32(4)

	while (ifdOffset !== 0 && ifdOffset < data.length) {
		const ifd = readIFD(reader, ifdOffset)
		ifds.push(ifd)
		ifdOffset = ifd.nextIFDOffset
	}

	// Parse EXIF IFD if present
	let exifIFD: IFD | undefined
	if (ifds.length > 0) {
		const exifOffset = getTag(ifds[0]!, NefTag.ExifIFD)
		if (exifOffset > 0 && exifOffset < data.length) {
			exifIFD = readIFD(reader, exifOffset)
		}
	}

	// Extract thumbnail if present
	let thumbnail: Uint8Array | undefined
	if (ifds.length > 1) {
		const thumbIfd = ifds[1]!
		const jpegOffset = getTag(thumbIfd, NefTag.JPEGInterchangeFormat)
		const jpegLength = getTag(thumbIfd, NefTag.JPEGInterchangeFormatLength)
		if (jpegOffset > 0 && jpegLength > 0) {
			thumbnail = reader.slice(jpegOffset, jpegOffset + jpegLength)
		}
	}

	return { littleEndian, ifds, exifIFD, thumbnail }
}

/**
 * Extract NEF metadata
 */
export function extractMetadata(nef: NefImage): NefMetadata {
	const ifd = nef.ifds[0]
	if (!ifd) {
		throw new Error('No IFD in NEF')
	}

	const width = getTag(ifd, NefTag.ImageWidth)
	const height = getTag(ifd, NefTag.ImageLength)
	const bitsPerSample = getTagArray(ifd, NefTag.BitsPerSample)
	const compression = getTag(ifd, NefTag.Compression, NefCompression.None)
	const photometric = getTag(ifd, NefTag.PhotometricInterpretation, Photometric.RGB)

	const metadata: NefMetadata = {
		width,
		height,
		bitsPerSample: bitsPerSample.length > 0 ? bitsPerSample : [8],
		compression,
		photometric,
	}

	// Extract string metadata
	const make = getTagString(ifd, NefTag.Make)
	if (make) metadata.make = make

	const model = getTagString(ifd, NefTag.Model)
	if (model) metadata.model = model

	const software = getTagString(ifd, NefTag.Software)
	if (software) metadata.software = software

	const dateTime = getTagString(ifd, NefTag.DateTime)
	if (dateTime) metadata.dateTime = dateTime

	const orientation = getTag(ifd, NefTag.Orientation)
	if (orientation > 0) metadata.orientation = orientation

	// Extract CFA pattern
	const cfaPattern = getTagArray(ifd, NefTag.CFAPattern)
	if (cfaPattern.length >= 4) {
		// Determine pattern from CFA bytes
		const pattern = `${cfaPattern[0]}${cfaPattern[1]}${cfaPattern[2]}${cfaPattern[3]}`
		if (pattern === '0112') metadata.cfaPattern = CFAPattern.RGGB
		else if (pattern === '1021') metadata.cfaPattern = CFAPattern.GRBG
		else if (pattern === '1201') metadata.cfaPattern = CFAPattern.GBRG
		else if (pattern === '2110') metadata.cfaPattern = CFAPattern.BGGR
	}

	return metadata
}

/**
 * Read an IFD (Image File Directory)
 */
function readIFD(reader: NefReader, offset: number): IFD {
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
function readIFDEntry(reader: NefReader, offset: number): IFDEntry {
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
	reader: NefReader,
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
function readSingleValue(reader: NefReader, offset: number, type: TagType): number {
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
function getTag(ifd: IFD, tag: NefTag, defaultValue?: number): number {
	const entry = ifd.entries.get(tag)
	if (!entry) return defaultValue ?? 0
	return typeof entry.value === 'number' ? entry.value : (entry.value as number[])[0]!
}

/**
 * Get tag values as array
 */
function getTagArray(ifd: IFD, tag: NefTag): number[] {
	const entry = ifd.entries.get(tag)
	if (!entry) return []
	if (typeof entry.value === 'number') return [entry.value]
	if (Array.isArray(entry.value)) return entry.value
	return []
}

/**
 * Get tag value as string
 */
function getTagString(ifd: IFD, tag: NefTag): string | undefined {
	const entry = ifd.entries.get(tag)
	if (!entry) return undefined
	if (typeof entry.value === 'string') return entry.value
	return undefined
}

/**
 * Decode an IFD to ImageData
 */
function decodeIFD(data: Uint8Array, ifd: IFD, littleEndian: boolean): ImageData {
	const reader = new NefReader(data, littleEndian)

	const width = getTag(ifd, NefTag.ImageWidth)
	const height = getTag(ifd, NefTag.ImageLength)
	const bitsPerSample = getTagArray(ifd, NefTag.BitsPerSample)
	const compression = getTag(ifd, NefTag.Compression, NefCompression.None)
	const photometric = getTag(ifd, NefTag.PhotometricInterpretation, Photometric.RGB)
	const samplesPerPixel = getTag(ifd, NefTag.SamplesPerPixel, 1)

	// Try strip-based image first
	const stripOffsets = getTagArray(ifd, NefTag.StripOffsets)
	if (stripOffsets.length > 0) {
		return decodeStripBasedImage(
			reader,
			ifd,
			width,
			height,
			bitsPerSample,
			compression,
			photometric,
			samplesPerPixel
		)
	}

	// Try tile-based image
	const tileOffsets = getTagArray(ifd, NefTag.TileOffsets)
	if (tileOffsets.length > 0) {
		return decodeTileBasedImage(reader, ifd, width, height, bitsPerSample, photometric, samplesPerPixel)
	}

	// Check for embedded JPEG
	const jpegOffset = getTag(ifd, NefTag.JPEGInterchangeFormat)
	const jpegLength = getTag(ifd, NefTag.JPEGInterchangeFormatLength)
	if (jpegOffset > 0 && jpegLength > 0) {
		// Return a placeholder for JPEG data
		// In a full implementation, would decode JPEG here
		return createPlaceholderImage(width, height)
	}

	throw new Error('Unsupported NEF image format')
}

/**
 * Decode strip-based image
 */
function decodeStripBasedImage(
	reader: NefReader,
	ifd: IFD,
	width: number,
	height: number,
	bitsPerSample: number[],
	compression: number,
	photometric: number,
	samplesPerPixel: number
): ImageData {
	const stripOffsets = getTagArray(ifd, NefTag.StripOffsets)
	const stripByteCounts = getTagArray(ifd, NefTag.StripByteCounts)
	const rowsPerStrip = getTag(ifd, NefTag.RowsPerStrip, height)

	const numStrips = stripOffsets.length
	const bytesPerSample = Math.ceil((bitsPerSample[0] || 8) / 8)

	// Decode strips
	const rawPixels: Uint8Array[] = []
	for (let stripIdx = 0; stripIdx < numStrips; stripIdx++) {
		const offset = stripOffsets[stripIdx]!
		const byteCount = stripByteCounts[stripIdx]!
		const stripData = reader.slice(offset, offset + byteCount)

		// For now, only support uncompressed data
		if (compression !== NefCompression.None) {
			// Create placeholder for compressed data
			const stripRows = Math.min(rowsPerStrip, height - stripIdx * rowsPerStrip)
			const expectedSize = width * stripRows * samplesPerPixel * bytesPerSample
			rawPixels.push(new Uint8Array(expectedSize))
		} else {
			rawPixels.push(stripData)
		}
	}

	// Combine strips
	const totalSize = rawPixels.reduce((sum, strip) => sum + strip.length, 0)
	const allPixels = new Uint8Array(totalSize)
	let offset = 0
	for (const strip of rawPixels) {
		allPixels.set(strip, offset)
		offset += strip.length
	}

	// Convert to RGBA
	return convertToRGBA(allPixels, width, height, photometric, samplesPerPixel, bitsPerSample)
}

/**
 * Decode tile-based image
 */
function decodeTileBasedImage(
	reader: NefReader,
	ifd: IFD,
	width: number,
	height: number,
	bitsPerSample: number[],
	photometric: number,
	samplesPerPixel: number
): ImageData {
	// For simplicity, create a placeholder
	// Full implementation would decode tiles
	return createPlaceholderImage(width, height)
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

			if (inIdx >= pixels.length) {
				// Out of bounds, use black
				output[outIdx] = 0
				output[outIdx + 1] = 0
				output[outIdx + 2] = 0
				output[outIdx + 3] = 255
				continue
			}

			switch (photometric) {
				case Photometric.WhiteIsZero: {
					const gray = pixels[inIdx]!
					const maxVal = (1 << bps) - 1
					const normalized = 255 - Math.round((gray / maxVal) * 255)
					r = g = b = normalized
					break
				}

				case Photometric.BlackIsZero: {
					const gray = pixels[inIdx]!
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

				case Photometric.CFA:
					// Bayer pattern - simple debayer (use green channel)
					// Full implementation would do proper demosaicing
					const value = pixels[inIdx] || 0
					r = g = b = value
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
 * Create a placeholder image
 */
function createPlaceholderImage(width: number, height: number): ImageData {
	const data = new Uint8Array(width * height * 4)
	// Create a gray checkerboard pattern
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4
			const gray = ((x >> 3) ^ (y >> 3)) & 1 ? 128 : 64
			data[idx] = gray
			data[idx + 1] = gray
			data[idx + 2] = gray
			data[idx + 3] = 255
		}
	}
	return { width, height, data }
}

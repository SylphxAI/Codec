import type { ImageData } from '@sylphx/codec-core'
import {
	Compression,
	type IFD,
	type IFDEntry,
	PEF_BIG_ENDIAN,
	PEF_LITTLE_ENDIAN,
	PEF_MAGIC,
	PefTag,
	Photometric,
	PlanarConfig,
	TYPE_SIZES,
	TagType,
	type PefImage,
} from './types'

/**
 * Binary reader with endianness support
 */
class PefReader {
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

	slice(start: number, end: number): Uint8Array {
		return this.data.slice(start, end)
	}

	get length(): number {
		return this.data.length
	}
}

/**
 * Decode PEF to ImageData
 */
export function decodePef(data: Uint8Array): ImageData {
	const pef = parsePef(data)

	if (pef.ifds.length === 0) {
		throw new Error('No image data in PEF')
	}

	// Try to decode preview image first (IFD 1), fall back to thumbnail/RAW
	const ifd = pef.previewIFD || pef.ifds[0]!
	return decodeIFD(data, ifd, pef.littleEndian)
}

/**
 * Parse PEF structure
 */
export function parsePef(data: Uint8Array): PefImage {
	const reader = new PefReader(data)

	// Read byte order
	const byteOrder = reader.readU16(0)
	let littleEndian: boolean

	if (byteOrder === PEF_LITTLE_ENDIAN) {
		littleEndian = true
	} else if (byteOrder === PEF_BIG_ENDIAN) {
		littleEndian = false
	} else {
		throw new Error('Invalid PEF byte order')
	}

	reader.littleEndian = littleEndian

	// Check magic number
	const magic = reader.readU16(2)
	if (magic !== PEF_MAGIC) {
		throw new Error(`Invalid PEF magic number: ${magic}`)
	}

	// Read IFDs
	const ifds: IFD[] = []
	let ifdOffset = reader.readU32(4)

	while (ifdOffset !== 0 && ifdOffset < data.length) {
		const ifd = readIFD(reader, ifdOffset)
		ifds.push(ifd)
		ifdOffset = ifd.nextIFDOffset
	}

	// Identify preview and RAW IFDs
	// IFD 0: Thumbnail (small JPEG preview)
	// IFD 1: Full-size preview (JPEG)
	// IFD 2+: RAW data
	let previewIFD: IFD | undefined
	let rawIFD: IFD | undefined

	if (ifds.length > 1) {
		previewIFD = ifds[1] // Full preview
	}
	if (ifds.length > 2) {
		rawIFD = ifds[2] // RAW data
	}

	return { littleEndian, ifds, previewIFD, rawIFD }
}

/**
 * Read an IFD (Image File Directory)
 */
function readIFD(reader: PefReader, offset: number): IFD {
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
function readIFDEntry(reader: PefReader, offset: number): IFDEntry {
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
	reader: PefReader,
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
function readSingleValue(reader: PefReader, offset: number, type: TagType): number {
	// Bounds check
	if (offset >= reader.length) {
		return 0
	}

	switch (type) {
		case TagType.Byte:
		case TagType.Undefined:
			return reader.readU8(offset)
		case TagType.Short:
			return offset + 2 <= reader.length ? reader.readU16(offset) : 0
		case TagType.Long:
			return offset + 4 <= reader.length ? reader.readU32(offset) : 0
		case TagType.SByte:
			return (reader.readU8(offset) << 24) >> 24 // Sign extend
		case TagType.SShort:
			return offset + 2 <= reader.length ? reader.readI16(offset) : 0
		case TagType.SLong:
			return offset + 4 <= reader.length ? reader.readI32(offset) : 0
		case TagType.Rational: {
			if (offset + 8 > reader.length) return 0
			const num = reader.readU32(offset)
			const den = reader.readU32(offset + 4)
			return den !== 0 ? num / den : 0
		}
		case TagType.SRational: {
			if (offset + 8 > reader.length) return 0
			const num = reader.readI32(offset)
			const den = reader.readI32(offset + 4)
			return den !== 0 ? num / den : 0
		}
		default:
			return reader.readU8(offset)
	}
}

/**
 * Get tag value from IFD
 */
function getTag(ifd: IFD, tag: PefTag, defaultValue?: number): number {
	const entry = ifd.entries.get(tag)
	if (!entry) return defaultValue ?? 0
	return typeof entry.value === 'number' ? entry.value : (entry.value as number[])[0]!
}

/**
 * Get tag values as array
 */
function getTagArray(ifd: IFD, tag: PefTag): number[] {
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
	const reader = new PefReader(data, littleEndian)

	const width = getTag(ifd, PefTag.ImageWidth)
	const height = getTag(ifd, PefTag.ImageLength)
	const bitsPerSample = getTagArray(ifd, PefTag.BitsPerSample)
	const compression = getTag(ifd, PefTag.Compression, Compression.None)
	const photometric = getTag(ifd, PefTag.PhotometricInterpretation, Photometric.RGB)
	const samplesPerPixel = getTag(ifd, PefTag.SamplesPerPixel, 1)
	const rowsPerStrip = getTag(ifd, PefTag.RowsPerStrip, height)
	const planarConfig = getTag(ifd, PefTag.PlanarConfiguration, PlanarConfig.Chunky)

	const stripOffsets = getTagArray(ifd, PefTag.StripOffsets)
	const stripByteCounts = getTagArray(ifd, PefTag.StripByteCounts)

	if (stripOffsets.length === 0 || stripByteCounts.length === 0) {
		throw new Error('No strip data found in PEF IFD')
	}

	// Calculate expected strip sizes
	const numStrips = Math.ceil(height / rowsPerStrip)
	const bytesPerSample = Math.ceil((bitsPerSample[0] || 8) / 8)

	// Decode strips
	const rawPixels: Uint8Array[] = []
	for (let stripIdx = 0; stripIdx < numStrips; stripIdx++) {
		const offset = stripOffsets[stripIdx]!
		const byteCount = stripByteCounts[stripIdx]!
		const stripData = reader.slice(offset, offset + byteCount)

		if (compression !== Compression.None) {
			throw new Error(`Unsupported PEF compression: ${compression}`)
		}

		rawPixels.push(stripData)
	}

	// Combine strips
	const totalSize = rawPixels.reduce((sum, strip) => sum + strip.length, 0)
	const allPixels = new Uint8Array(totalSize)
	let offset = 0
	for (const strip of rawPixels) {
		allPixels.set(strip, offset)
		offset += strip.length
	}

	// Convert to RGBA based on photometric interpretation
	return convertToRGBA(
		allPixels,
		width,
		height,
		photometric,
		samplesPerPixel,
		bitsPerSample,
		planarConfig
	)
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
	bitsPerSample: number[],
	planarConfig: PlanarConfig
): ImageData {
	const output = new Uint8Array(width * height * 4)
	const bps = bitsPerSample[0] || 8

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const outIdx = (y * width + x) * 4
			let r = 0
			let g = 0
			let b = 0
			let a = 255

			if (planarConfig === PlanarConfig.Chunky) {
				const inIdx = (y * width + x) * samplesPerPixel

				switch (photometric) {
					case Photometric.WhiteIsZero: {
						const gray = bps === 8 ? pixels[inIdx]! : (pixels[inIdx]! << 8) | pixels[inIdx + 1]!
						const maxVal = (1 << bps) - 1
						const normalized = 255 - Math.round((gray / maxVal) * 255)
						r = g = b = normalized
						break
					}

					case Photometric.BlackIsZero:
					case Photometric.CFA:
					case Photometric.LinearRaw: {
						// For RAW/CFA data, treat as grayscale preview
						const gray = bps === 8 ? pixels[inIdx]! : (pixels[inIdx]! << 8) | pixels[inIdx + 1]!
						const maxVal = (1 << bps) - 1
						const normalized = Math.round((gray / maxVal) * 255)
						r = g = b = normalized
						break
					}

					case Photometric.RGB:
						r = pixels[inIdx]!
						g = pixels[inIdx + 1]!
						b = pixels[inIdx + 2]!
						if (samplesPerPixel >= 4) {
							a = pixels[inIdx + 3]!
						}
						break

					default:
						// Treat as grayscale
						r = g = b = pixels[inIdx]!
				}
			} else {
				// Planar configuration - samples are separated
				const planeSize = width * height
				switch (photometric) {
					case Photometric.RGB:
						r = pixels[y * width + x]!
						g = pixels[planeSize + y * width + x]!
						b = pixels[planeSize * 2 + y * width + x]!
						if (samplesPerPixel >= 4) {
							a = pixels[planeSize * 3 + y * width + x]!
						}
						break
					default:
						r = g = b = pixels[y * width + x]!
				}
			}

			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = a
		}
	}

	return { width, height, data: output }
}

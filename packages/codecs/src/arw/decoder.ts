import type { ImageData } from '@sylphx/codec-core'
import { decompressPackBits } from '../tiff/compression'
import {
	ArwTag,
	type ArwImage,
	type ArwRawInfo,
	CFAPattern,
	Compression,
	type IFD,
	type IFDEntry,
	Photometric,
	PlanarConfig,
	TIFF_BIG_ENDIAN,
	TIFF_LITTLE_ENDIAN,
	TIFF_MAGIC,
	TYPE_SIZES,
	TagType,
} from './types'

/**
 * Binary reader with endianness support
 */
class ArwReader {
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
 * Decode ARW to ImageData
 */
export function decodeArw(data: Uint8Array): ImageData {
	const arw = parseArw(data)

	if (arw.ifds.length === 0) {
		throw new Error('No image data in ARW')
	}

	// ARW files typically have multiple IFDs:
	// IFD0: Full-size JPEG preview or thumbnail
	// SubIFD: RAW sensor data
	// We'll try to decode the first IFD that has proper image data
	return decodeIFD(data, arw.ifds[0]!, arw.littleEndian)
}

/**
 * Parse ARW structure
 */
export function parseArw(data: Uint8Array): ArwImage {
	const reader = new ArwReader(data)

	// Read byte order
	const byteOrder = reader.readU16(0)
	let littleEndian: boolean

	if (byteOrder === TIFF_LITTLE_ENDIAN) {
		littleEndian = true
	} else if (byteOrder === TIFF_BIG_ENDIAN) {
		littleEndian = false
	} else {
		throw new Error('Invalid ARW byte order')
	}

	reader.littleEndian = littleEndian

	// Check magic number
	const magic = reader.readU16(2)
	if (magic !== TIFF_MAGIC) {
		throw new Error(`Invalid ARW magic number: ${magic}`)
	}

	// Read IFDs
	const ifds: IFD[] = []
	let ifdOffset = reader.readU32(4)

	while (ifdOffset !== 0 && ifdOffset < data.length) {
		const ifd = readIFD(reader, ifdOffset)
		ifds.push(ifd)
		ifdOffset = ifd.nextIFDOffset

		// Also read SubIFDs if present
		const subIFDsEntry = ifd.entries.get(ArwTag.SubIFDs)
		if (subIFDsEntry) {
			const subOffsets = Array.isArray(subIFDsEntry.value)
				? subIFDsEntry.value
				: [subIFDsEntry.value]
			for (const subOffset of subOffsets) {
				if (typeof subOffset === 'number' && subOffset < data.length) {
					const subIfd = readIFD(reader, subOffset)
					ifds.push(subIfd)
				}
			}
		}
	}

	// Extract metadata
	const mainIfd = ifds[0]!
	const make = getTagString(mainIfd, ArwTag.Make)
	const model = getTagString(mainIfd, ArwTag.Model)
	const software = getTagString(mainIfd, ArwTag.Software)
	const datetime = getTagString(mainIfd, ArwTag.DateTime)

	return { littleEndian, isBigTiff: false, ifds, make, model, software, datetime }
}

/**
 * Read an IFD (Image File Directory)
 */
function readIFD(reader: ArwReader, offset: number): IFD {
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
function readIFDEntry(reader: ArwReader, offset: number): IFDEntry {
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
	reader: ArwReader,
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
function readSingleValue(reader: ArwReader, offset: number, type: TagType): number {
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
function getTag(ifd: IFD, tag: ArwTag, defaultValue?: number): number {
	const entry = ifd.entries.get(tag)
	if (!entry) return defaultValue ?? 0
	return typeof entry.value === 'number' ? entry.value : (entry.value as number[])[0]!
}

/**
 * Get tag string value
 */
function getTagString(ifd: IFD, tag: ArwTag): string | undefined {
	const entry = ifd.entries.get(tag)
	if (!entry) return undefined
	return typeof entry.value === 'string' ? entry.value : undefined
}

/**
 * Get tag values as array
 */
function getTagArray(ifd: IFD, tag: ArwTag): number[] {
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
	const reader = new ArwReader(data, littleEndian)

	const width = getTag(ifd, ArwTag.ImageWidth)
	const height = getTag(ifd, ArwTag.ImageLength)
	const bitsPerSample = getTagArray(ifd, ArwTag.BitsPerSample)
	const compression = getTag(ifd, ArwTag.Compression, Compression.None)
	const photometric = getTag(ifd, ArwTag.PhotometricInterpretation, Photometric.RGB)
	const samplesPerPixel = getTag(ifd, ArwTag.SamplesPerPixel, 1)
	const rowsPerStrip = getTag(ifd, ArwTag.RowsPerStrip, height)
	const planarConfig = getTag(ifd, ArwTag.PlanarConfiguration, PlanarConfig.Chunky)

	const stripOffsets = getTagArray(ifd, ArwTag.StripOffsets)
	const stripByteCounts = getTagArray(ifd, ArwTag.StripByteCounts)

	// Check if this IFD has valid image data
	if (width === 0 || height === 0 || stripOffsets.length === 0) {
		throw new Error('Invalid or incomplete image data in IFD')
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

		const stripRows = Math.min(rowsPerStrip, height - stripIdx * rowsPerStrip)
		const expectedSize = width * stripRows * samplesPerPixel * bytesPerSample

		let decompressed: Uint8Array
		switch (compression) {
			case Compression.None:
				decompressed = stripData
				break
			case Compression.PackBits:
				decompressed = decompressPackBits(stripData, expectedSize)
				break
			default:
				// For unsupported compression, just use the raw data
				decompressed = stripData
				break
		}

		rawPixels.push(decompressed)
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

	// Handle CFA (Bayer) RAW data
	if (photometric === 32803 || samplesPerPixel === 1) {
		// CFA (Color Filter Array) - needs demosaicing
		return demosaicBayer(pixels, width, height, bps)
	}

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

					case Photometric.BlackIsZero: {
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
						const gray = pixels[inIdx]!
						r = g = b = gray
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

/**
 * Simple Bayer demosaicing using bilinear interpolation
 * Assumes RGGB pattern (most common for Sony)
 */
function demosaicBayer(
	bayer: Uint8Array,
	width: number,
	height: number,
	bitsPerSample: number
): ImageData {
	const output = new Uint8Array(width * height * 4)
	const scale = bitsPerSample > 8 ? 65535 : 255
	const bytesPerPixel = bitsPerSample > 8 ? 2 : 1

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const outIdx = (y * width + x) * 4

			// Determine pixel position in Bayer pattern (RGGB)
			const isEvenRow = y % 2 === 0
			const isEvenCol = x % 2 === 0

			let r = 0
			let g = 0
			let b = 0

			// Read current pixel value
			const idx = y * width + x
			const pixelValue =
				bytesPerPixel === 2 ? (bayer[idx * 2]! << 8) | bayer[idx * 2 + 1]! : bayer[idx]!

			// RGGB pattern:
			// R G
			// G B
			if (isEvenRow && isEvenCol) {
				// Red pixel
				r = Math.round((pixelValue / scale) * 255)
				g = getInterpolatedG(bayer, x, y, width, height, bytesPerPixel, scale)
				b = getInterpolatedB(bayer, x, y, width, height, bytesPerPixel, scale)
			} else if (isEvenRow && !isEvenCol) {
				// Green pixel (in red row)
				r = getInterpolatedR(bayer, x, y, width, height, bytesPerPixel, scale)
				g = Math.round((pixelValue / scale) * 255)
				b = getInterpolatedB(bayer, x, y, width, height, bytesPerPixel, scale)
			} else if (!isEvenRow && isEvenCol) {
				// Green pixel (in blue row)
				r = getInterpolatedR(bayer, x, y, width, height, bytesPerPixel, scale)
				g = Math.round((pixelValue / scale) * 255)
				b = getInterpolatedB(bayer, x, y, width, height, bytesPerPixel, scale)
			} else {
				// Blue pixel
				r = getInterpolatedR(bayer, x, y, width, height, bytesPerPixel, scale)
				g = getInterpolatedG(bayer, x, y, width, height, bytesPerPixel, scale)
				b = Math.round((pixelValue / scale) * 255)
			}

			output[outIdx] = Math.min(255, Math.max(0, r))
			output[outIdx + 1] = Math.min(255, Math.max(0, g))
			output[outIdx + 2] = Math.min(255, Math.max(0, b))
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

/**
 * Get interpolated red value for non-red pixel
 */
function getInterpolatedR(
	bayer: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	bytesPerPixel: number,
	scale: number
): number {
	let sum = 0
	let count = 0

	// Sample neighboring red pixels (diagonal or horizontal/vertical)
	const positions = [
		[x - 1, y - 1],
		[x + 1, y - 1],
		[x - 1, y + 1],
		[x + 1, y + 1],
		[x - 2, y],
		[x + 2, y],
	]

	for (const [px, py] of positions) {
		if (px >= 0 && px < width && py >= 0 && py < height) {
			const idx = py * width + px
			const val =
				bytesPerPixel === 2 ? (bayer[idx * 2]! << 8) | bayer[idx * 2 + 1]! : bayer[idx]!
			sum += val
			count++
		}
	}

	return count > 0 ? Math.round((sum / count / scale) * 255) : 0
}

/**
 * Get interpolated green value for non-green pixel
 */
function getInterpolatedG(
	bayer: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	bytesPerPixel: number,
	scale: number
): number {
	let sum = 0
	let count = 0

	// Sample neighboring green pixels (cross pattern)
	const positions = [
		[x - 1, y],
		[x + 1, y],
		[x, y - 1],
		[x, y + 1],
	]

	for (const [px, py] of positions) {
		if (px >= 0 && px < width && py >= 0 && py < height) {
			const idx = py * width + px
			const val =
				bytesPerPixel === 2 ? (bayer[idx * 2]! << 8) | bayer[idx * 2 + 1]! : bayer[idx]!
			sum += val
			count++
		}
	}

	return count > 0 ? Math.round((sum / count / scale) * 255) : 0
}

/**
 * Get interpolated blue value for non-blue pixel
 */
function getInterpolatedB(
	bayer: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	bytesPerPixel: number,
	scale: number
): number {
	let sum = 0
	let count = 0

	// Sample neighboring blue pixels
	const positions = [
		[x - 1, y - 1],
		[x + 1, y - 1],
		[x - 1, y + 1],
		[x + 1, y + 1],
		[x, y - 2],
		[x, y + 2],
	]

	for (const [px, py] of positions) {
		if (px >= 0 && px < width && py >= 0 && py < height) {
			const idx = py * width + px
			const val =
				bytesPerPixel === 2 ? (bayer[idx * 2]! << 8) | bayer[idx * 2 + 1]! : bayer[idx]!
			sum += val
			count++
		}
	}

	return count > 0 ? Math.round((sum / count / scale) * 255) : 0
}

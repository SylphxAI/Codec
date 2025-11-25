import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import {
	Compression,
	ORF_LITTLE_ENDIAN,
	OlympusTag,
	Photometric,
	PlanarConfig,
	TIFF_MAGIC,
	Tag,
	TagType,
} from './types'

/**
 * Binary writer with little-endian support
 */
class OrfWriter {
	private buffer: number[] = []

	writeU8(value: number): void {
		this.buffer.push(value & 0xff)
	}

	writeU16(value: number): void {
		this.buffer.push(value & 0xff)
		this.buffer.push((value >> 8) & 0xff)
	}

	writeU32(value: number): void {
		this.buffer.push(value & 0xff)
		this.buffer.push((value >> 8) & 0xff)
		this.buffer.push((value >> 16) & 0xff)
		this.buffer.push((value >> 24) & 0xff)
	}

	writeBytes(data: Uint8Array): void {
		for (const byte of data) {
			this.buffer.push(byte)
		}
	}

	get position(): number {
		return this.buffer.length
	}

	setU32(offset: number, value: number): void {
		this.buffer[offset] = value & 0xff
		this.buffer[offset + 1] = (value >> 8) & 0xff
		this.buffer[offset + 2] = (value >> 16) & 0xff
		this.buffer[offset + 3] = (value >> 24) & 0xff
	}

	getData(): Uint8Array {
		return new Uint8Array(this.buffer)
	}
}

interface TagData {
	tag: number
	type: TagType
	count: number
	value: number | number[] | string
}

/**
 * Encode ImageData to ORF
 * Note: This creates a TIFF-based ORF format suitable for storage
 */
export function encodeOrf(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	const writer = new OrfWriter()

	// Header - using TIFF magic for compatibility
	// (Real ORF uses ORF_MAGIC but TIFF is more compatible)
	writer.writeU16(ORF_LITTLE_ENDIAN)
	writer.writeU16(TIFF_MAGIC)

	// IFD offset (will be updated)
	const ifdOffsetPos = writer.position
	writer.writeU32(0) // Placeholder

	// Prepare image data - ORF typically stores as uncompressed RGB
	const rowsPerStrip = height // Single strip for simplicity
	const numStrips = 1

	// Check for alpha channel
	let hasAlpha = false
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] !== 255) {
			hasAlpha = true
			break
		}
	}

	const samplesPerPixel = hasAlpha ? 4 : 3
	const bytesPerRow = width * samplesPerPixel

	// Create image data strip
	const stripData = new Uint8Array(height * bytesPerRow)
	let dstIdx = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			stripData[dstIdx++] = data[srcIdx]! // R
			stripData[dstIdx++] = data[srcIdx + 1]! // G
			stripData[dstIdx++] = data[srcIdx + 2]! // B
			if (hasAlpha) {
				stripData[dstIdx++] = data[srcIdx + 3]! // A
			}
		}
	}

	// Write strip data
	const stripOffset = writer.position
	writer.writeBytes(stripData)
	const stripByteCount = stripData.length

	// Pad to word boundary
	if (writer.position % 2) {
		writer.writeU8(0)
	}

	// Build IFD entries
	const tags: TagData[] = [
		{ tag: Tag.ImageWidth, type: TagType.Long, count: 1, value: width },
		{ tag: Tag.ImageLength, type: TagType.Long, count: 1, value: height },
		{
			tag: Tag.BitsPerSample,
			type: TagType.Short,
			count: samplesPerPixel,
			value: new Array(samplesPerPixel).fill(8),
		},
		{ tag: Tag.Compression, type: TagType.Short, count: 1, value: Compression.None },
		{ tag: Tag.PhotometricInterpretation, type: TagType.Short, count: 1, value: Photometric.RGB },
		{ tag: Tag.Make, type: TagType.Ascii, count: 8, value: 'OLYMPUS' },
		{ tag: Tag.Model, type: TagType.Ascii, count: 10, value: 'GENERATED' },
		{ tag: Tag.StripOffsets, type: TagType.Long, count: numStrips, value: stripOffset },
		{ tag: Tag.Orientation, type: TagType.Short, count: 1, value: 1 },
		{ tag: Tag.SamplesPerPixel, type: TagType.Short, count: 1, value: samplesPerPixel },
		{ tag: Tag.RowsPerStrip, type: TagType.Long, count: 1, value: rowsPerStrip },
		{ tag: Tag.StripByteCounts, type: TagType.Long, count: numStrips, value: stripByteCount },
		{ tag: Tag.XResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: Tag.YResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: Tag.PlanarConfiguration, type: TagType.Short, count: 1, value: PlanarConfig.Chunky },
		{ tag: Tag.ResolutionUnit, type: TagType.Short, count: 1, value: 2 }, // Inches
	]

	if (hasAlpha) {
		tags.push({ tag: Tag.ExtraSamples, type: TagType.Short, count: 1, value: 2 }) // Unassociated alpha
	}

	// Sort tags by tag number (required by TIFF spec)
	tags.sort((a, b) => a.tag - b.tag)

	// Calculate where overflow data will go
	const ifdStart = writer.position
	const ifdSize = 2 + tags.length * 12 + 4
	let overflowOffset = ifdStart + ifdSize

	// Write IFD
	writer.setU32(ifdOffsetPos, ifdStart)
	writer.writeU16(tags.length)

	for (const tag of tags) {
		writer.writeU16(tag.tag)
		writer.writeU16(tag.type)
		writer.writeU32(tag.count)

		// Calculate value size
		const valueSize = getValueSize(tag.type, tag.count, tag.value)

		if (valueSize <= 4) {
			// Value fits inline
			writeInlineValue(writer, tag)
		} else {
			// Write offset to overflow area
			writer.writeU32(overflowOffset)
			overflowOffset += valueSize + (valueSize % 2) // Pad to word boundary
		}
	}

	// Next IFD offset (0 = no more IFDs)
	writer.writeU32(0)

	// Write overflow values
	for (const tag of tags) {
		const valueSize = getValueSize(tag.type, tag.count, tag.value)
		if (valueSize > 4) {
			writeOverflowValue(writer, tag)
			if (valueSize % 2) {
				writer.writeU8(0) // Pad
			}
		}
	}

	return writer.getData()
}

/**
 * Get size of value data
 */
function getValueSize(type: TagType, count: number, value: number | number[] | string): number {
	if (type === TagType.Ascii) {
		return typeof value === 'string' ? value.length + 1 : count // +1 for null terminator
	}

	const typeSizes: Record<number, number> = {
		[TagType.Byte]: 1,
		[TagType.Ascii]: 1,
		[TagType.Short]: 2,
		[TagType.Long]: 4,
		[TagType.Rational]: 8,
	}
	return (typeSizes[type] || 1) * count
}

/**
 * Write inline value (4 bytes max)
 */
function writeInlineValue(writer: OrfWriter, tag: TagData): void {
	if (tag.type === TagType.Ascii && typeof tag.value === 'string') {
		// ASCII strings stored inline
		const str = tag.value.slice(0, 3) // Max 3 chars + null
		for (let i = 0; i < str.length; i++) {
			writer.writeU8(str.charCodeAt(i))
		}
		// Pad with nulls
		for (let i = str.length; i < 4; i++) {
			writer.writeU8(0)
		}
		return
	}

	const values = Array.isArray(tag.value) ? tag.value : [tag.value]
	let bytesWritten = 0

	for (const v of values) {
		if (typeof v === 'number') {
			switch (tag.type) {
				case TagType.Byte:
					writer.writeU8(v)
					bytesWritten += 1
					break
				case TagType.Short:
					writer.writeU16(v)
					bytesWritten += 2
					break
				case TagType.Long:
					writer.writeU32(v)
					bytesWritten += 4
					break
				default:
					writer.writeU32(v)
					bytesWritten += 4
			}
		}
	}

	// Pad to 4 bytes
	while (bytesWritten < 4) {
		writer.writeU8(0)
		bytesWritten++
	}
}

/**
 * Write overflow value
 */
function writeOverflowValue(writer: OrfWriter, tag: TagData): void {
	if (tag.type === TagType.Ascii && typeof tag.value === 'string') {
		// Write ASCII string with null terminator
		for (let i = 0; i < tag.value.length; i++) {
			writer.writeU8(tag.value.charCodeAt(i))
		}
		writer.writeU8(0) // Null terminator
		return
	}

	const values = Array.isArray(tag.value) ? tag.value : [tag.value]

	for (const v of values) {
		if (typeof v === 'number') {
			switch (tag.type) {
				case TagType.Byte:
					writer.writeU8(v)
					break
				case TagType.Short:
					writer.writeU16(v)
					break
				case TagType.Long:
					writer.writeU32(v)
					break
				case TagType.Rational:
					// Write as numerator/denominator (1/1 for integers)
					writer.writeU32(v)
					writer.writeU32(1)
					break
				default:
					writer.writeU32(v)
			}
		}
	}
}

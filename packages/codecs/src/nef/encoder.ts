import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import {
	NEF_LITTLE_ENDIAN,
	NEF_MAGIC,
	NefCompression,
	NefTag,
	Photometric,
	TagType,
} from './types'

/**
 * Binary writer with little-endian support
 */
class NefWriter {
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

	writeString(str: string): void {
		const encoder = new TextEncoder()
		const bytes = encoder.encode(str)
		this.writeBytes(bytes)
		this.writeU8(0) // Null terminator
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
 * Encode ImageData to NEF format
 * Note: Creates a basic TIFF-based NEF, not a true RAW NEF
 */
export function encodeNef(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	const writer = new NefWriter()

	// Header
	writer.writeU16(NEF_LITTLE_ENDIAN)
	writer.writeU16(NEF_MAGIC)

	// IFD offset (will be updated)
	const ifdOffsetPos = writer.position
	writer.writeU32(0) // Placeholder

	// Prepare image data
	const rowsPerStrip = 16 // Process in strips of 16 rows
	const numStrips = Math.ceil(height / rowsPerStrip)
	const strips: Uint8Array[] = []
	const stripOffsets: number[] = []
	const stripByteCounts: number[] = []

	// Check if image has alpha channel
	let hasAlpha = false
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] !== 255) {
			hasAlpha = true
			break
		}
	}

	const samplesPerPixel = hasAlpha ? 4 : 3
	const bytesPerRow = width * samplesPerPixel

	// Create strips
	for (let stripIdx = 0; stripIdx < numStrips; stripIdx++) {
		const startRow = stripIdx * rowsPerStrip
		const endRow = Math.min(startRow + rowsPerStrip, height)
		const stripRows = endRow - startRow

		const stripData = new Uint8Array(stripRows * bytesPerRow)
		let dstIdx = 0

		for (let y = startRow; y < endRow; y++) {
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

		strips.push(stripData)
	}

	// Write strip data
	for (const strip of strips) {
		stripOffsets.push(writer.position)
		writer.writeBytes(strip)
		stripByteCounts.push(strip.length)
	}

	// Pad to word boundary
	if (writer.position % 2) {
		writer.writeU8(0)
	}

	// Build IFD entries with NEF-specific tags
	const tags: TagData[] = [
		{ tag: NefTag.ImageWidth, type: TagType.Long, count: 1, value: width },
		{ tag: NefTag.ImageLength, type: TagType.Long, count: 1, value: height },
		{
			tag: NefTag.BitsPerSample,
			type: TagType.Short,
			count: samplesPerPixel,
			value: new Array(samplesPerPixel).fill(8),
		},
		{
			tag: NefTag.Compression,
			type: TagType.Short,
			count: 1,
			value: NefCompression.None,
		},
		{
			tag: NefTag.PhotometricInterpretation,
			type: TagType.Short,
			count: 1,
			value: Photometric.RGB,
		},
		{ tag: NefTag.Make, type: TagType.Ascii, count: 6, value: 'Nikon' },
		{ tag: NefTag.Model, type: TagType.Ascii, count: 4, value: 'NEF' },
		{ tag: NefTag.StripOffsets, type: TagType.Long, count: numStrips, value: stripOffsets },
		{ tag: NefTag.Orientation, type: TagType.Short, count: 1, value: 1 },
		{ tag: NefTag.SamplesPerPixel, type: TagType.Short, count: 1, value: samplesPerPixel },
		{ tag: NefTag.RowsPerStrip, type: TagType.Long, count: 1, value: rowsPerStrip },
		{ tag: NefTag.StripByteCounts, type: TagType.Long, count: numStrips, value: stripByteCounts },
		{ tag: NefTag.XResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: NefTag.YResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: NefTag.ResolutionUnit, type: TagType.Short, count: 1, value: 2 }, // Inches
		{ tag: NefTag.Software, type: TagType.Ascii, count: 13, value: 'mconv/codecs' },
	]

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
		const valueSize = getValueSize(tag.type, tag.count)

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
		const valueSize = getValueSize(tag.type, tag.count)
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
function getValueSize(type: TagType, count: number): number {
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
function writeInlineValue(writer: NefWriter, tag: TagData): void {
	const values = Array.isArray(tag.value) ? tag.value : [tag.value]
	let bytesWritten = 0

	if (tag.type === TagType.Ascii && typeof tag.value === 'string') {
		const encoder = new TextEncoder()
		const bytes = encoder.encode(tag.value)
		for (let i = 0; i < Math.min(4, bytes.length); i++) {
			writer.writeU8(bytes[i]!)
			bytesWritten++
		}
	} else {
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
function writeOverflowValue(writer: NefWriter, tag: TagData): void {
	if (tag.type === TagType.Ascii && typeof tag.value === 'string') {
		writer.writeString(tag.value)
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

import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import {
	Compression,
	PEF_LITTLE_ENDIAN,
	PEF_MAGIC,
	PefTag,
	Photometric,
	PlanarConfig,
	TagType,
} from './types'

/**
 * Binary writer with little-endian support
 */
class PefWriter {
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
	value: number | number[]
}

/**
 * Encode ImageData to PEF
 * Note: This creates a basic PEF-compatible TIFF with preview data,
 * not true RAW sensor data
 */
export function encodePef(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	const writer = new PefWriter()

	// Header
	writer.writeU16(PEF_LITTLE_ENDIAN)
	writer.writeU16(PEF_MAGIC)

	// IFD offset (will be updated)
	const ifdOffsetPos = writer.position
	writer.writeU32(0) // Placeholder

	// Prepare image data - create strips
	const rowsPerStrip = 16 // Process in strips of 16 rows
	const numStrips = Math.ceil(height / rowsPerStrip)
	const strips: Uint8Array[] = []
	const stripOffsets: number[] = []
	const stripByteCounts: number[] = []

	// Convert RGBA to RGB (or keep RGBA if has alpha)
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

	// Build IFD entries
	const tags: TagData[] = [
		{ tag: PefTag.ImageWidth, type: TagType.Long, count: 1, value: width },
		{ tag: PefTag.ImageLength, type: TagType.Long, count: 1, value: height },
		{
			tag: PefTag.BitsPerSample,
			type: TagType.Short,
			count: samplesPerPixel,
			value: new Array(samplesPerPixel).fill(8),
		},
		{ tag: PefTag.Compression, type: TagType.Short, count: 1, value: Compression.None },
		{ tag: PefTag.PhotometricInterpretation, type: TagType.Short, count: 1, value: Photometric.RGB },
		{ tag: PefTag.Make, type: TagType.Ascii, count: 7, value: 0x50454e54_41580000 }, // "PENTAX"
		{ tag: PefTag.StripOffsets, type: TagType.Long, count: numStrips, value: stripOffsets },
		{ tag: PefTag.SamplesPerPixel, type: TagType.Short, count: 1, value: samplesPerPixel },
		{ tag: PefTag.RowsPerStrip, type: TagType.Long, count: 1, value: rowsPerStrip },
		{ tag: PefTag.StripByteCounts, type: TagType.Long, count: numStrips, value: stripByteCounts },
		{ tag: PefTag.XResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: PefTag.YResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: PefTag.PlanarConfiguration, type: TagType.Short, count: 1, value: PlanarConfig.Chunky },
		{ tag: PefTag.ResolutionUnit, type: TagType.Short, count: 1, value: 2 }, // Inches
	]

	// Sort tags by tag number
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
function writeInlineValue(writer: PefWriter, tag: TagData): void {
	const values = Array.isArray(tag.value) ? tag.value : [tag.value]
	let bytesWritten = 0

	for (const v of values) {
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
			case TagType.Ascii:
				writer.writeU32(v)
				bytesWritten += 4
				break
			default:
				writer.writeU32(v)
				bytesWritten += 4
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
function writeOverflowValue(writer: PefWriter, tag: TagData): void {
	const values = Array.isArray(tag.value) ? tag.value : [tag.value]

	for (const v of values) {
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

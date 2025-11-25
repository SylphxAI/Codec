import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import {
	CR2Compression,
	CR2_MAGIC,
	CR2_SIGNATURE,
	CR2Tag,
	Photometric,
	PlanarConfig,
	TagType,
} from './types'

/**
 * Binary writer with little-endian support
 */
class CR2Writer {
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
 * Encode ImageData to CR2
 * Note: This creates a simplified CR2-like TIFF with RGB data
 * True RAW encoding would require Bayer pattern generation
 */
export function encodeCR2(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	const writer = new CR2Writer()

	// Header
	writer.writeU16(CR2_SIGNATURE)
	writer.writeU16(CR2_MAGIC)

	// IFD offset (will be updated)
	const ifdOffsetPos = writer.position
	writer.writeU32(0) // Placeholder

	// Prepare image data - convert to RGB
	let hasAlpha = false
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] !== 255) {
			hasAlpha = true
			break
		}
	}

	const samplesPerPixel = hasAlpha ? 4 : 3
	const bytesPerRow = width * samplesPerPixel
	const imageData = new Uint8Array(height * bytesPerRow)

	let dstIdx = 0
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			imageData[dstIdx++] = data[srcIdx]! // R
			imageData[dstIdx++] = data[srcIdx + 1]! // G
			imageData[dstIdx++] = data[srcIdx + 2]! // B
			if (hasAlpha) {
				imageData[dstIdx++] = data[srcIdx + 3]! // A
			}
		}
	}

	// For simplified CR2, we'll store as uncompressed
	// Real CR2 uses lossless JPEG which is complex to implement
	const finalData = imageData

	// Write image data
	const stripOffset = writer.position
	writer.writeBytes(finalData)
	const stripByteCount = finalData.length

	// Pad to word boundary
	if (writer.position % 2) {
		writer.writeU8(0)
	}

	// Build IFD entries
	const tags: TagData[] = [
		{ tag: CR2Tag.ImageWidth, type: TagType.Long, count: 1, value: width },
		{ tag: CR2Tag.ImageLength, type: TagType.Long, count: 1, value: height },
		{
			tag: CR2Tag.BitsPerSample,
			type: TagType.Short,
			count: samplesPerPixel,
			value: new Array(samplesPerPixel).fill(8),
		},
		{
			tag: CR2Tag.Compression,
			type: TagType.Short,
			count: 1,
			value: CR2Compression.None,
		},
		{ tag: CR2Tag.PhotometricInterpretation, type: TagType.Short, count: 1, value: Photometric.RGB },
		{ tag: CR2Tag.Make, type: TagType.Ascii, count: 6, value: 'Canon' },
		{ tag: CR2Tag.Model, type: TagType.Ascii, count: 4, value: 'CR2' },
		{ tag: CR2Tag.StripOffsets, type: TagType.Long, count: 1, value: stripOffset },
		{ tag: CR2Tag.SamplesPerPixel, type: TagType.Short, count: 1, value: samplesPerPixel },
		{ tag: CR2Tag.RowsPerStrip, type: TagType.Long, count: 1, value: height },
		{ tag: CR2Tag.StripByteCounts, type: TagType.Long, count: 1, value: stripByteCount },
		{ tag: CR2Tag.XResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: CR2Tag.YResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: CR2Tag.PlanarConfiguration, type: TagType.Short, count: 1, value: PlanarConfig.Chunky },
		{ tag: CR2Tag.ResolutionUnit, type: TagType.Short, count: 1, value: 2 }, // Inches
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
			overflowOffset += valueSize + (valueSize % 2)
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
				writer.writeU8(0)
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
function writeInlineValue(writer: CR2Writer, tag: TagData): void {
	const values = Array.isArray(tag.value) ? tag.value : [tag.value]
	let bytesWritten = 0

	for (const v of values) {
		if (tag.type === TagType.Ascii) {
			// Handle string values
			const str = typeof v === 'string' ? v : String(v)
			for (let i = 0; i < str.length && i < tag.count; i++) {
				writer.writeU8(str.charCodeAt(i))
				bytesWritten++
			}
		} else {
			switch (tag.type) {
				case TagType.Byte:
					writer.writeU8(v as number)
					bytesWritten += 1
					break
				case TagType.Short:
					writer.writeU16(v as number)
					bytesWritten += 2
					break
				case TagType.Long:
					writer.writeU32(v as number)
					bytesWritten += 4
					break
				default:
					writer.writeU32(v as number)
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
function writeOverflowValue(writer: CR2Writer, tag: TagData): void {
	const values = Array.isArray(tag.value) ? tag.value : [tag.value]

	if (tag.type === TagType.Ascii) {
		// Handle string
		const str = typeof values[0] === 'string' ? values[0] : String(values[0])
		for (let i = 0; i < tag.count; i++) {
			writer.writeU8(i < str.length ? str.charCodeAt(i) : 0)
		}
		return
	}

	for (const v of values) {
		switch (tag.type) {
			case TagType.Byte:
				writer.writeU8(v as number)
				break
			case TagType.Short:
				writer.writeU16(v as number)
				break
			case TagType.Long:
				writer.writeU32(v as number)
				break
			case TagType.Rational:
				writer.writeU32(v as number)
				writer.writeU32(1)
				break
			default:
				writer.writeU32(v as number)
		}
	}
}

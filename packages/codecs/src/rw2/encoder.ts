import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import {
	Photometric,
	PlanarConfig,
	RW2_MAGIC,
	RW2_SIGNATURE,
	RW2Tag,
	TagType,
} from './types'

/**
 * Binary writer with little-endian support
 */
class RW2Writer {
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
 * Encode ImageData to RW2
 * Note: This creates a basic TIFF-compatible RW2 without Panasonic-specific compression
 */
export function encodeRW2(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	const writer = new RW2Writer()

	// Header - RW2 uses Panasonic magic number
	writer.writeU16(RW2_SIGNATURE) // Little-endian signature
	writer.writeU16(RW2_MAGIC) // Panasonic magic (0x0055)

	// IFD offset (will be updated)
	const ifdOffsetPos = writer.position
	writer.writeU32(0) // Placeholder

	// Check for alpha channel
	let hasAlpha = false
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] !== 255) {
			hasAlpha = true
			break
		}
	}

	const samplesPerPixel = hasAlpha ? 4 : 3

	// Convert RGBA to RGB (or keep RGBA if has alpha)
	const pixelData = new Uint8Array(width * height * samplesPerPixel)
	let dstIdx = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4
			pixelData[dstIdx++] = data[srcIdx]! // R
			pixelData[dstIdx++] = data[srcIdx + 1]! // G
			pixelData[dstIdx++] = data[srcIdx + 2]! // B
			if (hasAlpha) {
				pixelData[dstIdx++] = data[srcIdx + 3]! // A
			}
		}
	}

	// Write image data
	const imageDataOffset = writer.position
	writer.writeBytes(pixelData)

	// Pad to word boundary
	if (writer.position % 2) {
		writer.writeU8(0)
	}

	// Build IFD entries
	const tags: TagData[] = [
		{ tag: RW2Tag.ImageWidth, type: TagType.Long, count: 1, value: width },
		{ tag: RW2Tag.ImageLength, type: TagType.Long, count: 1, value: height },
		{
			tag: RW2Tag.BitsPerSample,
			type: TagType.Short,
			count: samplesPerPixel,
			value: new Array(samplesPerPixel).fill(8),
		},
		{ tag: RW2Tag.Compression, type: TagType.Short, count: 1, value: 1 }, // None
		{ tag: RW2Tag.PhotometricInterpretation, type: TagType.Short, count: 1, value: Photometric.RGB },
		{ tag: RW2Tag.Make, type: TagType.Ascii, count: 10, value: 'Panasonic' },
		{ tag: RW2Tag.StripOffsets, type: TagType.Long, count: 1, value: imageDataOffset },
		{ tag: RW2Tag.SamplesPerPixel, type: TagType.Short, count: 1, value: samplesPerPixel },
		{ tag: RW2Tag.RowsPerStrip, type: TagType.Long, count: 1, value: height },
		{ tag: RW2Tag.StripByteCounts, type: TagType.Long, count: 1, value: pixelData.length },
		{ tag: RW2Tag.XResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: RW2Tag.YResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: RW2Tag.PlanarConfiguration, type: TagType.Short, count: 1, value: PlanarConfig.Chunky },
		{ tag: RW2Tag.ResolutionUnit, type: TagType.Short, count: 1, value: 2 }, // Inches
	]

	if (hasAlpha) {
		tags.push({ tag: 338, type: TagType.Short, count: 1, value: 2 }) // ExtraSamples: Unassociated alpha
	}

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
function writeInlineValue(writer: RW2Writer, tag: TagData): void {
	if (tag.type === TagType.Ascii) {
		// Write ASCII string inline
		const str = String(tag.value)
		const bytes = new TextEncoder().encode(str)
		let bytesWritten = 0
		for (let i = 0; i < Math.min(bytes.length, 4); i++) {
			writer.writeU8(bytes[i]!)
			bytesWritten++
		}
		while (bytesWritten < 4) {
			writer.writeU8(0)
			bytesWritten++
		}
		return
	}

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
function writeOverflowValue(writer: RW2Writer, tag: TagData): void {
	if (tag.type === TagType.Ascii) {
		// Write ASCII string
		const str = String(tag.value)
		const bytes = new TextEncoder().encode(str)
		for (const byte of bytes) {
			writer.writeU8(byte)
		}
		// Add null terminator if needed
		if (bytes.length < tag.count) {
			writer.writeU8(0)
		}
		return
	}

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

import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import { encodeTiff as encodeTiffBase } from '../tiff/encoder'
import { compressPackBits } from '../tiff/compression'
import {
	Compression,
	DNGTag,
	DNG_VERSION_1_4,
	Photometric,
	PlanarConfig,
	TIFF_LITTLE_ENDIAN,
	TIFF_MAGIC,
	Tag,
	TagType,
	type DNGMetadata,
} from './types'

/**
 * Binary writer with little-endian support
 */
class DNGWriter {
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
 * Encode ImageData to DNG
 */
export function encodeDNG(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image
	const useCompression = options?.quality !== 100 // Use PackBits unless quality=100
	const metadata = (options as any)?.metadata as DNGMetadata | undefined

	const writer = new DNGWriter()

	// Header
	writer.writeU16(TIFF_LITTLE_ENDIAN)
	writer.writeU16(TIFF_MAGIC)

	// IFD offset (will be updated)
	const ifdOffsetPos = writer.position
	writer.writeU32(0) // Placeholder

	// Prepare image data
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

		// Compress if enabled
		const finalStrip = useCompression ? compressPackBits(stripData) : stripData
		strips.push(finalStrip)
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

	// Build IFD entries - start with standard TIFF tags
	const tags: TagData[] = [
		{ tag: Tag.ImageWidth, type: TagType.Long, count: 1, value: width },
		{ tag: Tag.ImageLength, type: TagType.Long, count: 1, value: height },
		{
			tag: Tag.BitsPerSample,
			type: TagType.Short,
			count: samplesPerPixel,
			value: new Array(samplesPerPixel).fill(8),
		},
		{
			tag: Tag.Compression,
			type: TagType.Short,
			count: 1,
			value: useCompression ? Compression.PackBits : Compression.None,
		},
		{ tag: Tag.PhotometricInterpretation, type: TagType.Short, count: 1, value: Photometric.RGB },
		{ tag: Tag.StripOffsets, type: TagType.Long, count: numStrips, value: stripOffsets },
		{ tag: Tag.SamplesPerPixel, type: TagType.Short, count: 1, value: samplesPerPixel },
		{ tag: Tag.RowsPerStrip, type: TagType.Long, count: 1, value: rowsPerStrip },
		{ tag: Tag.StripByteCounts, type: TagType.Long, count: numStrips, value: stripByteCounts },
		{ tag: Tag.XResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: Tag.YResolution, type: TagType.Rational, count: 1, value: 72 },
		{ tag: Tag.PlanarConfiguration, type: TagType.Short, count: 1, value: PlanarConfig.Chunky },
		{ tag: Tag.ResolutionUnit, type: TagType.Short, count: 1, value: 2 }, // Inches
	]

	if (hasAlpha) {
		tags.push({ tag: Tag.ExtraSamples, type: TagType.Short, count: 1, value: 2 }) // Unassociated alpha
	}

	// Add DNG-specific tags
	// DNG Version (required for DNG)
	tags.push({
		tag: DNGTag.DNGVersion,
		type: TagType.Byte,
		count: 4,
		value: metadata?.dngVersion || DNG_VERSION_1_4,
	})

	// DNG Backward Version (required for DNG)
	tags.push({
		tag: DNGTag.DNGBackwardVersion,
		type: TagType.Byte,
		count: 4,
		value: metadata?.dngBackwardVersion || DNG_VERSION_1_4,
	})

	// Optional DNG metadata
	if (metadata?.uniqueCameraModel) {
		tags.push({
			tag: DNGTag.UniqueCameraModel,
			type: TagType.Ascii,
			count: metadata.uniqueCameraModel.length + 1,
			value: metadata.uniqueCameraModel,
		})
	}

	if (metadata?.localizedCameraModel) {
		tags.push({
			tag: DNGTag.LocalizedCameraModel,
			type: TagType.Ascii,
			count: metadata.localizedCameraModel.length + 1,
			value: metadata.localizedCameraModel,
		})
	}

	if (metadata?.cameraSerialNumber) {
		tags.push({
			tag: DNGTag.CameraSerialNumber,
			type: TagType.Ascii,
			count: metadata.cameraSerialNumber.length + 1,
			value: metadata.cameraSerialNumber,
		})
	}

	if (metadata?.lensInfo) {
		tags.push({
			tag: DNGTag.LensInfo,
			type: TagType.Rational,
			count: metadata.lensInfo.length,
			value: metadata.lensInfo,
		})
	}

	if (metadata?.whiteLevel) {
		tags.push({
			tag: DNGTag.WhiteLevel,
			type: TagType.Long,
			count: metadata.whiteLevel.length,
			value: metadata.whiteLevel,
		})
	}

	if (metadata?.blackLevel) {
		tags.push({
			tag: DNGTag.BlackLevel,
			type: TagType.Rational,
			count: metadata.blackLevel.length,
			value: metadata.blackLevel,
		})
	}

	if (metadata?.colorMatrix1) {
		tags.push({
			tag: DNGTag.ColorMatrix1,
			type: TagType.SRational,
			count: metadata.colorMatrix1.length,
			value: metadata.colorMatrix1,
		})
	}

	if (metadata?.colorMatrix2) {
		tags.push({
			tag: DNGTag.ColorMatrix2,
			type: TagType.SRational,
			count: metadata.colorMatrix2.length,
			value: metadata.colorMatrix2,
		})
	}

	if (metadata?.calibrationIlluminant1 !== undefined) {
		tags.push({
			tag: DNGTag.CalibrationIlluminant1,
			type: TagType.Short,
			count: 1,
			value: metadata.calibrationIlluminant1,
		})
	}

	if (metadata?.calibrationIlluminant2 !== undefined) {
		tags.push({
			tag: DNGTag.CalibrationIlluminant2,
			type: TagType.Short,
			count: 1,
			value: metadata.calibrationIlluminant2,
		})
	}

	if (metadata?.asShotNeutral) {
		tags.push({
			tag: DNGTag.AsShotNeutral,
			type: TagType.Rational,
			count: metadata.asShotNeutral.length,
			value: metadata.asShotNeutral,
		})
	}

	if (metadata?.baselineExposure !== undefined) {
		tags.push({
			tag: DNGTag.BaselineExposure,
			type: TagType.SRational,
			count: 1,
			value: metadata.baselineExposure,
		})
	}

	if (metadata?.baselineNoise !== undefined) {
		tags.push({
			tag: DNGTag.BaselineNoise,
			type: TagType.Rational,
			count: 1,
			value: metadata.baselineNoise,
		})
	}

	if (metadata?.baselineSharpness !== undefined) {
		tags.push({
			tag: DNGTag.BaselineSharpness,
			type: TagType.Rational,
			count: 1,
			value: metadata.baselineSharpness,
		})
	}

	if (metadata?.profileName) {
		tags.push({
			tag: DNGTag.ProfileName,
			type: TagType.Ascii,
			count: metadata.profileName.length + 1,
			value: metadata.profileName,
		})
	}

	if (metadata?.profileCopyright) {
		tags.push({
			tag: DNGTag.ProfileCopyright,
			type: TagType.Ascii,
			count: metadata.profileCopyright.length + 1,
			value: metadata.profileCopyright,
		})
	}

	// Sort tags by tag number (required by TIFF/DNG spec)
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
		return typeof value === 'string' ? value.length + 1 : count
	}

	const typeSizes: Record<number, number> = {
		[TagType.Byte]: 1,
		[TagType.Ascii]: 1,
		[TagType.Short]: 2,
		[TagType.Long]: 4,
		[TagType.Rational]: 8,
		[TagType.SByte]: 1,
		[TagType.Undefined]: 1,
		[TagType.SShort]: 2,
		[TagType.SLong]: 4,
		[TagType.SRational]: 8,
		[TagType.Float]: 4,
		[TagType.Double]: 8,
	}
	return (typeSizes[type] || 1) * count
}

/**
 * Write inline value (4 bytes max)
 */
function writeInlineValue(writer: DNGWriter, tag: TagData): void {
	if (tag.type === TagType.Ascii && typeof tag.value === 'string') {
		const bytes = new TextEncoder().encode(tag.value + '\0')
		for (let i = 0; i < Math.min(4, bytes.length); i++) {
			writer.writeU8(bytes[i]!)
		}
		for (let i = bytes.length; i < 4; i++) {
			writer.writeU8(0)
		}
		return
	}

	const values = Array.isArray(tag.value) ? tag.value : [tag.value as number]
	let bytesWritten = 0

	for (const v of values) {
		switch (tag.type) {
			case TagType.Byte:
			case TagType.Undefined:
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
function writeOverflowValue(writer: DNGWriter, tag: TagData): void {
	if (tag.type === TagType.Ascii && typeof tag.value === 'string') {
		const bytes = new TextEncoder().encode(tag.value + '\0')
		writer.writeBytes(bytes)
		return
	}

	const values = Array.isArray(tag.value) ? tag.value : [tag.value as number]

	for (const v of values) {
		switch (tag.type) {
			case TagType.Byte:
			case TagType.Undefined:
				writer.writeU8(v)
				break
			case TagType.Short:
				writer.writeU16(v)
				break
			case TagType.Long:
				writer.writeU32(v)
				break
			case TagType.Rational: {
				// Convert float to rational (numerator/denominator)
				const precision = 10000 // Support up to 4 decimal places
				const numerator = Math.round(v * precision)
				writer.writeU32(numerator)
				writer.writeU32(precision)
				break
			}
			case TagType.SRational: {
				// Convert float to signed rational (numerator/denominator)
				const precision = 10000 // Support up to 4 decimal places
				const numerator = Math.round(v * precision)
				writer.writeU32(numerator)
				writer.writeU32(precision)
				break
			}
			default:
				writer.writeU32(v)
		}
	}
}

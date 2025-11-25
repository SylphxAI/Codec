import type { ImageData } from '@sylphx/codec-core'
import {
	BPG_CS_RGB,
	BPG_CS_YCbCr,
	BPG_CS_YCbCr_BT2020,
	BPG_CS_YCbCr_BT709,
	BPG_CS_YCgCo,
	BPG_FORMAT_420,
	BPG_FORMAT_420_VIDEO,
	BPG_FORMAT_422,
	BPG_FORMAT_422_VIDEO,
	BPG_FORMAT_444,
	BPG_FORMAT_GRAY,
	BPG_MAGIC,
	type BPGExtension,
	type BPGFile,
	type BPGHeader,
	type HevcBitstream,
	HevcNalUnitType,
	type HevcSPS,
} from './types'

/**
 * Read unsigned variable-length integer (exponential golomb)
 */
function readUE7(data: Uint8Array, offset: { value: number }): number {
	let value = 0
	let byte: number

	do {
		if (offset.value >= data.length) {
			throw new Error('Unexpected end of data reading variable integer')
		}
		byte = data[offset.value++]!
		value = (value << 7) | (byte & 0x7f)
	} while (byte & 0x80)

	return value
}

/**
 * Read 32-bit big-endian value
 */
function readU32BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!
}

/**
 * Decode BPG to ImageData
 */
export function decodeBpg(data: Uint8Array): ImageData {
	// Parse BPG file structure
	const bpgFile = parseBpgFile(data)

	// Validate BPG format
	if (bpgFile.header.magic !== BPG_MAGIC) {
		throw new Error('Invalid BPG magic number')
	}

	// Get image dimensions
	const width = bpgFile.header.pictureWidth
	const height = bpgFile.header.pictureHeight

	if (width === 0 || height === 0) {
		throw new Error('Invalid BPG dimensions')
	}

	// Parse HEVC bitstream from picture data
	const bitstream = parseHevcBitstream(bpgFile.pictureData)

	// Decode HEVC intra frame
	return decodeHevcIntraFrame(bitstream, bpgFile.header)
}

/**
 * Parse BPG file structure
 */
function parseBpgFile(data: Uint8Array): BPGFile {
	const offset = { value: 0 }

	// Read and validate magic
	if (offset.value + 4 > data.length) {
		throw new Error('Invalid BPG file: too short for header')
	}

	const magic = readU32BE(data, offset.value)
	offset.value += 4

	if (magic !== BPG_MAGIC) {
		throw new Error(`Invalid BPG magic: expected 0x${BPG_MAGIC.toString(16)}, got 0x${magic.toString(16)}`)
	}

	// Read format flags
	const formatFlags = data[offset.value++]!

	// Parse format flags
	const format = formatFlags & 0x07
	const hasAlpha = !!(formatFlags & 0x08)
	const bitDepthMinus8 = (formatFlags >> 4) & 0x0f

	// Read picture width and height
	const pictureWidth = readUE7(data, offset)
	const pictureHeight = readUE7(data, offset)

	// Read picture data length
	const pictureDataLength = readUE7(data, offset)

	// Read extension data length (if present)
	const extensionFlags = data[offset.value++]!
	const hasExtensions = !!(extensionFlags & 0x01)
	const alphaFirst = !!(extensionFlags & 0x02)
	const isPremultiplied = !!(extensionFlags & 0x04)
	const hasLimitedRange = !!(extensionFlags & 0x08)
	const colorSpace = (extensionFlags >> 4) & 0x0f
	const hasAnimation = !!(data[offset.value - 1]! & 0x80)

	let extensionDataLength = 0
	if (hasExtensions) {
		extensionDataLength = readUE7(data, offset)
	}

	// Build header
	const header: BPGHeader = {
		magic,
		formatFlags,
		pictureWidth,
		pictureHeight,
		pictureDataLength,
		extensionDataLength,
		format,
		hasAlpha,
		bitDepth: bitDepthMinus8 + 8,
		colorSpace,
		hasExtensions,
		alphaFirst,
		isPremultiplied,
		hasLimitedRange,
		hasAnimation,
	}

	// Read extension data
	const extensions: BPGExtension[] = []
	if (hasExtensions && extensionDataLength > 0) {
		const extensionEnd = offset.value + extensionDataLength
		while (offset.value < extensionEnd) {
			const tag = readUE7(data, offset)
			const length = readUE7(data, offset)
			const extData = data.slice(offset.value, offset.value + length)
			offset.value += length
			extensions.push({ tag, length, data: extData })
		}
	}

	// Read picture data
	const pictureData = data.slice(offset.value, offset.value + pictureDataLength)
	offset.value += pictureDataLength

	return { header, extensions, pictureData }
}

/**
 * Parse HEVC bitstream into NAL units
 */
function parseHevcBitstream(data: Uint8Array): HevcBitstream {
	const nalUnits: Array<{ type: HevcNalUnitType; data: Uint8Array }> = []
	let sps: HevcSPS | undefined

	let offset = 0

	// BPG uses length-prefixed NAL units
	while (offset < data.length) {
		// Read NAL unit length (4 bytes, big-endian)
		if (offset + 4 > data.length) break

		const naluLength = readU32BE(data, offset)
		offset += 4

		if (offset + naluLength > data.length) {
			throw new Error('Invalid NAL unit length')
		}

		const naluData = data.slice(offset, offset + naluLength)
		offset += naluLength

		if (naluData.length > 0) {
			// Parse NAL unit header (HEVC)
			const nalUnitType = (naluData[0]! >> 1) & 0x3f

			nalUnits.push({ type: nalUnitType, data: naluData })

			if (nalUnitType === HevcNalUnitType.SPS_NUT) {
				sps = parseHevcSPS(naluData)
			}
		}
	}

	return { nalUnits, sps }
}

/**
 * Parse HEVC Sequence Parameter Set (simplified)
 */
function parseHevcSPS(data: Uint8Array): HevcSPS {
	// This is a simplified parser - full HEVC SPS parsing is very complex
	// For a production implementation, you would parse:
	// - profile_tier_level
	// - pic_width_in_luma_samples
	// - pic_height_in_luma_samples
	// - bit_depth_luma_minus8
	// - bit_depth_chroma_minus8
	// - chroma_format_idc

	// For now, return defaults
	return {
		width: 0,
		height: 0,
		bitDepth: 8,
		chromaFormat: 1, // 4:2:0
	}
}

/**
 * Decode HEVC intra frame to ImageData
 */
function decodeHevcIntraFrame(_bitstream: HevcBitstream, header: BPGHeader): ImageData {
	// HEVC decoding is extremely complex and requires:
	// 1. Parse VPS, SPS, PPS parameter sets
	// 2. Decode slice headers
	// 3. Perform inverse quantization
	// 4. Perform inverse transform (DCT)
	// 5. Perform intra prediction
	// 6. Apply deblocking filter and SAO
	// 7. Convert from YUV to RGB (based on color space)
	// 8. Handle alpha channel if present

	// This would require a full HEVC decoder implementation, which is beyond
	// the scope of a pure TypeScript codec. In production, you would use:
	// - A WASM-based HEVC decoder
	// - Hardware decoder APIs
	// - Existing decoder libraries

	throw new Error(
		'HEVC decoding is not yet implemented. ' +
			'BPG uses HEVC (H.265) compression which is extremely complex. ' +
			`Image dimensions: ${header.pictureWidth}x${header.pictureHeight}, ` +
			`format: ${getFormatName(header.format)}, ` +
			`bit depth: ${header.bitDepth}, ` +
			`color space: ${getColorSpaceName(header.colorSpace)}, ` +
			`alpha: ${header.hasAlpha}. ` +
			'Consider using a WASM-based decoder or system codec for production use.'
	)

	// Placeholder implementation would create an empty image:
	// const { pictureWidth: width, pictureHeight: height, hasAlpha } = header
	// const channels = hasAlpha ? 4 : 4 // Always RGBA for ImageData
	// const pixelData = new Uint8Array(width * height * channels)
	//
	// // Fill with gray placeholder
	// for (let i = 0; i < width * height; i++) {
	// 	pixelData[i * 4] = 128     // R
	// 	pixelData[i * 4 + 1] = 128 // G
	// 	pixelData[i * 4 + 2] = 128 // B
	// 	pixelData[i * 4 + 3] = 255 // A
	// }
	//
	// return { width, height, data: pixelData }
}

/**
 * Get human-readable format name
 */
function getFormatName(format: number): string {
	switch (format) {
		case BPG_FORMAT_GRAY:
			return 'Grayscale'
		case BPG_FORMAT_420:
			return 'YCbCr 4:2:0'
		case BPG_FORMAT_422:
			return 'YCbCr 4:2:2'
		case BPG_FORMAT_444:
			return 'YCbCr 4:4:4'
		case BPG_FORMAT_420_VIDEO:
			return 'YCbCr 4:2:0 (video range)'
		case BPG_FORMAT_422_VIDEO:
			return 'YCbCr 4:2:2 (video range)'
		default:
			return `Unknown (${format})`
	}
}

/**
 * Get human-readable color space name
 */
function getColorSpaceName(colorSpace: number): string {
	switch (colorSpace) {
		case BPG_CS_YCbCr:
			return 'YCbCr'
		case BPG_CS_RGB:
			return 'RGB'
		case BPG_CS_YCgCo:
			return 'YCgCo'
		case BPG_CS_YCbCr_BT709:
			return 'YCbCr BT.709'
		case BPG_CS_YCbCr_BT2020:
			return 'YCbCr BT.2020'
		default:
			return `Unknown (${colorSpace})`
	}
}

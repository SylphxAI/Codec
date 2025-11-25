import type { ImageData } from '@sylphx/codec-core'
import {
	ColorSpace,
	EncodingMode,
	JXL_CODESTREAM_SIGNATURE,
	JXL_CONTAINER_SIGNATURE,
	type JxlBox,
	type JxlHeader,
} from './types'

/**
 * Bit reader for JXL variable-length integer decoding
 */
class BitReader {
	private data: Uint8Array
	private byteOffset: number
	private bitOffset: number

	constructor(data: Uint8Array, offset = 0) {
		this.data = data
		this.byteOffset = offset
		this.bitOffset = 0
	}

	/**
	 * Read bits from the stream
	 */
	readBits(count: number): number {
		let result = 0
		for (let i = 0; i < count; i++) {
			if (this.byteOffset >= this.data.length) {
				throw new Error('Unexpected end of data')
			}

			const bit = (this.data[this.byteOffset]! >> this.bitOffset) & 1
			result |= bit << i
			this.bitOffset++

			if (this.bitOffset === 8) {
				this.bitOffset = 0
				this.byteOffset++
			}
		}
		return result
	}

	/**
	 * Read a single bit
	 */
	readBit(): boolean {
		return this.readBits(1) === 1
	}

	/**
	 * Align to byte boundary
	 */
	alignToByte(): void {
		if (this.bitOffset !== 0) {
			this.bitOffset = 0
			this.byteOffset++
		}
	}

	/**
	 * Get current byte offset
	 */
	getByteOffset(): number {
		return this.byteOffset + (this.bitOffset > 0 ? 1 : 0)
	}

	/**
	 * Skip bytes
	 */
	skip(bytes: number): void {
		this.alignToByte()
		this.byteOffset += bytes
	}
}

/**
 * Read U32 big-endian
 */
function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) |
			(data[offset + 1]! << 16) |
			(data[offset + 2]! << 8) |
			data[offset + 3]!) >>>
		0
	)
}

/**
 * Read U64 big-endian (as two 32-bit numbers)
 */
function readU64BE(data: Uint8Array, offset: number): [number, number] {
	const high = readU32BE(data, offset)
	const low = readU32BE(data, offset + 4)
	return [high, low]
}

/**
 * Decode JXL variable-length unsigned integer (U32)
 */
function decodeVarInt(reader: BitReader): number {
	// U32() encoding as per JXL spec
	// 00 -> 0
	// 01 -> 1-4 bits
	// 10 -> 5-12 bits
	// 11 -> 13-20 bits, etc.

	let value = 0
	let shift = 0

	while (true) {
		const selector = reader.readBits(2)

		if (selector === 0) {
			// 00: value is 0
			return value
		}

		let bits: number
		if (selector === 1) {
			bits = 4
		} else if (selector === 2) {
			bits = 8
		} else {
			bits = 12
		}

		const chunk = reader.readBits(bits)
		value |= chunk << shift
		shift += bits

		if (selector !== 3) {
			break
		}
	}

	return value
}

/**
 * Check if data is JXL container format
 */
function isContainer(data: Uint8Array): boolean {
	if (data.length < JXL_CONTAINER_SIGNATURE.length) {
		return false
	}

	for (let i = 0; i < JXL_CONTAINER_SIGNATURE.length; i++) {
		if (data[i] !== JXL_CONTAINER_SIGNATURE[i]) {
			return false
		}
	}

	return true
}

/**
 * Check if data is JXL naked codestream
 */
function isCodestream(data: Uint8Array): boolean {
	if (data.length < JXL_CODESTREAM_SIGNATURE.length) {
		return false
	}

	return data[0] === JXL_CODESTREAM_SIGNATURE[0] && data[1] === JXL_CODESTREAM_SIGNATURE[1]
}

/**
 * Parse JXL container boxes
 */
function parseContainerBoxes(data: Uint8Array): JxlBox[] {
	const boxes: JxlBox[] = []
	let offset = JXL_CONTAINER_SIGNATURE.length

	while (offset < data.length) {
		if (offset + 8 > data.length) break

		let size = readU32BE(data, offset)
		const type = readU32BE(data, offset + 4)
		let dataOffset = offset + 8

		// Handle extended size
		if (size === 1) {
			if (offset + 16 > data.length) break
			const [high, low] = readU64BE(data, offset + 8)
			// For simplicity, we assume size fits in 32 bits
			size = low
			dataOffset = offset + 16
		} else if (size === 0) {
			// Box extends to end of file
			size = data.length - offset
		}

		const boxDataSize = size - (dataOffset - offset)
		const boxData = data.slice(dataOffset, dataOffset + boxDataSize)

		boxes.push({ type, size, data: boxData })

		offset = dataOffset + boxDataSize
	}

	return boxes
}

/**
 * Extract codestream from container
 */
function extractCodestream(data: Uint8Array): Uint8Array {
	const boxes = parseContainerBoxes(data)

	// Find jxlc box (complete codestream)
	const jxlcBox = boxes.find((box) => box.type === 0x6a786c63)
	if (jxlcBox) {
		return jxlcBox.data
	}

	// Find jxlp boxes (partial codestream) and concatenate
	const jxlpBoxes = boxes.filter((box) => box.type === 0x6a786c70)
	if (jxlpBoxes.length > 0) {
		const totalSize = jxlpBoxes.reduce((sum, box) => sum + box.data.length, 0)
		const codestream = new Uint8Array(totalSize)
		let offset = 0
		for (const box of jxlpBoxes) {
			codestream.set(box.data, offset)
			offset += box.data.length
		}
		return codestream
	}

	throw new Error('No codestream found in JXL container')
}

/**
 * Parse JXL image header
 */
function parseHeader(reader: BitReader): JxlHeader {
	// Read signature (already validated)
	reader.skip(2)

	// SizeHeader
	const div8 = reader.readBit()
	let height: number
	let width: number

	if (div8) {
		// Small image (< 2048)
		height = (reader.readBits(5) + 1) * 8
		const ratio = reader.readBits(3)

		switch (ratio) {
			case 0:
				width = height
				break
			case 1:
				width = (height * 12) / 10
				break
			case 2:
				width = (height * 4) / 3
				break
			case 3:
				width = (height * 3) / 2
				break
			case 4:
				width = (height * 16) / 9
				break
			case 5:
				width = (height * 5) / 4
				break
			case 6:
				width = height * 2
				break
			case 7:
			default:
				// Custom height and width
				width = (reader.readBits(5) + 1) * 8
				break
		}
	} else {
		// Larger images
		height = decodeVarInt(reader) + 1
		width = decodeVarInt(reader) + 1
	}

	// ImageMetadata
	const allDefault = reader.readBit()

	let bitDepth = 8
	let hasAlpha = false
	let colorSpace = ColorSpace.RGB
	let numExtraChannels = 0
	let orientation = 1

	if (!allDefault) {
		const extraFields = reader.readBit()

		// Orientation
		orientation = reader.readBits(3)

		if (extraFields) {
			// Have intrinsic size
			const haveIntrinsicSize = reader.readBit()
			if (haveIntrinsicSize) {
				// Skip intrinsic width/height
				decodeVarInt(reader)
				decodeVarInt(reader)
			}

			// Have preview
			const havePreview = reader.readBit()
			if (havePreview) {
				decodeVarInt(reader)
				decodeVarInt(reader)
			}

			// Have animation
			const haveAnimation = reader.readBit()
			if (haveAnimation) {
				// Animation metadata
				decodeVarInt(reader) // tps_numerator
				decodeVarInt(reader) // tps_denominator
				decodeVarInt(reader) // num_loops
				const haveTimecodes = reader.readBit()
				// Skip timecodes if present
				if (haveTimecodes) {
					// Would need to parse based on num_frames
				}
			}
		}

		// Bit depth
		const bitDepthField = reader.readBit()
		if (bitDepthField) {
			const expBits = reader.readBits(4)
			const mantissaBits = reader.readBits(expBits === 0 ? 0 : (expBits === 1 ? 2 : 4))
			bitDepth = expBits === 0 ? 8 : (1 << expBits) + mantissaBits
		}

		// Modular 16-bit buffer
		const mod16bit = reader.readBit()

		// Number of extra channels
		numExtraChannels = decodeVarInt(reader)

		// Parse extra channels
		for (let i = 0; i < numExtraChannels; i++) {
			const allDefaultEC = reader.readBit()
			if (!allDefaultEC) {
				const type = decodeVarInt(reader)
				const bitDepthEC = decodeVarInt(reader)
				const dimShift = decodeVarInt(reader)
				const nameLen = decodeVarInt(reader)
				// Skip name bytes
				reader.skip(nameLen)

				// Alpha channel
				if (type === 0) {
					hasAlpha = true
				}
			} else {
				// Default extra channel is alpha
				hasAlpha = true
			}
		}

		// XYB encoded
		const xybEncoded = reader.readBit()
		if (xybEncoded) {
			colorSpace = ColorSpace.XYB
		}

		// Color encoding
		const allDefaultColor = reader.readBit()
		if (!allDefaultColor) {
			const wantICC = reader.readBit()
			if (wantICC) {
				// Skip ICC profile
				const iccSize = decodeVarInt(reader)
				reader.skip(iccSize)
			} else {
				// Parse color encoding bundle
				const colorSpace = reader.readBits(2)
				// ... more color encoding fields (simplified for now)
			}
		}
	}

	return {
		width: Math.floor(width),
		height: Math.floor(height),
		bitDepth,
		colorSpace,
		hasAlpha,
		isLossy: false, // Will be determined by frame encoding
		encodingMode: EncodingMode.VarDCT,
		numExtraChannels,
		orientation,
	}
}

/**
 * Simplified JXL decoding - creates a placeholder image
 * Full JXL decoding requires complex entropy coding, transforms, and color space conversion
 * This implementation focuses on header parsing and creates a test pattern
 */
function decodeImage(data: Uint8Array, header: JxlHeader): ImageData {
	const { width, height, hasAlpha } = header

	// Create RGBA output
	const output = new Uint8Array(width * height * 4)

	// For now, create a gradient test pattern
	// A full decoder would parse frame headers, entropy-coded data, and apply transforms
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4

			// Create a gradient pattern for testing
			output[idx] = Math.floor((x / width) * 255) // R
			output[idx + 1] = Math.floor((y / height) * 255) // G
			output[idx + 2] = 128 // B
			output[idx + 3] = hasAlpha ? 255 : 255 // A
		}
	}

	return {
		width,
		height,
		data: output,
	}
}

/**
 * Decode JXL to ImageData
 *
 * Note: This is a simplified implementation that parses JXL headers and creates
 * placeholder image data. Full JXL decoding requires:
 * - ANS entropy decoding
 * - Modular/VarDCT decoding
 * - XYB to RGB color space conversion
 * - Adaptive quantization and noise synthesis
 * - Patch dictionary and spline reconstruction
 *
 * For production use, consider using a complete JXL library like libjxl via WASM.
 */
export function decodeJxl(data: Uint8Array): ImageData {
	// Check format
	let codestream: Uint8Array

	if (isContainer(data)) {
		codestream = extractCodestream(data)
	} else if (isCodestream(data)) {
		codestream = data
	} else {
		throw new Error('Invalid JXL signature')
	}

	// Verify codestream signature
	if (!isCodestream(codestream)) {
		throw new Error('Invalid JXL codestream signature')
	}

	// Parse header
	const reader = new BitReader(codestream)
	const header = parseHeader(reader)

	// Decode image (simplified)
	return decodeImage(codestream, header)
}

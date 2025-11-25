import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import {
	BayerPattern,
	RAF_HEADER_SIZE,
	RAF_MAGIC,
	RAF_VERSION,
	type RAFHeader,
} from './types'

/**
 * Binary writer for RAF files
 */
class RAFWriter {
	private buffer: number[] = []

	writeU8(value: number): void {
		this.buffer.push(value & 0xff)
	}

	writeU16BE(value: number): void {
		this.buffer.push((value >> 8) & 0xff)
		this.buffer.push(value & 0xff)
	}

	writeU32BE(value: number): void {
		this.buffer.push((value >> 24) & 0xff)
		this.buffer.push((value >> 16) & 0xff)
		this.buffer.push((value >> 8) & 0xff)
		this.buffer.push(value & 0xff)
	}

	writeString(str: string, length: number): void {
		const encoder = new TextEncoder()
		const bytes = encoder.encode(str)
		const padded = new Uint8Array(length)
		padded.set(bytes.slice(0, length))
		for (const byte of padded) {
			this.buffer.push(byte)
		}
	}

	writeBytes(data: Uint8Array): void {
		for (const byte of data) {
			this.buffer.push(byte)
		}
	}

	get position(): number {
		return this.buffer.length
	}

	setU32BE(offset: number, value: number): void {
		this.buffer[offset] = (value >> 24) & 0xff
		this.buffer[offset + 1] = (value >> 16) & 0xff
		this.buffer[offset + 2] = (value >> 8) & 0xff
		this.buffer[offset + 3] = value & 0xff
	}

	getData(): Uint8Array {
		return new Uint8Array(this.buffer)
	}
}

/**
 * Encode ImageData to RAF
 * Note: This creates a simplified RAF file with RGB to Bayer conversion
 */
export function encodeRaf(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	// Validate dimensions (must be even for Bayer pattern)
	if (width % 2 !== 0 || height % 2 !== 0) {
		throw new Error('RAF encoding requires even width and height for Bayer pattern')
	}

	const writer = new RAFWriter()

	// Write RAF header following the standard layout
	writer.writeString(RAF_MAGIC, 16) // Offset 0-15: Magic
	writer.writeString(RAF_VERSION, 4) // Offset 16-19: Version
	writer.writeString('', 4) // Offset 20-23: Reserved
	writer.writeString('mconv-generated', 32) // Offset 24-55: Camera model
	writer.writeString('', 16) // Offset 56-71: Reserved
	writer.writeString('0000', 4) // Offset 72-75: Direction
	writer.writeString('', 8) // Offset 76-83: Reserved

	// Write JPEG info at correct offsets (84-91)
	writer.writeU32BE(0) // JPEG offset (position 84)
	writer.writeU32BE(0) // JPEG length (position 88)

	// Write CFA info at correct offsets (92-99)
	writer.writeU32BE(0) // CFA header offset (position 92) - will update
	writer.writeU32BE(0) // CFA header length (position 96) - will update

	// Pad to header size (160 bytes)
	while (writer.position < RAF_HEADER_SIZE) {
		writer.writeU8(0)
	}

	// No embedded JPEG for simplicity
	// Convert RGB to Bayer RAW data
	const cfaHeaderOffset = writer.position
	writer.setU32BE(92, cfaHeaderOffset) // Update CFA offset at position 92

	// Write CFA header
	writer.writeU16BE(width) // Width
	writer.writeU16BE(height) // Height
	writer.writeU16BE(16) // Bits per sample
	writer.writeU8(BayerPattern.RGGB) // Bayer pattern
	writer.writeU8(0) // Reserved
	writer.writeU16BE(0) // Black level
	writer.writeU16BE(65535) // White level

	// Pad CFA header to 32 bytes
	while (writer.position - cfaHeaderOffset < 32) {
		writer.writeU8(0)
	}

	const cfaHeaderLength = writer.position - cfaHeaderOffset
	writer.setU32BE(96, cfaHeaderLength) // Update CFA length at position 96

	// Convert RGBA to Bayer pattern RAW data
	const rawData = convertToBayer(data, width, height, BayerPattern.RGGB)

	// Write raw data
	writer.writeBytes(rawData)

	return writer.getData()
}

/**
 * Convert RGB image to Bayer pattern RAW data
 */
function convertToBayer(
	data: Uint8Array,
	width: number,
	height: number,
	pattern: BayerPattern
): Uint8Array {
	// Output is 16-bit per pixel
	const output = new Uint8Array(width * height * 2)
	const view = new DataView(output.buffer)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const inIdx = (y * width + x) * 4
			const outIdx = y * width + x

			const r = data[inIdx]!
			const g = data[inIdx + 1]!
			const b = data[inIdx + 2]!

			// Determine which channel to use based on Bayer pattern
			const isEvenRow = y % 2 === 0
			const isEvenCol = x % 2 === 0

			let value = 0

			switch (pattern) {
				case BayerPattern.RGGB:
					if (isEvenRow && isEvenCol) {
						value = r // Red position
					} else if (isEvenRow && !isEvenCol) {
						value = g // Green position (R row)
					} else if (!isEvenRow && isEvenCol) {
						value = g // Green position (B row)
					} else {
						value = b // Blue position
					}
					break

				case BayerPattern.GRBG:
					if (isEvenRow && isEvenCol) {
						value = g
					} else if (isEvenRow && !isEvenCol) {
						value = r
					} else if (!isEvenRow && isEvenCol) {
						value = b
					} else {
						value = g
					}
					break

				case BayerPattern.GBRG:
					if (isEvenRow && isEvenCol) {
						value = g
					} else if (isEvenRow && !isEvenCol) {
						value = b
					} else if (!isEvenRow && isEvenCol) {
						value = r
					} else {
						value = g
					}
					break

				case BayerPattern.BGGR:
					if (isEvenRow && isEvenCol) {
						value = b
					} else if (isEvenRow && !isEvenCol) {
						value = g
					} else if (!isEvenRow && isEvenCol) {
						value = g
					} else {
						value = r
					}
					break

				default:
					// Fallback: use green channel
					value = g
			}

			// Scale 8-bit to 16-bit and write big-endian
			const scaled = (value << 8) | value
			view.setUint16(outIdx * 2, scaled, false)
		}
	}

	return output
}

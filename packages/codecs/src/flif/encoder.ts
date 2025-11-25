import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import { FLIF_SIGNATURE } from './types'

/**
 * Write varint (variable-length integer)
 */
function writeVarint(value: number): Uint8Array {
	const bytes: number[] = []

	while (value >= 0x80) {
		bytes.push((value & 0x7f) | 0x80)
		value >>>= 7
	}
	bytes.push(value & 0x7f)

	return new Uint8Array(bytes)
}

/**
 * Simple bit writer for exact value preservation
 */
class BitWriter {
	private output: number[] = []
	private currentByte: number = 0
	private bitOffset: number = 0

	/**
	 * Write a single bit
	 */
	writeBit(bit: number): void {
		this.currentByte = (this.currentByte << 1) | (bit & 1)
		this.bitOffset++

		if (this.bitOffset >= 8) {
			this.output.push(this.currentByte)
			this.currentByte = 0
			this.bitOffset = 0
		}
	}

	/**
	 * Write multiple bits from a number
	 */
	writeBits(value: number, numBits: number): void {
		for (let i = numBits - 1; i >= 0; i--) {
			this.writeBit((value >> i) & 1)
		}
	}

	/**
	 * Write a number in a range [min, max]
	 */
	writeUniform(value: number, min: number, max: number): void {
		if (min >= max) return

		const range = max - min
		const numBits = Math.ceil(Math.log2(range + 1))
		this.writeBits(value - min, numBits)
	}

	/**
	 * Finalize encoding and return bytes
	 */
	finalize(): Uint8Array {
		// Flush remaining bits
		if (this.bitOffset > 0) {
			this.currentByte = this.currentByte << (8 - this.bitOffset)
			this.output.push(this.currentByte)
		}

		return new Uint8Array(this.output)
	}
}

/**
 * MANIAC encoder - simplified version
 */
class ManiacEncoder {
	private writer: BitWriter

	constructor(writer: BitWriter) {
		this.writer = writer
	}

	/**
	 * Encode a symbol using MANIAC entropy coding
	 */
	encodeSymbol(symbol: number, context: number, min: number, max: number): void {
		if (min >= max) return

		// Use uniform distribution for simplicity
		this.writer.writeUniform(symbol, min, max)
	}
}

/**
 * Convert RGBA to planar format
 */
function rgbaToPlanes(
	data: Uint8Array,
	width: number,
	height: number,
	channels: number
): Uint8Array[] {
	const planes: Uint8Array[] = []

	for (let c = 0; c < channels; c++) {
		planes.push(new Uint8Array(width * height))
	}

	for (let i = 0; i < width * height; i++) {
		if (channels === 1) {
			// Grayscale - convert RGB to luminance
			const r = data[i * 4]!
			const g = data[i * 4 + 1]!
			const b = data[i * 4 + 2]!
			planes[0]![i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
		} else if (channels === 3) {
			// RGB
			planes[0]![i] = data[i * 4]!
			planes[1]![i] = data[i * 4 + 1]!
			planes[2]![i] = data[i * 4 + 2]!
		} else if (channels === 4) {
			// RGBA
			planes[0]![i] = data[i * 4]!
			planes[1]![i] = data[i * 4 + 1]!
			planes[2]![i] = data[i * 4 + 2]!
			planes[3]![i] = data[i * 4 + 3]!
		}
	}

	return planes
}

/**
 * Encode interlaced FLIF data
 */
function encodeInterlaced(
	maniac: ManiacEncoder,
	planes: Uint8Array[],
	width: number,
	height: number,
	channels: number,
	bitDepth: number
): void {
	const maxValue = (1 << bitDepth) - 1
	const zoomLevels = Math.ceil(Math.log2(Math.max(width, height)))

	for (let zoom = 0; zoom <= zoomLevels; zoom++) {
		const scale = 1 << (zoomLevels - zoom)
		const w = Math.ceil(width / scale)
		const h = Math.ceil(height / scale)

		// Encode pixels at this zoom level
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const px = x * scale
				const py = y * scale

				if (px >= width || py >= height) continue

				for (let c = 0; c < channels; c++) {
					const context = c * 1000 + (y % 8) * 100 + (x % 8)
					const value = planes[c]![py * width + px]!
					maniac.encodeSymbol(value, context, 0, maxValue)
				}
			}
		}
	}
}

/**
 * Encode non-interlaced FLIF data
 */
function encodeNonInterlaced(
	maniac: ManiacEncoder,
	planes: Uint8Array[],
	width: number,
	height: number,
	channels: number,
	bitDepth: number
): void {
	const maxValue = (1 << bitDepth) - 1

	// Encode scanline by scanline
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			for (let c = 0; c < channels; c++) {
				const context = c * 1000 + (y % 8) * 100 + (x % 8)
				const value = planes[c]![y * width + x]!
				maniac.encodeSymbol(value, context, 0, maxValue)
			}
		}
	}
}

/**
 * Create FLIF header
 */
function createHeader(
	width: number,
	height: number,
	channels: number,
	bitDepth: number,
	interlaced: boolean
): Uint8Array {
	const parts: Uint8Array[] = []

	// Signature
	parts.push(FLIF_SIGNATURE)

	// Format byte
	let formatByte = channels - 1
	if (interlaced) formatByte |= 0x10

	parts.push(new Uint8Array([formatByte]))

	// Bit depth
	parts.push(new Uint8Array([bitDepth - 1]))

	// Width and height
	parts.push(writeVarint(width - 1))
	parts.push(writeVarint(height - 1))

	// Calculate total size
	const totalSize = parts.reduce((sum, p) => sum + p.length, 0)
	const header = new Uint8Array(totalSize)

	let offset = 0
	for (const part of parts) {
		header.set(part, offset)
		offset += part.length
	}

	return header
}

/**
 * Encode ImageData to FLIF
 */
export function encodeFlif(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	// Determine parameters
	const interlaced = options?.interlaced ?? true
	const bitDepth = 8 // Fixed for now

	// Determine number of channels - check if alpha is used
	let hasAlpha = false
	for (let i = 3; i < data.length; i += 4) {
		if (data[i]! < 255) {
			hasAlpha = true
			break
		}
	}

	const channels = hasAlpha ? 4 : 3

	// Convert to planar format
	const planes = rgbaToPlanes(data, width, height, channels)

	// Create header
	const header = createHeader(width, height, channels, bitDepth, interlaced)

	// Initialize bit writer
	const writer = new BitWriter()

	// Initialize MANIAC encoder
	const maniac = new ManiacEncoder(writer)

	// Encode pixel data
	if (interlaced) {
		encodeInterlaced(maniac, planes, width, height, channels, bitDepth)
	} else {
		encodeNonInterlaced(maniac, planes, width, height, channels, bitDepth)
	}

	// Finalize encoding
	const encoded = writer.finalize()

	// Combine header and encoded data
	const output = new Uint8Array(header.length + encoded.length)
	output.set(header, 0)
	output.set(encoded, header.length)

	return output
}

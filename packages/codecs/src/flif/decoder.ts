import type { ImageData } from '@sylphx/codec-core'
import { FLIF_SIGNATURE, type FlifHeader } from './types'

/**
 * Read varint (variable-length integer)
 */
function readVarint(data: Uint8Array, offset: { value: number }): number {
	let result = 0
	let shift = 0

	while (offset.value < data.length) {
		const byte = data[offset.value++]!
		result |= (byte & 0x7f) << shift
		if ((byte & 0x80) === 0) {
			break
		}
		shift += 7
	}

	return result
}

/**
 * Parse FLIF header
 */
function parseHeader(data: Uint8Array): { header: FlifHeader; offset: number } {
	// Verify signature
	for (let i = 0; i < 4; i++) {
		if (data[i] !== FLIF_SIGNATURE[i]) {
			throw new Error('Invalid FLIF signature')
		}
	}

	let offset = 4

	// Read format byte
	const formatByte = data[offset++]!

	// Bits 7-4: interlacing and animation flags
	const interlaced = (formatByte & 0x10) !== 0
	const animated = (formatByte & 0x20) !== 0

	// Bits 3-0: number of channels
	const channels = (formatByte & 0x0f) + 1

	// Read bit depth
	const bitDepth = data[offset++]! + 1

	const offsetObj = { value: offset }

	// Read width and height
	const width = readVarint(data, offsetObj) + 1
	const height = readVarint(data, offsetObj) + 1

	// Read number of frames
	let numFrames = 1
	if (animated) {
		numFrames = readVarint(data, offsetObj) + 2
	}

	return {
		header: {
			width,
			height,
			channels,
			bitDepth,
			numFrames,
			flags: {
				interlaced,
				animated,
			},
		},
		offset: offsetObj.value,
	}
}

/**
 * Simple bit reader for exact value preservation
 */
class BitReader {
	private data: Uint8Array
	private offset: number
	private bitOffset: number

	constructor(data: Uint8Array, offset: number) {
		this.data = data
		this.offset = offset
		this.bitOffset = 0
	}

	/**
	 * Read a single bit
	 */
	readBit(): number {
		if (this.offset >= this.data.length) return 0

		const byte = this.data[this.offset]!
		const bit = (byte >> (7 - this.bitOffset)) & 1

		this.bitOffset++
		if (this.bitOffset >= 8) {
			this.bitOffset = 0
			this.offset++
		}

		return bit
	}

	/**
	 * Read multiple bits as a number
	 */
	readBits(numBits: number): number {
		let result = 0
		for (let i = 0; i < numBits; i++) {
			result = (result << 1) | this.readBit()
		}
		return result
	}

	/**
	 * Read a number in a range [min, max]
	 */
	readUniform(min: number, max: number): number {
		if (min >= max) return min

		const range = max - min
		const numBits = Math.ceil(Math.log2(range + 1))

		let value: number
		do {
			value = this.readBits(numBits)
		} while (value > range)

		return min + value
	}
}

/**
 * MANIAC decoder - simplified version
 */
class ManiacDecoder {
	private reader: BitReader

	constructor(reader: BitReader) {
		this.reader = reader
	}

	/**
	 * Decode a symbol using MANIAC entropy coding
	 */
	decodeSymbol(context: number, min: number, max: number): number {
		if (min >= max) return min

		// Use uniform distribution for simplicity
		return this.reader.readUniform(min, max)
	}
}

/**
 * Decode interlaced FLIF data
 */
function decodeInterlaced(
	maniac: ManiacDecoder,
	width: number,
	height: number,
	channels: number,
	bitDepth: number
): Uint8Array[] {
	const planes: Uint8Array[] = []
	const maxValue = (1 << bitDepth) - 1

	// Initialize planes
	for (let c = 0; c < channels; c++) {
		planes.push(new Uint8Array(width * height))
	}

	// FLIF uses a specific interlacing pattern with multiple zoom levels
	// This is a simplified version that decodes progressively
	const zoomLevels = Math.ceil(Math.log2(Math.max(width, height)))

	for (let zoom = 0; zoom <= zoomLevels; zoom++) {
		const scale = 1 << (zoomLevels - zoom)
		const w = Math.ceil(width / scale)
		const h = Math.ceil(height / scale)

		// Decode pixels at this zoom level
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const px = x * scale
				const py = y * scale

				if (px >= width || py >= height) continue

				for (let c = 0; c < channels; c++) {
					const context = c * 1000 + (y % 8) * 100 + (x % 8)
					const value = maniac.decodeSymbol(context, 0, maxValue)
					planes[c]![py * width + px] = value
				}
			}
		}
	}

	return planes
}

/**
 * Decode non-interlaced FLIF data
 */
function decodeNonInterlaced(
	maniac: ManiacDecoder,
	width: number,
	height: number,
	channels: number,
	bitDepth: number
): Uint8Array[] {
	const planes: Uint8Array[] = []
	const maxValue = (1 << bitDepth) - 1

	// Initialize planes
	for (let c = 0; c < channels; c++) {
		planes.push(new Uint8Array(width * height))
	}

	// Decode scanline by scanline
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			for (let c = 0; c < channels; c++) {
				const context = c * 1000 + (y % 8) * 100 + (x % 8)
				const value = maniac.decodeSymbol(context, 0, maxValue)
				planes[c]![y * width + x] = value
			}
		}
	}

	return planes
}

/**
 * Convert planar data to RGBA
 */
function planesToRGBA(planes: Uint8Array[], width: number, height: number, channels: number): Uint8Array {
	const rgba = new Uint8Array(width * height * 4)

	for (let i = 0; i < width * height; i++) {
		if (channels === 1) {
			// Grayscale
			const gray = planes[0]![i]!
			rgba[i * 4] = gray
			rgba[i * 4 + 1] = gray
			rgba[i * 4 + 2] = gray
			rgba[i * 4 + 3] = 255
		} else if (channels === 3) {
			// RGB
			rgba[i * 4] = planes[0]![i]!
			rgba[i * 4 + 1] = planes[1]![i]!
			rgba[i * 4 + 2] = planes[2]![i]!
			rgba[i * 4 + 3] = 255
		} else if (channels === 4) {
			// RGBA
			rgba[i * 4] = planes[0]![i]!
			rgba[i * 4 + 1] = planes[1]![i]!
			rgba[i * 4 + 2] = planes[2]![i]!
			rgba[i * 4 + 3] = planes[3]![i]!
		}
	}

	return rgba
}

/**
 * Decode FLIF to ImageData
 */
export function decodeFlif(data: Uint8Array): ImageData {
	// Parse header
	const { header, offset } = parseHeader(data)

	if (header.flags.animated) {
		throw new Error('Animated FLIF files not yet supported')
	}

	// Initialize bit reader
	const reader = new BitReader(data, offset)

	// Initialize MANIAC decoder
	const maniac = new ManiacDecoder(reader)

	// Decode pixel data
	const planes = header.flags.interlaced
		? decodeInterlaced(maniac, header.width, header.height, header.channels, header.bitDepth)
		: decodeNonInterlaced(maniac, header.width, header.height, header.channels, header.bitDepth)

	// Convert to RGBA
	const rgba = planesToRGBA(planes, header.width, header.height, header.channels)

	return {
		width: header.width,
		height: header.height,
		data: rgba,
	}
}

import type { ImageData } from '@mconv/core'
import { inflate } from './inflate'
import { type ColorType, type IHDRData, PNG_SIGNATURE, type PngChunk } from './types'

/**
 * Read 32-bit big-endian unsigned integer
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
 * Calculate CRC32
 */
const crcTable: number[] = []
for (let n = 0; n < 256; n++) {
	let c = n
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	}
	crcTable[n] = c
}

function crc32(data: Uint8Array, start: number, length: number): number {
	let crc = 0xffffffff
	for (let i = start; i < start + length; i++) {
		crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
	}
	return (crc ^ 0xffffffff) >>> 0
}

/**
 * Parse PNG chunks
 */
function parseChunks(data: Uint8Array): PngChunk[] {
	const chunks: PngChunk[] = []
	let offset = 8 // Skip signature

	while (offset < data.length) {
		const length = readU32BE(data, offset)
		const type = readU32BE(data, offset + 4)
		const chunkData = data.slice(offset + 8, offset + 8 + length)
		const expectedCrc = readU32BE(data, offset + 8 + length)

		// Verify CRC
		const actualCrc = crc32(data, offset + 4, length + 4)
		if (actualCrc !== expectedCrc) {
			throw new Error(
				`CRC mismatch in chunk ${String.fromCharCode((type >> 24) & 0xff, (type >> 16) & 0xff, (type >> 8) & 0xff, type & 0xff)}`
			)
		}

		chunks.push({ type, data: chunkData })
		offset += 12 + length

		// Stop at IEND
		if (type === 0x49454e44) break
	}

	return chunks
}

/**
 * Parse IHDR chunk
 */
function parseIHDR(data: Uint8Array): IHDRData {
	if (data.length !== 13) {
		throw new Error('Invalid IHDR chunk length')
	}

	return {
		width: readU32BE(data, 0),
		height: readU32BE(data, 4),
		bitDepth: data[8]!,
		colorType: data[9]! as ColorType,
		compressionMethod: data[10]!,
		filterMethod: data[11]!,
		interlaceMethod: data[12]!,
	}
}

/**
 * Get bytes per pixel based on color type and bit depth
 */
function getBytesPerPixel(colorType: ColorType, bitDepth: number): number {
	const channels =
		colorType === 0
			? 1
			: // Grayscale
				colorType === 2
				? 3
				: // RGB
					colorType === 3
					? 1
					: // Indexed
						colorType === 4
						? 2
						: // Grayscale + Alpha
							colorType === 6
							? 4
							: // RGBA
								0

	return Math.ceil((channels * bitDepth) / 8)
}

/**
 * Paeth predictor function
 */
function paethPredictor(a: number, b: number, c: number): number {
	const p = a + b - c
	const pa = Math.abs(p - a)
	const pb = Math.abs(p - b)
	const pc = Math.abs(p - c)

	if (pa <= pb && pa <= pc) return a
	if (pb <= pc) return b
	return c
}

/**
 * Unfilter a scanline
 */
function unfilterScanline(
	filter: number,
	current: Uint8Array,
	previous: Uint8Array | null,
	bpp: number
): void {
	const len = current.length

	switch (filter) {
		case 0: // None
			break

		case 1: // Sub
			for (let i = bpp; i < len; i++) {
				current[i] = (current[i]! + current[i - bpp]!) & 0xff
			}
			break

		case 2: // Up
			if (previous) {
				for (let i = 0; i < len; i++) {
					current[i] = (current[i]! + previous[i]!) & 0xff
				}
			}
			break

		case 3: // Average
			for (let i = 0; i < len; i++) {
				const a = i >= bpp ? current[i - bpp]! : 0
				const b = previous ? previous[i]! : 0
				current[i] = (current[i]! + Math.floor((a + b) / 2)) & 0xff
			}
			break

		case 4: // Paeth
			for (let i = 0; i < len; i++) {
				const a = i >= bpp ? current[i - bpp]! : 0
				const b = previous ? previous[i]! : 0
				const c = i >= bpp && previous ? previous[i - bpp]! : 0
				current[i] = (current[i]! + paethPredictor(a, b, c)) & 0xff
			}
			break

		default:
			throw new Error(`Unknown filter type: ${filter}`)
	}
}

/**
 * Convert raw pixels to RGBA
 */
function toRGBA(
	raw: Uint8Array,
	width: number,
	height: number,
	colorType: ColorType,
	bitDepth: number,
	palette?: Uint8Array,
	transparency?: Uint8Array
): Uint8Array {
	const output = new Uint8Array(width * height * 4)
	const bpp = getBytesPerPixel(colorType, bitDepth)
	const scanlineBytes = Math.ceil((width * bpp * 8) / 8)

	let rawOffset = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const outIdx = (y * width + x) * 4
			let r = 0
			let g = 0
			let b = 0
			let a = 255

			switch (colorType) {
				case 0: // Grayscale
					if (bitDepth === 16) {
						const v = raw[rawOffset]!
						r = g = b = v
						rawOffset += 2
					} else if (bitDepth === 8) {
						r = g = b = raw[rawOffset++]!
					} else {
						// 1, 2, 4 bit
						const byteIdx = rawOffset + Math.floor((x * bitDepth) / 8)
						const bitIdx = 8 - bitDepth - ((x * bitDepth) % 8)
						const mask = (1 << bitDepth) - 1
						const v = (raw[byteIdx]! >> bitIdx) & mask
						const scale = 255 / mask
						r = g = b = Math.round(v * scale)
						if (x === width - 1) rawOffset += Math.ceil((width * bitDepth) / 8)
					}
					// Check transparency
					if (transparency && transparency.length >= 2) {
						const transVal = (transparency[0]! << 8) | transparency[1]!
						const maxVal = (1 << bitDepth) - 1
						if (bitDepth <= 8) {
							const pixelVal = (r * maxVal) / 255
							if (Math.round(pixelVal) === transVal) a = 0
						}
					}
					break

				case 2: // RGB
					if (bitDepth === 16) {
						r = raw[rawOffset]!
						g = raw[rawOffset + 2]!
						b = raw[rawOffset + 4]!
						rawOffset += 6
					} else {
						r = raw[rawOffset++]!
						g = raw[rawOffset++]!
						b = raw[rawOffset++]!
					}
					// Check transparency
					if (transparency && transparency.length >= 6) {
						const tr = (transparency[0]! << 8) | transparency[1]!
						const tg = (transparency[2]! << 8) | transparency[3]!
						const tb = (transparency[4]! << 8) | transparency[5]!
						if (bitDepth === 8 && r === (tr & 0xff) && g === (tg & 0xff) && b === (tb & 0xff)) {
							a = 0
						}
					}
					break

				case 3: // Indexed
					{
						let idx: number
						if (bitDepth === 8) {
							idx = raw[rawOffset++]!
						} else {
							const byteIdx = rawOffset + Math.floor((x * bitDepth) / 8)
							const bitIdx = 8 - bitDepth - ((x * bitDepth) % 8)
							const mask = (1 << bitDepth) - 1
							idx = (raw[byteIdx]! >> bitIdx) & mask
							if (x === width - 1) rawOffset += Math.ceil((width * bitDepth) / 8)
						}
						if (palette) {
							r = palette[idx * 3]!
							g = palette[idx * 3 + 1]!
							b = palette[idx * 3 + 2]!
						}
						if (transparency && idx < transparency.length) {
							a = transparency[idx]!
						}
					}
					break

				case 4: // Grayscale + Alpha
					if (bitDepth === 16) {
						r = g = b = raw[rawOffset]!
						a = raw[rawOffset + 2]!
						rawOffset += 4
					} else {
						r = g = b = raw[rawOffset++]!
						a = raw[rawOffset++]!
					}
					break

				case 6: // RGBA
					if (bitDepth === 16) {
						r = raw[rawOffset]!
						g = raw[rawOffset + 2]!
						b = raw[rawOffset + 4]!
						a = raw[rawOffset + 6]!
						rawOffset += 8
					} else {
						r = raw[rawOffset++]!
						g = raw[rawOffset++]!
						b = raw[rawOffset++]!
						a = raw[rawOffset++]!
					}
					break
			}

			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = a
		}

		// For sub-byte formats, advance rawOffset at end of scanline
		if (colorType === 0 && bitDepth < 8) {
			// Already handled in the loop
		} else if (colorType === 3 && bitDepth < 8) {
			// Already handled in the loop
		}
	}

	return output
}

/**
 * Decode PNG to ImageData
 */
export function decodePng(data: Uint8Array): ImageData {
	// Verify signature
	for (let i = 0; i < 8; i++) {
		if (data[i] !== PNG_SIGNATURE[i]) {
			throw new Error('Invalid PNG signature')
		}
	}

	// Parse chunks
	const chunks = parseChunks(data)

	// Get IHDR
	const ihdrChunk = chunks.find((c) => c.type === 0x49484452)
	if (!ihdrChunk) {
		throw new Error('Missing IHDR chunk')
	}
	const ihdr = parseIHDR(ihdrChunk.data)

	// Validate
	if (ihdr.compressionMethod !== 0) {
		throw new Error('Unknown compression method')
	}
	if (ihdr.filterMethod !== 0) {
		throw new Error('Unknown filter method')
	}
	if (ihdr.interlaceMethod !== 0 && ihdr.interlaceMethod !== 1) {
		throw new Error('Unknown interlace method')
	}
	if (ihdr.interlaceMethod === 1) {
		throw new Error('Adam7 interlacing not yet supported')
	}

	// Get PLTE (palette)
	const plteChunk = chunks.find((c) => c.type === 0x504c5445)
	const palette = plteChunk?.data

	// Get tRNS (transparency)
	const trnsChunk = chunks.find((c) => c.type === 0x74524e53)
	const transparency = trnsChunk?.data

	// Concatenate IDAT chunks
	const idatChunks = chunks.filter((c) => c.type === 0x49444154)
	const compressedLength = idatChunks.reduce((sum, c) => sum + c.data.length, 0)
	const compressed = new Uint8Array(compressedLength)
	let offset = 0
	for (const chunk of idatChunks) {
		compressed.set(chunk.data, offset)
		offset += chunk.data.length
	}

	// Decompress
	const decompressed = inflate(compressed)

	// Calculate scanline parameters
	const bpp = getBytesPerPixel(ihdr.colorType, ihdr.bitDepth)
	const scanlineBytes = Math.ceil((ihdr.width * bpp * ihdr.bitDepth) / 8)
	const expectedBytes = (scanlineBytes + 1) * ihdr.height // +1 for filter byte

	if (decompressed.length < expectedBytes) {
		throw new Error(`Decompressed data too short: ${decompressed.length} < ${expectedBytes}`)
	}

	// Unfilter scanlines
	const raw = new Uint8Array(scanlineBytes * ihdr.height)
	let prevScanline: Uint8Array | null = null

	for (let y = 0; y < ihdr.height; y++) {
		const filterByte = decompressed[y * (scanlineBytes + 1)]!
		const scanline = decompressed.slice(
			y * (scanlineBytes + 1) + 1,
			y * (scanlineBytes + 1) + 1 + scanlineBytes
		)

		// Make a copy for unfiltering
		const currentScanline = new Uint8Array(scanline)
		unfilterScanline(filterByte, currentScanline, prevScanline, bpp)

		// Store unfiltered scanline
		raw.set(currentScanline, y * scanlineBytes)
		prevScanline = currentScanline
	}

	// Convert to RGBA
	const rgba = toRGBA(
		raw,
		ihdr.width,
		ihdr.height,
		ihdr.colorType,
		ihdr.bitDepth,
		palette,
		transparency
	)

	return {
		width: ihdr.width,
		height: ihdr.height,
		data: rgba,
	}
}

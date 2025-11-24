import type { EncodeOptions, ImageData } from '@mconv/core'
import { deflate } from './deflate'
import { ColorType, FilterType, PNG_SIGNATURE } from './types'

/**
 * Write 32-bit big-endian unsigned integer
 */
function writeU32BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 24) & 0xff
	data[offset + 1] = (value >> 16) & 0xff
	data[offset + 2] = (value >> 8) & 0xff
	data[offset + 3] = value & 0xff
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
 * Create a PNG chunk
 */
function createChunk(type: string, data: Uint8Array): Uint8Array {
	const chunk = new Uint8Array(12 + data.length)

	// Length
	writeU32BE(chunk, 0, data.length)

	// Type
	chunk[4] = type.charCodeAt(0)
	chunk[5] = type.charCodeAt(1)
	chunk[6] = type.charCodeAt(2)
	chunk[7] = type.charCodeAt(3)

	// Data
	chunk.set(data, 8)

	// CRC (over type + data)
	const crc = crc32(chunk, 4, data.length + 4)
	writeU32BE(chunk, 8 + data.length, crc)

	return chunk
}

/**
 * Create IHDR chunk
 */
function createIHDR(width: number, height: number): Uint8Array {
	const data = new Uint8Array(13)
	writeU32BE(data, 0, width)
	writeU32BE(data, 4, height)
	data[8] = 8 // Bit depth
	data[9] = ColorType.RGBA // Color type
	data[10] = 0 // Compression method
	data[11] = 0 // Filter method
	data[12] = 0 // Interlace method
	return createChunk('IHDR', data)
}

/**
 * Paeth predictor
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
 * Apply filter to scanline and return filtered data with filter byte
 */
function filterScanline(
	current: Uint8Array,
	previous: Uint8Array | null,
	bpp: number,
	filterType: FilterType
): Uint8Array {
	const len = current.length
	const filtered = new Uint8Array(len + 1)
	filtered[0] = filterType

	switch (filterType) {
		case FilterType.None:
			filtered.set(current, 1)
			break

		case FilterType.Sub:
			for (let i = 0; i < len; i++) {
				const a = i >= bpp ? current[i - bpp]! : 0
				filtered[i + 1] = (current[i]! - a) & 0xff
			}
			break

		case FilterType.Up:
			for (let i = 0; i < len; i++) {
				const b = previous ? previous[i]! : 0
				filtered[i + 1] = (current[i]! - b) & 0xff
			}
			break

		case FilterType.Average:
			for (let i = 0; i < len; i++) {
				const a = i >= bpp ? current[i - bpp]! : 0
				const b = previous ? previous[i]! : 0
				filtered[i + 1] = (current[i]! - Math.floor((a + b) / 2)) & 0xff
			}
			break

		case FilterType.Paeth:
			for (let i = 0; i < len; i++) {
				const a = i >= bpp ? current[i - bpp]! : 0
				const b = previous ? previous[i]! : 0
				const c = i >= bpp && previous ? previous[i - bpp]! : 0
				filtered[i + 1] = (current[i]! - paethPredictor(a, b, c)) & 0xff
			}
			break
	}

	return filtered
}

/**
 * Calculate sum of absolute values (for filter selection)
 */
function sumAbsolute(data: Uint8Array): number {
	let sum = 0
	for (let i = 1; i < data.length; i++) {
		// Treat as signed byte
		const v = data[i]!
		sum += v < 128 ? v : 256 - v
	}
	return sum
}

/**
 * Select best filter for scanline
 */
function selectFilter(current: Uint8Array, previous: Uint8Array | null, bpp: number): Uint8Array {
	let bestFilter = FilterType.None
	let bestFiltered = filterScanline(current, previous, bpp, FilterType.None)
	let bestSum = sumAbsolute(bestFiltered)

	for (const filterType of [FilterType.Sub, FilterType.Up, FilterType.Average, FilterType.Paeth]) {
		const filtered = filterScanline(current, previous, bpp, filterType)
		const sum = sumAbsolute(filtered)
		if (sum < bestSum) {
			bestSum = sum
			bestFilter = filterType
			bestFiltered = filtered
		}
	}

	return bestFiltered
}

/**
 * Create IDAT chunk(s)
 */
function createIDAT(image: ImageData): Uint8Array[] {
	const { width, height, data } = image
	const bpp = 4 // RGBA
	const scanlineBytes = width * bpp

	// Filter scanlines
	const filteredData = new Uint8Array((scanlineBytes + 1) * height)
	let prevScanline: Uint8Array | null = null
	let offset = 0

	for (let y = 0; y < height; y++) {
		const scanline = data.slice(y * scanlineBytes, (y + 1) * scanlineBytes)
		const filtered = selectFilter(scanline, prevScanline, bpp)
		filteredData.set(filtered, offset)
		offset += filtered.length
		prevScanline = scanline
	}

	// Compress
	const compressed = deflate(filteredData)

	// Create IDAT chunk
	return [createChunk('IDAT', compressed)]
}

/**
 * Create IEND chunk
 */
function createIEND(): Uint8Array {
	return createChunk('IEND', new Uint8Array(0))
}

/**
 * Encode ImageData to PNG
 */
export function encodePng(image: ImageData, _options?: EncodeOptions): Uint8Array {
	const { width, height } = image

	// Create chunks
	const ihdr = createIHDR(width, height)
	const idatChunks = createIDAT(image)
	const iend = createIEND()

	// Calculate total size
	const totalSize =
		PNG_SIGNATURE.length +
		ihdr.length +
		idatChunks.reduce((sum, c) => sum + c.length, 0) +
		iend.length

	// Assemble PNG
	const output = new Uint8Array(totalSize)
	let offset = 0

	// Signature
	output.set(PNG_SIGNATURE, offset)
	offset += PNG_SIGNATURE.length

	// IHDR
	output.set(ihdr, offset)
	offset += ihdr.length

	// IDAT(s)
	for (const idat of idatChunks) {
		output.set(idat, offset)
		offset += idat.length
	}

	// IEND
	output.set(iend, offset)

	return output
}

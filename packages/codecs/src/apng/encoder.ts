import type { EncodeOptions, VideoData } from '@sylphx/codec-core'
import {
	ApngChunkType,
	BlendOp,
	ColorType,
	DisposeOp,
	type FrameControl,
	PNG_SIGNATURE,
} from './types'

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
 * Write 16-bit big-endian unsigned integer
 */
function writeU16BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 8) & 0xff
	data[offset + 1] = value & 0xff
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
 * Filter scanline for compression
 * Uses Sub filter (type 1) for simplicity
 */
function filterScanline(current: Uint8Array, previous: Uint8Array | null, bpp: number): Uint8Array {
	const filtered = new Uint8Array(current.length + 1)
	filtered[0] = 1 // Sub filter

	for (let i = 0; i < current.length; i++) {
		const a = i >= bpp ? current[i - bpp]! : 0
		filtered[i + 1] = (current[i]! - a) & 0xff
	}

	return filtered
}

/**
 * Compress frame data
 */
function compressFrameData(data: Uint8Array, width: number, height: number): Uint8Array {
	// Import deflate from PNG codec
	const { deflate } = require('../png/deflate')

	const bpp = 4 // RGBA
	const scanlineBytes = width * bpp

	// Filter scanlines
	const filteredData = new Uint8Array((scanlineBytes + 1) * height)
	let prevScanline: Uint8Array | null = null
	let offset = 0

	for (let y = 0; y < height; y++) {
		const scanline = data.slice(y * scanlineBytes, (y + 1) * scanlineBytes)
		const filtered = filterScanline(scanline, prevScanline, bpp)
		filteredData.set(filtered, offset)
		offset += filtered.length
		prevScanline = scanline
	}

	// Compress
	return deflate(filteredData)
}

/**
 * Concatenate Uint8Arrays
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
	const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
	const result = new Uint8Array(totalLength)
	let offset = 0
	for (const arr of arrays) {
		result.set(arr, offset)
		offset += arr.length
	}
	return result
}

/**
 * Calculate GCD (Greatest Common Divisor)
 */
function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b)
}

/**
 * Simplify fraction to fit in 16-bit values
 */
function simplifyFraction(num: number, den: number): [number, number] {
	// First simplify
	const d = gcd(num, den)
	let n = num / d
	let de = den / d

	// Scale down if needed to fit in 16 bits
	while (n > 65535 || de > 65535) {
		n = Math.floor(n / 2)
		de = Math.floor(de / 2)
	}

	return [Math.max(1, n), Math.max(1, de)]
}

/**
 * Encode VideoData to APNG
 */
export function encodeApng(video: VideoData, _options?: EncodeOptions): Uint8Array {
	const { width, height, frames } = video

	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const chunks: Uint8Array[] = []
	let sequenceNumber = 0

	// Signature
	chunks.push(PNG_SIGNATURE)

	// IHDR
	const ihdrData = new Uint8Array(13)
	writeU32BE(ihdrData, 0, width)
	writeU32BE(ihdrData, 4, height)
	ihdrData[8] = 8 // Bit depth
	ihdrData[9] = ColorType.RGBA // Color type
	ihdrData[10] = 0 // Compression method
	ihdrData[11] = 0 // Filter method
	ihdrData[12] = 0 // Interlace method
	chunks.push(createChunk('IHDR', ihdrData))

	// acTL (Animation Control)
	const actlData = new Uint8Array(8)
	writeU32BE(actlData, 0, frames.length) // num_frames
	writeU32BE(actlData, 4, 0) // num_plays (0 = infinite)
	chunks.push(createChunk('acTL', actlData))

	// Encode frames
	for (let i = 0; i < frames.length; i++) {
		const frame = frames[i]!
		const { image, duration } = frame

		// Validate frame dimensions
		if (image.width !== width || image.height !== height) {
			throw new Error(
				`Frame ${i} dimensions (${image.width}x${image.height}) don't match video dimensions (${width}x${height})`
			)
		}

		// Calculate delay as fraction
		const delayMs = duration || 100
		let delayNum = Math.round(delayMs)
		let delayDen = 1000

		// Simplify fraction to fit in 16 bits
		;[delayNum, delayDen] = simplifyFraction(delayNum, delayDen)

		// fcTL (Frame Control)
		const fctlData = new Uint8Array(26)
		writeU32BE(fctlData, 0, sequenceNumber++) // sequence_number
		writeU32BE(fctlData, 4, image.width) // width
		writeU32BE(fctlData, 8, image.height) // height
		writeU32BE(fctlData, 12, 0) // x_offset
		writeU32BE(fctlData, 16, 0) // y_offset
		writeU16BE(fctlData, 20, delayNum) // delay_num
		writeU16BE(fctlData, 22, delayDen) // delay_den
		fctlData[24] = DisposeOp.None // dispose_op
		fctlData[25] = BlendOp.Source // blend_op
		chunks.push(createChunk('fcTL', fctlData))

		// Compress frame data
		const compressed = compressFrameData(image.data, image.width, image.height)

		if (i === 0) {
			// First frame uses IDAT
			chunks.push(createChunk('IDAT', compressed))
		} else {
			// Subsequent frames use fdAT
			const fdatData = new Uint8Array(4 + compressed.length)
			writeU32BE(fdatData, 0, sequenceNumber++) // sequence_number
			fdatData.set(compressed, 4)
			chunks.push(createChunk('fdAT', fdatData))
		}
	}

	// IEND
	chunks.push(createChunk('IEND', new Uint8Array(0)))

	// Combine all chunks
	return concatUint8Arrays(chunks)
}

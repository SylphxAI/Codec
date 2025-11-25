import type { EncodeOptions, ImageData, VideoData } from '@sylphx/codec-core'
import {
	type SwfRGB,
	type SwfRect,
	SwfTagType,
	SWF_UNCOMPRESSED,
	TWIPS_PER_PIXEL,
} from './types'

// NOTE: Using uncompressed SWF (FWS) format for browser compatibility.
// Compressed SWF (CWS) requires zlib which is not available in browser builds.

/**
 * Create zlib-wrapped data using stored (uncompressed) deflate blocks.
 * This is valid zlib but doesn't actually compress - just wraps data.
 */
function deflateStore(data: Uint8Array): Uint8Array {
	// Calculate Adler-32 checksum
	let s1 = 1
	let s2 = 0
	for (let i = 0; i < data.length; i++) {
		s1 = (s1 + data[i]!) % 65521
		s2 = (s2 + s1) % 65521
	}
	const adler32 = ((s2 << 16) | s1) >>> 0

	// Split into 65535-byte blocks (max for stored blocks)
	const MAX_BLOCK_SIZE = 65535
	const numBlocks = Math.ceil(data.length / MAX_BLOCK_SIZE) || 1

	// Calculate output size: zlib header (2) + blocks + adler32 (4)
	let outputSize = 2 + 4 // header + checksum
	for (let i = 0; i < numBlocks; i++) {
		const blockStart = i * MAX_BLOCK_SIZE
		const blockSize = Math.min(MAX_BLOCK_SIZE, data.length - blockStart)
		outputSize += 5 + blockSize // block header (5) + data
	}

	const output = new Uint8Array(outputSize)
	let pos = 0

	// Zlib header: CMF=0x78 (deflate, 32K window), FLG=0x01 (no dict, level 0)
	output[pos++] = 0x78
	output[pos++] = 0x01

	// Write deflate blocks
	for (let i = 0; i < numBlocks; i++) {
		const blockStart = i * MAX_BLOCK_SIZE
		const blockSize = Math.min(MAX_BLOCK_SIZE, data.length - blockStart)
		const isLast = i === numBlocks - 1

		// Block header: BFINAL (1 bit) + BTYPE=00 (2 bits) = stored block
		output[pos++] = isLast ? 0x01 : 0x00

		// LEN (2 bytes, little-endian)
		output[pos++] = blockSize & 0xff
		output[pos++] = (blockSize >> 8) & 0xff

		// NLEN (one's complement of LEN)
		output[pos++] = ~blockSize & 0xff
		output[pos++] = (~blockSize >> 8) & 0xff

		// Block data
		output.set(data.subarray(blockStart, blockStart + blockSize), pos)
		pos += blockSize
	}

	// Adler-32 checksum (big-endian)
	output[pos++] = (adler32 >> 24) & 0xff
	output[pos++] = (adler32 >> 16) & 0xff
	output[pos++] = (adler32 >> 8) & 0xff
	output[pos++] = adler32 & 0xff

	return output
}

/**
 * Bit writer for SWF format
 */
class BitWriter {
	private bytes: number[] = []
	private currentByte = 0
	private bitPos = 0

	writeBits(value: number, count: number): void {
		for (let i = count - 1; i >= 0; i--) {
			const bit = (value >> i) & 1
			this.currentByte = (this.currentByte << 1) | bit
			this.bitPos++

			if (this.bitPos === 8) {
				this.bytes.push(this.currentByte)
				this.currentByte = 0
				this.bitPos = 0
			}
		}
	}

	writeSignedBits(value: number, count: number): void {
		// Handle negative numbers with two's complement
		if (value < 0) {
			value = (1 << count) + value
		}
		// Mask to ensure we only write 'count' bits
		value = value & ((1 << count) - 1)
		this.writeBits(value, count)
	}

	alignByte(): void {
		if (this.bitPos !== 0) {
			this.currentByte <<= 8 - this.bitPos
			this.bytes.push(this.currentByte)
			this.currentByte = 0
			this.bitPos = 0
		}
	}

	writeUint8(value: number): void {
		this.alignByte()
		this.bytes.push(value & 0xff)
	}

	writeUint16(value: number): void {
		this.alignByte()
		this.bytes.push(value & 0xff)
		this.bytes.push((value >> 8) & 0xff)
	}

	writeUint32(value: number): void {
		this.alignByte()
		this.bytes.push(value & 0xff)
		this.bytes.push((value >> 8) & 0xff)
		this.bytes.push((value >> 16) & 0xff)
		this.bytes.push((value >> 24) & 0xff)
	}

	writeBytes(data: Uint8Array): void {
		this.alignByte()
		for (const byte of data) {
			this.bytes.push(byte)
		}
	}

	toUint8Array(): Uint8Array {
		this.alignByte()
		return new Uint8Array(this.bytes)
	}
}

/**
 * Calculate minimum bits needed to represent signed value
 */
function calculateBits(value: number): number {
	if (value === 0) return 1

	// For signed values, we need enough bits to represent the magnitude
	// plus one bit for the sign
	const absValue = Math.abs(value)
	let bits = 0
	let temp = absValue
	while (temp > 0) {
		bits++
		temp >>= 1
	}

	// For negative numbers, check if sign bit would collide with magnitude
	// For positive numbers, add 1 for sign bit
	if (value < 0) {
		// Check if -value fits in bits without sign extension issues
		return bits + 1
	} else {
		// Positive values need 1 more bit for sign
		return bits + 1
	}
}

/**
 * Write SWF rectangle
 */
function writeRect(writer: BitWriter, rect: SwfRect): void {
	const nBits = Math.max(
		calculateBits(rect.xMin),
		calculateBits(rect.xMax),
		calculateBits(rect.yMin),
		calculateBits(rect.yMax)
	)

	writer.writeBits(nBits, 5)
	writer.writeSignedBits(rect.xMin, nBits)
	writer.writeSignedBits(rect.xMax, nBits)
	writer.writeSignedBits(rect.yMin, nBits)
	writer.writeSignedBits(rect.yMax, nBits)
	writer.alignByte()
}

/**
 * Write SWF RGB color
 */
function writeRGB(writer: BitWriter, color: SwfRGB): void {
	writer.writeUint8(color.red)
	writer.writeUint8(color.green)
	writer.writeUint8(color.blue)
}

/**
 * Write SWF tag
 */
function writeTag(writer: BitWriter, tagType: SwfTagType, data: Uint8Array): void {
	const length = data.length

	if (length < 0x3f) {
		// Short form
		writer.writeUint16((tagType << 6) | length)
	} else {
		// Long form
		writer.writeUint16((tagType << 6) | 0x3f)
		writer.writeUint32(length)
	}

	writer.writeBytes(data)
}

/**
 * Create SetBackgroundColor tag
 */
function createBackgroundColorTag(color: SwfRGB): Uint8Array {
	const writer = new BitWriter()
	writeRGB(writer, color)
	return writer.toUint8Array()
}

/**
 * Create DefineBitsLossless2 tag (RGBA bitmap)
 */
function createBitmapTag(
	characterId: number,
	width: number,
	height: number,
	data: Uint8Array
): Uint8Array {
	const writer = new BitWriter()

	writer.writeUint16(characterId)
	writer.writeUint8(5) // Format 5: 32-bit ARGB
	writer.writeUint16(width)
	writer.writeUint16(height)

	// Convert RGBA to ARGB and compress
	const argbData = new Uint8Array(width * height * 4)
	for (let i = 0; i < width * height; i++) {
		argbData[i * 4] = data[i * 4]! // R
		argbData[i * 4 + 1] = data[i * 4 + 1]! // G
		argbData[i * 4 + 2] = data[i * 4 + 2]! // B
		argbData[i * 4 + 3] = data[i * 4 + 3]! // A
	}

	const compressed = deflateStore(argbData)
	writer.writeBytes(compressed)

	return writer.toUint8Array()
}

/**
 * Create PlaceObject2 tag
 */
function createPlaceObjectTag(characterId: number, depth: number): Uint8Array {
	const writer = new BitWriter()

	// Flags: HasCharacter | HasMatrix
	writer.writeUint8(0x06)
	writer.writeUint16(depth)
	writer.writeUint16(characterId)

	// Identity matrix
	const matrix = {
		xMin: 0,
		xMax: 0,
		yMin: 0,
		yMax: 0,
	}
	writeRect(writer, matrix)

	return writer.toUint8Array()
}

/**
 * Encode ImageData to SWF
 */
export function encodeSwf(image: ImageData, _options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	const writer = new BitWriter()

	// Signature - always use uncompressed (FWS) for browser compatibility
	for (const c of SWF_UNCOMPRESSED) {
		writer.writeUint8(c.charCodeAt(0))
	}

	// Version (10 for basic features)
	writer.writeUint8(10)

	// File length placeholder (will update later)
	const fileLengthPos = writer.toUint8Array().length
	writer.writeUint32(0)

	// Create body writer for potentially compressed content
	const bodyWriter = new BitWriter()

	// Frame size (in TWIPS)
	const frameSize: SwfRect = {
		xMin: 0,
		xMax: width * TWIPS_PER_PIXEL,
		yMin: 0,
		yMax: height * TWIPS_PER_PIXEL,
	}
	writeRect(bodyWriter, frameSize)

	// Frame rate (fixed 8.8 format) - 30 fps
	bodyWriter.writeUint8(0) // Fraction
	bodyWriter.writeUint8(30) // Whole number

	// Frame count
	bodyWriter.writeUint16(1)

	// SetBackgroundColor tag
	const bgTag = createBackgroundColorTag({ red: 255, green: 255, blue: 255 })
	writeTag(bodyWriter, SwfTagType.SetBackgroundColor, bgTag)

	// DefineBitsLossless2 tag
	const bitmapTag = createBitmapTag(1, width, height, data)
	writeTag(bodyWriter, SwfTagType.DefineBitsLossless2, bitmapTag)

	// PlaceObject2 tag
	const placeTag = createPlaceObjectTag(1, 1)
	writeTag(bodyWriter, SwfTagType.PlaceObject2, placeTag)

	// ShowFrame tag
	writeTag(bodyWriter, SwfTagType.ShowFrame, new Uint8Array(0))

	// End tag
	writeTag(bodyWriter, SwfTagType.End, new Uint8Array(0))

	const bodyData = bodyWriter.toUint8Array()

	// Write body (uncompressed)
	writer.writeBytes(bodyData)

	const result = writer.toUint8Array()

	// Update file length
	const fileLength = result.length
	result[fileLengthPos] = fileLength & 0xff
	result[fileLengthPos + 1] = (fileLength >> 8) & 0xff
	result[fileLengthPos + 2] = (fileLength >> 16) & 0xff
	result[fileLengthPos + 3] = (fileLength >> 24) & 0xff

	return result
}

/**
 * Encode VideoData to SWF animation
 */
export function encodeSwfAnimation(video: VideoData, _options?: EncodeOptions): Uint8Array {
	const { width, height, frameRate, frames } = video

	const writer = new BitWriter()

	// Signature - always use uncompressed (FWS) for browser compatibility
	for (const c of SWF_UNCOMPRESSED) {
		writer.writeUint8(c.charCodeAt(0))
	}

	// Version
	writer.writeUint8(10)

	// File length placeholder
	const fileLengthPos = writer.toUint8Array().length
	writer.writeUint32(0)

	const bodyWriter = new BitWriter()

	// Frame size
	const frameSize: SwfRect = {
		xMin: 0,
		xMax: width * TWIPS_PER_PIXEL,
		yMin: 0,
		yMax: height * TWIPS_PER_PIXEL,
	}
	writeRect(bodyWriter, frameSize)

	// Frame rate
	const frameRateWhole = Math.floor(frameRate)
	const frameRateFraction = Math.round((frameRate - frameRateWhole) * 256)
	bodyWriter.writeUint8(frameRateFraction)
	bodyWriter.writeUint8(frameRateWhole)

	// Frame count
	bodyWriter.writeUint16(frames.length)

	// SetBackgroundColor tag
	const bgTag = createBackgroundColorTag({ red: 255, green: 255, blue: 255 })
	writeTag(bodyWriter, SwfTagType.SetBackgroundColor, bgTag)

	// Define bitmaps and show frames
	for (let i = 0; i < frames.length; i++) {
		const frame = frames[i]!
		const characterId = i + 1

		// DefineBitsLossless2 tag
		const bitmapTag = createBitmapTag(characterId, width, height, frame.image.data)
		writeTag(bodyWriter, SwfTagType.DefineBitsLossless2, bitmapTag)

		// PlaceObject2 tag
		const placeTag = createPlaceObjectTag(characterId, 1)
		writeTag(bodyWriter, SwfTagType.PlaceObject2, placeTag)

		// ShowFrame tag
		writeTag(bodyWriter, SwfTagType.ShowFrame, new Uint8Array(0))
	}

	// End tag
	writeTag(bodyWriter, SwfTagType.End, new Uint8Array(0))

	const bodyData = bodyWriter.toUint8Array()

	// Write body (uncompressed)
	writer.writeBytes(bodyData)

	const result = writer.toUint8Array()

	// Update file length
	const fileLength = result.length
	result[fileLengthPos] = fileLength & 0xff
	result[fileLengthPos + 1] = (fileLength >> 8) & 0xff
	result[fileLengthPos + 2] = (fileLength >> 16) & 0xff
	result[fileLengthPos + 3] = (fileLength >> 24) & 0xff

	return result
}

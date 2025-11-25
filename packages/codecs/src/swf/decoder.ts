import type { ImageData, VideoData, VideoFrame } from '@sylphx/codec-core'
import { inflate } from '../png/inflate'
import {
	type DefineBitsLosslessTag,
	type SetBackgroundColorTag,
	type ShowFrameTag,
	type SwfFile,
	type SwfHeader,
	type SwfRGB,
	type SwfRect,
	type SwfTag,
	SwfTagType,
	SWF_LZMA,
	SWF_UNCOMPRESSED,
	SWF_ZLIB,
	TWIPS_PER_PIXEL,
} from './types'

/**
 * Bit reader for SWF format
 */
class BitReader {
	private data: Uint8Array
	private pos = 0
	private bitPos = 0

	constructor(data: Uint8Array) {
		this.data = data
	}

	readBits(count: number): number {
		let result = 0

		for (let i = 0; i < count; i++) {
			if (this.bitPos === 0) {
				if (this.pos >= this.data.length) {
					throw new Error('Unexpected end of data')
				}
			}

			const bit = (this.data[this.pos]! >> (7 - this.bitPos)) & 1
			result = (result << 1) | bit
			this.bitPos++

			if (this.bitPos === 8) {
				this.bitPos = 0
				this.pos++
			}
		}

		return result
	}

	readSignedBits(count: number): number {
		if (count === 0) return 0
		const value = this.readBits(count)
		// Check sign bit
		const signBit = 1 << (count - 1)
		if (value & signBit) {
			// Negative number - extend sign with two's complement
			return value - (1 << count)
		}
		return value
	}

	alignByte(): void {
		if (this.bitPos !== 0) {
			this.bitPos = 0
			this.pos++
		}
	}

	get position(): number {
		return this.pos
	}

	set position(value: number) {
		this.pos = value
		this.bitPos = 0
	}

	readBytes(count: number): Uint8Array {
		this.alignByte()
		const bytes = this.data.slice(this.pos, this.pos + count)
		this.pos += count
		return bytes
	}

	readUint8(): number {
		this.alignByte()
		return this.data[this.pos++]!
	}

	readUint16(): number {
		this.alignByte()
		const value = this.data[this.pos]! | (this.data[this.pos + 1]! << 8)
		this.pos += 2
		return value
	}

	readUint32(): number {
		this.alignByte()
		const value =
			this.data[this.pos]! |
			(this.data[this.pos + 1]! << 8) |
			(this.data[this.pos + 2]! << 16) |
			(this.data[this.pos + 3]! << 24)
		this.pos += 4
		return value >>> 0 // Ensure unsigned
	}

	get remaining(): number {
		return this.data.length - this.pos
	}
}

/**
 * Decompress SWF data
 */
function decompressSWF(data: Uint8Array): Uint8Array {
	const signature = String.fromCharCode(data[0]!, data[1]!, data[2]!)

	if (signature === SWF_UNCOMPRESSED) {
		return data
	}

	if (signature === SWF_ZLIB) {
		// First 8 bytes are uncompressed header
		const header = data.slice(0, 8)
		const compressed = data.slice(8)

		// Decompress the rest (zlib format with header)
		const decompressed = inflate(compressed)

		// Combine header with decompressed data
		const result = new Uint8Array(header.length + decompressed.length)
		result.set(header)
		result.set(decompressed, header.length)

		// Change signature to FWS
		result[0] = 'F'.charCodeAt(0)

		return result
	}

	if (signature === SWF_LZMA) {
		throw new Error('LZMA compression (ZWS) is not supported')
	}

	throw new Error(`Invalid SWF signature: ${signature}`)
}

/**
 * Read SWF rectangle from bit stream
 */
function readRect(reader: BitReader): SwfRect {
	const nBits = reader.readBits(5)
	const xMin = reader.readSignedBits(nBits)
	const xMax = reader.readSignedBits(nBits)
	const yMin = reader.readSignedBits(nBits)
	const yMax = reader.readSignedBits(nBits)
	reader.alignByte()

	return { xMin, xMax, yMin, yMax }
}

/**
 * Read SWF RGB color
 */
function readRGB(reader: BitReader): SwfRGB {
	return {
		red: reader.readUint8(),
		green: reader.readUint8(),
		blue: reader.readUint8(),
	}
}

/**
 * Parse SWF header
 */
function parseHeader(data: Uint8Array): { header: SwfHeader; dataStart: number } {
	const reader = new BitReader(data)

	const signature = String.fromCharCode(reader.readUint8(), reader.readUint8(), reader.readUint8())

	if (signature !== SWF_UNCOMPRESSED && signature !== SWF_ZLIB && signature !== SWF_LZMA) {
		throw new Error(`Invalid SWF signature: ${signature}`)
	}

	const version = reader.readUint8()
	const fileLength = reader.readUint32()
	const frameSize = readRect(reader)

	// Frame rate is stored as 8.8 fixed point
	const frameRateFraction = reader.readUint8()
	const frameRateWhole = reader.readUint8()
	const frameRate = frameRateWhole + frameRateFraction / 256

	const frameCount = reader.readUint16()

	return {
		header: {
			signature,
			version,
			fileLength,
			frameSize,
			frameRate,
			frameCount,
		},
		dataStart: reader.position,
	}
}

/**
 * Parse SWF tags
 */
function parseTags(data: Uint8Array, startPos: number): SwfTag[] {
	const reader = new BitReader(data)
	reader.position = startPos

	const tags: SwfTag[] = []

	while (reader.remaining > 0) {
		const tagCodeAndLength = reader.readUint16()
		const tagType = tagCodeAndLength >> 6
		let length = tagCodeAndLength & 0x3f

		// If length is 0x3F, read extended length
		if (length === 0x3f) {
			length = reader.readUint32()
		}

		if (length > reader.remaining) {
			break
		}

		const tagData = reader.readBytes(length)

		tags.push({
			type: tagType as SwfTagType,
			data: tagData,
		})

		if (tagType === SwfTagType.End) {
			break
		}
	}

	return tags
}

/**
 * Parse complete SWF structure
 */
export function parseSwf(data: Uint8Array): SwfFile {
	// Decompress if needed
	const decompressed = decompressSWF(data)

	// Parse header
	const { header, dataStart } = parseHeader(decompressed)

	// Parse tags
	const tags = parseTags(decompressed, dataStart)

	// Extract background color if present
	let backgroundColor: SwfRGB | undefined

	for (const tag of tags) {
		if (tag.type === SwfTagType.SetBackgroundColor && tag.data.length >= 3) {
			const reader = new BitReader(tag.data)
			backgroundColor = readRGB(reader)
			break
		}
	}

	return {
		header,
		tags,
		backgroundColor,
	}
}

/**
 * Extract bitmap from DefineBitsLossless tag
 */
function extractBitmap(tag: SwfTag): ImageData | null {
	if (
		tag.type !== SwfTagType.DefineBitsLossless &&
		tag.type !== SwfTagType.DefineBitsLossless2
	) {
		return null
	}

	const reader = new BitReader(tag.data)
	const characterId = reader.readUint16()
	const bitmapFormat = reader.readUint8()
	const bitmapWidth = reader.readUint16()
	const bitmapHeight = reader.readUint16()

	const hasAlpha = tag.type === SwfTagType.DefineBitsLossless2

	// Read and decompress bitmap data
	const compressedData = reader.readBytes(reader.remaining)
	const decompressed = inflate(compressedData)

	const output = new Uint8Array(bitmapWidth * bitmapHeight * 4)

	if (bitmapFormat === 3) {
		// 8-bit colormapped image
		const colorTableSize = decompressed[0]! + 1

		// Read color table
		const colorTable: number[] = []
		let pos = 1

		for (let i = 0; i < colorTableSize; i++) {
			const r = decompressed[pos++]!
			const g = decompressed[pos++]!
			const b = decompressed[pos++]!
			const a = hasAlpha ? decompressed[pos++]! : 255
			colorTable.push(r, g, b, a)
		}

		// Read pixel indices
		const pixelDataStart = pos
		for (let i = 0; i < bitmapWidth * bitmapHeight; i++) {
			const index = decompressed[pixelDataStart + i]!
			output[i * 4] = colorTable[index * 4]!
			output[i * 4 + 1] = colorTable[index * 4 + 1]!
			output[i * 4 + 2] = colorTable[index * 4 + 2]!
			output[i * 4 + 3] = colorTable[index * 4 + 3]!
		}
	} else if (bitmapFormat === 5) {
		// 32-bit ARGB or 24-bit RGB
		let pos = 0
		for (let i = 0; i < bitmapWidth * bitmapHeight; i++) {
			const r = decompressed[pos++]!
			const g = decompressed[pos++]!
			const b = decompressed[pos++]!
			const a = hasAlpha ? decompressed[pos++]! : 255

			output[i * 4] = r
			output[i * 4 + 1] = g
			output[i * 4 + 2] = b
			output[i * 4 + 3] = a
		}
	}

	return {
		width: bitmapWidth,
		height: bitmapHeight,
		data: output,
	}
}

/**
 * Decode SWF to first frame as ImageData
 */
export function decodeSwf(data: Uint8Array): ImageData {
	const swf = parseSwf(data)

	// Try to extract first bitmap
	for (const tag of swf.tags) {
		const bitmap = extractBitmap(tag)
		if (bitmap) {
			return bitmap
		}
	}

	// If no bitmap found, create blank frame with background color
	const { frameSize } = swf.header
	const width = Math.ceil((frameSize.xMax - frameSize.xMin) / TWIPS_PER_PIXEL)
	const height = Math.ceil((frameSize.yMax - frameSize.yMin) / TWIPS_PER_PIXEL)

	const output = new Uint8Array(width * height * 4)

	if (swf.backgroundColor) {
		const { red, green, blue } = swf.backgroundColor
		for (let i = 0; i < output.length; i += 4) {
			output[i] = red
			output[i + 1] = green
			output[i + 2] = blue
			output[i + 3] = 255
		}
	}

	return { width, height, data: output }
}

/**
 * Decode SWF animation to VideoData
 */
export function decodeSwfAnimation(data: Uint8Array): VideoData {
	const swf = parseSwf(data)

	const { frameSize, frameRate, frameCount } = swf.header
	const width = Math.ceil((frameSize.xMax - frameSize.xMin) / TWIPS_PER_PIXEL)
	const height = Math.ceil((frameSize.yMax - frameSize.yMin) / TWIPS_PER_PIXEL)

	const frames: VideoFrame[] = []
	let currentFrame = new Uint8Array(width * height * 4)

	// Fill with background color
	if (swf.backgroundColor) {
		const { red, green, blue } = swf.backgroundColor
		for (let i = 0; i < currentFrame.length; i += 4) {
			currentFrame[i] = red
			currentFrame[i + 1] = green
			currentFrame[i + 2] = blue
			currentFrame[i + 3] = 255
		}
	}

	let frameIndex = 0
	const frameDuration = 1000 / frameRate

	for (const tag of swf.tags) {
		if (tag.type === SwfTagType.ShowFrame) {
			// Add current frame
			frames.push({
				image: {
					width,
					height,
					data: new Uint8Array(currentFrame),
				},
				timestamp: frameIndex * frameDuration,
				duration: frameDuration,
			})
			frameIndex++
		} else {
			// Update current frame with bitmap data if available
			const bitmap = extractBitmap(tag)
			if (bitmap) {
				// Simple: replace entire frame with bitmap
				// In real SWF, this would be placed at specific coordinates
				if (bitmap.width === width && bitmap.height === height) {
					currentFrame.set(bitmap.data)
				}
			}
		}
	}

	return {
		width,
		height,
		frameRate,
		frames,
	}
}

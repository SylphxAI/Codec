/**
 * MNG (Multiple-image Network Graphics) encoder
 * Encodes frame sequences to MNG animations
 */

import type { ImageData } from '@mconv/core'
import { encodePng } from '../png'
import {
	MNG_SIGNATURE,
	MngChunkType,
	MngSimplicity,
	type MngAnimation,
	type MngEncodeOptions,
	type MngFrame,
	type MngInfo,
} from './types'

/**
 * Encode images to MNG animation
 */
export function encodeMng(images: ImageData[], options: MngEncodeOptions = {}): Uint8Array {
	if (images.length === 0) {
		return new Uint8Array(0)
	}

	const { delay = 100, loops = 0 } = options

	const width = images[0]!.width
	const height = images[0]!.height
	const frameCount = images.length
	const ticksPerSecond = 1000
	const playTime = frameCount * delay

	// Encode each frame as PNG
	const pngFrames: Uint8Array[] = []
	for (const image of images) {
		pngFrames.push(encodePng(image))
	}

	// Build MNG file
	const parts: Uint8Array[] = []

	// MNG signature
	parts.push(MNG_SIGNATURE)

	// MHDR chunk
	const mhdrData = new Uint8Array(28)
	writeU32BE(mhdrData, 0, width)
	writeU32BE(mhdrData, 4, height)
	writeU32BE(mhdrData, 8, ticksPerSecond)
	writeU32BE(mhdrData, 12, 1) // layer count
	writeU32BE(mhdrData, 16, frameCount)
	writeU32BE(mhdrData, 20, playTime)
	writeU32BE(mhdrData, 24, MngSimplicity.SIMPLE | MngSimplicity.TRANSPARENCY)
	parts.push(createChunk(MngChunkType.MHDR, mhdrData))

	// TERM chunk (termination action)
	const termData = new Uint8Array(10)
	termData[0] = 3 // Repeat (action after MEND)
	termData[1] = 0 // No action after TERM
	writeU32BE(termData, 2, delay) // Delay after each iteration
	writeU32BE(termData, 6, loops) // Iteration count (0 = infinite)
	parts.push(createChunk(MngChunkType.TERM, termData))

	// BACK chunk (background color - transparent)
	const backData = new Uint8Array(6)
	writeU16BE(backData, 0, 0) // Red
	writeU16BE(backData, 2, 0) // Green
	writeU16BE(backData, 4, 0) // Blue
	parts.push(createChunk(MngChunkType.BACK, backData))

	// Embed PNG frames
	for (let i = 0; i < pngFrames.length; i++) {
		// FRAM chunk (frame control)
		const framData = new Uint8Array(10)
		framData[0] = 1 // Framing mode: restore background
		if (i === 0) {
			framData[1] = 0 // No change in interframe delay
		} else {
			framData[1] = 2 // Change interframe delay for this frame only
			writeU32BE(framData, 6, delay) // Delay in ticks
		}
		parts.push(createChunk(MngChunkType.FRAM, framData.slice(0, i === 0 ? 1 : 10)))

		// Extract chunks from PNG (skip signature)
		const png = pngFrames[i]!
		const chunks = extractPngChunks(png)
		for (const chunk of chunks) {
			parts.push(chunk)
		}
	}

	// MEND chunk
	parts.push(createChunk(MngChunkType.MEND, new Uint8Array(0)))

	// Combine all parts
	let totalSize = 0
	for (const part of parts) {
		totalSize += part.length
	}

	const output = new Uint8Array(totalSize)
	let offset = 0
	for (const part of parts) {
		output.set(part, offset)
		offset += part.length
	}

	return output
}

/**
 * Create MNG animation object from images
 */
export function createMngAnimation(
	images: ImageData[],
	options: MngEncodeOptions = {}
): MngAnimation {
	const { delay = 100 } = options

	if (images.length === 0) {
		return {
			info: {
				width: 0,
				height: 0,
				frameCount: 0,
				duration: 0,
				defaultDelay: delay,
				isLC: true,
			},
			frames: [],
		}
	}

	const width = images[0]!.width
	const height = images[0]!.height

	const info: MngInfo = {
		width,
		height,
		frameCount: images.length,
		duration: images.length * delay,
		defaultDelay: delay,
		isLC: true,
	}

	const frames: MngFrame[] = images.map((image, index) => ({
		index,
		timestamp: index * delay,
		duration: delay,
		image,
	}))

	return { info, frames }
}

/**
 * Extract PNG chunks from a PNG file (without signature)
 */
function extractPngChunks(png: Uint8Array): Uint8Array[] {
	const chunks: Uint8Array[] = []
	let offset = 8 // Skip PNG signature

	while (offset < png.length - 4) {
		const length = readU32BE(png, offset)
		const chunkSize = 12 + length // length + type + data + crc

		if (offset + chunkSize > png.length) break

		// Copy entire chunk (length + type + data + crc)
		chunks.push(png.slice(offset, offset + chunkSize))
		offset += chunkSize
	}

	return chunks
}

/**
 * Create an MNG chunk
 */
function createChunk(type: number, data: Uint8Array): Uint8Array {
	const chunk = new Uint8Array(12 + data.length)

	// Length
	writeU32BE(chunk, 0, data.length)

	// Type
	writeU32BE(chunk, 4, type)

	// Data
	chunk.set(data, 8)

	// CRC (over type + data)
	const crcData = new Uint8Array(4 + data.length)
	writeU32BE(crcData, 0, type)
	crcData.set(data, 4)
	const crc = crc32(crcData)
	writeU32BE(chunk, 8 + data.length, crc)

	return chunk
}

// CRC32 table
const crcTable: number[] = []
for (let n = 0; n < 256; n++) {
	let c = n
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	}
	crcTable[n] = c
}

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff
	for (let i = 0; i < data.length; i++) {
		crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
	}
	return (crc ^ 0xffffffff) >>> 0
}

// Binary writing helpers
function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) >>> 0) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 24) & 0xff
	data[offset + 1] = (value >> 16) & 0xff
	data[offset + 2] = (value >> 8) & 0xff
	data[offset + 3] = value & 0xff
}

function writeU16BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 8) & 0xff
	data[offset + 1] = value & 0xff
}

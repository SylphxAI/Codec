/**
 * FLI/FLC (FLIC) decoder
 * Decodes Autodesk Animator animations
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	FLIC_MAGIC_FLC,
	FLIC_MAGIC_FLI,
	type FlicAnimation,
	FlicChunkType,
	type FlicFrame,
	type FlicHeader,
	type FlicInfo,
} from './types'

/**
 * Check if data is a FLIC file
 */
export function isFlic(data: Uint8Array): boolean {
	if (data.length < 6) return false
	const magic = readU16LE(data, 4)
	return magic === FLIC_MAGIC_FLI || magic === FLIC_MAGIC_FLC
}

/**
 * Parse FLIC header
 */
export function parseFlicHeader(data: Uint8Array): FlicHeader {
	if (data.length < 128) {
		throw new Error('Invalid FLIC: file too short')
	}

	const magic = readU16LE(data, 4)
	if (magic !== FLIC_MAGIC_FLI && magic !== FLIC_MAGIC_FLC) {
		throw new Error('Invalid FLIC: bad magic number')
	}

	return {
		size: readU32LE(data, 0),
		magic,
		frameCount: readU16LE(data, 6),
		width: readU16LE(data, 8),
		height: readU16LE(data, 10),
		depth: readU16LE(data, 12),
		flags: readU16LE(data, 14),
		delay: readU32LE(data, 16),
		reserved1: readU16LE(data, 20),
		created: readU32LE(data, 22),
		creator: readU32LE(data, 26),
		updated: readU32LE(data, 30),
		updater: readU32LE(data, 34),
		aspectX: readU16LE(data, 38),
		aspectY: readU16LE(data, 40),
		frame1Offset: readU32LE(data, 80),
		frame2Offset: readU32LE(data, 84),
	}
}

/**
 * Parse FLIC info without decoding frames
 */
export function parseFlicInfo(data: Uint8Array): FlicInfo {
	const header = parseFlicHeader(data)
	const isFLC = header.magic === FLIC_MAGIC_FLC
	const delay = header.delay || 66 // Default ~15fps

	return {
		isFLC,
		width: header.width,
		height: header.height,
		frameCount: header.frameCount,
		delay,
		duration: header.frameCount * delay,
	}
}

/**
 * Decode FLIC animation
 */
export function decodeFlic(data: Uint8Array): FlicAnimation {
	const header = parseFlicHeader(data)
	const { width, height, frameCount } = header
	const delay = header.delay || 66

	// Initialize canvas and palette
	const canvas = new Uint8Array(width * height)
	const palette = new Uint8Array(768) // 256 * 3 (RGB)

	// Start at first frame
	let offset = 128 // Header size

	const frames: FlicFrame[] = []

	for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
		if (offset >= data.length - 6) break

		// Read frame header
		const frameSize = readU32LE(data, offset)
		const frameType = readU16LE(data, offset + 4)

		if (frameType !== FlicChunkType.FRAME) {
			// Skip non-frame chunks
			offset += frameSize
			continue
		}

		const chunkCount = readU16LE(data, offset + 6)
		let chunkOffset = offset + 16 // Frame header is 16 bytes

		// Process chunks
		for (let i = 0; i < chunkCount && chunkOffset < offset + frameSize; i++) {
			const chunkSize = readU32LE(data, chunkOffset)
			const chunkType = readU16LE(data, chunkOffset + 4) as FlicChunkType

			decodeChunk(data, chunkOffset + 6, chunkType, chunkSize - 6, canvas, palette, width, height)

			chunkOffset += chunkSize
		}

		// Convert canvas to RGBA
		const image = canvasToRgba(canvas, palette, width, height)

		frames.push({
			index: frameIdx,
			timestamp: frameIdx * delay,
			image,
		})

		offset += frameSize
	}

	const info: FlicInfo = {
		isFLC: header.magic === FLIC_MAGIC_FLC,
		width,
		height,
		frameCount: frames.length,
		delay,
		duration: frames.length * delay,
	}

	return { info, frames }
}

/**
 * Decode a single frame
 */
export function decodeFlicFrame(data: Uint8Array, frameIndex: number): ImageData | null {
	const anim = decodeFlic(data)
	if (frameIndex < 0 || frameIndex >= anim.frames.length) {
		return null
	}
	return anim.frames[frameIndex]!.image
}

function decodeChunk(
	data: Uint8Array,
	offset: number,
	type: FlicChunkType,
	size: number,
	canvas: Uint8Array,
	palette: Uint8Array,
	width: number,
	height: number
): void {
	switch (type) {
		case FlicChunkType.COLOR_256:
			decodeColor256(data, offset, palette)
			break
		case FlicChunkType.COLOR_64:
			decodeColor64(data, offset, palette)
			break
		case FlicChunkType.BLACK:
			canvas.fill(0)
			break
		case FlicChunkType.BYTE_RUN:
			decodeByteRun(data, offset, canvas, width, height)
			break
		case FlicChunkType.DELTA_FLI:
			decodeDeltaFli(data, offset, canvas, width)
			break
		case FlicChunkType.DELTA_FLC:
			decodeDeltaFlc(data, offset, canvas, width)
			break
		case FlicChunkType.LITERAL:
			decodeLiteral(data, offset, size, canvas)
			break
	}
}

function decodeColor256(data: Uint8Array, offset: number, palette: Uint8Array): void {
	const packetCount = readU16LE(data, offset)
	let pos = offset + 2
	let colorIndex = 0

	for (let i = 0; i < packetCount; i++) {
		colorIndex += data[pos]! // Skip count
		pos++
		let copyCount = data[pos]!
		pos++

		if (copyCount === 0) copyCount = 256

		for (let j = 0; j < copyCount; j++) {
			palette[(colorIndex + j) * 3] = data[pos]!
			palette[(colorIndex + j) * 3 + 1] = data[pos + 1]!
			palette[(colorIndex + j) * 3 + 2] = data[pos + 2]!
			pos += 3
		}

		colorIndex += copyCount
	}
}

function decodeColor64(data: Uint8Array, offset: number, palette: Uint8Array): void {
	const packetCount = readU16LE(data, offset)
	let pos = offset + 2
	let colorIndex = 0

	for (let i = 0; i < packetCount; i++) {
		colorIndex += data[pos]!
		pos++
		let copyCount = data[pos]!
		pos++

		if (copyCount === 0) copyCount = 256

		for (let j = 0; j < copyCount; j++) {
			// FLI uses 6-bit color, scale to 8-bit
			palette[(colorIndex + j) * 3] = (data[pos]! << 2) | (data[pos]! >> 4)
			palette[(colorIndex + j) * 3 + 1] = (data[pos + 1]! << 2) | (data[pos + 1]! >> 4)
			palette[(colorIndex + j) * 3 + 2] = (data[pos + 2]! << 2) | (data[pos + 2]! >> 4)
			pos += 3
		}

		colorIndex += copyCount
	}
}

function decodeByteRun(
	data: Uint8Array,
	offset: number,
	canvas: Uint8Array,
	width: number,
	height: number
): void {
	let pos = offset
	let canvasPos = 0

	for (let y = 0; y < height; y++) {
		pos++ // Skip packet count for this line

		let x = 0
		while (x < width) {
			const count = data[pos]!
			pos++

			if (count > 127) {
				// Literal run: (256 - count) pixels
				const runLen = 256 - count
				for (let i = 0; i < runLen && x < width; i++) {
					canvas[canvasPos + x] = data[pos]!
					pos++
					x++
				}
			} else {
				// RLE run: repeat next byte count times
				const value = data[pos]!
				pos++
				for (let i = 0; i < count && x < width; i++) {
					canvas[canvasPos + x] = value
					x++
				}
			}
		}

		canvasPos += width
	}
}

function decodeDeltaFli(data: Uint8Array, offset: number, canvas: Uint8Array, width: number): void {
	let pos = offset
	const startLine = readU16LE(data, pos)
	pos += 2
	const lineCount = readU16LE(data, pos)
	pos += 2

	let canvasPos = startLine * width

	for (let y = 0; y < lineCount; y++) {
		const packetCount = data[pos]!
		pos++

		let x = 0
		for (let p = 0; p < packetCount; p++) {
			x += data[pos]! // Skip count
			pos++

			const count = data[pos]!
			pos++

			if (count > 127) {
				// RLE: repeat next byte (256 - count) times
				const runLen = 256 - count
				const value = data[pos]!
				pos++
				for (let i = 0; i < runLen; i++) {
					canvas[canvasPos + x] = value
					x++
				}
			} else {
				// Literal: copy count bytes
				for (let i = 0; i < count; i++) {
					canvas[canvasPos + x] = data[pos]!
					pos++
					x++
				}
			}
		}

		canvasPos += width
	}
}

function decodeDeltaFlc(data: Uint8Array, offset: number, canvas: Uint8Array, width: number): void {
	let pos = offset
	const lineCount = readU16LE(data, pos)
	pos += 2

	let y = 0
	let processedLines = 0

	while (processedLines < lineCount) {
		const opcode = readI16LE(data, pos)
		pos += 2

		if (opcode < 0) {
			if (opcode & 0x4000) {
				// Skip lines
				y += -opcode
			} else {
				// Last pixel (single byte at end of line)
				canvas[y * width + width - 1] = opcode & 0xff
			}
		} else {
			// Packet count
			let x = 0
			for (let p = 0; p < opcode; p++) {
				x += data[pos]! // Column skip
				pos++

				const count = data[pos]!
				pos++

				if (count > 127) {
					// RLE: repeat word (256 - count) times
					const runLen = 256 - count
					const value1 = data[pos]!
					const value2 = data[pos + 1]!
					pos += 2
					for (let i = 0; i < runLen; i++) {
						canvas[y * width + x] = value1
						canvas[y * width + x + 1] = value2
						x += 2
					}
				} else {
					// Literal: copy count words
					for (let i = 0; i < count; i++) {
						canvas[y * width + x] = data[pos]!
						canvas[y * width + x + 1] = data[pos + 1]!
						pos += 2
						x += 2
					}
				}
			}

			y++
			processedLines++
		}
	}
}

function decodeLiteral(data: Uint8Array, offset: number, size: number, canvas: Uint8Array): void {
	for (let i = 0; i < size && i < canvas.length; i++) {
		canvas[i] = data[offset + i]!
	}
}

function canvasToRgba(
	canvas: Uint8Array,
	palette: Uint8Array,
	width: number,
	height: number
): ImageData {
	const output = new Uint8Array(width * height * 4)

	for (let i = 0; i < width * height; i++) {
		const colorIdx = canvas[i]!
		output[i * 4] = palette[colorIdx * 3]!
		output[i * 4 + 1] = palette[colorIdx * 3 + 1]!
		output[i * 4 + 2] = palette[colorIdx * 3 + 2]!
		output[i * 4 + 3] = 255
	}

	return { width, height, data: output }
}

// Binary reading helpers
function readU16LE(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8)
}

function readI16LE(data: Uint8Array, offset: number): number {
	const u = readU16LE(data, offset)
	return u > 0x7fff ? u - 0x10000 : u
}

function readU32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! |
		(data[offset + 1]! << 8) |
		(data[offset + 2]! << 16) |
		((data[offset + 3]! << 24) >>> 0)
	)
}

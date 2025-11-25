/**
 * MNG (Multiple-image Network Graphics) decoder
 * Decodes MNG animations to frame sequences
 */

import type { ImageData } from '@mconv/core'
import { decodePng } from '../png'
import {
	MNG_SIGNATURE,
	MngChunkType,
	PNG_SIGNATURE,
	type MngAnimation,
	type MngChunk,
	type MngFrame,
	type MngHeader,
	type MngInfo,
} from './types'

/**
 * Check if data is an MNG file
 */
export function isMng(data: Uint8Array): boolean {
	if (data.length < 8) return false
	for (let i = 0; i < 8; i++) {
		if (data[i] !== MNG_SIGNATURE[i]) return false
	}
	return true
}

/**
 * Parse MNG header (MHDR chunk)
 */
export function parseMngHeader(data: Uint8Array): MngHeader {
	if (!isMng(data)) {
		throw new Error('Invalid MNG: bad signature')
	}

	const chunks = parseChunks(data)
	const mhdr = chunks.find((c) => c.type === MngChunkType.MHDR)

	if (!mhdr || mhdr.data.length < 28) {
		throw new Error('Invalid MNG: missing or invalid MHDR chunk')
	}

	return {
		width: readU32BE(mhdr.data, 0),
		height: readU32BE(mhdr.data, 4),
		ticksPerSecond: readU32BE(mhdr.data, 8),
		layerCount: readU32BE(mhdr.data, 12),
		frameCount: readU32BE(mhdr.data, 16),
		playTime: readU32BE(mhdr.data, 20),
		simplicity: readU32BE(mhdr.data, 24),
	}
}

/**
 * Parse MNG info without decoding frames
 */
export function parseMngInfo(data: Uint8Array): MngInfo {
	const header = parseMngHeader(data)
	const ticksPerSecond = header.ticksPerSecond || 1000
	const defaultDelay = Math.round(1000 / ticksPerSecond)
	const duration = Math.round((header.playTime / ticksPerSecond) * 1000)

	// Check if it's MNG-LC (simple profile)
	const isLC = (header.simplicity & 0x01) !== 0 && (header.simplicity & 0x02) === 0

	return {
		width: header.width,
		height: header.height,
		frameCount: header.frameCount,
		duration,
		defaultDelay,
		isLC,
	}
}

/**
 * Decode MNG animation
 */
export function decodeMng(data: Uint8Array): MngAnimation {
	const header = parseMngHeader(data)
	const info = parseMngInfo(data)

	// Extract embedded PNG images
	const pngImages = extractPngImages(data)
	const frames: MngFrame[] = []

	let timestamp = 0
	const frameDuration = info.defaultDelay || 100

	for (let i = 0; i < pngImages.length; i++) {
		const image = decodePng(pngImages[i]!)

		frames.push({
			index: i,
			timestamp,
			duration: frameDuration,
			image,
		})

		timestamp += frameDuration
	}

	// Update info with actual frame count
	info.frameCount = frames.length
	info.duration = timestamp

	return { info, frames }
}

/**
 * Decode a single frame from MNG
 */
export function decodeMngFrame(data: Uint8Array, frameIndex: number): ImageData | null {
	const anim = decodeMng(data)
	if (frameIndex < 0 || frameIndex >= anim.frames.length) {
		return null
	}
	return anim.frames[frameIndex]!.image
}

/**
 * Extract embedded PNG images from MNG
 */
function extractPngImages(data: Uint8Array): Uint8Array[] {
	const chunks = parseChunks(data)
	const images: Uint8Array[] = []

	let currentImage: MngChunk[] = []
	let inImage = false

	for (const chunk of chunks) {
		if (chunk.type === MngChunkType.IHDR) {
			// Start of new PNG image
			inImage = true
			currentImage = [chunk]
		} else if (inImage) {
			currentImage.push(chunk)

			if (chunk.type === MngChunkType.IEND) {
				// End of PNG image - build complete PNG
				const pngData = buildPng(currentImage)
				images.push(pngData)
				currentImage = []
				inImage = false
			}
		}
	}

	return images
}

/**
 * Build a complete PNG from chunks
 */
function buildPng(chunks: MngChunk[]): Uint8Array {
	// Calculate total size
	let size = 8 // PNG signature
	for (const chunk of chunks) {
		size += 12 + chunk.data.length // length (4) + type (4) + data + crc (4)
	}

	const output = new Uint8Array(size)
	let offset = 0

	// Write PNG signature
	output.set(PNG_SIGNATURE, 0)
	offset = 8

	// Write chunks
	for (const chunk of chunks) {
		// Length
		writeU32BE(output, offset, chunk.data.length)
		offset += 4

		// Type
		writeU32BE(output, offset, chunk.type)
		offset += 4

		// Data
		output.set(chunk.data, offset)
		offset += chunk.data.length

		// CRC (over type + data)
		const crcData = new Uint8Array(4 + chunk.data.length)
		writeU32BE(crcData, 0, chunk.type)
		crcData.set(chunk.data, 4)
		const crc = crc32(crcData)
		writeU32BE(output, offset, crc)
		offset += 4
	}

	return output
}

/**
 * Parse MNG chunks
 */
function parseChunks(data: Uint8Array): MngChunk[] {
	const chunks: MngChunk[] = []
	let offset = 8 // Skip signature

	while (offset < data.length - 8) {
		const length = readU32BE(data, offset)
		const type = readU32BE(data, offset + 4)

		if (offset + 12 + length > data.length) break

		const chunkData = data.slice(offset + 8, offset + 8 + length)

		chunks.push({ type, data: chunkData })
		offset += 12 + length

		// Stop at MEND
		if (type === MngChunkType.MEND) break
	}

	return chunks
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

// Binary reading/writing helpers
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

/**
 * ANI encoder - Animated Cursor format
 */

import { encodeCursorFile } from '../cur/encoder'
import type { CursorImage } from '../cur/types'
import { ANI_FLAG_ICON, type AniEncodeOptions, type AnimatedCursor } from './types'

/**
 * Encode animated cursor to ANI format
 */
export function encodeAni(frames: CursorImage[], options: AniEncodeOptions = {}): Uint8Array {
	const { defaultRate = 10, title, author } = options

	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	// Encode each frame as CUR
	const encodedFrames: Uint8Array[] = []
	for (const frame of frames) {
		encodedFrames.push(encodeCursorFile([frame]))
	}

	// Build chunks
	const chunks: Uint8Array[] = []

	// anih chunk
	const anihData = new Uint8Array(36)
	writeU32LE(anihData, 0, 36) // cbSize
	writeU32LE(anihData, 4, frames.length) // nFrames
	writeU32LE(anihData, 8, frames.length) // nSteps
	writeU32LE(anihData, 12, 0) // cx (use frame size)
	writeU32LE(anihData, 16, 0) // cy (use frame size)
	writeU32LE(anihData, 20, 32) // bpp
	writeU32LE(anihData, 24, 1) // nPlanes
	writeU32LE(anihData, 28, defaultRate) // jifRate
	writeU32LE(anihData, 32, ANI_FLAG_ICON) // flags
	chunks.push(createChunk(0x68696e61, anihData)) // 'anih'

	// rate chunk (uniform rate)
	const rateData = new Uint8Array(frames.length * 4)
	for (let i = 0; i < frames.length; i++) {
		writeU32LE(rateData, i * 4, defaultRate)
	}
	chunks.push(createChunk(0x65746172, rateData)) // 'rate'

	// INAM chunk (title)
	if (title) {
		const titleData = stringToBytes(title)
		chunks.push(createChunk(0x4d414e49, titleData)) // 'INAM'
	}

	// IART chunk (author)
	if (author) {
		const authorData = stringToBytes(author)
		chunks.push(createChunk(0x54524149, authorData)) // 'IART'
	}

	// LIST 'fram' chunk with icon subchunks
	const framChunks: Uint8Array[] = []
	for (const frame of encodedFrames) {
		framChunks.push(createChunk(0x6e6f6369, frame)) // 'icon'
	}
	chunks.push(createListChunk(0x6d617266, framChunks)) // 'fram'

	// Calculate total size
	let totalChunksSize = 0
	for (const chunk of chunks) {
		totalChunksSize += chunk.length
	}

	// Create RIFF container
	const output = new Uint8Array(12 + totalChunksSize)
	writeU32LE(output, 0, 0x46464952) // 'RIFF'
	writeU32LE(output, 4, 4 + totalChunksSize) // File size - 8
	writeU32LE(output, 8, 0x4e4f4341) // 'ACON'

	// Copy chunks
	let offset = 12
	for (const chunk of chunks) {
		output.set(chunk, offset)
		offset += chunk.length
	}

	return output
}

/**
 * Encode AnimatedCursor structure
 */
export function encodeAnimatedCursor(
	ani: AnimatedCursor,
	options: AniEncodeOptions = {}
): Uint8Array {
	return encodeAni(ani.frames, {
		defaultRate: ani.header.jifRate,
		title: ani.title ?? options.title,
		author: ani.author ?? options.author,
	})
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

function createChunk(id: number, data: Uint8Array): Uint8Array {
	const paddedSize = data.length + (data.length % 2)
	const chunk = new Uint8Array(8 + paddedSize)

	writeU32LE(chunk, 0, id)
	writeU32LE(chunk, 4, data.length)
	chunk.set(data, 8)

	return chunk
}

function createListChunk(listType: number, chunks: Uint8Array[]): Uint8Array {
	let contentSize = 4 // List type
	for (const chunk of chunks) {
		contentSize += chunk.length
	}

	const paddedSize = contentSize + (contentSize % 2)
	const list = new Uint8Array(8 + paddedSize)

	writeU32LE(list, 0, 0x5453494c) // 'LIST'
	writeU32LE(list, 4, contentSize)
	writeU32LE(list, 8, listType)

	let offset = 12
	for (const chunk of chunks) {
		list.set(chunk, offset)
		offset += chunk.length
	}

	return list
}

function stringToBytes(str: string): Uint8Array {
	const bytes = new Uint8Array(str.length + 1)
	for (let i = 0; i < str.length; i++) {
		bytes[i] = str.charCodeAt(i) & 0xff
	}
	bytes[str.length] = 0 // Null terminator
	return bytes
}

/**
 * ANI decoder - Animated Cursor format
 */

import type { ImageData } from '@mconv/core'
import { decodeCursorFile } from '../cur/decoder'
import type { CursorImage } from '../cur/types'
import { ANI_FLAG_ICON, type AniHeader, type AnimatedCursor } from './types'

/** RIFF chunk IDs */
const RIFF = 0x46464952 // 'RIFF'
const ACON = 0x4e4f4341 // 'ACON'
const LIST = 0x5453494c // 'LIST'
const ANIH = 0x68696e61 // 'anih'
const RATE = 0x65746172 // 'rate'
const SEQ = 0x20716573 // 'seq '
const FRAM = 0x6d617266 // 'fram'
const ICON = 0x6e6f6369 // 'icon'
const INAM = 0x4d414e49 // 'INAM'
const IART = 0x54524149 // 'IART'

/**
 * Decode ANI to first frame as ImageData
 */
export function decodeAni(data: Uint8Array): ImageData {
	const ani = decodeAnimatedCursor(data)

	if (ani.frames.length === 0) {
		throw new Error('No frames in ANI file')
	}

	const frame = ani.frames[0]!
	return {
		width: frame.width,
		height: frame.height,
		data: frame.data,
	}
}

/**
 * Decode full animated cursor
 */
export function decodeAnimatedCursor(data: Uint8Array): AnimatedCursor {
	let offset = 0

	// Read RIFF header
	const riffId = readU32LE(data, offset)
	if (riffId !== RIFF) {
		throw new Error('Not a RIFF file')
	}
	offset += 4

	const fileSize = readU32LE(data, offset)
	offset += 4

	const formType = readU32LE(data, offset)
	if (formType !== ACON) {
		throw new Error('Not an ANI file (expected ACON)')
	}
	offset += 4

	let header: AniHeader | null = null
	const frames: CursorImage[] = []
	let rates: number[] | undefined
	let sequence: number[] | undefined
	let title: string | undefined
	let author: string | undefined

	// Parse chunks
	while (offset < data.length - 8) {
		const chunkId = readU32LE(data, offset)
		const chunkSize = readU32LE(data, offset + 4)
		offset += 8

		switch (chunkId) {
			case ANIH:
				header = parseAnihChunk(data, offset, chunkSize)
				break

			case RATE:
				rates = parseRateChunk(data, offset, chunkSize)
				break

			case SEQ:
				sequence = parseSeqChunk(data, offset, chunkSize)
				break

			case LIST: {
				const listType = readU32LE(data, offset)
				if (listType === FRAM) {
					const listFrames = parseFramList(data, offset + 4, chunkSize - 4)
					frames.push(...listFrames)
				}
				break
			}

			case INAM:
				title = parseString(data, offset, chunkSize)
				break

			case IART:
				author = parseString(data, offset, chunkSize)
				break
		}

		// Align to word boundary
		offset += chunkSize + (chunkSize % 2)
	}

	if (!header) {
		throw new Error('Missing anih chunk')
	}

	return {
		header,
		frames,
		rates,
		sequence,
		title,
		author,
	}
}

/**
 * Check if data is an ANI file
 */
export function isAni(data: Uint8Array): boolean {
	if (data.length < 12) return false

	const riffId = readU32LE(data, 0)
	const formType = readU32LE(data, 8)

	return riffId === RIFF && formType === ACON
}

function readU32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
	)
}

function parseAnihChunk(data: Uint8Array, offset: number, size: number): AniHeader {
	return {
		cbSize: readU32LE(data, offset),
		nFrames: readU32LE(data, offset + 4),
		nSteps: readU32LE(data, offset + 8),
		cx: readU32LE(data, offset + 12),
		cy: readU32LE(data, offset + 16),
		bpp: readU32LE(data, offset + 20),
		nPlanes: readU32LE(data, offset + 24),
		jifRate: readU32LE(data, offset + 28),
		flags: readU32LE(data, offset + 32),
	}
}

function parseRateChunk(data: Uint8Array, offset: number, size: number): number[] {
	const rates: number[] = []
	const count = size / 4

	for (let i = 0; i < count; i++) {
		rates.push(readU32LE(data, offset + i * 4))
	}

	return rates
}

function parseSeqChunk(data: Uint8Array, offset: number, size: number): number[] {
	const sequence: number[] = []
	const count = size / 4

	for (let i = 0; i < count; i++) {
		sequence.push(readU32LE(data, offset + i * 4))
	}

	return sequence
}

function parseFramList(data: Uint8Array, offset: number, size: number): CursorImage[] {
	const frames: CursorImage[] = []
	let pos = offset
	const end = offset + size

	while (pos < end - 8) {
		const chunkId = readU32LE(data, pos)
		const chunkSize = readU32LE(data, pos + 4)
		pos += 8

		if (chunkId === ICON) {
			// This is a CUR/ICO frame
			const frameData = data.slice(pos, pos + chunkSize)
			try {
				const cursor = decodeCursorFile(frameData)
				if (cursor.cursors.length > 0) {
					frames.push(cursor.cursors[0]!)
				}
			} catch {
				// Skip invalid frames
			}
		}

		pos += chunkSize + (chunkSize % 2)
	}

	return frames
}

function parseString(data: Uint8Array, offset: number, size: number): string {
	let str = ''
	for (let i = 0; i < size; i++) {
		const byte = data[offset + i]!
		if (byte === 0) break
		str += String.fromCharCode(byte)
	}
	return str
}

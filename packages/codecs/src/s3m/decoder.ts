/**
 * S3M file decoder
 * Parses ScreamTracker 3 Module files
 */

import type {
	S3MCell,
	S3MChannelSettings,
	S3MFile,
	S3MInfo,
	S3MPattern,
	S3MSample,
	S3MVersion,
} from './types'

/**
 * S3M file signature
 */
const S3M_MAGIC = 0x4d524353 // 'SCRM' at offset 44

/**
 * Check if data is an S3M file
 */
export function isS3M(data: Uint8Array): boolean {
	if (data.length < 96) return false

	// Check for 'SCRM' signature at offset 44
	const magic = (data[47]! << 24) | (data[46]! << 16) | (data[45]! << 8) | data[44]!
	return magic === S3M_MAGIC
}

/**
 * Parse S3M info without full decode
 */
export function parseS3MInfo(data: Uint8Array): S3MInfo {
	if (!isS3M(data)) {
		throw new Error('Invalid S3M file: missing SCRM signature')
	}

	// Parse name
	const name = readString(data, 0, 28)

	// Parse version
	const version = readU16LE(data, 40) as S3MVersion

	// Parse counts
	const orderCount = readU16LE(data, 32)
	const instrumentCount = readU16LE(data, 34)
	const patternCount = readU16LE(data, 36)

	// Parse tempo and speed (at offsets 49, 50)
	const initialSpeed = data[49]!
	const initialTempo = data[50]!

	// Check for message
	const messagePtr = readU16LE(data, 40 + 24) // Special pointer
	const hasMessage = (readU16LE(data, 38) & 1) !== 0 && messagePtr !== 0

	// Count channels
	let channelCount = 0
	for (let i = 0; i < 32; i++) {
		const chSetting = data[64 + i]!
		if (chSetting < 16 || (chSetting >= 128 && chSetting < 144)) {
			channelCount++
		}
	}

	// Estimate duration (very rough estimate)
	// Typical S3M: 6 ticks/row, 64 rows/pattern, 125 BPM
	const ticksPerRow = initialSpeed
	const rowsPerPattern = 64
	const ticksPerSecond = (initialTempo * 2) / 5
	const estimatedPatterns = Math.min(orderCount, patternCount)
	const totalTicks = estimatedPatterns * rowsPerPattern * ticksPerRow
	const durationSeconds = totalTicks / ticksPerSecond

	return {
		name,
		version,
		channelCount,
		patternCount,
		instrumentCount,
		initialTempo,
		initialSpeed,
		hasMessage,
		durationSeconds,
	}
}

/**
 * Decode S3M file
 */
export function decodeS3M(data: Uint8Array): S3MFile {
	if (!isS3M(data)) {
		throw new Error('Invalid S3M file: missing SCRM signature')
	}

	let offset = 0

	// Parse header (96 bytes)
	const name = readString(data, offset, 28)
	offset = 28

	// Skip 0x1A marker and type
	offset += 2

	// Reserved
	offset += 2

	// Order count, instrument count, pattern count
	const orderCount = readU16LE(data, offset)
	offset += 2
	const instrumentCount = readU16LE(data, offset)
	offset += 2
	const patternCount = readU16LE(data, offset)
	offset += 2

	// Flags
	const flags = readU16LE(data, offset)
	offset += 2

	// Created with version
	const createdWith = readU16LE(data, offset)
	offset += 2

	// Sample format
	const sampleFormat = readU16LE(data, offset)
	offset += 2

	// SCRM signature (already validated)
	offset += 4

	// Global volume
	const globalVolume = data[offset]!
	offset++

	// Initial speed
	const initialSpeed = data[offset]!
	offset++

	// Initial tempo
	const initialTempo = data[offset]!
	offset++

	// Master volume
	const masterVolume = data[offset]! & 0x7f
	offset++

	// Ultra click removal
	const ultraClickRemoval = data[offset]!
	offset++

	// Default pan flag
	const defaultPan = data[offset]! === 252
	offset++

	// Reserved
	offset += 8

	// Special pointer (for message)
	const specialPtr = readU16LE(data, offset) * 16
	offset += 2

	// Parse channel settings
	const channels: S3MChannelSettings[] = []
	for (let i = 0; i < 32; i++) {
		const chSetting = data[offset]!
		offset++

		if (chSetting === 255) {
			channels.push({ enabled: false, panning: 0 })
		} else if (chSetting < 16) {
			// Left channel
			channels.push({ enabled: true, panning: -0.5 })
		} else if (chSetting < 32) {
			// Right channel
			channels.push({ enabled: true, panning: 0.5 })
		} else if (chSetting >= 128 && chSetting < 144) {
			// Adlib melody
			channels.push({ enabled: true, panning: 0 })
		} else if (chSetting >= 144 && chSetting < 160) {
			// Adlib drum
			channels.push({ enabled: true, panning: 0 })
		} else {
			channels.push({ enabled: false, panning: 0 })
		}
	}

	// Parse order list
	const orders: number[] = []
	for (let i = 0; i < orderCount; i++) {
		const order = data[offset]!
		offset++
		if (order < 254) {
			orders.push(order)
		}
	}

	// Parse instrument pointers
	const instrumentPointers: number[] = []
	for (let i = 0; i < instrumentCount; i++) {
		instrumentPointers.push(readU16LE(data, offset) * 16)
		offset += 2
	}

	// Parse pattern pointers
	const patternPointers: number[] = []
	for (let i = 0; i < patternCount; i++) {
		patternPointers.push(readU16LE(data, offset) * 16)
		offset += 2
	}

	// Parse panning if default pan flag is set
	if (defaultPan) {
		for (let i = 0; i < 32; i++) {
			const pan = data[offset]!
			offset++
			if (channels[i] && channels[i]!.enabled && (pan & 0x20)) {
				// Map 0-15 to -1.0 to 1.0
				channels[i]!.panning = ((pan & 0x0f) - 7.5) / 7.5
			}
		}
	}

	// Parse message if present
	let message: string | undefined
	if ((flags & 1) && specialPtr !== 0) {
		const msgLength = readU16LE(data, specialPtr)
		message = readString(data, specialPtr + 2, msgLength)
	}

	// Parse instruments
	const instruments: S3MSample[] = []
	for (const ptr of instrumentPointers) {
		if (ptr === 0) {
			// Empty instrument
			instruments.push(createEmptySample())
		} else {
			instruments.push(parseSample(data, ptr, sampleFormat))
		}
	}

	// Parse patterns
	const patterns: S3MPattern[] = []
	for (const ptr of patternPointers) {
		if (ptr === 0) {
			// Empty pattern
			patterns.push(createEmptyPattern())
		} else {
			patterns.push(parsePattern(data, ptr))
		}
	}

	const version = readU16LE(data, 40) as S3MVersion

	return {
		name,
		version,
		orderCount,
		instrumentCount,
		patternCount,
		flags,
		createdWith,
		sampleFormat,
		globalVolume,
		initialSpeed,
		initialTempo,
		masterVolume,
		ultraClickRemoval,
		defaultPan,
		message,
		channels,
		orders,
		instruments,
		patterns,
	}
}

/**
 * Parse a sample/instrument
 */
function parseSample(data: Uint8Array, offset: number, sampleFormat: number): S3MSample {
	// Type
	const type = data[offset]!
	offset++

	// DOS filename
	const filename = readString(data, offset, 12)
	offset += 12

	// Sample data pointer (paragraph)
	const memSeg = ((data[offset + 2]! << 16) | (data[offset + 1]! << 8) | data[offset]!) * 16
	offset += 3

	// Length
	const length = readU32LE(data, offset)
	offset += 4

	// Loop start
	const loopStart = readU32LE(data, offset)
	offset += 4

	// Loop end
	const loopEnd = readU32LE(data, offset)
	offset += 4

	// Volume
	const volume = data[offset]!
	offset++

	// Reserved
	offset++

	// Packing
	const pack = data[offset]!
	offset++

	// Flags
	const flags = data[offset]!
	offset++

	// C4 speed
	const c4Speed = readU32LE(data, offset)
	offset += 4

	// Reserved
	offset += 12

	// Sample name (28 bytes)
	const name = readString(data, offset, 28)
	offset += 28

	// SCRS marker (4 bytes) - optional validation
	// const marker = readString(data, offset, 4)
	// if (marker !== 'SCRS' && marker !== 'SCRI') throw error

	// Parse flags
	const isLooped = (flags & 1) !== 0
	const isStereo = (flags & 2) !== 0
	const is16Bit = (flags & 4) !== 0

	// Read sample data
	let sampleData = new Uint8Array(0)
	if (type === 1 && length > 0 && memSeg > 0 && memSeg < data.length) {
		const actualLength = is16Bit ? length * 2 : length
		const endPos = Math.min(memSeg + actualLength, data.length)
		sampleData = data.slice(memSeg, endPos)

		// Convert from unsigned to signed if needed
		if (sampleFormat === 1) {
			sampleData = convertToSigned(sampleData, is16Bit)
		}
	}

	return {
		type,
		filename,
		name,
		length,
		loopStart,
		loopEnd,
		volume,
		pack,
		flags,
		c4Speed,
		data: sampleData,
		isLooped,
		isStereo,
		is16Bit,
	}
}

/**
 * Parse a pattern
 */
function parsePattern(data: Uint8Array, offset: number): S3MPattern {
	// Read packed length
	const packedLength = readU16LE(data, offset)
	offset += 2

	const rows: S3MCell[][] = []
	for (let i = 0; i < 64; i++) {
		rows.push([])
		for (let j = 0; j < 32; j++) {
			rows[i]!.push({
				note: 0xff,
				instrument: 0,
				volume: 0xff,
				command: 0,
				param: 0,
			})
		}
	}

	const endOffset = offset + packedLength
	let row = 0

	while (offset < endOffset && row < 64) {
		const channelByte = data[offset]!
		offset++

		if (channelByte === 0) {
			// End of row
			row++
			continue
		}

		const channel = channelByte & 31
		const cell = rows[row]![channel]!

		// Note and instrument
		if (channelByte & 32) {
			cell.note = data[offset]!
			offset++
			cell.instrument = data[offset]!
			offset++
		}

		// Volume
		if (channelByte & 64) {
			cell.volume = data[offset]!
			offset++
		}

		// Command and param
		if (channelByte & 128) {
			cell.command = data[offset]!
			offset++
			cell.param = data[offset]!
			offset++
		}
	}

	return { rows }
}

/**
 * Create an empty sample
 */
function createEmptySample(): S3MSample {
	return {
		type: 0,
		filename: '',
		name: '',
		length: 0,
		loopStart: 0,
		loopEnd: 0,
		volume: 0,
		pack: 0,
		flags: 0,
		c4Speed: 8363,
		data: new Uint8Array(0),
		isLooped: false,
		isStereo: false,
		is16Bit: false,
	}
}

/**
 * Create an empty pattern
 */
function createEmptyPattern(): S3MPattern {
	const rows: S3MCell[][] = []
	for (let i = 0; i < 64; i++) {
		const row: S3MCell[] = []
		for (let j = 0; j < 32; j++) {
			row.push({
				note: 0xff,
				instrument: 0,
				volume: 0xff,
				command: 0,
				param: 0,
			})
		}
		rows.push(row)
	}
	return { rows }
}

/**
 * Convert unsigned sample data to signed
 */
function convertToSigned(data: Uint8Array, is16Bit: boolean): Uint8Array {
	const result = new Uint8Array(data.length)
	if (is16Bit) {
		// 16-bit conversion
		for (let i = 0; i < data.length; i += 2) {
			const value = (data[i + 1]! << 8) | data[i]!
			const signed = value - 32768
			result[i] = signed & 0xff
			result[i + 1] = (signed >> 8) & 0xff
		}
	} else {
		// 8-bit conversion
		for (let i = 0; i < data.length; i++) {
			result[i] = data[i]! - 128
		}
	}
	return result
}

/**
 * Read null-terminated string
 */
function readString(data: Uint8Array, offset: number, maxLength: number): string {
	let end = offset
	while (end < offset + maxLength && data[end] !== 0) {
		end++
	}
	return new TextDecoder('ascii').decode(data.slice(offset, end))
}

/**
 * Read 16-bit little-endian
 */
function readU16LE(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8)
}

/**
 * Read 32-bit little-endian
 */
function readU32LE(data: Uint8Array, offset: number): number {
	return (
		(data[offset]! |
		(data[offset + 1]! << 8) |
		(data[offset + 2]! << 16) |
		(data[offset + 3]! << 24)) >>> 0
	)
}

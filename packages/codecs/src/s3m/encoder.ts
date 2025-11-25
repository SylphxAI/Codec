/**
 * S3M file encoder
 * Creates ScreamTracker 3 Module files
 */

import type {
	S3MCell,
	S3MEncodeOptions,
	S3MFile,
	S3MPattern,
	S3MSample,
} from './types'

/**
 * Encode S3M file
 */
export function encodeS3M(file: S3MFile, options: S3MEncodeOptions = {}): Uint8Array {
	const initialSpeed = options.initialSpeed ?? file.initialSpeed
	const initialTempo = options.initialTempo ?? file.initialTempo
	const globalVolume = options.globalVolume ?? file.globalVolume
	const masterVolume = options.masterVolume ?? file.masterVolume

	// Calculate sizes and create header
	const orderCount = file.orders.length
	const instrumentCount = file.instruments.length
	const patternCount = file.patterns.length

	// Encode all components
	const header = encodeHeader(
		file,
		orderCount,
		instrumentCount,
		patternCount,
		initialSpeed,
		initialTempo,
		globalVolume,
		masterVolume
	)

	// Encode orders
	const orders = encodeOrders(file.orders, orderCount)

	// Encode patterns first to get their data
	const encodedPatterns: Uint8Array[] = []
	for (const pattern of file.patterns) {
		encodedPatterns.push(encodePattern(pattern))
	}

	// Encode samples and get their data
	const encodedSamples: Uint8Array[] = []
	for (const sample of file.instruments) {
		encodedSamples.push(encodeSampleHeader(sample))
	}

	// Calculate pointers (in paragraphs - 16 byte units)
	const headerSize = 96 + orderCount + (instrumentCount * 2) + (patternCount * 2) + (file.defaultPan ? 32 : 0)
	let currentPtr = Math.ceil(headerSize / 16)

	// Instrument pointers
	const instrumentPointers = new Uint8Array(instrumentCount * 2)
	for (let i = 0; i < instrumentCount; i++) {
		writeU16LE(instrumentPointers, i * 2, currentPtr)
		currentPtr += 5 // Each sample header is 80 bytes = 5 paragraphs
	}

	// Pattern pointers
	const patternPointers = new Uint8Array(patternCount * 2)
	for (let i = 0; i < patternCount; i++) {
		writeU16LE(patternPointers, i * 2, currentPtr)
		const patternSize = encodedPatterns[i]!.length
		currentPtr += Math.ceil(patternSize / 16)
	}

	// Sample data pointers
	const sampleDataPointers: number[] = []
	for (let i = 0; i < instrumentCount; i++) {
		if (file.instruments[i]!.data.length > 0) {
			sampleDataPointers.push(currentPtr)
			currentPtr += Math.ceil(file.instruments[i]!.data.length / 16)
		} else {
			sampleDataPointers.push(0)
		}
	}

	// Update sample headers with data pointers
	for (let i = 0; i < instrumentCount; i++) {
		if (sampleDataPointers[i]! > 0) {
			const ptr = sampleDataPointers[i]!
			encodedSamples[i]![13] = ptr & 0xff
			encodedSamples[i]![14] = (ptr >> 8) & 0xff
			encodedSamples[i]![15] = (ptr >> 16) & 0xff
		}
	}

	// Panning data if needed
	let panningData = new Uint8Array(0)
	if (file.defaultPan) {
		panningData = new Uint8Array(32)
		for (let i = 0; i < 32; i++) {
			const channel = file.channels[i]
			if (channel && channel.enabled) {
				// Map -1.0 to 1.0 to 0-15
				const pan = Math.round((channel.panning + 1.0) * 7.5)
				panningData[i] = 0x20 | (pan & 0x0f)
			} else {
				panningData[i] = 0x20 | 7 // Center
			}
		}
	}

	// Concatenate all parts
	const parts: Uint8Array[] = []

	// Header section (must be paragraph-aligned)
	const headerSection = concatArrays([
		header,
		orders,
		instrumentPointers,
		patternPointers,
		panningData,
	])
	// Pad to paragraph boundary
	const headerPadding = (16 - (headerSection.length % 16)) % 16
	parts.push(headerSection)
	if (headerPadding > 0) {
		parts.push(new Uint8Array(headerPadding))
	}

	// Add sample headers (each is 80 bytes = 5 paragraphs, already aligned)
	for (const sample of encodedSamples) {
		parts.push(sample)
	}

	// Add patterns (pad each to paragraph boundary)
	for (const pattern of encodedPatterns) {
		parts.push(pattern)
		const patternPadding = (16 - (pattern.length % 16)) % 16
		if (patternPadding > 0) {
			parts.push(new Uint8Array(patternPadding))
		}
	}

	// Add sample data (pad each to paragraph boundary)
	for (const sample of file.instruments) {
		if (sample.data.length > 0) {
			parts.push(sample.data)
			const samplePadding = (16 - (sample.data.length % 16)) % 16
			if (samplePadding > 0) {
				parts.push(new Uint8Array(samplePadding))
			}
		}
	}

	return concatArrays(parts)
}

/**
 * Create a simple S3M file from samples and patterns
 */
export function createS3MFromSamples(
	samples: S3MSample[],
	patterns: S3MPattern[],
	orders: number[],
	options: S3MEncodeOptions = {}
): Uint8Array {
	const channels: Array<{ enabled: boolean; panning: number }> = []
	for (let i = 0; i < 32; i++) {
		channels.push({ enabled: i < 16, panning: i < 8 ? -0.5 : 0.5 })
	}

	const file: S3MFile = {
		name: 'Created by mconv',
		version: 0x1300,
		orderCount: orders.length,
		instrumentCount: samples.length,
		patternCount: patterns.length,
		flags: 0,
		createdWith: 0x1300,
		sampleFormat: 1,
		globalVolume: options.globalVolume ?? 64,
		initialSpeed: options.initialSpeed ?? 6,
		initialTempo: options.initialTempo ?? 125,
		masterVolume: options.masterVolume ?? 48,
		ultraClickRemoval: 0,
		defaultPan: false,
		channels,
		orders,
		instruments: samples,
		patterns,
	}

	return encodeS3M(file, options)
}

/**
 * Encode header (96 bytes)
 */
function encodeHeader(
	file: S3MFile,
	orderCount: number,
	instrumentCount: number,
	patternCount: number,
	initialSpeed: number,
	initialTempo: number,
	globalVolume: number,
	masterVolume: number
): Uint8Array {
	const header = new Uint8Array(96)
	let offset = 0

	// Song name (28 bytes)
	writeString(header, offset, file.name, 28)
	offset += 28

	// 0x1A marker
	header[offset] = 0x1a
	offset++

	// Type (16 = S3M module)
	header[offset] = 16
	offset++

	// Reserved
	offset += 2

	// Order count
	writeU16LE(header, offset, orderCount)
	offset += 2

	// Instrument count
	writeU16LE(header, offset, instrumentCount)
	offset += 2

	// Pattern count
	writeU16LE(header, offset, patternCount)
	offset += 2

	// Flags
	writeU16LE(header, offset, file.flags)
	offset += 2

	// Created with version
	writeU16LE(header, offset, file.version)
	offset += 2

	// Sample format (1 = signed)
	writeU16LE(header, offset, 1)
	offset += 2

	// SCRM signature
	header[offset] = 0x53 // 'S'
	header[offset + 1] = 0x43 // 'C'
	header[offset + 2] = 0x52 // 'R'
	header[offset + 3] = 0x4d // 'M'
	offset += 4

	// Global volume
	header[offset] = globalVolume
	offset++

	// Initial speed
	header[offset] = initialSpeed
	offset++

	// Initial tempo
	header[offset] = initialTempo
	offset++

	// Master volume
	header[offset] = masterVolume & 0x7f
	offset++

	// Ultra click removal
	header[offset] = file.ultraClickRemoval
	offset++

	// Default pan flag
	header[offset] = file.defaultPan ? 252 : 0
	offset++

	// Reserved
	offset += 8

	// Special pointer (no message)
	writeU16LE(header, offset, 0)
	offset += 2

	// Channel settings
	for (let i = 0; i < 32; i++) {
		const channel = file.channels[i]
		if (channel && channel.enabled) {
			// 0-7 = left, 8-15 = right
			if (channel.panning < 0) {
				header[offset] = i % 8
			} else {
				header[offset] = 8 + (i % 8)
			}
		} else {
			header[offset] = 255 // Disabled
		}
		offset++
	}

	return header
}

/**
 * Encode orders
 */
function encodeOrders(orders: number[], orderCount: number): Uint8Array {
	const data = new Uint8Array(orderCount)
	for (let i = 0; i < orderCount; i++) {
		data[i] = orders[i] ?? 255
	}
	return data
}

/**
 * Encode sample header (80 bytes including SCRS marker)
 */
function encodeSampleHeader(sample: S3MSample): Uint8Array {
	const header = new Uint8Array(80)
	let offset = 0

	// Type
	header[offset] = sample.type
	offset++

	// DOS filename
	writeString(header, offset, sample.filename, 12)
	offset += 12

	// Sample data pointer (to be filled later, set to 0 for now)
	offset += 3

	// Length
	writeU32LE(header, offset, sample.length)
	offset += 4

	// Loop start
	writeU32LE(header, offset, sample.loopStart)
	offset += 4

	// Loop end
	writeU32LE(header, offset, sample.loopEnd)
	offset += 4

	// Volume
	header[offset] = sample.volume
	offset++

	// Reserved
	offset++

	// Packing
	header[offset] = sample.pack
	offset++

	// Flags
	header[offset] = sample.flags
	offset++

	// C4 speed
	writeU32LE(header, offset, sample.c4Speed)
	offset += 4

	// Reserved
	offset += 12

	// Sample name
	writeString(header, offset, sample.name, 28)
	offset += 28

	// SCRS marker
	header[offset] = 0x53 // 'S'
	header[offset + 1] = 0x43 // 'C'
	header[offset + 2] = 0x52 // 'R'
	header[offset + 3] = 0x53 // 'S'

	return header
}

/**
 * Encode pattern
 */
function encodePattern(pattern: S3MPattern): Uint8Array {
	const data: number[] = []

	for (let row = 0; row < 64; row++) {
		const rowData = pattern.rows[row]!

		for (let ch = 0; ch < 32; ch++) {
			const cell = rowData[ch]!

			// Check if cell has any data
			const hasNote = cell.note !== 0xff || cell.instrument !== 0
			const hasVolume = cell.volume !== 0xff
			const hasCommand = cell.command !== 0 || cell.param !== 0

			if (!hasNote && !hasVolume && !hasCommand) {
				continue
			}

			// Channel byte
			let channelByte = ch
			if (hasNote) channelByte |= 32
			if (hasVolume) channelByte |= 64
			if (hasCommand) channelByte |= 128

			data.push(channelByte)

			if (hasNote) {
				data.push(cell.note)
				data.push(cell.instrument)
			}

			if (hasVolume) {
				data.push(cell.volume)
			}

			if (hasCommand) {
				data.push(cell.command)
				data.push(cell.param)
			}
		}

		// End of row marker
		data.push(0)
	}

	// Create pattern with length header
	const packedLength = data.length
	const result = new Uint8Array(2 + packedLength)
	writeU16LE(result, 0, packedLength)
	for (let i = 0; i < packedLength; i++) {
		result[2 + i] = data[i]!
	}

	return result
}

/**
 * Create an empty cell
 */
export function createEmptyCell(): S3MCell {
	return {
		note: 0xff,
		instrument: 0,
		volume: 0xff,
		command: 0,
		param: 0,
	}
}

/**
 * Create an empty pattern
 */
export function createEmptyPattern(): S3MPattern {
	const rows: S3MCell[][] = []
	for (let i = 0; i < 64; i++) {
		const row: S3MCell[] = []
		for (let j = 0; j < 32; j++) {
			row.push(createEmptyCell())
		}
		rows.push(row)
	}
	return { rows }
}

/**
 * Create a note cell
 */
export function createNoteCell(
	note: number,
	instrument: number,
	volume: number = 0xff
): S3MCell {
	return {
		note,
		instrument,
		volume,
		command: 0,
		param: 0,
	}
}

/**
 * Write null-padded string
 */
function writeString(data: Uint8Array, offset: number, str: string, maxLength: number): void {
	const bytes = new TextEncoder().encode(str)
	const len = Math.min(bytes.length, maxLength)
	for (let i = 0; i < len; i++) {
		data[offset + i] = bytes[i]!
	}
	// Null padding
	for (let i = len; i < maxLength; i++) {
		data[offset + i] = 0
	}
}

/**
 * Write 16-bit little-endian
 */
function writeU16LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
}

/**
 * Write 32-bit little-endian
 */
function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

/**
 * Concatenate arrays
 */
function concatArrays(arrays: Uint8Array[]): Uint8Array {
	const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
	const result = new Uint8Array(totalLength)
	let offset = 0

	for (const arr of arrays) {
		result.set(arr, offset)
		offset += arr.length
	}

	return result
}

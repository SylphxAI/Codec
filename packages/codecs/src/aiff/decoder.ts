/**
 * AIFF audio decoder
 * Decodes Audio Interchange File Format (Apple)
 */

import {
	AIFF_MAGIC,
	AIFC_MAGIC,
	COMM_MAGIC,
	FORM_MAGIC,
	SSND_MAGIC,
	type AiffAudio,
	type AiffHeader,
	type AiffInfo,
} from './types'

/**
 * Check if data is an AIFF file
 */
export function isAiff(data: Uint8Array): boolean {
	if (data.length < 12) return false
	const form = readU32BE(data, 0)
	const type = readU32BE(data, 8)
	return form === FORM_MAGIC && (type === AIFF_MAGIC || type === AIFC_MAGIC)
}

/**
 * Parse AIFF header
 */
export function parseAiffHeader(data: Uint8Array): AiffHeader {
	if (!isAiff(data)) {
		throw new Error('Invalid AIFF: bad magic number')
	}

	const fileSize = readU32BE(data, 4) + 8
	const isAIFC = readU32BE(data, 8) === AIFC_MAGIC

	// Find COMM and SSND chunks
	let offset = 12
	let numChannels = 0
	let numSampleFrames = 0
	let sampleSize = 0
	let sampleRate = 0
	let compressionType: string | undefined
	let dataOffset = 0
	let dataSize = 0
	let blockSize = 0

	while (offset < data.length - 8) {
		const chunkId = readU32BE(data, offset)
		const chunkSize = readU32BE(data, offset + 4)

		if (chunkId === COMM_MAGIC) {
			numChannels = readU16BE(data, offset + 8)
			numSampleFrames = readU32BE(data, offset + 10)
			sampleSize = readU16BE(data, offset + 14)
			sampleRate = readExtended(data, offset + 16)

			if (isAIFC && chunkSize >= 22) {
				compressionType = readFourCC(data, offset + 26)
			}
		} else if (chunkId === SSND_MAGIC) {
			dataOffset = offset + 8 + 8 // Skip chunk header + offset/blockSize
			dataSize = chunkSize - 8
			blockSize = readU32BE(data, offset + 12)
		}

		// Move to next chunk (chunks are word-aligned)
		offset += 8 + chunkSize
		if (chunkSize % 2 === 1) offset++
	}

	if (numChannels === 0 || sampleRate === 0) {
		throw new Error('Invalid AIFF: missing COMM chunk')
	}

	return {
		fileSize,
		isAIFC,
		numChannels,
		numSampleFrames,
		sampleSize,
		sampleRate,
		compressionType,
		dataOffset,
		dataSize,
		blockSize,
	}
}

/**
 * Parse AIFF info without decoding samples
 */
export function parseAiffInfo(data: Uint8Array): AiffInfo {
	const header = parseAiffHeader(data)
	const duration = header.numSampleFrames / header.sampleRate

	return {
		numChannels: header.numChannels,
		sampleRate: header.sampleRate,
		bitsPerSample: header.sampleSize,
		isCompressed: header.isAIFC && header.compressionType !== 'NONE',
		duration,
		sampleCount: header.numSampleFrames,
	}
}

/**
 * Decode AIFF audio
 */
export function decodeAiff(data: Uint8Array): AiffAudio {
	const header = parseAiffHeader(data)
	const info = parseAiffInfo(data)

	if (info.isCompressed) {
		throw new Error('Compressed AIFF-C not supported')
	}

	// Decode samples
	const samples = decodeSamples(data, header)

	return { info, samples }
}

function decodeSamples(data: Uint8Array, header: AiffHeader): Float32Array[] {
	const { numChannels, numSampleFrames, sampleSize, dataOffset } = header
	const bytesPerSample = Math.ceil(sampleSize / 8)

	// Create channel arrays
	const channels: Float32Array[] = []
	for (let c = 0; c < numChannels; c++) {
		channels.push(new Float32Array(numSampleFrames))
	}

	let offset = dataOffset

	for (let i = 0; i < numSampleFrames; i++) {
		for (let c = 0; c < numChannels; c++) {
			const sample = decodeSample(data, offset, sampleSize)
			channels[c]![i] = sample
			offset += bytesPerSample
		}
	}

	return channels
}

function decodeSample(data: Uint8Array, offset: number, sampleSize: number): number {
	switch (sampleSize) {
		case 8: {
			// 8-bit signed (unlike WAV which is unsigned)
			const val = data[offset]!
			return (val > 127 ? val - 256 : val) / 128
		}
		case 16: {
			// 16-bit signed big-endian
			const val = readI16BE(data, offset)
			return val / 32768
		}
		case 24: {
			// 24-bit signed big-endian
			const val = readI24BE(data, offset)
			return val / 8388608
		}
		case 32: {
			// 32-bit signed big-endian
			const val = readI32BE(data, offset)
			return val / 2147483648
		}
		default:
			return 0
	}
}

/**
 * Read 80-bit extended precision float (IEEE 754)
 * Used for sample rate in AIFF
 */
function readExtended(data: Uint8Array, offset: number): number {
	const sign = (data[offset]! >> 7) & 1
	const exponent = ((data[offset]! & 0x7f) << 8) | data[offset + 1]!

	// Read 64-bit mantissa
	let mantissa = 0
	for (let i = 0; i < 8; i++) {
		mantissa = mantissa * 256 + data[offset + 2 + i]!
	}

	if (exponent === 0 && mantissa === 0) {
		return 0
	}

	if (exponent === 0x7fff) {
		return mantissa === 0 ? (sign ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY) : Number.NaN
	}

	// Normalize: exponent is biased by 16383
	const value = mantissa * 2 ** (exponent - 16383 - 63)
	return sign ? -value : value
}

function readFourCC(data: Uint8Array, offset: number): string {
	return String.fromCharCode(
		data[offset]!,
		data[offset + 1]!,
		data[offset + 2]!,
		data[offset + 3]!
	)
}

// Binary reading helpers (big-endian)
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

function readI16BE(data: Uint8Array, offset: number): number {
	const u = readU16BE(data, offset)
	return u > 0x7fff ? u - 0x10000 : u
}

function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) >>> 0) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

function readI24BE(data: Uint8Array, offset: number): number {
	const u = (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!
	return u > 0x7fffff ? u - 0x1000000 : u
}

function readI32BE(data: Uint8Array, offset: number): number {
	return (
		(data[offset]! << 24) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

/**
 * WMA (Windows Media Audio) encoder
 * Pure TypeScript implementation of WMA encoding
 */

import type { AudioData } from '@sylphx/codec-core'
import { ASF_GUID, type WmaEncodeOptions } from './types'

/**
 * Encode audio to WMA
 * Note: Full WMA encoding requires complex audio codec implementation
 * This is a basic implementation that creates ASF container with PCM
 */
export function encodeWma(audio: AudioData, options: WmaEncodeOptions = {}): Uint8Array {
	const { bitrate = 128000, quality, vbr = false } = options

	const { samples, sampleRate, channels } = audio

	if (channels === 0 || samples.length === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	const totalSamples = samples[0]!.length
	const duration = totalSamples / sampleRate

	// For now, convert to 16-bit PCM
	// Full WMA would use MDCT, quantization, and Huffman coding
	const bitsPerSample = 16
	const pcmData = convertToPcm16(samples)

	const parts: Uint8Array[] = []

	// Build ASF file structure
	const headerObjects = buildHeaderObjects(sampleRate, channels, bitsPerSample, bitrate, duration, totalSamples)

	// Calculate header size
	let headerSize = 30 // Header object overhead
	for (const obj of headerObjects) {
		headerSize += obj.length
	}

	// ASF Header
	parts.push(createAsfHeader(headerSize, headerObjects.length))
	parts.push(...headerObjects)

	// ASF Data object
	const dataPackets = createDataPackets(pcmData, channels, bitsPerSample, sampleRate)
	parts.push(createDataObjectHeader(dataPackets))
	parts.push(dataPackets)

	console.warn(
		'WMA encoding: Using PCM fallback. Full WMA codec encoding not implemented. ' +
			'Consider using a dedicated audio library for production use.'
	)

	return concatArrays(parts)
}

/**
 * Create ASF header object
 */
function createAsfHeader(headerSize: number, objectCount: number): Uint8Array {
	const data = new Uint8Array(30)
	let offset = 0

	// Header GUID
	offset = writeGuid(data, offset, ASF_GUID.HEADER)

	// Header size (including this header)
	offset = writeU64LE(data, offset, BigInt(headerSize))

	// Number of header objects
	offset = writeU32LE(data, offset, objectCount)

	// Reserved (2 bytes)
	data[offset++] = 1
	data[offset++] = 2

	return data
}

/**
 * Build header objects
 */
function buildHeaderObjects(
	sampleRate: number,
	channels: number,
	bitsPerSample: number,
	bitrate: number,
	duration: number,
	totalSamples: number
): Uint8Array[] {
	const objects: Uint8Array[] = []

	// File properties
	objects.push(createFileProperties(duration, bitrate))

	// Stream properties
	objects.push(createStreamProperties(sampleRate, channels, bitsPerSample, bitrate))

	// Content description (empty but present)
	objects.push(createContentDescription())

	return objects
}

/**
 * Create file properties object
 */
function createFileProperties(duration: number, bitrate: number): Uint8Array {
	const data = new Uint8Array(104)
	let offset = 0

	// File Properties GUID
	offset = writeGuid(data, offset, ASF_GUID.FILE_PROPERTIES)

	// Object size
	offset = writeU64LE(data, offset, BigInt(104))

	// File ID (random GUID)
	offset = writeGuid(data, offset, generateRandomGuid())

	// File size (placeholder - would need to calculate)
	offset = writeU64LE(data, offset, BigInt(0))

	// Creation date (Windows FILETIME: 100-nanosecond intervals since 1601-01-01)
	const now = Date.now()
	const windowsEpoch = 116444736000000000n // 1601 to 1970 in 100-ns
	const fileTime = windowsEpoch + BigInt(now) * 10000n
	offset = writeU64LE(data, offset, fileTime)

	// Data packets count
	offset = writeU64LE(data, offset, BigInt(0))

	// Play duration (100-nanosecond units)
	// Add preroll time to the play duration
	const prerollMs = 0 // No preroll for simple PCM
	const playDuration = BigInt(Math.floor((duration + prerollMs / 1000) * 10000000))
	offset = writeU64LE(data, offset, playDuration)

	// Send duration
	offset = writeU64LE(data, offset, playDuration)

	// Preroll (milliseconds)
	offset = writeU64LE(data, offset, BigInt(prerollMs))

	// Flags (broadcast=1, seekable=2)
	offset = writeU32LE(data, offset, 0x02)

	// Min/max packet size
	const packetSize = 8192
	offset = writeU32LE(data, offset, packetSize)
	offset = writeU32LE(data, offset, packetSize)

	// Max bitrate
	offset = writeU32LE(data, offset, bitrate)

	return data
}

/**
 * Create stream properties object
 */
function createStreamProperties(
	sampleRate: number,
	channels: number,
	bitsPerSample: number,
	bitrate: number
): Uint8Array {
	const codecDataSize = 0
	const objectSize = 24 + 16 + 16 + 8 + 4 + 4 + 2 + 4 + 18 + codecDataSize

	const data = new Uint8Array(objectSize)
	let offset = 0

	// Stream Properties GUID
	offset = writeGuid(data, offset, ASF_GUID.STREAM_PROPERTIES)

	// Object size
	offset = writeU64LE(data, offset, BigInt(objectSize))

	// Stream type (Audio)
	offset = writeGuid(data, offset, ASF_GUID.AUDIO_MEDIA)

	// Error correction type (none)
	offset = writeGuid(data, offset, '00000000000000000000000000000000')

	// Time offset
	offset = writeU64LE(data, offset, BigInt(0))

	// Type specific data length (WAVEFORMATEX structure)
	offset = writeU32LE(data, offset, 18 + codecDataSize)

	// Error correction data length
	offset = writeU32LE(data, offset, 0)

	// Flags (stream number=1, encrypted=0, reserved=0)
	offset = writeU16LE(data, offset, 0x0001)

	// Reserved
	offset = writeU32LE(data, offset, 0)

	// WAVEFORMATEX structure
	// Format tag (0x0001 = PCM)
	offset = writeU16LE(data, offset, 0x0001)

	// Channels
	offset = writeU16LE(data, offset, channels)

	// Samples per second
	offset = writeU32LE(data, offset, sampleRate)

	// Average bytes per second
	const avgBytesPerSec = Math.floor((sampleRate * channels * bitsPerSample) / 8)
	offset = writeU32LE(data, offset, avgBytesPerSec)

	// Block align
	const blockAlign = Math.floor((channels * bitsPerSample) / 8)
	offset = writeU16LE(data, offset, blockAlign)

	// Bits per sample
	offset = writeU16LE(data, offset, bitsPerSample)

	// Codec data size
	offset = writeU16LE(data, offset, codecDataSize)

	return data
}

/**
 * Create content description object (empty)
 */
function createContentDescription(): Uint8Array {
	const data = new Uint8Array(34)
	let offset = 0

	// Content Description GUID
	offset = writeGuid(data, offset, ASF_GUID.CONTENT_DESCRIPTION)

	// Object size
	offset = writeU64LE(data, offset, BigInt(34))

	// All lengths are 0 (no content)
	offset = writeU16LE(data, offset, 0) // Title
	offset = writeU16LE(data, offset, 0) // Author
	offset = writeU16LE(data, offset, 0) // Copyright
	offset = writeU16LE(data, offset, 0) // Description
	offset = writeU16LE(data, offset, 0) // Rating

	return data
}

/**
 * Create data object header
 */
function createDataObjectHeader(dataPackets: Uint8Array): Uint8Array {
	const data = new Uint8Array(50)
	let offset = 0

	// Data GUID
	offset = writeGuid(data, offset, ASF_GUID.DATA)

	// Object size
	offset = writeU64LE(data, offset, BigInt(50 + dataPackets.length))

	// File ID (should match file properties)
	offset = writeGuid(data, offset, generateRandomGuid())

	// Total data packets
	offset = writeU64LE(data, offset, BigInt(1))

	// Reserved
	offset = writeU16LE(data, offset, 0x0101)

	return data
}

/**
 * Create data packets with PCM audio
 */
function createDataPackets(pcmData: Uint8Array, channels: number, bitsPerSample: number, sampleRate: number): Uint8Array {
	// Simple single-packet implementation
	// Real WMA would split into multiple packets with headers
	return pcmData
}

/**
 * Convert Float32Array samples to 16-bit PCM
 */
function convertToPcm16(samples: Float32Array[]): Uint8Array {
	const channels = samples.length
	const numSamples = samples[0]!.length
	const pcm = new Uint8Array(numSamples * channels * 2)

	let offset = 0
	for (let i = 0; i < numSamples; i++) {
		for (let ch = 0; ch < channels; ch++) {
			// Clamp and convert to 16-bit signed integer
			const sample = Math.max(-1, Math.min(1, samples[ch]![i]!))
			const value = Math.round(sample * 32767)
			const signed = value < 0 ? value + 65536 : value

			// Little-endian 16-bit
			pcm[offset++] = signed & 0xff
			pcm[offset++] = (signed >> 8) & 0xff
		}
	}

	return pcm
}

/**
 * Generate random GUID
 */
function generateRandomGuid(): string {
	const bytes = new Uint8Array(16)
	for (let i = 0; i < 16; i++) {
		bytes[i] = Math.floor(Math.random() * 256)
	}

	// Set version (4) and variant (RFC 4122)
	bytes[6] = (bytes[6]! & 0x0f) | 0x40
	bytes[8] = (bytes[8]! & 0x3f) | 0x80

	let guid = ''
	// Data1
	for (let i = 3; i >= 0; i--) guid += bytes[i]!.toString(16).padStart(2, '0')
	// Data2
	for (let i = 5; i >= 4; i--) guid += bytes[i]!.toString(16).padStart(2, '0')
	// Data3
	for (let i = 7; i >= 6; i--) guid += bytes[i]!.toString(16).padStart(2, '0')
	// Data4
	for (let i = 8; i < 16; i++) guid += bytes[i]!.toString(16).padStart(2, '0')

	return guid
}

/**
 * Write GUID to buffer (little-endian for first 3 parts, big-endian for last)
 */
function writeGuid(data: Uint8Array, offset: number, guid: string): number {
	// Parse hex string GUID
	const bytes = new Uint8Array(16)
	for (let i = 0; i < 16; i++) {
		bytes[i] = parseInt(guid.substr(i * 2, 2), 16)
	}

	// Data1 (4 bytes, little-endian)
	for (let i = 3; i >= 0; i--) {
		data[offset++] = bytes[i]!
	}

	// Data2 (2 bytes, little-endian)
	for (let i = 5; i >= 4; i--) {
		data[offset++] = bytes[i]!
	}

	// Data3 (2 bytes, little-endian)
	for (let i = 7; i >= 6; i--) {
		data[offset++] = bytes[i]!
	}

	// Data4 (8 bytes, big-endian)
	for (let i = 8; i < 16; i++) {
		data[offset++] = bytes[i]!
	}

	return offset
}

/**
 * Write 16-bit little-endian
 */
function writeU16LE(data: Uint8Array, offset: number, value: number): number {
	data[offset++] = value & 0xff
	data[offset++] = (value >> 8) & 0xff
	return offset
}

/**
 * Write 32-bit little-endian
 */
function writeU32LE(data: Uint8Array, offset: number, value: number): number {
	data[offset++] = value & 0xff
	data[offset++] = (value >> 8) & 0xff
	data[offset++] = (value >> 16) & 0xff
	data[offset++] = (value >> 24) & 0xff
	return offset
}

/**
 * Write 64-bit little-endian
 */
function writeU64LE(data: Uint8Array, offset: number, value: bigint): number {
	const low = Number(value & 0xffffffffn)
	const high = Number(value >> 32n)

	offset = writeU32LE(data, offset, low)
	offset = writeU32LE(data, offset, high)

	return offset
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

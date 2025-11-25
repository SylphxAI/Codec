/**
 * MPC decoder
 * Decodes Musepack (MPC) audio files
 */

import type { AudioData } from '@sylphx/codec-core'
import {
	MPC_MAGIC_SV7,
	MPC_MAGIC_SV8,
	MPC_SAMPLE_RATES,
	MPC_SAMPLES_PER_FRAME,
	MPCPacketType,
	MPCVersion,
	type MPCDecodeResult,
	type MPCEncoderInfo,
	type MPCFrame,
	type MPCFrameHeader,
	type MPCInfo,
	type MPCReplayGain,
	type MPCStreamHeader,
	type MPCSV7Header,
} from './types'

/**
 * Check if data is an MPC file
 */
export function isMpc(data: Uint8Array): boolean {
	if (data.length < 4) return false

	// Check for SV8 magic "MPCK"
	const magicSV8 = (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!
	if (magicSV8 === MPC_MAGIC_SV8) {
		return true
	}

	// Check for SV7 magic "MP+"
	if (data.length >= 3) {
		const magicSV7 = (data[0]! << 16) | (data[1]! << 8) | data[2]!
		if (magicSV7 === MPC_MAGIC_SV7) {
			return true
		}
	}

	return false
}

/**
 * Parse SV8 stream header
 */
export function parseSV8StreamHeader(data: Uint8Array, offset: number): MPCStreamHeader | null {
	if (offset + 8 > data.length) return null

	// Check for "MPCK" magic
	const magic = (data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!
	if (magic !== MPC_MAGIC_SV8) return null

	offset += 4

	// Find Stream Header packet
	let pos = offset
	while (pos + 4 < data.length) {
		const packetType = String.fromCharCode(data[pos]!, data[pos + 1]!)
		const packetSize = readVarint(data, pos + 2)
		if (packetSize.value === -1) break

		pos += 2 + packetSize.length

		if (packetType === MPCPacketType.STREAM_HEADER) {
			// Parse stream header
			const headerData = data.slice(pos, pos + packetSize.value)
			return parseSV8Header(headerData)
		}

		pos += packetSize.value
	}

	return null
}

/**
 * Parse SV8 header data
 */
function parseSV8Header(data: Uint8Array): MPCStreamHeader {
	let offset = 0

	// CRC (4 bytes) - skip
	offset += 4

	// Stream version (varint)
	const version = readVarint(data, offset)
	offset += version.length

	// Total samples (varint)
	const totalSamples = readVarint(data, offset)
	offset += totalSamples.length

	// Begin silence (varint)
	const beginSilence = readVarint(data, offset)
	offset += beginSilence.length

	// Sample frequency index (3 bits)
	const sampleFreqIdx = (data[offset]! >> 5) & 0x07
	const sampleRate = MPC_SAMPLE_RATES[sampleFreqIdx] || 44100

	// Channels - 1 (4 bits)
	const channels = ((data[offset]! >> 1) & 0x0f) + 1

	// Audio block frames (varint) - optional
	offset += 1
	const audioBlockFrames = offset < data.length ? readVarint(data, offset).value : 16

	return {
		version: MPCVersion.SV8,
		sampleRate,
		channels,
		totalSamples: totalSamples.value,
		beginSilence: beginSilence.value,
		audioBlockFrames,
		encoderVersion: version.value,
	}
}

/**
 * Parse SV7 header
 */
export function parseSV7Header(data: Uint8Array, offset: number = 0): MPCSV7Header | null {
	if (offset + 28 > data.length) return null

	// Check for "MP+" magic
	const magic = (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!
	if (magic !== MPC_MAGIC_SV7) return null

	offset += 3

	// Stream version (1 byte)
	const version = data[offset]!
	offset += 1

	// Frame count (4 bytes, little-endian)
	const frameCount =
		data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
	offset += 4

	// Max band (1 byte)
	const maxBand = data[offset]!
	offset += 1

	// Channel count (1 byte)
	const channels = data[offset]! === 0 ? 2 : 1
	offset += 1

	// Mid-side stereo (1 byte)
	const midSideStereo = data[offset]! === 1
	offset += 1

	// Sample rate index (2 bytes)
	const sampleRateIdx = data[offset]! | (data[offset + 1]! << 8)
	const sampleRate = MPC_SAMPLE_RATES[sampleRateIdx & 0x03] || 44100
	offset += 2

	// Profile (2 bytes)
	const profile = data[offset]! | (data[offset + 1]! << 8)
	offset += 2

	// Encoder version (2 bytes)
	const encoderVersion = data[offset]! | (data[offset + 1]! << 8)

	return {
		version: MPCVersion.SV7,
		sampleRate,
		channels,
		frameCount,
		maxBand,
		midSideStereo,
		profile,
		encoderVersion,
	}
}

/**
 * Read variable-length integer (varint)
 */
function readVarint(data: Uint8Array, offset: number): { value: number; length: number } {
	let value = 0
	let shift = 0
	let length = 0

	for (let i = 0; i < 10 && offset + i < data.length; i++) {
		const byte = data[offset + i]!
		value |= (byte & 0x7f) << shift
		length++

		if ((byte & 0x80) === 0) {
			break
		}

		shift += 7
	}

	return { value, length }
}

/**
 * Parse MPC info without decoding
 */
export function parseMpcInfo(data: Uint8Array): MPCInfo {
	// Try SV8 first
	const sv8Header = parseSV8StreamHeader(data, 0)
	if (sv8Header) {
		const duration = sv8Header.totalSamples / sv8Header.sampleRate
		const bitrate = Math.round((data.length * 8) / duration / 1000)

		return {
			version: MPCVersion.SV8,
			sampleRate: sv8Header.sampleRate,
			channels: sv8Header.channels,
			duration,
			totalSamples: sv8Header.totalSamples,
			bitrate,
		}
	}

	// Try SV7
	const sv7Header = parseSV7Header(data, 0)
	if (sv7Header) {
		const totalSamples = sv7Header.frameCount * MPC_SAMPLES_PER_FRAME
		const duration = totalSamples / sv7Header.sampleRate
		const bitrate = Math.round((data.length * 8) / duration / 1000)

		return {
			version: MPCVersion.SV7,
			sampleRate: sv7Header.sampleRate,
			channels: sv7Header.channels,
			duration,
			totalSamples,
			bitrate,
		}
	}

	throw new Error('Invalid MPC file: no valid header found')
}

/**
 * Parse MPC frame header (SV7)
 */
export function parseFrameHeader(data: Uint8Array, offset: number): MPCFrameHeader | null {
	if (offset + 4 > data.length) return null

	// Read frame size (20 bits)
	const frameSize = ((data[offset]! << 12) | (data[offset + 1]! << 4) | (data[offset + 2]! >> 4)) & 0xfffff

	// Reserved bits
	const reserved = data[offset + 2]! & 0x0f

	return {
		frameSize,
		samplesPerFrame: MPC_SAMPLES_PER_FRAME,
		reserved,
	}
}

/**
 * Decode MPC audio
 */
export function decodeMpc(data: Uint8Array): MPCDecodeResult {
	const info = parseMpcInfo(data)

	// Parse frames
	const frames: MPCFrame[] = []
	let offset = 0

	if (info.version === MPCVersion.SV8) {
		offset = parseSV8Frames(data, frames)
	} else {
		offset = parseSV7Frames(data, frames, info)
	}

	// Decode frames to PCM
	const samples = decodeFrames(frames, info)

	return { info, samples }
}

/**
 * Parse SV8 frames
 */
function parseSV8Frames(data: Uint8Array, frames: MPCFrame[]): number {
	let offset = 4 // Skip "MPCK"

	while (offset + 2 < data.length) {
		const packetType = String.fromCharCode(data[offset]!, data[offset + 1]!)
		const packetSize = readVarint(data, offset + 2)
		if (packetSize.value === -1) break

		offset += 2 + packetSize.length

		if (packetType === MPCPacketType.AUDIO_PACKET) {
			const frameData = data.slice(offset, offset + packetSize.value)
			frames.push({
				header: {
					frameSize: packetSize.value,
					samplesPerFrame: MPC_SAMPLES_PER_FRAME,
					reserved: 0,
				},
				data: frameData,
			})
		} else if (packetType === MPCPacketType.STREAM_END) {
			break
		}

		offset += packetSize.value
	}

	return offset
}

/**
 * Parse SV7 frames
 */
function parseSV7Frames(data: Uint8Array, frames: MPCFrame[], info: MPCInfo): number {
	const sv7Header = parseSV7Header(data, 0)
	if (!sv7Header) return 0

	let offset = 28 // Skip header

	for (let i = 0; i < sv7Header.frameCount && offset < data.length; i++) {
		const header = parseFrameHeader(data, offset)
		if (!header) break

		const frameData = data.slice(offset + 4, offset + header.frameSize)
		frames.push({
			header,
			data: frameData,
		})

		offset += header.frameSize
	}

	return offset
}

/**
 * Decode frames to PCM samples
 * Full implementation would include:
 * - Huffman/range decoding
 * - Subband synthesis
 * - Quantization and dequantization
 * - Mid-side stereo processing
 * - Filterbank reconstruction
 */
function decodeFrames(frames: MPCFrame[], info: MPCInfo): Float32Array[] {
	const totalSamples = frames.reduce((sum, f) => sum + f.header.samplesPerFrame, 0)
	const channels: Float32Array[] = []

	for (let ch = 0; ch < info.channels; ch++) {
		channels.push(new Float32Array(totalSamples))
	}

	// Simplified: Create silent audio
	// A full implementation would decode the compressed audio data using:
	// - Range decoder for entropy decoding
	// - Subband quantization tables
	// - PQMF (Pseudo Quadrature Mirror Filter) synthesis filterbank
	// - Mid-side stereo reconstruction
	let sampleOffset = 0
	for (const frame of frames) {
		// TODO: Implement full MPC decoding pipeline
		// For now, fill with silence
		sampleOffset += frame.header.samplesPerFrame
	}

	return channels
}

/**
 * Decode text from buffer
 */
function decodeText(data: Uint8Array): string {
	try {
		const decoder = new TextDecoder('utf-8', { fatal: true })
		return decoder.decode(data).replace(/\0/g, '').trim()
	} catch {
		const decoder = new TextDecoder('latin1')
		return decoder.decode(data).replace(/\0/g, '').trim()
	}
}

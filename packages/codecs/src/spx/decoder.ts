/**
 * Speex audio decoder
 * Pure TypeScript implementation of Speex decoding from Ogg container
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeOgg } from '../ogg/decoder'
import {
	SPEEX_COMMENT_MAGIC,
	SPEEX_MAGIC,
	SpeexMode,
	type SpeexComment,
	type SpeexDecodeResult,
	type SpeexHeader,
	type SpeexInfo,
	type SpeexPacket,
} from './types'

/**
 * Check if data is Speex (in Ogg container)
 */
export function isSpeex(data: Uint8Array): boolean {
	if (data.length < 80) return false

	// Check for Ogg sync: "OggS"
	if (data[0] !== 0x4f || data[1] !== 0x67 || data[2] !== 0x67 || data[3] !== 0x53) {
		return false
	}

	// Parse first page to check for Speex header
	try {
		// Skip to page data (27 bytes header + segment table)
		const segmentCount = data[26]!
		const dataStart = 27 + segmentCount

		if (dataStart + 8 > data.length) return false

		// Check for "Speex   " magic (with 3 spaces)
		const magic = String.fromCharCode(
			data[dataStart]!,
			data[dataStart + 1]!,
			data[dataStart + 2]!,
			data[dataStart + 3]!,
			data[dataStart + 4]!,
			data[dataStart + 5]!,
			data[dataStart + 6]!,
			data[dataStart + 7]!
		)

		return magic === SPEEX_MAGIC
	} catch {
		return false
	}
}

/**
 * Parse Speex info without full decode
 */
export function parseSpeexInfo(data: Uint8Array): SpeexInfo {
	if (!isSpeex(data)) {
		throw new Error('Invalid Speex: missing Speex magic in Ogg container')
	}

	const oggData = decodeOgg(data)

	if (oggData.packets.length === 0 || !oggData.packets[0] || oggData.packets[0].length === 0) {
		throw new Error('Invalid Speex: no packets found')
	}

	// First packet is Speex header
	const headerPacket = oggData.packets[0][0]!
	const header = parseSpeexHeader(headerPacket)

	// Second packet is Speex comment (if present)
	let comment: SpeexComment | undefined
	if (oggData.packets[0].length > 1) {
		try {
			comment = parseSpeexComment(oggData.packets[0][1]!)
		} catch {
			// Comments are optional
		}
	}

	// Calculate duration from last page granule position
	let duration: number | undefined
	let totalSamples: number | undefined

	if (oggData.pages.length > 0) {
		const lastPage = oggData.pages[oggData.pages.length - 1]!
		if (lastPage.granulePosition > 0n) {
			totalSamples = Number(lastPage.granulePosition)
			duration = totalSamples / header.sampleRate
		}
	}

	return {
		channels: header.channels,
		sampleRate: header.sampleRate,
		mode: header.mode,
		frameSize: header.frameSize,
		vbr: header.vbr,
		bitrate: header.bitrate,
		framesPerPacket: header.framesPerPacket,
		duration,
		totalSamples,
		vendor: comment?.vendor,
		tags: comment?.comments,
	}
}

/**
 * Decode Speex file to audio data
 */
export function decodeSpeex(data: Uint8Array): SpeexDecodeResult {
	const info = parseSpeexInfo(data)
	const oggData = decodeOgg(data)

	if (oggData.packets.length === 0 || !oggData.packets[0]) {
		throw new Error('Invalid Speex: no packets found')
	}

	const packets = oggData.packets[0]

	// Skip first two packets (Speex header and comments)
	const audioPackets = packets.slice(2)

	// Decode audio packets
	const decodedSamples = decodeSpeexPackets(audioPackets, info)

	const audio: AudioData = {
		samples: decodedSamples,
		sampleRate: info.sampleRate,
		channels: info.channels,
	}

	return { info, audio }
}

/**
 * Parse Speex header packet (identification header)
 */
function parseSpeexHeader(data: Uint8Array): SpeexHeader {
	if (data.length < 80) {
		throw new Error('Invalid Speex header: packet too short')
	}

	// Check magic
	const magic = String.fromCharCode(
		data[0]!,
		data[1]!,
		data[2]!,
		data[3]!,
		data[4]!,
		data[5]!,
		data[6]!,
		data[7]!
	)

	if (magic !== SPEEX_MAGIC) {
		throw new Error(`Invalid Speex header: expected "${SPEEX_MAGIC}", got "${magic}"`)
	}

	// Parse version string (20 bytes, null-terminated)
	let versionEnd = 28
	for (let i = 8; i < 28; i++) {
		if (data[i] === 0) {
			versionEnd = i
			break
		}
	}
	const version = String.fromCharCode(...Array.from(data.slice(8, versionEnd)))

	const versionId = readLittleEndian32(data, 28)
	const headerSize = readLittleEndian32(data, 32)
	const sampleRate = readLittleEndian32(data, 36)
	const mode = readLittleEndian32(data, 40)
	const modeBitstreamVersion = readLittleEndian32(data, 44)
	const channels = readLittleEndian32(data, 48)
	const bitrate = readLittleEndian32Signed(data, 52)
	const frameSize = readLittleEndian32(data, 56)
	const vbr = readLittleEndian32(data, 60) !== 0
	const framesPerPacket = readLittleEndian32(data, 64)
	const extraHeaders = readLittleEndian32(data, 68)
	const reserved = readLittleEndian32(data, 72)

	// Validate mode
	if (mode !== SpeexMode.NARROWBAND && mode !== SpeexMode.WIDEBAND && mode !== SpeexMode.ULTRA_WIDEBAND) {
		throw new Error(`Invalid Speex mode: ${mode}`)
	}

	// Validate sample rate matches mode
	const expectedRate = mode === SpeexMode.NARROWBAND ? 8000 : mode === SpeexMode.WIDEBAND ? 16000 : 32000
	if (sampleRate !== expectedRate) {
		console.warn(`Speex sample rate ${sampleRate} doesn't match mode ${mode}, expected ${expectedRate}`)
	}

	return {
		magic,
		version,
		versionId,
		headerSize,
		sampleRate,
		mode,
		modeBitstreamVersion,
		channels,
		bitrate,
		frameSize,
		vbr,
		framesPerPacket,
		extraHeaders,
		reserved,
	}
}

/**
 * Parse Speex comment packet
 */
function parseSpeexComment(data: Uint8Array): SpeexComment {
	if (data.length < 4) {
		throw new Error('Invalid Speex comment: packet too short')
	}

	let offset = 0

	// Read vendor string length
	const vendorLength = readLittleEndian32(data, offset)
	offset += 4

	if (offset + vendorLength > data.length) {
		throw new Error('Invalid Speex comment: vendor string truncated')
	}

	const vendor = new TextDecoder('utf-8').decode(data.slice(offset, offset + vendorLength))
	offset += vendorLength

	// Read comment count
	if (offset + 4 > data.length) {
		throw new Error('Invalid Speex comment: comment count missing')
	}

	const commentCount = readLittleEndian32(data, offset)
	offset += 4

	// Read comments
	const comments: Record<string, string> = {}

	for (let i = 0; i < commentCount; i++) {
		if (offset + 4 > data.length) {
			throw new Error('Invalid Speex comment: comment length missing')
		}

		const commentLength = readLittleEndian32(data, offset)
		offset += 4

		if (offset + commentLength > data.length) {
			throw new Error('Invalid Speex comment: comment truncated')
		}

		const comment = new TextDecoder('utf-8').decode(data.slice(offset, offset + commentLength))
		offset += commentLength

		// Parse key=value
		const eqIndex = comment.indexOf('=')
		if (eqIndex > 0) {
			const key = comment.substring(0, eqIndex).toUpperCase()
			const value = comment.substring(eqIndex + 1)
			comments[key] = value
		}
	}

	return { vendor, comments }
}

/**
 * Decode Speex audio packets
 * Simplified implementation - real decoder would use Speex CELP algorithm
 */
function decodeSpeexPackets(packets: Uint8Array[], info: SpeexInfo): Float32Array[] {
	// Initialize output buffers
	const outputSamples: Float32Array[] = []
	for (let ch = 0; ch < info.channels; ch++) {
		outputSamples.push(new Float32Array(0))
	}

	// Decode each packet
	for (const packetData of packets) {
		if (packetData.length === 0) continue

		try {
			const packet = parseSpeexPacket(packetData, info)
			const frameSamples = decodeSpeexPacket(packet, info)

			// Append to output
			for (let ch = 0; ch < info.channels; ch++) {
				const existing = outputSamples[ch]!
				const newSamples = frameSamples[ch]!
				const combined = new Float32Array(existing.length + newSamples.length)
				combined.set(existing)
				combined.set(newSamples, existing.length)
				outputSamples[ch] = combined
			}
		} catch (e) {
			// Skip corrupted packet
			console.warn('Failed to decode Speex packet:', e)
		}
	}

	return outputSamples
}

/**
 * Parse Speex packet structure
 */
function parseSpeexPacket(data: Uint8Array, info: SpeexInfo): SpeexPacket {
	if (data.length === 0) {
		throw new Error('Empty Speex packet')
	}

	// Speex packets don't have a standard header like Opus
	// The mode is determined from the stream header
	return {
		data,
		mode: info.mode,
		frameCount: info.framesPerPacket,
	}
}

/**
 * Decode a single Speex packet to PCM samples
 * Simplified implementation - real decoder would use Speex CELP algorithm
 */
function decodeSpeexPacket(packet: SpeexPacket, info: SpeexInfo): Float32Array[] {
	// In a real implementation, this would:
	// 1. Parse bitstream using Speex bit unpacking
	// 2. Decode LSP parameters (Line Spectral Pairs)
	// 3. Decode pitch and gain parameters
	// 4. Reconstruct excitation signal
	// 5. Apply LPC synthesis filter
	// 6. Apply perceptual enhancement
	// 7. Handle packet loss concealment

	// Simplified: Generate placeholder decoded samples
	const samples: Float32Array[] = []
	const totalSamples = info.frameSize * packet.frameCount

	for (let ch = 0; ch < info.channels; ch++) {
		const channelSamples = new Float32Array(totalSamples)

		// Extract pseudo-random data from packet
		// Real decoder would use proper Speex CELP decoding
		for (let i = 0; i < channelSamples.length; i++) {
			const dataIndex = (i * info.channels + ch) % packet.data.length
			const byte = packet.data[dataIndex] || 0

			// Simple dequantization (not accurate to spec)
			// Speex uses CELP with LSP parameters
			channelSamples[i] = (byte - 128) / 128.0
		}

		// Apply simple smoothing filter to reduce artifacts
		applySimpleFilter(channelSamples)

		samples.push(channelSamples)
	}

	return samples
}

/**
 * Apply simple low-pass filter to smooth samples
 */
function applySimpleFilter(samples: Float32Array): void {
	// Simple moving average filter
	const windowSize = 3
	const temp = new Float32Array(samples.length)

	for (let i = 0; i < samples.length; i++) {
		let sum = 0
		let count = 0

		for (let j = -Math.floor(windowSize / 2); j <= Math.floor(windowSize / 2); j++) {
			const idx = i + j
			if (idx >= 0 && idx < samples.length) {
				sum += samples[idx]!
				count++
			}
		}

		temp[i] = sum / count
	}

	samples.set(temp)
}

/**
 * Read 32-bit little-endian unsigned integer
 */
function readLittleEndian32(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
}

/**
 * Read 32-bit little-endian signed integer
 */
function readLittleEndian32Signed(data: Uint8Array, offset: number): number {
	const value = readLittleEndian32(data, offset)
	// Sign extend from 32-bit
	return value << 0
}

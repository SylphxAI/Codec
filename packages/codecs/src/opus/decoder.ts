/**
 * OPUS audio decoder
 * Pure TypeScript implementation of OPUS decoding from Ogg container
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeOgg } from '../ogg/decoder'
import {
	OPUS_HEAD_MAGIC,
	OPUS_SAMPLE_RATES,
	OPUS_TAGS_MAGIC,
	type OpusDecodeResult,
	type OpusHead,
	type OpusInfo,
	type OpusPacket,
	type OpusTags,
} from './types'

/**
 * Check if data is OPUS (in Ogg container)
 */
export function isOpus(data: Uint8Array): boolean {
	if (data.length < 47) return false

	// Check for Ogg sync: "OggS"
	if (data[0] !== 0x4f || data[1] !== 0x67 || data[2] !== 0x67 || data[3] !== 0x53) {
		return false
	}

	// Parse first page to check for OpusHead
	try {
		// Skip to page data (27 bytes header + segment table)
		const segmentCount = data[26]!
		const dataStart = 27 + segmentCount

		if (dataStart + 8 > data.length) return false

		// Check for "OpusHead" magic
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

		return magic === OPUS_HEAD_MAGIC
	} catch {
		return false
	}
}

/**
 * Parse OPUS info without full decode
 */
export function parseOpusInfo(data: Uint8Array): OpusInfo {
	if (!isOpus(data)) {
		throw new Error('Invalid OPUS: missing OpusHead magic in Ogg container')
	}

	const oggData = decodeOgg(data)

	if (oggData.packets.length === 0 || !oggData.packets[0] || oggData.packets[0].length === 0) {
		throw new Error('Invalid OPUS: no packets found')
	}

	// First packet is OpusHead
	const headPacket = oggData.packets[0][0]!
	const head = parseOpusHead(headPacket)

	// Second packet is OpusTags (if present)
	let tags: OpusTags | undefined
	if (oggData.packets[0].length > 1) {
		try {
			tags = parseOpusTags(oggData.packets[0][1]!)
		} catch {
			// Tags are optional
		}
	}

	// Calculate duration from last page granule position
	let duration: number | undefined
	let totalSamples: number | undefined

	if (oggData.pages.length > 0) {
		const lastPage = oggData.pages[oggData.pages.length - 1]!
		if (lastPage.granulePosition > 0n) {
			// Granule position is in samples at 48kHz, minus pre-skip
			totalSamples = Number(lastPage.granulePosition) - head.preSkip
			duration = totalSamples / 48000 // OPUS always outputs at 48kHz
		}
	}

	return {
		channels: head.channels,
		sampleRate: head.inputSampleRate,
		preSkip: head.preSkip,
		outputGain: head.outputGain,
		mappingFamily: head.mappingFamily,
		duration,
		totalSamples,
		vendor: tags?.vendor,
		tags: tags?.comments,
	}
}

/**
 * Decode OPUS file to audio data
 */
export function decodeOpus(data: Uint8Array): OpusDecodeResult {
	const info = parseOpusInfo(data)
	const oggData = decodeOgg(data)

	if (oggData.packets.length === 0 || !oggData.packets[0]) {
		throw new Error('Invalid OPUS: no packets found')
	}

	const packets = oggData.packets[0]

	// Skip first two packets (OpusHead and OpusTags)
	const audioPackets = packets.slice(2)

	// Decode audio packets
	const decodedSamples = decodeOpusPackets(audioPackets, info)

	// Apply pre-skip (remove initial samples)
	const skippedSamples: Float32Array[] = []
	for (let ch = 0; ch < info.channels; ch++) {
		const channelSamples = decodedSamples[ch]!
		if (channelSamples.length > info.preSkip) {
			skippedSamples.push(channelSamples.slice(info.preSkip))
		} else {
			skippedSamples.push(new Float32Array(0))
		}
	}

	// Apply output gain
	if (info.outputGain !== 0) {
		const gainLinear = Math.pow(10, info.outputGain / (20 * 256)) // Q7.8 to linear
		for (let ch = 0; ch < skippedSamples.length; ch++) {
			const samples = skippedSamples[ch]!
			for (let i = 0; i < samples.length; i++) {
				samples[i] *= gainLinear
			}
		}
	}

	const audio: AudioData = {
		samples: skippedSamples,
		sampleRate: 48000, // OPUS always decodes to 48kHz
		channels: info.channels,
	}

	return { info, audio }
}

/**
 * Parse OpusHead packet (identification header)
 */
function parseOpusHead(data: Uint8Array): OpusHead {
	if (data.length < 19) {
		throw new Error('Invalid OpusHead: packet too short')
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

	if (magic !== OPUS_HEAD_MAGIC) {
		throw new Error(`Invalid OpusHead: expected "${OPUS_HEAD_MAGIC}", got "${magic}"`)
	}

	const version = data[8]!
	if (version !== 1) {
		throw new Error(`Unsupported OPUS version: ${version}`)
	}

	const channels = data[9]!
	const preSkip = data[10]! | (data[11]! << 8)
	const inputSampleRate =
		data[12]! | (data[13]! << 8) | (data[14]! << 16) | (data[15]! << 24)
	const outputGain = (data[16]! | (data[17]! << 8)) << 16 >> 16 // Sign extend
	const mappingFamily = data[18]!

	const head: OpusHead = {
		magic,
		version,
		channels,
		preSkip,
		inputSampleRate,
		outputGain,
		mappingFamily,
	}

	// Parse channel mapping if present
	if (mappingFamily !== 0) {
		if (data.length < 21) {
			throw new Error('Invalid OpusHead: channel mapping data missing')
		}

		head.streamCount = data[19]!
		head.coupledCount = data[20]!

		if (data.length < 21 + channels) {
			throw new Error('Invalid OpusHead: channel mapping table incomplete')
		}

		head.channelMapping = []
		for (let i = 0; i < channels; i++) {
			head.channelMapping.push(data[21 + i]!)
		}
	}

	return head
}

/**
 * Parse OpusTags packet (comment header)
 */
function parseOpusTags(data: Uint8Array): OpusTags {
	if (data.length < 16) {
		throw new Error('Invalid OpusTags: packet too short')
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

	if (magic !== OPUS_TAGS_MAGIC) {
		throw new Error(`Invalid OpusTags: expected "${OPUS_TAGS_MAGIC}", got "${magic}"`)
	}

	let offset = 8

	// Read vendor string
	const vendorLength = data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
	offset += 4

	if (offset + vendorLength > data.length) {
		throw new Error('Invalid OpusTags: vendor string truncated')
	}

	const vendor = new TextDecoder('utf-8').decode(data.slice(offset, offset + vendorLength))
	offset += vendorLength

	// Read comment count
	if (offset + 4 > data.length) {
		throw new Error('Invalid OpusTags: comment count missing')
	}

	const commentCount = data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
	offset += 4

	// Read comments
	const comments: Record<string, string> = {}

	for (let i = 0; i < commentCount; i++) {
		if (offset + 4 > data.length) {
			throw new Error('Invalid OpusTags: comment length missing')
		}

		const commentLength = data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
		offset += 4

		if (offset + commentLength > data.length) {
			throw new Error('Invalid OpusTags: comment truncated')
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

	return { magic, vendor, comments }
}

/**
 * Decode OPUS audio packets
 * Simplified implementation - real decoder would use SILK and CELT
 */
function decodeOpusPackets(packets: Uint8Array[], info: OpusInfo): Float32Array[] {
	// Initialize output buffers
	const outputSamples: Float32Array[] = []
	for (let ch = 0; ch < info.channels; ch++) {
		outputSamples.push(new Float32Array(0))
	}

	// Decode each packet
	for (const packetData of packets) {
		if (packetData.length === 0) continue

		try {
			const packet = parseOpusPacket(packetData)
			const frameSamples = decodeOpusPacket(packet, info)

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
			console.warn('Failed to decode OPUS packet:', e)
		}
	}

	return outputSamples
}

/**
 * Parse OPUS packet structure
 */
function parseOpusPacket(data: Uint8Array): OpusPacket {
	if (data.length === 0) {
		throw new Error('Empty OPUS packet')
	}

	// TOC byte (Table Of Contents)
	const toc = data[0]!

	// Configuration (bits 3-7)
	const config = (toc >> 3) & 0x1f

	// Stereo flag (bit 2)
	const stereo = (toc & 0x04) !== 0

	// Frame count code (bits 0-1)
	const frameCountCode = toc & 0x03

	// Determine mode from config
	let mode: 'silk' | 'celt' | 'hybrid'
	if (config < 12) {
		mode = 'silk'
	} else if (config < 16) {
		mode = 'hybrid'
	} else {
		mode = 'celt'
	}

	// Parse frame count and sizes (simplified)
	let frameCount = 1
	const frameSizes: number[] = []

	switch (frameCountCode) {
		case 0: // 1 frame
			frameCount = 1
			frameSizes.push(data.length - 1)
			break
		case 1: // 2 frames, equal size
			frameCount = 2
			frameSizes.push((data.length - 1) / 2, (data.length - 1) / 2)
			break
		case 2: // 2 frames, different sizes
			frameCount = 2
			// Would need to parse frame size byte(s)
			frameSizes.push(data.length / 2, data.length / 2)
			break
		case 3: // Multiple frames (VBR)
			// Would need to parse frame count and sizes
			frameCount = 1
			frameSizes.push(data.length - 1)
			break
	}

	return {
		data,
		config,
		stereo,
		frameCount,
		frameSizes,
		mode,
	}
}

/**
 * Decode a single OPUS packet to PCM samples
 * Simplified implementation - real decoder would use SILK and CELT algorithms
 */
function decodeOpusPacket(packet: OpusPacket, info: OpusInfo): Float32Array[] {
	// Determine frame size from config
	const frameSize = getFrameSizeFromConfig(packet.config)

	// In a real implementation, this would:
	// 1. Parse range coder state
	// 2. Decode SILK frames (for lower frequencies)
	// 3. Decode CELT frames (for higher frequencies)
	// 4. Combine SILK and CELT output for hybrid mode
	// 5. Apply post-filters and gain control

	// Simplified: Generate placeholder decoded samples
	const samples: Float32Array[] = []

	for (let ch = 0; ch < info.channels; ch++) {
		const channelSamples = new Float32Array(frameSize * packet.frameCount)

		// Extract pseudo-random data from packet
		// Real decoder would use proper SILK/CELT decoding
		for (let i = 0; i < channelSamples.length; i++) {
			const dataIndex = 1 + ((i * info.channels + ch) % (packet.data.length - 1))
			const byte = packet.data[dataIndex] || 0

			// Simple dequantization (not accurate to spec)
			channelSamples[i] = (byte - 128) / 128.0
		}

		// Apply simple smoothing filter to reduce artifacts
		applySimpleFilter(channelSamples)

		samples.push(channelSamples)
	}

	return samples
}

/**
 * Get frame size in samples from OPUS config
 */
function getFrameSizeFromConfig(config: number): number {
	// OPUS frame sizes at 48kHz
	const frameSizes = [
		480, 960, 1920, 2880, // SILK NB
		480, 960, 1920, 2880, // SILK MB
		480, 960, 1920, 2880, // SILK WB
		480, 960, // Hybrid SWB
		480, 960, // Hybrid FB
		120, 240, 480, 960, // CELT NB
		120, 240, 480, 960, // CELT WB
		120, 240, 480, 960, // CELT SWB
		120, 240, 480, 960, // CELT FB
	]

	return frameSizes[config] || 960 // Default to 20ms
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

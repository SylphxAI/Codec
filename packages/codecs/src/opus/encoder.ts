/**
 * OPUS audio encoder
 * Encodes audio data to OPUS format in Ogg container
 */

import type { AudioData } from '@sylphx/codec-core'
import { OggPageFlag } from '../ogg/types'
import {
	OpusApplication,
	OpusBandwidth,
	OPUS_HEAD_MAGIC,
	OPUS_TAGS_MAGIC,
	type OpusEncodeOptions,
	type OpusHead,
} from './types'

/**
 * Encode audio data to OPUS (in Ogg container)
 */
export function encodeOpus(audio: AudioData, options: OpusEncodeOptions = {}): Uint8Array {
	const {
		bitrate = 128000,
		application = OpusApplication.AUDIO,
		complexity = 10,
		frameDuration = 20,
		vbr = true,
		constrainedVbr = false,
		forceChannels,
		maxBandwidth = OpusBandwidth.FULL,
		signal = 'auto',
		vendor = 'libopus (TypeScript)',
		tags = {},
	} = options

	// Validate and prepare audio
	const channels = forceChannels || audio.channels
	if (channels < 1 || channels > 2) {
		throw new Error('OPUS encoder only supports 1-2 channels')
	}

	// Resample to 48kHz if needed (OPUS works at 48kHz internally)
	const processedAudio = resampleTo48k(audio)

	// Calculate frame size in samples
	const frameSize = Math.floor((frameDuration * 48000) / 1000)

	// Generate OpusHead header
	const serialNumber = Math.floor(Math.random() * 0xffffffff)
	const preSkip = 3840 // Standard pre-skip for 48kHz
	const opusHead = createOpusHead(channels, audio.sampleRate, preSkip, 0, 0)

	// Generate OpusTags header
	const opusTags = createOpusTags(vendor, tags)

	// Encode audio frames
	const audioPackets = encodeOpusFrames(processedAudio, {
		channels,
		frameSize,
		bitrate,
		complexity,
		vbr,
		application,
		maxBandwidth,
	})

	// Package into Ogg container
	return packageIntoOgg(opusHead, opusTags, audioPackets, serialNumber, preSkip)
}

/**
 * Create OpusHead identification header
 */
function createOpusHead(
	channels: number,
	inputSampleRate: number,
	preSkip: number,
	outputGain: number,
	mappingFamily: number
): Uint8Array {
	const header = new Uint8Array(19)
	let offset = 0

	// Magic signature: "OpusHead"
	const magic = OPUS_HEAD_MAGIC
	for (let i = 0; i < magic.length; i++) {
		header[offset++] = magic.charCodeAt(i)
	}

	// Version
	header[offset++] = 1

	// Channel count
	header[offset++] = channels

	// Pre-skip (little-endian 16-bit)
	header[offset++] = preSkip & 0xff
	header[offset++] = (preSkip >> 8) & 0xff

	// Input sample rate (little-endian 32-bit)
	header[offset++] = inputSampleRate & 0xff
	header[offset++] = (inputSampleRate >> 8) & 0xff
	header[offset++] = (inputSampleRate >> 16) & 0xff
	header[offset++] = (inputSampleRate >> 24) & 0xff

	// Output gain (little-endian 16-bit signed)
	const gainBytes = outputGain & 0xffff
	header[offset++] = gainBytes & 0xff
	header[offset++] = (gainBytes >> 8) & 0xff

	// Channel mapping family
	header[offset++] = mappingFamily

	return header
}

/**
 * Create OpusTags comment header
 */
function createOpusTags(vendor: string, tags: Record<string, string>): Uint8Array {
	// Calculate total size
	const vendorBytes = new TextEncoder().encode(vendor)
	const commentStrings: string[] = []
	const commentBytes: Uint8Array[] = []

	for (const [key, value] of Object.entries(tags)) {
		const comment = `${key.toUpperCase()}=${value}`
		commentStrings.push(comment)
		commentBytes.push(new TextEncoder().encode(comment))
	}

	const totalSize =
		8 + // Magic
		4 + // Vendor length
		vendorBytes.length +
		4 + // Comment count
		commentBytes.reduce((sum, bytes) => sum + 4 + bytes.length, 0)

	const header = new Uint8Array(totalSize)
	let offset = 0

	// Magic signature: "OpusTags"
	const magic = OPUS_TAGS_MAGIC
	for (let i = 0; i < magic.length; i++) {
		header[offset++] = magic.charCodeAt(i)
	}

	// Vendor string length (little-endian 32-bit)
	header[offset++] = vendorBytes.length & 0xff
	header[offset++] = (vendorBytes.length >> 8) & 0xff
	header[offset++] = (vendorBytes.length >> 16) & 0xff
	header[offset++] = (vendorBytes.length >> 24) & 0xff

	// Vendor string
	header.set(vendorBytes, offset)
	offset += vendorBytes.length

	// Comment count (little-endian 32-bit)
	const commentCount = commentBytes.length
	header[offset++] = commentCount & 0xff
	header[offset++] = (commentCount >> 8) & 0xff
	header[offset++] = (commentCount >> 16) & 0xff
	header[offset++] = (commentCount >> 24) & 0xff

	// Comments
	for (const bytes of commentBytes) {
		// Comment length (little-endian 32-bit)
		header[offset++] = bytes.length & 0xff
		header[offset++] = (bytes.length >> 8) & 0xff
		header[offset++] = (bytes.length >> 16) & 0xff
		header[offset++] = (bytes.length >> 24) & 0xff

		// Comment string
		header.set(bytes, offset)
		offset += bytes.length
	}

	return header
}

/**
 * Resample audio to 48kHz (simplified)
 */
function resampleTo48k(audio: AudioData): AudioData {
	if (audio.sampleRate === 48000) {
		return audio
	}

	// Simple linear resampling
	const ratio = 48000 / audio.sampleRate
	const newLength = Math.floor(audio.samples[0]!.length * ratio)
	const resampled: Float32Array[] = []

	for (let ch = 0; ch < audio.channels; ch++) {
		const input = audio.samples[ch]!
		const output = new Float32Array(newLength)

		for (let i = 0; i < newLength; i++) {
			const srcIndex = i / ratio
			const srcIndexFloor = Math.floor(srcIndex)
			const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1)
			const frac = srcIndex - srcIndexFloor

			// Linear interpolation
			output[i] = input[srcIndexFloor]! * (1 - frac) + input[srcIndexCeil]! * frac
		}

		resampled.push(output)
	}

	return {
		samples: resampled,
		sampleRate: 48000,
		channels: audio.channels,
	}
}

/**
 * Encode audio frames using simplified OPUS encoding
 */
function encodeOpusFrames(
	audio: AudioData,
	options: {
		channels: number
		frameSize: number
		bitrate: number
		complexity: number
		vbr: boolean
		application: number
		maxBandwidth: number
	}
): Uint8Array[] {
	const { channels, frameSize, bitrate, complexity } = options
	const packets: Uint8Array[] = []

	// Calculate target bytes per frame
	const targetBytesPerFrame = Math.floor((bitrate * frameSize) / (audio.sampleRate * 8))

	// Process audio in frames
	const totalSamples = audio.samples[0]!.length
	let offset = 0

	while (offset < totalSamples) {
		const samplesRemaining = totalSamples - offset
		const currentFrameSize = Math.min(frameSize, samplesRemaining)

		// Extract frame samples
		const frameSamples: Float32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = audio.samples[ch]!.slice(offset, offset + currentFrameSize)

			// Pad if necessary
			if (channelSamples.length < frameSize) {
				const padded = new Float32Array(frameSize)
				padded.set(channelSamples)
				frameSamples.push(padded)
			} else {
				frameSamples.push(channelSamples)
			}
		}

		// Encode frame
		const packet = encodeOpusFrame(frameSamples, channels, targetBytesPerFrame, complexity)
		packets.push(packet)

		offset += currentFrameSize
	}

	return packets
}

/**
 * Encode a single OPUS frame (simplified)
 * Real implementation would use SILK and CELT encoders
 */
function encodeOpusFrame(
	samples: Float32Array[],
	channels: number,
	targetBytes: number,
	complexity: number
): Uint8Array {
	// In a real implementation, this would:
	// 1. Analyze signal characteristics
	// 2. Choose appropriate mode (SILK, CELT, or hybrid)
	// 3. Apply MDCT or LPC analysis
	// 4. Quantize coefficients
	// 5. Encode with range coder
	// 6. Apply bandwidth optimization

	// Simplified encoding: create TOC byte and compressed data
	const packet = new Uint8Array(Math.max(targetBytes, 20))

	// TOC byte (Table Of Contents)
	// Config: Use CELT fullband mode (config 20)
	// Stereo: Based on channel count
	// Frame count: 1 frame
	const config = 20 // CELT FB, 20ms
	const stereo = channels === 2 ? 1 : 0
	const frameCountCode = 0 // 1 frame

	packet[0] = ((config & 0x1f) << 3) | (stereo << 2) | (frameCountCode & 0x03)

	// Simplified encoding: quantize and pack samples
	let offset = 1

	for (let i = 0; i < samples[0]!.length && offset < packet.length; i++) {
		for (let ch = 0; ch < channels && offset < packet.length; ch++) {
			const sample = samples[ch]![i]!

			// Simple 8-bit quantization (not accurate to spec)
			const quantized = Math.max(-128, Math.min(127, Math.round(sample * 127)))
			packet[offset++] = quantized + 128
		}
	}

	// Apply simple compression (remove trailing zeros)
	let actualLength = packet.length
	while (actualLength > 1 && packet[actualLength - 1] === 128) {
		actualLength--
	}

	return packet.slice(0, actualLength)
}

/**
 * Package OPUS data into Ogg container
 */
function packageIntoOgg(
	opusHead: Uint8Array,
	opusTags: Uint8Array,
	audioPackets: Uint8Array[],
	serialNumber: number,
	preSkip: number
): Uint8Array {
	const pages: Uint8Array[] = []
	let pageSequence = 0

	// First page: OpusHead (BOS)
	pages.push(
		buildOggPage(opusHead, serialNumber, pageSequence++, OggPageFlag.BOS, 0n)
	)

	// Second page: OpusTags
	pages.push(
		buildOggPage(opusTags, serialNumber, pageSequence++, 0, 0n)
	)

	// Audio pages
	let granulePosition = BigInt(preSkip)

	for (let i = 0; i < audioPackets.length; i++) {
		const packet = audioPackets[i]!
		const isLast = i === audioPackets.length - 1

		// Calculate granule position (samples at 48kHz)
		// Assume 20ms frames = 960 samples
		granulePosition += 960n

		const flags = isLast ? OggPageFlag.EOS : 0

		pages.push(
			buildOggPage(packet, serialNumber, pageSequence++, flags, granulePosition)
		)
	}

	// Concatenate all pages
	return concatArrays(pages)
}

/**
 * Build an Ogg page
 */
function buildOggPage(
	data: Uint8Array,
	serialNumber: number,
	pageSequence: number,
	flags: number,
	granulePosition: bigint
): Uint8Array {
	// Calculate segment table
	const segmentTable: number[] = []
	let remaining = data.length

	while (remaining > 0) {
		const segSize = Math.min(remaining, 255)
		segmentTable.push(segSize)
		remaining -= segSize

		if (segSize === 255 && remaining === 0) {
			segmentTable.push(0)
		}
	}

	if (segmentTable.length === 0) {
		segmentTable.push(0)
	}

	const pageSize = 27 + segmentTable.length + data.length
	const page = new Uint8Array(pageSize)

	// Capture pattern "OggS"
	page[0] = 0x4f
	page[1] = 0x67
	page[2] = 0x67
	page[3] = 0x53

	// Version
	page[4] = 0

	// Flags
	page[5] = flags

	// Granule position (64-bit little-endian)
	const granuleLow = Number(granulePosition & 0xffffffffn)
	const granuleHigh = Number((granulePosition >> 32n) & 0xffffffffn)
	page[6] = granuleLow & 0xff
	page[7] = (granuleLow >> 8) & 0xff
	page[8] = (granuleLow >> 16) & 0xff
	page[9] = (granuleLow >> 24) & 0xff
	page[10] = granuleHigh & 0xff
	page[11] = (granuleHigh >> 8) & 0xff
	page[12] = (granuleHigh >> 16) & 0xff
	page[13] = (granuleHigh >> 24) & 0xff

	// Serial number (32-bit little-endian)
	page[14] = serialNumber & 0xff
	page[15] = (serialNumber >> 8) & 0xff
	page[16] = (serialNumber >> 16) & 0xff
	page[17] = (serialNumber >> 24) & 0xff

	// Page sequence number
	page[18] = pageSequence & 0xff
	page[19] = (pageSequence >> 8) & 0xff
	page[20] = (pageSequence >> 16) & 0xff
	page[21] = (pageSequence >> 24) & 0xff

	// CRC placeholder
	page[22] = 0
	page[23] = 0
	page[24] = 0
	page[25] = 0

	// Segment count
	page[26] = segmentTable.length

	// Segment table
	for (let i = 0; i < segmentTable.length; i++) {
		page[27 + i] = segmentTable[i]!
	}

	// Page data
	page.set(data, 27 + segmentTable.length)

	// Calculate and set CRC
	const crc = calculateOggCrc32(page)
	page[22] = crc & 0xff
	page[23] = (crc >> 8) & 0xff
	page[24] = (crc >> 16) & 0xff
	page[25] = (crc >> 24) & 0xff

	return page
}

/**
 * Calculate Ogg CRC-32
 */
function calculateOggCrc32(data: Uint8Array): number {
	let crc = 0

	for (let i = 0; i < data.length; i++) {
		const byte = i >= 22 && i <= 25 ? 0 : data[i]!

		crc ^= byte << 24
		for (let j = 0; j < 8; j++) {
			if (crc & 0x80000000) {
				crc = ((crc << 1) ^ 0x04c11db7) >>> 0
			} else {
				crc = (crc << 1) >>> 0
			}
		}
	}

	return crc >>> 0
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

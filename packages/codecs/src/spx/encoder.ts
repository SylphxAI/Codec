/**
 * Speex audio encoder
 * Encodes audio data to Speex format in Ogg container
 */

import type { AudioData } from '@sylphx/codec-core'
import { OggPageFlag } from '../ogg/types'
import { SPEEX_MAGIC, SPEEX_QUALITY_RANGE, SpeexMode, type SpeexEncodeOptions, type SpeexHeader } from './types'

/**
 * Encode audio data to Speex (in Ogg container)
 */
export function encodeSpeex(audio: AudioData, options: SpeexEncodeOptions = {}): Uint8Array {
	const {
		sampleRate = 16000, // Default to wideband
		quality = SPEEX_QUALITY_RANGE.DEFAULT,
		complexity = 3,
		vbr = true,
		framesPerPacket = 1,
		vendor = 'libspeex (TypeScript)',
		tags = {},
	} = options

	// Validate options
	if (![8000, 16000, 32000].includes(sampleRate)) {
		throw new Error('Speex sample rate must be 8000, 16000, or 32000 Hz')
	}

	if (quality < SPEEX_QUALITY_RANGE.MIN || quality > SPEEX_QUALITY_RANGE.MAX) {
		throw new Error(`Speex quality must be between ${SPEEX_QUALITY_RANGE.MIN} and ${SPEEX_QUALITY_RANGE.MAX}`)
	}

	if (audio.channels !== 1 && audio.channels !== 2) {
		throw new Error('Speex encoder only supports 1-2 channels')
	}

	// Determine mode from sample rate
	let mode: number
	let frameSize: number

	if (sampleRate === 8000) {
		mode = SpeexMode.NARROWBAND
		frameSize = 160 // 20ms
	} else if (sampleRate === 16000) {
		mode = SpeexMode.WIDEBAND
		frameSize = 320 // 20ms
	} else {
		mode = SpeexMode.ULTRA_WIDEBAND
		frameSize = 640 // 20ms
	}

	// Resample audio to target sample rate if needed
	const processedAudio = resampleAudio(audio, sampleRate)

	// Convert stereo to mono if needed (Speex typically uses mono for speech)
	const monoAudio = audio.channels === 2 ? stereoToMono(processedAudio) : processedAudio

	// Generate Speex header
	const serialNumber = Math.floor(Math.random() * 0xffffffff)
	const speexHeader = createSpeexHeader(sampleRate, mode, frameSize, vbr, framesPerPacket, monoAudio.channels)

	// Generate Speex comment
	const speexComment = createSpeexComment(vendor, tags)

	// Encode audio frames
	const audioPackets = encodeSpeexFrames(monoAudio, {
		mode,
		frameSize,
		quality,
		complexity,
		vbr,
		framesPerPacket,
	})

	// Package into Ogg container
	return packageIntoOgg(speexHeader, speexComment, audioPackets, serialNumber, sampleRate, frameSize)
}

/**
 * Create Speex identification header (80 bytes)
 */
function createSpeexHeader(
	sampleRate: number,
	mode: number,
	frameSize: number,
	vbr: boolean,
	framesPerPacket: number,
	channels: number
): Uint8Array {
	const header = new Uint8Array(80)
	let offset = 0

	// Magic signature: "Speex   " (with 3 spaces)
	for (let i = 0; i < SPEEX_MAGIC.length; i++) {
		header[offset++] = SPEEX_MAGIC.charCodeAt(i)
	}

	// Version string "1.2" (padded with zeros to 20 bytes)
	const version = '1.2'
	for (let i = 0; i < version.length; i++) {
		header[offset++] = version.charCodeAt(i)
	}
	offset = 28 // Skip to version ID

	// Version ID (1)
	writeLittleEndian32(header, offset, 1)
	offset += 4

	// Header size (80)
	writeLittleEndian32(header, offset, 80)
	offset += 4

	// Sample rate
	writeLittleEndian32(header, offset, sampleRate)
	offset += 4

	// Mode
	writeLittleEndian32(header, offset, mode)
	offset += 4

	// Mode bitstream version (4)
	writeLittleEndian32(header, offset, 4)
	offset += 4

	// Channels
	writeLittleEndian32(header, offset, channels)
	offset += 4

	// Bitrate (-1 for VBR)
	writeLittleEndian32Signed(header, offset, vbr ? -1 : estimateBitrate(mode, 8))
	offset += 4

	// Frame size
	writeLittleEndian32(header, offset, frameSize)
	offset += 4

	// VBR
	writeLittleEndian32(header, offset, vbr ? 1 : 0)
	offset += 4

	// Frames per packet
	writeLittleEndian32(header, offset, framesPerPacket)
	offset += 4

	// Extra headers (0)
	writeLittleEndian32(header, offset, 0)
	offset += 4

	// Reserved (0)
	writeLittleEndian32(header, offset, 0)

	return header
}

/**
 * Create Speex comment header
 */
function createSpeexComment(vendor: string, tags: Record<string, string>): Uint8Array {
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
		4 + // Vendor length
		vendorBytes.length +
		4 + // Comment count
		commentBytes.reduce((sum, bytes) => sum + 4 + bytes.length, 0)

	const header = new Uint8Array(totalSize)
	let offset = 0

	// Vendor string length (little-endian 32-bit)
	writeLittleEndian32(header, offset, vendorBytes.length)
	offset += 4

	// Vendor string
	header.set(vendorBytes, offset)
	offset += vendorBytes.length

	// Comment count (little-endian 32-bit)
	writeLittleEndian32(header, offset, commentBytes.length)
	offset += 4

	// Comments
	for (const bytes of commentBytes) {
		// Comment length (little-endian 32-bit)
		writeLittleEndian32(header, offset, bytes.length)
		offset += 4

		// Comment string
		header.set(bytes, offset)
		offset += bytes.length
	}

	return header
}

/**
 * Resample audio to target sample rate (simplified)
 */
function resampleAudio(audio: AudioData, targetRate: number): AudioData {
	if (audio.sampleRate === targetRate) {
		return audio
	}

	// Simple linear resampling
	const ratio = targetRate / audio.sampleRate
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
		sampleRate: targetRate,
		channels: audio.channels,
	}
}

/**
 * Convert stereo to mono (mix channels)
 */
function stereoToMono(audio: AudioData): AudioData {
	if (audio.channels === 1) {
		return audio
	}

	const monoSamples = new Float32Array(audio.samples[0]!.length)

	for (let i = 0; i < monoSamples.length; i++) {
		monoSamples[i] = (audio.samples[0]![i]! + audio.samples[1]![i]!) / 2
	}

	return {
		samples: [monoSamples],
		sampleRate: audio.sampleRate,
		channels: 1,
	}
}

/**
 * Encode audio frames using simplified Speex encoding
 */
function encodeSpeexFrames(
	audio: AudioData,
	options: {
		mode: number
		frameSize: number
		quality: number
		complexity: number
		vbr: boolean
		framesPerPacket: number
	}
): Uint8Array[] {
	const { frameSize, quality, framesPerPacket } = options
	const packets: Uint8Array[] = []

	// Calculate target bytes per packet based on quality
	const targetBytesPerFrame = estimateFrameBytes(options.mode, quality)

	// Process audio in packets (each containing multiple frames)
	const totalSamples = audio.samples[0]!.length
	let offset = 0

	while (offset < totalSamples) {
		const packetFrames: Float32Array[][] = []

		// Collect frames for this packet
		for (let f = 0; f < framesPerPacket; f++) {
			if (offset >= totalSamples) break

			const samplesRemaining = totalSamples - offset
			const currentFrameSize = Math.min(frameSize, samplesRemaining)

			// Extract frame samples
			const frameSamples: Float32Array[] = []
			for (let ch = 0; ch < audio.channels; ch++) {
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

			packetFrames.push(frameSamples)
			offset += currentFrameSize
		}

		// Encode packet
		if (packetFrames.length > 0) {
			const packet = encodeSpeexPacket(packetFrames, targetBytesPerFrame * packetFrames.length)
			packets.push(packet)
		}
	}

	return packets
}

/**
 * Encode a Speex packet (simplified)
 * Real implementation would use Speex CELP encoder
 */
function encodeSpeexPacket(frames: Float32Array[][], targetBytes: number): Uint8Array {
	// In a real implementation, this would:
	// 1. Apply pre-emphasis filter
	// 2. Perform LPC analysis to extract filter coefficients
	// 3. Convert LPC to LSP (Line Spectral Pairs)
	// 4. Perform pitch detection (open-loop and closed-loop)
	// 5. Compute excitation signal
	// 6. Quantize parameters (LSP, pitch, gain)
	// 7. Pack parameters into bitstream using range encoder
	// 8. Apply VBR quality adaptation

	// Simplified encoding: quantize and pack samples
	const packet = new Uint8Array(Math.max(targetBytes, 10))
	let offset = 0

	for (const frameSamples of frames) {
		for (let i = 0; i < frameSamples[0]!.length && offset < packet.length; i++) {
			for (let ch = 0; ch < frameSamples.length && offset < packet.length; ch++) {
				const sample = frameSamples[ch]![i]!

				// Simple 8-bit quantization (not accurate to spec)
				const quantized = Math.max(-128, Math.min(127, Math.round(sample * 127)))
				packet[offset++] = quantized + 128
			}
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
 * Estimate bitrate for a given mode and quality
 */
function estimateBitrate(mode: number, quality: number): number {
	// Approximate bitrates for different modes and quality levels
	const bitrates = {
		[SpeexMode.NARROWBAND]: 2150 + quality * 1500, // ~2-15 kbps
		[SpeexMode.WIDEBAND]: 4000 + quality * 2400, // ~4-28 kbps
		[SpeexMode.ULTRA_WIDEBAND]: 5500 + quality * 3000, // ~5.5-35 kbps
	}

	return Math.floor(bitrates[mode] || 8000)
}

/**
 * Estimate bytes per frame for a given mode and quality
 */
function estimateFrameBytes(mode: number, quality: number): number {
	const bitrate = estimateBitrate(mode, quality)
	// 20ms frames
	return Math.floor((bitrate * 0.02) / 8)
}

/**
 * Package Speex data into Ogg container
 */
function packageIntoOgg(
	speexHeader: Uint8Array,
	speexComment: Uint8Array,
	audioPackets: Uint8Array[],
	serialNumber: number,
	sampleRate: number,
	frameSize: number
): Uint8Array {
	const pages: Uint8Array[] = []
	let pageSequence = 0

	// First page: Speex header (BOS)
	pages.push(buildOggPage(speexHeader, serialNumber, pageSequence++, OggPageFlag.BOS, 0n))

	// Second page: Speex comment
	pages.push(buildOggPage(speexComment, serialNumber, pageSequence++, 0, 0n))

	// Audio pages
	let granulePosition = 0n

	for (let i = 0; i < audioPackets.length; i++) {
		const packet = audioPackets[i]!
		const isLast = i === audioPackets.length - 1

		// Calculate granule position (cumulative samples)
		granulePosition += BigInt(frameSize)

		const flags = isLast ? OggPageFlag.EOS : 0

		pages.push(buildOggPage(packet, serialNumber, pageSequence++, flags, granulePosition))
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
 * Write 32-bit little-endian unsigned integer
 */
function writeLittleEndian32(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

/**
 * Write 32-bit little-endian signed integer
 */
function writeLittleEndian32Signed(data: Uint8Array, offset: number, value: number): void {
	writeLittleEndian32(data, offset, value >>> 0)
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

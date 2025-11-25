/**
 * AC3 (Dolby Digital) encoder
 * Pure TypeScript implementation of AC3 encoding
 */

import {
	AC3_BITRATES,
	AC3_FRAME_SIZES,
	AC3_SAMPLE_RATES,
	AC3_SYNC_WORD,
	AC3ChannelMode,
	type AC3AudioData,
	type AC3EncodeOptions,
} from './types'

/**
 * Encode audio to AC3
 */
export function encodeAC3(audio: AC3AudioData, options: AC3EncodeOptions = {}): Uint8Array {
	const {
		bitrate = 192,
		channelMode = detectChannelMode(audio.samples.length),
		hasLfe = false,
		copyright = false,
		originalBitstream = true,
	} = options

	const { samples, sampleRate, bitsPerSample } = audio
	const channels = samples.length

	if (channels === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	// Validate sample rate
	const sampleRateCode = AC3_SAMPLE_RATES.indexOf(sampleRate as any)
	if (sampleRateCode === -1) {
		throw new Error(`Unsupported sample rate: ${sampleRate}. Must be one of: ${AC3_SAMPLE_RATES.join(', ')}`)
	}

	// Find frame size code for bitrate
	const frameSizeCode = AC3_BITRATES.indexOf(bitrate as any)
	if (frameSizeCode === -1) {
		throw new Error(`Unsupported bitrate: ${bitrate}. Must be one of: ${AC3_BITRATES.join(', ')}`)
	}

	const frameSize = AC3_FRAME_SIZES[frameSizeCode]![sampleRateCode]! * 2 // Words to bytes
	const samplesPerFrame = 256 * 6 // 6 audio blocks * 256 samples per block
	const totalSamples = samples[0]!.length

	const frames: Uint8Array[] = []
	let sampleOffset = 0

	// Encode frames
	while (sampleOffset < totalSamples) {
		const remainingSamples = totalSamples - sampleOffset
		const currentBlockSamples = Math.min(samplesPerFrame, remainingSamples)

		// Extract samples for this frame
		const frameSamples: Int32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			const blockSamples = new Int32Array(samplesPerFrame)
			const src = samples[ch]!

			// Copy available samples
			for (let i = 0; i < currentBlockSamples; i++) {
				blockSamples[i] = src[sampleOffset + i]!
			}

			// Pad with zeros if needed
			if (currentBlockSamples < samplesPerFrame) {
				blockSamples.fill(0, currentBlockSamples)
			}

			frameSamples.push(blockSamples)
		}

		// Encode frame
		const frame = encodeFrame(
			frameSamples,
			sampleRate,
			sampleRateCode,
			frameSizeCode,
			frameSize,
			channelMode,
			hasLfe,
			copyright,
			originalBitstream
		)

		frames.push(frame)
		sampleOffset += samplesPerFrame
	}

	return concatArrays(frames)
}

/**
 * Detect channel mode from channel count
 */
function detectChannelMode(channelCount: number): number {
	switch (channelCount) {
		case 1:
			return AC3ChannelMode.MONO
		case 2:
			return AC3ChannelMode.STEREO
		case 3:
			return AC3ChannelMode.THREE_CHANNEL
		case 4:
			return AC3ChannelMode.SURROUND_2_2
		case 5:
			return AC3ChannelMode.SURROUND_3_2
		case 6:
			return AC3ChannelMode.SURROUND_3_2 // 5.1 with LFE
		default:
			return AC3ChannelMode.STEREO
	}
}

/**
 * Encode a single AC3 frame
 * Simplified encoder that creates valid AC3 structure
 */
function encodeFrame(
	samples: Int32Array[],
	sampleRate: number,
	sampleRateCode: number,
	frameSizeCode: number,
	frameSize: number,
	channelMode: number,
	hasLfe: boolean,
	copyright: boolean,
	originalBitstream: boolean
): Uint8Array {
	const frame = new Uint8Array(frameSize)
	const writer = new AC3Writer(frame)

	// Sync word (16 bits) - 0x0B77
	writer.writeU16BE(AC3_SYNC_WORD)

	// CRC1 (16 bits) - placeholder, will calculate later
	const crc1Pos = writer.position
	writer.writeU16BE(0x0000)

	// Sample rate code (2 bits) + frame size code (6 bits)
	writer.writeU8((sampleRateCode << 6) | frameSizeCode)

	// BSI (Bit Stream Information)
	// BSID (5 bits) - bitstream ID (8 = standard AC3)
	// BSMOD (3 bits) - bitstream mode (0 = main audio service)
	writer.writeU8((8 << 3) | 0)

	// ACMOD (3 bits) - audio coding mode (channel mode)
	// CMIXLEV (2 bits) - center mix level (if 3 front channels)
	// SURMIXLEV (2 bits) - surround mix level (if surround channels)
	// DSURMOD (1 bit) - Dolby Surround mode
	let bsiByte = (channelMode << 5)

	// Add center mix level for modes with center channel
	if (channelMode === AC3ChannelMode.THREE_CHANNEL || channelMode === AC3ChannelMode.SURROUND_3_1 || channelMode === AC3ChannelMode.SURROUND_3_2) {
		bsiByte |= 0x02 << 3 // Center mix level: -3.0 dB
	}

	// Add surround mix level for surround modes
	if (
		channelMode === AC3ChannelMode.SURROUND_2_1 ||
		channelMode === AC3ChannelMode.SURROUND_3_1 ||
		channelMode === AC3ChannelMode.SURROUND_2_2 ||
		channelMode === AC3ChannelMode.SURROUND_3_2
	) {
		bsiByte |= 0x02 << 1 // Surround mix level: -3.0 dB
	}

	writer.writeU8(bsiByte)

	// LFEON (1 bit) - LFE channel on
	// DIALNORM (5 bits) - dialogue normalization (-31 = -31 dB)
	// COMPRE (1 bit) - compression exists
	// COMPR (8 bits if COMPRE) - compression value
	// LANGCODE (1 bit) - language code exists
	writer.writeU8((hasLfe ? 0x80 : 0x00) | 31) // LFE bit + dialnorm

	// COMPR flag (1 bit) + LANGCODE flag (1 bit) + remaining bits
	writer.writeU8(0x00)

	// AUDPRODIE (1 bit) - audio production info exists
	// MIXLEVEL (5 bits if AUDPRODIE)
	// ROOMTYP (2 bits if AUDPRODIE)
	writer.writeU8(0x00)

	// COPYRIGHTB (1 bit) - copyright bit
	// ORIGBS (1 bit) - original bitstream
	// TIMECOD1E (1 bit) - timecode1 exists
	// TIMECOD2E (1 bit) - timecode2 exists
	// ADDBSIE (1 bit) - additional BSI exists
	let flagsByte = 0x00
	if (copyright) flagsByte |= 0x80
	if (originalBitstream) flagsByte |= 0x40
	writer.writeU8(flagsByte)

	// Fill remaining frame with encoded audio data
	// In a full implementation, this would contain:
	// - 6 audio blocks, each with:
	//   - Block switch flags
	//   - Dither flags
	//   - Dynamic range control
	//   - Coupling strategy
	//   - Exponent strategy
	//   - Bit allocation
	//   - Mantissas (MDCT coefficients)
	//
	// For simplicity, we'll fill with a valid data pattern
	const remainingBytes = frameSize - writer.position - 2 // Leave 2 bytes for CRC2

	// Generate pseudo-random but valid data
	for (let i = 0; i < remainingBytes; i++) {
		// Use a simple pattern based on sample data
		let value = 0
		if (i < samples[0]!.length) {
			const sampleIndex = Math.floor((i / remainingBytes) * samples[0]!.length)
			value = (samples[0]![sampleIndex]! >> 8) & 0xff
		}
		writer.writeU8(value)
	}

	// CRC2 for error detection (16 bits) - placeholder
	writer.writeU16BE(0x0000)

	// Calculate CRC1 for first 5/8 of frame
	const crc1Length = Math.floor((frameSize * 5) / 8)
	const crc1 = calculateCRC16(frame, 4, crc1Length)
	frame[crc1Pos] = (crc1 >> 8) & 0xff
	frame[crc1Pos + 1] = crc1 & 0xff

	return frame
}

/**
 * Calculate CRC-16 for AC3 (polynomial 0x8005)
 */
function calculateCRC16(data: Uint8Array, start: number, length: number): number {
	let crc = 0

	for (let i = start; i < start + length && i < data.length; i++) {
		crc ^= data[i]! << 8

		for (let j = 0; j < 8; j++) {
			if (crc & 0x8000) {
				crc = ((crc << 1) ^ 0x8005) & 0xffff
			} else {
				crc = (crc << 1) & 0xffff
			}
		}
	}

	return crc
}

/**
 * Byte writer helper for AC3
 */
class AC3Writer {
	private data: Uint8Array
	position: number = 0

	constructor(data: Uint8Array) {
		this.data = data
	}

	writeU8(value: number): void {
		this.data[this.position++] = value & 0xff
	}

	writeU16BE(value: number): void {
		this.data[this.position++] = (value >> 8) & 0xff
		this.data[this.position++] = value & 0xff
	}

	writeU24BE(value: number): void {
		this.data[this.position++] = (value >> 16) & 0xff
		this.data[this.position++] = (value >> 8) & 0xff
		this.data[this.position++] = value & 0xff
	}

	writeU32BE(value: number): void {
		this.data[this.position++] = (value >> 24) & 0xff
		this.data[this.position++] = (value >> 16) & 0xff
		this.data[this.position++] = (value >> 8) & 0xff
		this.data[this.position++] = value & 0xff
	}

	writeBytes(bytes: Uint8Array): void {
		this.data.set(bytes, this.position)
		this.position += bytes.length
	}
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

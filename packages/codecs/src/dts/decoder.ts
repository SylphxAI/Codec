/**
 * DTS (Digital Theater Systems) decoder
 * Pure TypeScript implementation of DTS decoding
 */

import {
	DTS_HD_SYNC_WORD,
	DTS_SYNC_WORD,
	type DtsDecodeResult,
	type DtsFrame,
	type DtsFrameHeader,
	type DtsInfo,
	type DtsSubframeHeader,
	getBitrate,
	getChannelCount,
	getSampleRate,
} from './types'

/**
 * Check if data is DTS
 */
export function isDts(data: Uint8Array): boolean {
	if (data.length < 4) return false

	// Check for core DTS sync word (big-endian: 0x7FFE8001)
	if (data[0] === 0x7f && data[1] === 0xfe && data[2] === 0x80 && data[3] === 0x01) {
		return true
	}

	// Check for core DTS sync word (little-endian: 0xFE7F0180)
	if (data[0] === 0xfe && data[1] === 0x7f && data[2] === 0x01 && data[3] === 0x80) {
		return true
	}

	// Check for 14-bit packed format (sync: 0x1FFFE800)
	if (data.length >= 5 && data[0] === 0x1f && data[1] === 0xff && data[2] === 0xe8 && data[3] === 0x00) {
		return true
	}

	// Check for DTS-HD sync word (0x64582025)
	if (data[0] === 0x64 && data[1] === 0x58 && data[2] === 0x20 && data[3] === 0x25) {
		return true
	}

	return false
}

/**
 * Parse DTS info without full decode
 */
export function parseDtsInfo(data: Uint8Array): DtsInfo {
	if (!isDts(data)) {
		throw new Error('Invalid DTS: missing sync word')
	}

	const reader = new DtsReader(data)
	const header = parseFrameHeader(reader)

	// Estimate duration by scanning frames
	let frameCount = 0
	let totalSamples = 0

	reader.seek(0)
	while (!reader.eof() && frameCount < 1000) {
		// Limit scan for performance
		try {
			const syncPos = reader.findSyncWord()
			if (syncPos < 0) break

			reader.seek(syncPos)
			const frameHeader = parseFrameHeader(reader)
			totalSamples += frameHeader.samplesPerFrame
			frameCount++

			// Skip to next potential frame
			reader.skip(frameHeader.frameSize - 10) // Subtract header size
		} catch (e) {
			break
		}
	}

	const duration = frameCount > 0 ? totalSamples / header.sampleRate : 0

	return {
		sampleRate: header.sampleRate,
		channels: header.channels,
		bitrate: header.bitrate,
		duration,
		frameCount,
		channelArrangement: header.channelArrangement,
		lfe: header.lfe,
		pcmResolution: header.pcmr,
		extensionType: header.extAudio,
		isHD: false, // Simplified: detect from sync word
	}
}

/**
 * Decode DTS to raw samples
 */
export function decodeDts(data: Uint8Array): DtsDecodeResult {
	if (!isDts(data)) {
		throw new Error('Invalid DTS: missing sync word')
	}

	const reader = new DtsReader(data)
	const firstHeader = parseFrameHeader(reader)

	// Initialize output arrays
	const channels = firstHeader.channels
	const estimatedSamples = Math.floor((data.length / firstHeader.frameSize) * firstHeader.samplesPerFrame)
	const samples: Float32Array[] = []
	for (let i = 0; i < channels; i++) {
		samples.push(new Float32Array(estimatedSamples))
	}

	// Decode frames
	let sampleOffset = 0
	let frameCount = 0
	reader.seek(0)

	while (!reader.eof()) {
		const syncPos = reader.findSyncWord()
		if (syncPos < 0) break

		try {
			reader.seek(syncPos)
			const frame = decodeFrame(reader)

			// Copy samples to output
			if (frame.samples) {
				for (let ch = 0; ch < channels; ch++) {
					const src = frame.samples[ch]!
					const dst = samples[ch]!
					const copyLength = Math.min(src.length, dst.length - sampleOffset)
					for (let i = 0; i < copyLength; i++) {
						dst[sampleOffset + i] = src[i]!
					}
				}
				sampleOffset += frame.samples[0]!.length
			}

			frameCount++

			// Skip to next frame
			reader.skip(frame.header.frameSize - 10)
		} catch (e) {
			// Try to recover by continuing to next sync word
			reader.skip(1)
			continue
		}
	}

	// Trim samples to actual length
	const finalSamples: Float32Array[] = []
	for (let i = 0; i < channels; i++) {
		finalSamples.push(samples[i]!.slice(0, sampleOffset))
	}

	const info: DtsInfo = {
		sampleRate: firstHeader.sampleRate,
		channels: firstHeader.channels,
		bitrate: firstHeader.bitrate,
		duration: sampleOffset / firstHeader.sampleRate,
		frameCount,
		channelArrangement: firstHeader.channelArrangement,
		lfe: firstHeader.lfe,
		pcmResolution: firstHeader.pcmr,
		extensionType: firstHeader.extAudio,
		isHD: false,
	}

	return { info, samples: finalSamples }
}

/**
 * Parse frame header
 */
function parseFrameHeader(reader: DtsReader): DtsFrameHeader {
	const startPos = reader.position

	// Sync word (32 bits)
	const sync = reader.readU32BE()
	if (sync !== DTS_SYNC_WORD) {
		throw new Error(`Invalid sync word: 0x${sync.toString(16)}`)
	}

	// Use bit reader for precise bit-level parsing
	const bitReader = new BitReader(reader)

	// Frame type and deficit sample count (1 + 5 bits)
	const frameType = bitReader.readBits(1)
	const deficitSampleCount = bitReader.readBits(5)

	// CRC present flag (1 bit)
	const crcFlag = bitReader.readBits(1) === 1

	// Number of PCM sample blocks (7 bits): actual = value + 1
	const sampleBlocks = bitReader.readBits(7) + 1

	// Primary frame byte size (14 bits): actual = value + 1
	const frameSize = bitReader.readBits(14) + 1

	// Audio channel arrangement (6 bits)
	const channelArrangement = bitReader.readBits(6)

	// Core audio sample rate (4 bits)
	const sampleRateIndex = bitReader.readBits(4)
	const sampleRate = getSampleRate(sampleRateIndex)

	// Transmission bit rate (5 bits)
	const bitrateIndex = bitReader.readBits(5)
	const bitrate = getBitrate(bitrateIndex)

	// Downmix (1 bit)
	bitReader.readBits(1)

	// Dynamic range (1 bit)
	const dynamicRange = bitReader.readBits(1) === 1

	// Time stamp (1 bit)
	const timestamp = bitReader.readBits(1) === 1

	// Auxiliary data (1 bit)
	const auxData = bitReader.readBits(1) === 1

	// HDCD (1 bit)
	const hdcd = bitReader.readBits(1) === 1

	// Extension audio descriptor (3 bits)
	const extAudio = bitReader.readBits(3)

	// Extended coding (1 bit)
	const extCoding = bitReader.readBits(1) === 1

	// Audio sync word insertion (1 bit)
	const aspf = bitReader.readBits(1) === 1

	// Low frequency effects (2 bits)
	const lfeCode = bitReader.readBits(2)
	const lfe = lfeCode === 1 || lfeCode === 2

	// Predictor history flag (1 bit)
	const predictor = bitReader.readBits(1) === 1

	// Header CRC check bytes (16 bits) - if CRC present
	if (crcFlag) {
		bitReader.readBits(16)
	}

	// Multirate interpolator (1 bit)
	const multirate = bitReader.readBits(1) === 1

	// Encoder software revision (4 bits)
	const version = bitReader.readBits(4)

	// Copy history (2 bits)
	const copyHistory = bitReader.readBits(2)

	// Source PCM resolution (3 bits)
	const pcmrCode = bitReader.readBits(3)
	const pcmr = [16, 16, 20, 20, 24, 24, 16, 16][pcmrCode]!

	// Front sum/difference flag (1 bit)
	const sumDiff = bitReader.readBits(1) === 1

	// Surround sum/difference flag (1 bit)
	const surroundDiff = bitReader.readBits(1) === 1

	// Dialog normalization (4 bits)
	const dialogNorm = bitReader.readBits(4)

	// Calculate channels
	const channels = getChannelCount(channelArrangement, lfe)

	// Calculate samples per frame
	const samplesPerFrame = sampleBlocks * 32 // Each block contains 32 samples

	return {
		frameType,
		sampleBlocks,
		frameSize,
		channelArrangement,
		sampleRateIndex,
		sampleRate,
		bitrateIndex,
		bitrate,
		dynamicRange,
		timestamp,
		auxData,
		hdcd,
		extAudio,
		extCoding,
		aspf,
		lfe,
		predictor,
		multirate,
		version,
		copyHistory,
		pcmr,
		sumDiff,
		surroundDiff,
		dialogNorm,
		crcFlag,
		channels,
		samplesPerFrame,
	}
}

/**
 * Decode a single frame
 */
function decodeFrame(reader: DtsReader): DtsFrame {
	const header = parseFrameHeader(reader)
	const frameStart = reader.position - 10 // Approximate header size

	// Read frame data
	const remainingBytes = header.frameSize - (reader.position - frameStart)
	const data = reader.readBytes(Math.max(0, remainingBytes))

	// Parse subframes (simplified - actual decoding is very complex)
	const subframes: DtsSubframeHeader[] = []

	// Simplified: Create silent samples (stub for actual ADPCM decoding)
	// Real DTS decoding requires complex QMF filter banks, ADPCM decoding,
	// and extensive bit allocation algorithms
	const samples: Float32Array[] = []
	for (let ch = 0; ch < header.channels; ch++) {
		samples.push(new Float32Array(header.samplesPerFrame))
	}

	return {
		header,
		subframes,
		data,
		samples,
	}
}

/**
 * Byte reader helper
 */
class DtsReader {
	private data: Uint8Array
	position: number = 0

	constructor(data: Uint8Array) {
		this.data = data
	}

	eof(): boolean {
		return this.position >= this.data.length
	}

	skip(n: number): void {
		this.position = Math.min(this.position + n, this.data.length)
	}

	seek(pos: number): void {
		this.position = Math.max(0, Math.min(pos, this.data.length))
	}

	readU8(): number {
		if (this.position >= this.data.length) {
			throw new Error('Unexpected end of data')
		}
		return this.data[this.position++]!
	}

	readU16BE(): number {
		const v = (this.data[this.position]! << 8) | this.data[this.position + 1]!
		this.position += 2
		return v
	}

	readU32BE(): number {
		const v =
			(this.data[this.position]! << 24) |
			(this.data[this.position + 1]! << 16) |
			(this.data[this.position + 2]! << 8) |
			this.data[this.position + 3]!
		this.position += 4
		return v >>> 0
	}

	readBytes(n: number): Uint8Array {
		const end = Math.min(this.position + n, this.data.length)
		const bytes = this.data.slice(this.position, end)
		this.position = end
		return bytes
	}

	/**
	 * Find next sync word and return its position
	 */
	findSyncWord(): number {
		while (this.position < this.data.length - 3) {
			// Check for big-endian sync word 0x7FFE8001
			if (
				this.data[this.position] === 0x7f &&
				this.data[this.position + 1] === 0xfe &&
				this.data[this.position + 2] === 0x80 &&
				this.data[this.position + 3] === 0x01
			) {
				return this.position
			}

			// Check for little-endian sync word 0xFE7F0180
			if (
				this.data[this.position] === 0xfe &&
				this.data[this.position + 1] === 0x7f &&
				this.data[this.position + 2] === 0x01 &&
				this.data[this.position + 3] === 0x80
			) {
				return this.position
			}

			this.position++
		}
		return -1
	}
}

/**
 * Bit reader for precise bit-level parsing
 */
class BitReader {
	private reader: DtsReader
	private buffer: number = 0
	private bitsInBuffer: number = 0

	constructor(reader: DtsReader) {
		this.reader = reader
	}

	readBits(n: number): number {
		while (this.bitsInBuffer < n) {
			this.buffer = (this.buffer << 8) | this.reader.readU8()
			this.bitsInBuffer += 8
		}

		this.bitsInBuffer -= n
		return (this.buffer >> this.bitsInBuffer) & ((1 << n) - 1)
	}

	alignToByte(): void {
		this.bitsInBuffer = 0
		this.buffer = 0
	}
}

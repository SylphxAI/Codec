/**
 * TTA (True Audio) decoder
 * Pure TypeScript implementation of TTA decoding
 */

import { TTA_MAGIC, type TtaDecodeResult, type TtaFilter, type TtaInfo, type TtaStreamInfo } from './types'

/**
 * Check if data is TTA
 */
export function isTta(data: Uint8Array): boolean {
	if (data.length < 4) return false
	return data[0] === 0x54 && data[1] === 0x54 && data[2] === 0x41 && data[3] === 0x31 // "TTA1"
}

/**
 * Parse TTA info without full decode
 */
export function parseTtaInfo(data: Uint8Array): TtaInfo {
	const reader = new TtaReader(data)

	// Check magic
	if (!isTta(data)) {
		throw new Error('Invalid TTA: missing magic number')
	}

	// Parse header
	reader.skip(4) // magic
	const streamInfo = parseHeader(reader)

	const duration = streamInfo.totalSamples / streamInfo.sampleRate

	return {
		streamInfo,
		sampleRate: streamInfo.sampleRate,
		channels: streamInfo.channels,
		bitsPerSample: streamInfo.bitsPerSample,
		totalSamples: streamInfo.totalSamples,
		duration,
	}
}

/**
 * Decode TTA to raw samples
 */
export function decodeTta(data: Uint8Array): TtaDecodeResult {
	const info = parseTtaInfo(data)
	const reader = new TtaReader(data)

	// Skip header
	reader.skip(4) // magic
	reader.skip(18) // header fields
	reader.skip(4) // CRC32

	const { channels, totalSamples, sampleRate } = info

	// Frame size in samples (default 1 second, last frame may be shorter)
	const frameSize = sampleRate
	const numFrames = Math.ceil(totalSamples / frameSize)

	// Read seek table (frame sizes)
	const frameSizes: number[] = []
	for (let i = 0; i < numFrames; i++) {
		frameSizes.push(reader.readU32LE())
	}
	reader.skip(4) // Seek table CRC32

	// Initialize output arrays
	const samples: Int32Array[] = []
	for (let i = 0; i < channels; i++) {
		samples.push(new Int32Array(totalSamples))
	}

	// Decode frames
	let sampleOffset = 0
	for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
		const frameBytes = frameSizes[frameIdx]!
		if (frameBytes === 0) continue

		const currentFrameSize = Math.min(frameSize, totalSamples - sampleOffset)
		const frameData = reader.readBytes(frameBytes)

		const frameSamples = decodeFrame(frameData, channels, currentFrameSize, info.bitsPerSample)

		// Copy samples to output
		for (let ch = 0; ch < channels; ch++) {
			const src = frameSamples[ch]!
			const dst = samples[ch]!
			for (let i = 0; i < currentFrameSize; i++) {
				dst[sampleOffset + i] = src[i]!
			}
		}

		sampleOffset += currentFrameSize
	}

	return { info, samples }
}

/**
 * Parse TTA header
 */
function parseHeader(reader: TtaReader): TtaStreamInfo {
	const format = reader.readU16LE()
	const channels = reader.readU16LE()
	const bitsPerSample = reader.readU16LE()
	const sampleRate = reader.readU32LE()
	const totalSamples = reader.readU32LE()
	const crc32 = reader.readU32LE()

	if (format !== 1 && format !== 2 && format !== 3) {
		throw new Error(`Unsupported TTA format: ${format}`)
	}

	if (channels === 0 || channels > 8) {
		throw new Error(`Invalid channel count: ${channels}`)
	}

	if (bitsPerSample !== 8 && bitsPerSample !== 16 && bitsPerSample !== 24) {
		throw new Error(`Invalid bits per sample: ${bitsPerSample}`)
	}

	return {
		format,
		channels,
		bitsPerSample,
		sampleRate,
		totalSamples,
		crc32,
	}
}

/**
 * Decode a single frame
 */
function decodeFrame(data: Uint8Array, channels: number, frameSize: number, bitsPerSample: number): Int32Array[] {
	const bitReader = new BitReader(data)
	const channelSamples: Int32Array[] = []

	// Initialize simple predictor state for each channel
	const lastSamples: number[] = []
	for (let ch = 0; ch < channels; ch++) {
		lastSamples.push(0)
		channelSamples.push(new Int32Array(frameSize))
	}

	// Decode samples
	for (let i = 0; i < frameSize; i++) {
		for (let ch = 0; ch < channels; ch++) {
			const samples = channelSamples[ch]!

			// Read Rice-coded residual
			const residual = decodeRice(bitReader)

			// Simple predictor: previous sample
			const prediction = lastSamples[ch]!
			const sample = prediction + residual

			// Update state
			lastSamples[ch] = sample

			// Store sample
			samples[i] = sample
		}
	}

	// Apply decorrelation if stereo
	if (channels === 2) {
		decorrelate(channelSamples[0]!, channelSamples[1]!, frameSize)
	}

	return channelSamples
}

/**
 * Create a new filter state
 */
function createFilter(): TtaFilter {
	return {
		round: 1 << 4,
		shift: 10,
		error: 0,
		qm: new Int32Array(8), // 8-tap filter
		dx: new Int32Array(8),
		dl: new Int32Array(8),
	}
}

/**
 * Predict next sample using adaptive filter
 */
function predictSample(filter: TtaFilter): number {
	let sum = filter.round
	for (let i = 0; i < 8; i++) {
		sum += filter.qm[i]! * filter.dx[i]!
	}
	return (sum >> filter.shift)
}

/**
 * Update filter state with new sample value
 */
function updateFilter(filter: TtaFilter, value: number): void {
	// Shift history
	for (let i = 7; i > 0; i--) {
		filter.dl[i] = filter.dl[i - 1]!
		filter.dx[i] = filter.dx[i - 1]!
	}
	filter.dl[0] = value - filter.error
	filter.dx[0] = filter.error
	filter.error = value

	// Adapt filter coefficients
	for (let i = 0; i < 8; i++) {
		if (filter.dl[i]! < 0) {
			filter.qm[i] = filter.qm[i]! - filter.dx[i]!
		} else {
			filter.qm[i] = filter.qm[i]! + filter.dx[i]!
		}
	}
}

/**
 * Decode Rice-coded value
 */
function decodeRice(bitReader: BitReader): number {
	// Read unary-coded quotient
	let quotient = 0
	while (bitReader.readBit() === 0) {
		quotient++
		if (quotient > 255) throw new Error('Invalid Rice quotient')
	}

	// Read 10 bits for remainder (TTA uses fixed k=10)
	const k = 10
	const remainder = bitReader.readBits(k)

	// Combine to unsigned value
	const unsigned = (quotient << k) | remainder

	// Convert to signed (zigzag decoding)
	return (unsigned >> 1) ^ -(unsigned & 1)
}

/**
 * Apply stereo decorrelation (mid-side decoding)
 */
function decorrelate(left: Int32Array, right: Int32Array, count: number): void {
	for (let i = 0; i < count; i++) {
		const mid = left[i]!
		const side = right[i]!
		// mid = (L + R) / 2, side = L - R
		// L = mid + side/2, R = mid - side/2
		// But for integer: L = ((mid<<1) + side) >> 1, R = ((mid<<1) - side) >> 1
		left[i] = mid + (side >> 1) + (side & 1)
		right[i] = mid - (side >> 1)
	}
}

/**
 * Byte reader helper
 */
class TtaReader {
	private data: Uint8Array
	position: number = 0

	constructor(data: Uint8Array) {
		this.data = data
	}

	eof(): boolean {
		return this.position >= this.data.length
	}

	skip(n: number): void {
		this.position += n
	}

	readU8(): number {
		return this.data[this.position++]!
	}

	readU16LE(): number {
		const v = this.data[this.position]! | (this.data[this.position + 1]! << 8)
		this.position += 2
		return v
	}

	readU32LE(): number {
		const v =
			this.data[this.position]! |
			(this.data[this.position + 1]! << 8) |
			(this.data[this.position + 2]! << 16) |
			(this.data[this.position + 3]! << 24)
		this.position += 4
		return v >>> 0
	}

	readBytes(n: number): Uint8Array {
		const bytes = this.data.slice(this.position, this.position + n)
		this.position += n
		return bytes
	}
}

/**
 * Bit reader for frame decoding
 */
class BitReader {
	private data: Uint8Array
	private position: number = 0
	private buffer: number = 0
	private bitsInBuffer: number = 0

	constructor(data: Uint8Array) {
		this.data = data
	}

	readBit(): number {
		if (this.bitsInBuffer === 0) {
			if (this.position >= this.data.length) {
				throw new Error('Unexpected end of data')
			}
			this.buffer = this.data[this.position++]!
			this.bitsInBuffer = 8
		}

		const bit = (this.buffer >> 7) & 1
		this.buffer <<= 1
		this.bitsInBuffer--
		return bit
	}

	readBits(n: number): number {
		let result = 0
		for (let i = 0; i < n; i++) {
			result = (result << 1) | this.readBit()
		}
		return result
	}
}

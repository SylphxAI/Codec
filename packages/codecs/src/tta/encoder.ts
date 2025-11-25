/**
 * TTA (True Audio) encoder
 * Pure TypeScript implementation of TTA encoding
 */

import { type TtaAudioData, type TtaEncodeOptions, type TtaFilter } from './types'

/**
 * Encode audio to TTA
 */
export function encodeTta(audio: TtaAudioData, options: TtaEncodeOptions = {}): Uint8Array {
	const { format = 1 } = options
	const { samples, sampleRate, bitsPerSample } = audio
	const channels = samples.length

	if (channels === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	const totalSamples = samples[0]!.length
	const frameSize = sampleRate // 1 second per frame
	const numFrames = Math.ceil(totalSamples / frameSize)

	const parts: Uint8Array[] = []

	// Magic number "TTA1"
	parts.push(new Uint8Array([0x54, 0x54, 0x41, 0x31]))

	// Header
	const header = buildHeader(format, channels, bitsPerSample, sampleRate, totalSamples)
	parts.push(header)

	// Encode frames and build seek table
	const frames: Uint8Array[] = []
	const frameSizes: number[] = []

	let sampleOffset = 0
	for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
		const currentFrameSize = Math.min(frameSize, totalSamples - sampleOffset)

		// Extract frame samples
		const frameSamples: Int32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			frameSamples.push(samples[ch]!.slice(sampleOffset, sampleOffset + currentFrameSize))
		}

		// Encode frame
		const frameData = encodeFrame(frameSamples, channels, currentFrameSize, bitsPerSample)
		frames.push(frameData)
		frameSizes.push(frameData.length)

		sampleOffset += currentFrameSize
	}

	// Seek table (frame sizes)
	const seekTable = new Uint8Array(numFrames * 4)
	for (let i = 0; i < numFrames; i++) {
		writeU32LE(seekTable, i * 4, frameSizes[i]!)
	}
	parts.push(seekTable)

	// Seek table CRC32
	const seekTableCrc = calculateCrc32(seekTable)
	const seekCrcBytes = new Uint8Array(4)
	writeU32LE(seekCrcBytes, 0, seekTableCrc)
	parts.push(seekCrcBytes)

	// Append all frames
	parts.push(...frames)

	return concatArrays(parts)
}

/**
 * Build TTA header
 */
function buildHeader(
	format: number,
	channels: number,
	bitsPerSample: number,
	sampleRate: number,
	totalSamples: number
): Uint8Array {
	const data = new Uint8Array(22) // 18 bytes header + 4 bytes CRC

	let offset = 0

	// Format (2 bytes)
	writeU16LE(data, offset, format)
	offset += 2

	// Channels (2 bytes)
	writeU16LE(data, offset, channels)
	offset += 2

	// Bits per sample (2 bytes)
	writeU16LE(data, offset, bitsPerSample)
	offset += 2

	// Sample rate (4 bytes)
	writeU32LE(data, offset, sampleRate)
	offset += 4

	// Total samples (4 bytes)
	writeU32LE(data, offset, totalSamples)
	offset += 4

	// CRC32 of header
	const crc32 = calculateCrc32(data.slice(0, 18))
	writeU32LE(data, offset, crc32)

	return data
}

/**
 * Encode a single frame
 */
function encodeFrame(samples: Int32Array[], channels: number, frameSize: number, bitsPerSample: number): Uint8Array {
	const bitWriter = new BitWriter()

	// Apply stereo correlation if stereo
	let encodeSamples = samples
	if (channels === 2) {
		encodeSamples = [new Int32Array(samples[0]!), new Int32Array(samples[1]!)]
		correlate(encodeSamples[0]!, encodeSamples[1]!, frameSize)
	}

	// Initialize simple predictor state for each channel
	const lastSamples: number[] = []
	for (let ch = 0; ch < channels; ch++) {
		lastSamples.push(0)
	}

	// Encode samples
	for (let i = 0; i < frameSize; i++) {
		for (let ch = 0; ch < channels; ch++) {
			const sample = encodeSamples[ch]![i]!

			// Simple predictor: previous sample
			const prediction = lastSamples[ch]!
			const residual = sample - prediction

			// Encode residual with Rice coding
			encodeRice(bitWriter, residual)

			// Update state
			lastSamples[ch] = sample
		}
	}

	// Pad to byte boundary
	bitWriter.alignToByte()

	return bitWriter.getBytes()
}

/**
 * Create a new filter state
 */
function createFilter(): TtaFilter {
	return {
		round: 1 << 4,
		shift: 10,
		error: 0,
		qm: new Int32Array(8),
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
 * Encode value with Rice coding
 */
function encodeRice(bitWriter: BitWriter, value: number): void {
	// Convert signed to unsigned (zigzag encoding)
	const unsigned = value < 0 ? -value * 2 - 1 : value * 2

	// TTA uses fixed k=10
	const k = 10

	// Calculate quotient and remainder
	const quotient = unsigned >> k
	const remainder = unsigned & ((1 << k) - 1)

	// Write unary-coded quotient
	for (let i = 0; i < quotient; i++) {
		bitWriter.writeBit(0)
	}
	bitWriter.writeBit(1)

	// Write k bits for remainder
	bitWriter.writeBits(remainder, k)
}

/**
 * Apply stereo correlation (mid-side encoding)
 */
function correlate(left: Int32Array, right: Int32Array, count: number): void {
	for (let i = 0; i < count; i++) {
		const l = left[i]!
		const r = right[i]!
		// mid = (L + R) / 2, side = L - R
		const side = l - r
		const mid = r + (side >> 1)
		left[i] = mid
		right[i] = side
	}
}

/**
 * Calculate CRC32
 */
function calculateCrc32(data: Uint8Array): number {
	let crc = 0xffffffff

	for (let i = 0; i < data.length; i++) {
		crc ^= data[i]!
		for (let j = 0; j < 8; j++) {
			if (crc & 1) {
				crc = (crc >>> 1) ^ 0xedb88320
			} else {
				crc >>>= 1
			}
		}
	}

	return (crc ^ 0xffffffff) >>> 0
}

/**
 * Bit writer helper
 */
class BitWriter {
	private buffer: number[] = []
	private currentByte: number = 0
	private bitsInByte: number = 0

	writeBit(bit: number): void {
		this.currentByte = (this.currentByte << 1) | (bit & 1)
		this.bitsInByte++

		if (this.bitsInByte === 8) {
			this.buffer.push(this.currentByte)
			this.currentByte = 0
			this.bitsInByte = 0
		}
	}

	writeBits(value: number, bits: number): void {
		for (let i = bits - 1; i >= 0; i--) {
			this.writeBit((value >> i) & 1)
		}
	}

	alignToByte(): void {
		if (this.bitsInByte > 0) {
			this.currentByte <<= 8 - this.bitsInByte
			this.buffer.push(this.currentByte)
			this.currentByte = 0
			this.bitsInByte = 0
		}
	}

	getBytes(): Uint8Array {
		const result = new Uint8Array(this.buffer.length)
		for (let i = 0; i < this.buffer.length; i++) {
			result[i] = this.buffer[i]!
		}
		return result
	}
}

// Binary helpers
function writeU16LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

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

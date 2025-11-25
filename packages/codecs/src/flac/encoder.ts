/**
 * FLAC (Free Lossless Audio Codec) encoder
 * Pure TypeScript implementation of FLAC encoding
 */

import { FlacBlockType, FlacChannelAssignment, type FlacAudioData, type FlacEncodeOptions } from './types'

/**
 * Encode audio to FLAC
 */
export function encodeFlac(audio: FlacAudioData, options: FlacEncodeOptions = {}): Uint8Array {
	const { compressionLevel = 5, blockSize = 4096, doMidSideStereo = true } = options

	const { samples, sampleRate, bitsPerSample } = audio
	const channels = samples.length

	if (channels === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	const totalSamples = samples[0]!.length
	const parts: Uint8Array[] = []

	// Magic number
	parts.push(new Uint8Array([0x66, 0x4c, 0x61, 0x43])) // "fLaC"

	// STREAMINFO block (must be first, marked as last for simplicity)
	parts.push(buildStreamInfo(sampleRate, channels, bitsPerSample, totalSamples, blockSize, true))

	// Encode frames
	let sampleOffset = 0
	let frameNumber = 0

	while (sampleOffset < totalSamples) {
		const currentBlockSize = Math.min(blockSize, totalSamples - sampleOffset)

		// Extract block samples
		const blockSamples: Int32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			blockSamples.push(samples[ch]!.slice(sampleOffset, sampleOffset + currentBlockSize))
		}

		// Encode frame
		const frame = encodeFrame(blockSamples, sampleRate, bitsPerSample, frameNumber, doMidSideStereo)
		parts.push(frame)

		sampleOffset += currentBlockSize
		frameNumber++
	}

	return concatArrays(parts)
}

/**
 * Build STREAMINFO metadata block
 */
function buildStreamInfo(
	sampleRate: number,
	channels: number,
	bitsPerSample: number,
	totalSamples: number,
	blockSize: number,
	isLast: boolean
): Uint8Array {
	// STREAMINFO is 34 bytes
	const data = new Uint8Array(4 + 34)

	// Block header
	data[0] = (isLast ? 0x80 : 0x00) | FlacBlockType.STREAMINFO
	data[1] = 0
	data[2] = 0
	data[3] = 34 // Length

	let offset = 4

	// Min/max block size
	writeU16BE(data, offset, blockSize)
	offset += 2
	writeU16BE(data, offset, blockSize)
	offset += 2

	// Min/max frame size (0 = unknown)
	writeU24BE(data, offset, 0)
	offset += 3
	writeU24BE(data, offset, 0)
	offset += 3

	// 20 bits sample rate, 3 bits channels-1, 5 bits bps-1, 36 bits total samples
	const packed = new Uint8Array(8)
	packed[0] = (sampleRate >> 12) & 0xff
	packed[1] = (sampleRate >> 4) & 0xff
	packed[2] = ((sampleRate & 0x0f) << 4) | (((channels - 1) & 0x07) << 1) | (((bitsPerSample - 1) >> 4) & 0x01)
	packed[3] = (((bitsPerSample - 1) & 0x0f) << 4) | ((totalSamples / 0x100000000) & 0x0f)
	packed[4] = (totalSamples >> 24) & 0xff
	packed[5] = (totalSamples >> 16) & 0xff
	packed[6] = (totalSamples >> 8) & 0xff
	packed[7] = totalSamples & 0xff

	data.set(packed, offset)
	offset += 8

	// MD5 signature (zeros for now)
	// 16 bytes of zeros already

	return data
}

/**
 * Encode a single frame
 */
function encodeFrame(
	samples: Int32Array[],
	sampleRate: number,
	bitsPerSample: number,
	frameNumber: number,
	doMidSideStereo: boolean
): Uint8Array {
	const channels = samples.length
	const blockSize = samples[0]!.length

	const bitWriter = new BitWriter()

	// Determine channel assignment - use independent channels for simplicity
	// Mid-side stereo encoding is complex and disabled for now
	const channelAssignment = channels - 1
	const encodeSamples = samples

	// Frame header
	// Sync code (14 bits)
	bitWriter.writeBits(0x3ffe, 14)
	// Reserved
	bitWriter.writeBits(0, 1)
	// Blocking strategy (0 = fixed-blocksize)
	bitWriter.writeBits(0, 1)

	// Block size code
	const blockSizeCode = getBlockSizeCode(blockSize)
	bitWriter.writeBits(blockSizeCode, 4)

	// Sample rate code
	const sampleRateCode = getSampleRateCode(sampleRate)
	bitWriter.writeBits(sampleRateCode, 4)

	// Channel assignment
	bitWriter.writeBits(channelAssignment, 4)

	// Sample size code
	const sampleSizeCode = getSampleSizeCode(bitsPerSample)
	bitWriter.writeBits(sampleSizeCode, 3)

	// Reserved
	bitWriter.writeBits(0, 1)

	// Frame number (UTF-8 coded)
	writeUtf8Number(bitWriter, frameNumber)

	// Block size (if code requires extra bytes)
	if (blockSizeCode === 6) {
		bitWriter.writeBits(blockSize - 1, 8)
	} else if (blockSizeCode === 7) {
		bitWriter.writeBits(blockSize - 1, 16)
	}

	// Sample rate (if code requires extra bytes)
	if (sampleRateCode === 12) {
		bitWriter.writeBits(Math.floor(sampleRate / 1000), 8)
	} else if (sampleRateCode === 13) {
		bitWriter.writeBits(sampleRate, 16)
	} else if (sampleRateCode === 14) {
		bitWriter.writeBits(Math.floor(sampleRate / 10), 16)
	}

	// CRC-8 of frame header (placeholder)
	const headerBytes = bitWriter.getBytes()
	const crc8 = calculateCrc8(headerBytes)
	bitWriter.writeBits(crc8, 8)

	// Encode subframes
	for (let ch = 0; ch < encodeSamples.length; ch++) {
		// Adjust bits per sample for side channel
		let effectiveBps = bitsPerSample
		if (channelAssignment === 10 && ch === 1) {
			// Mid-side, side channel needs extra bit
			effectiveBps++
		}

		encodeSubframe(bitWriter, encodeSamples[ch]!, effectiveBps)
	}

	// Align to byte boundary
	bitWriter.alignToByte()

	// CRC-16 of frame
	const frameBytes = bitWriter.getBytes()
	const crc16 = calculateCrc16(frameBytes)
	bitWriter.writeBits((crc16 >> 8) & 0xff, 8)
	bitWriter.writeBits(crc16 & 0xff, 8)

	return bitWriter.getBytes()
}

/**
 * Encode a subframe using fixed prediction
 */
function encodeSubframe(bitWriter: BitWriter, samples: Int32Array, bitsPerSample: number): void {
	const blockSize = samples.length

	// Try different fixed prediction orders and pick the best
	let bestOrder = 0
	let bestResidualBits = Infinity

	for (let order = 0; order <= 4; order++) {
		if (order >= blockSize) break
		const residual = calculateFixedResidual(samples, order)
		const bits = estimateRiceBits(residual)
		if (bits < bestResidualBits) {
			bestResidualBits = bits
			bestOrder = order
		}
	}

	// Also try verbatim
	const verbatimBits = blockSize * bitsPerSample
	if (verbatimBits <= bestResidualBits + bestOrder * bitsPerSample + 10) {
		// Use verbatim
		bitWriter.writeBits(0, 1) // Zero padding
		bitWriter.writeBits(1, 6) // Verbatim type
		bitWriter.writeBits(0, 1) // No wasted bits

		for (let i = 0; i < blockSize; i++) {
			bitWriter.writeSignedBits(samples[i]!, bitsPerSample)
		}
		return
	}

	// Use fixed prediction
	bitWriter.writeBits(0, 1) // Zero padding
	bitWriter.writeBits(8 + bestOrder, 6) // Fixed type
	bitWriter.writeBits(0, 1) // No wasted bits

	// Warm-up samples
	for (let i = 0; i < bestOrder; i++) {
		bitWriter.writeSignedBits(samples[i]!, bitsPerSample)
	}

	// Calculate and encode residual
	const residual = calculateFixedResidual(samples, bestOrder)
	encodeResidual(bitWriter, residual, blockSize, bestOrder)
}

/**
 * Calculate fixed prediction residual
 */
function calculateFixedResidual(samples: Int32Array, order: number): Int32Array {
	const blockSize = samples.length
	const residual = new Int32Array(blockSize - order)

	for (let i = order; i < blockSize; i++) {
		let prediction = 0
		switch (order) {
			case 0:
				prediction = 0
				break
			case 1:
				prediction = samples[i - 1]!
				break
			case 2:
				prediction = 2 * samples[i - 1]! - samples[i - 2]!
				break
			case 3:
				prediction = 3 * samples[i - 1]! - 3 * samples[i - 2]! + samples[i - 3]!
				break
			case 4:
				prediction = 4 * samples[i - 1]! - 6 * samples[i - 2]! + 4 * samples[i - 3]! - samples[i - 4]!
				break
		}
		residual[i - order] = samples[i]! - prediction
	}

	return residual
}

/**
 * Estimate bits needed for Rice coding
 */
function estimateRiceBits(residual: Int32Array): number {
	if (residual.length === 0) return 0

	// Find optimal Rice parameter
	let sum = 0
	for (let i = 0; i < residual.length; i++) {
		const v = residual[i]!
		sum += v < 0 ? -v * 2 - 1 : v * 2
	}

	const mean = sum / residual.length
	const k = mean > 0 ? Math.floor(Math.log2(mean)) : 0

	// Estimate bits: quotient (unary) + remainder (k bits) + 1 for terminator
	let bits = 0
	for (let i = 0; i < residual.length; i++) {
		const v = residual[i]!
		const unsigned = v < 0 ? -v * 2 - 1 : v * 2
		bits += (unsigned >> k) + 1 + k
	}

	return bits
}

/**
 * Encode residual using Rice coding
 */
function encodeResidual(bitWriter: BitWriter, residual: Int32Array, blockSize: number, predictorOrder: number): void {
	// Use Rice coding method 0
	bitWriter.writeBits(0, 2)

	// Single partition (order 0)
	bitWriter.writeBits(0, 4)

	// Find optimal Rice parameter
	let sum = 0
	for (let i = 0; i < residual.length; i++) {
		const v = residual[i]!
		sum += v < 0 ? -v * 2 - 1 : v * 2
	}

	const mean = residual.length > 0 ? sum / residual.length : 0
	let k = mean > 0 ? Math.floor(Math.log2(mean)) : 0
	k = Math.min(k, 14) // Max Rice parameter is 14

	bitWriter.writeBits(k, 4)

	// Encode each residual sample
	for (let i = 0; i < residual.length; i++) {
		const v = residual[i]!
		// Convert signed to unsigned
		const unsigned = v < 0 ? -v * 2 - 1 : v * 2

		const quotient = unsigned >> k
		const remainder = unsigned & ((1 << k) - 1)

		// Unary coded quotient
		for (let j = 0; j < quotient; j++) {
			bitWriter.writeBits(0, 1)
		}
		bitWriter.writeBits(1, 1)

		// Binary coded remainder
		if (k > 0) {
			bitWriter.writeBits(remainder, k)
		}
	}
}

/**
 * Get block size code
 */
function getBlockSizeCode(blockSize: number): number {
	switch (blockSize) {
		case 192:
			return 1
		case 576:
			return 2
		case 1152:
			return 3
		case 2304:
			return 4
		case 4608:
			return 5
		case 256:
			return 8
		case 512:
			return 9
		case 1024:
			return 10
		case 2048:
			return 11
		case 4096:
			return 12
		case 8192:
			return 13
		case 16384:
			return 14
		case 32768:
			return 15
		default:
			if (blockSize <= 256) return 6 // 8-bit
			return 7 // 16-bit
	}
}

/**
 * Get sample rate code
 */
function getSampleRateCode(sampleRate: number): number {
	switch (sampleRate) {
		case 88200:
			return 1
		case 176400:
			return 2
		case 192000:
			return 3
		case 8000:
			return 4
		case 16000:
			return 5
		case 22050:
			return 6
		case 24000:
			return 7
		case 32000:
			return 8
		case 44100:
			return 9
		case 48000:
			return 10
		case 96000:
			return 11
		default:
			if (sampleRate % 1000 === 0 && sampleRate <= 255000) return 12
			if (sampleRate <= 65535) return 13
			return 14
	}
}

/**
 * Get sample size code
 */
function getSampleSizeCode(bitsPerSample: number): number {
	switch (bitsPerSample) {
		case 8:
			return 1
		case 12:
			return 2
		case 16:
			return 4
		case 20:
			return 5
		case 24:
			return 6
		case 32:
			return 7
		default:
			return 0 // Get from STREAMINFO
	}
}

/**
 * Write UTF-8 coded number
 */
function writeUtf8Number(bitWriter: BitWriter, value: number): void {
	if (value < 0x80) {
		bitWriter.writeBits(value, 8)
	} else if (value < 0x800) {
		bitWriter.writeBits(0xc0 | (value >> 6), 8)
		bitWriter.writeBits(0x80 | (value & 0x3f), 8)
	} else if (value < 0x10000) {
		bitWriter.writeBits(0xe0 | (value >> 12), 8)
		bitWriter.writeBits(0x80 | ((value >> 6) & 0x3f), 8)
		bitWriter.writeBits(0x80 | (value & 0x3f), 8)
	} else if (value < 0x200000) {
		bitWriter.writeBits(0xf0 | (value >> 18), 8)
		bitWriter.writeBits(0x80 | ((value >> 12) & 0x3f), 8)
		bitWriter.writeBits(0x80 | ((value >> 6) & 0x3f), 8)
		bitWriter.writeBits(0x80 | (value & 0x3f), 8)
	} else if (value < 0x4000000) {
		bitWriter.writeBits(0xf8 | (value >> 24), 8)
		bitWriter.writeBits(0x80 | ((value >> 18) & 0x3f), 8)
		bitWriter.writeBits(0x80 | ((value >> 12) & 0x3f), 8)
		bitWriter.writeBits(0x80 | ((value >> 6) & 0x3f), 8)
		bitWriter.writeBits(0x80 | (value & 0x3f), 8)
	} else {
		bitWriter.writeBits(0xfc | (value >> 30), 8)
		bitWriter.writeBits(0x80 | ((value >> 24) & 0x3f), 8)
		bitWriter.writeBits(0x80 | ((value >> 18) & 0x3f), 8)
		bitWriter.writeBits(0x80 | ((value >> 12) & 0x3f), 8)
		bitWriter.writeBits(0x80 | ((value >> 6) & 0x3f), 8)
		bitWriter.writeBits(0x80 | (value & 0x3f), 8)
	}
}

/**
 * Calculate CRC-8 (polynomial 0x07)
 */
function calculateCrc8(data: Uint8Array): number {
	let crc = 0
	for (let i = 0; i < data.length; i++) {
		crc ^= data[i]!
		for (let j = 0; j < 8; j++) {
			if (crc & 0x80) {
				crc = ((crc << 1) ^ 0x07) & 0xff
			} else {
				crc = (crc << 1) & 0xff
			}
		}
	}
	return crc
}

/**
 * Calculate CRC-16 (polynomial 0x8005)
 */
function calculateCrc16(data: Uint8Array): number {
	let crc = 0
	for (let i = 0; i < data.length; i++) {
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
 * Bit writer helper
 */
class BitWriter {
	private buffer: number[] = []
	private currentByte: number = 0
	private bitsInByte: number = 0

	writeBits(value: number, bits: number): void {
		for (let i = bits - 1; i >= 0; i--) {
			this.currentByte = (this.currentByte << 1) | ((value >> i) & 1)
			this.bitsInByte++

			if (this.bitsInByte === 8) {
				this.buffer.push(this.currentByte)
				this.currentByte = 0
				this.bitsInByte = 0
			}
		}
	}

	writeSignedBits(value: number, bits: number): void {
		// Convert to unsigned representation
		const unsigned = value < 0 ? value + (1 << bits) : value
		this.writeBits(unsigned, bits)
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
function writeU16BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 8) & 0xff
	data[offset + 1] = value & 0xff
}

function writeU24BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 16) & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = value & 0xff
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

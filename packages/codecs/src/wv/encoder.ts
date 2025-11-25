/**
 * WavPack (WV) encoder
 * Pure TypeScript implementation of WavPack encoding
 */

import type { AudioData } from '@sylphx/codec-core'
import type { WavPackEncodeOptions } from './types'
import { WavPackFlags } from './types'

/**
 * Encode audio to WavPack
 */
export function encodeWavPack(audio: AudioData, options: WavPackEncodeOptions = {}): Uint8Array {
	const { compressionLevel = 1, blockSize = 22050, jointStereo = true } = options

	const { samples, sampleRate, bitsPerSample } = audio
	const channels = samples.length

	if (channels === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	const totalSamples = samples[0]!.length
	const parts: Uint8Array[] = []

	let sampleOffset = 0
	let blockIndex = 0

	// Encode blocks
	while (sampleOffset < totalSamples) {
		const currentBlockSize = Math.min(blockSize, totalSamples - sampleOffset)

		// Extract block samples
		const blockSamples: Int32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			blockSamples.push(samples[ch]!.slice(sampleOffset, sampleOffset + currentBlockSize))
		}

		// Encode block
		const block = encodeBlock(
			blockSamples,
			sampleRate,
			bitsPerSample,
			totalSamples,
			blockIndex,
			sampleOffset === 0,
			sampleOffset + currentBlockSize >= totalSamples,
			jointStereo
		)
		parts.push(block)

		sampleOffset += currentBlockSize
		blockIndex += currentBlockSize
	}

	return concatArrays(parts)
}

/**
 * Encode a single WavPack block
 */
function encodeBlock(
	samples: Int32Array[],
	sampleRate: number,
	bitsPerSample: number,
	totalSamples: number,
	blockIndex: number,
	isInitialBlock: boolean,
	isFinalBlock: boolean,
	jointStereo: boolean
): Uint8Array {
	const channels = samples.length
	const blockSamples = samples[0]!.length

	// Build flags
	let flags = 0

	// Bytes per sample (0=8bit, 1=16bit, 2=24bit, 3=32bit)
	const bytesPerSample = Math.ceil(bitsPerSample / 8)
	flags |= Math.min(bytesPerSample - 1, 3) & WavPackFlags.BYTES_PER_SAMPLE_MASK

	// Mono flag
	if (channels === 1) {
		flags |= WavPackFlags.MONO_FLAG
	}

	// Joint stereo for stereo files
	if (channels === 2 && jointStereo) {
		flags |= WavPackFlags.JOINT_STEREO
	}

	// Initial/final block flags
	if (isInitialBlock) {
		flags |= WavPackFlags.INITIAL_BLOCK
	}
	if (isFinalBlock) {
		flags |= WavPackFlags.FINAL_BLOCK
	}

	// Sample rate encoding
	const srFlags = getSampleRateFlags(sampleRate)
	flags |= (srFlags << 19) & WavPackFlags.SAMPLE_RATE_MASK

	// Apply joint stereo encoding
	let encodeSamples = samples
	if (channels === 2 && jointStereo) {
		encodeSamples = applyJointStereo(samples)
	}

	// Calculate decorrelation (simplified - just use order 1 prediction)
	const residuals = calculateResiduals(encodeSamples)

	// Encode metadata and bitstream
	const metadata: Uint8Array[] = []

	// Add decorrelation terms (simple order-1 prediction)
	if (blockSamples > 1) {
		metadata.push(encodeDecorrTerms())
		metadata.push(encodeDecorrWeights())
		metadata.push(encodeDecorrSamples(encodeSamples))
	}

	// Add entropy variables
	metadata.push(encodeEntropyVars())

	// Encode residuals as bitstream
	const bitstream = encodeBitstream(residuals)
	metadata.push(encodeBitstreamMetadata(bitstream))

	// Build block
	const metadataBytes = concatArrays(metadata)
	const blockSize = 32 + metadataBytes.length // Header (32) + metadata

	const block = new Uint8Array(blockSize)
	let offset = 0

	// Block header
	block.set([0x77, 0x76, 0x70, 0x6b], offset) // "wvpk"
	offset += 4

	writeU32LE(block, offset, blockSize) // Block size
	offset += 4

	writeU16LE(block, offset, 0x0410) // Version 4.16
	offset += 2

	block[offset++] = 0 // Track number
	block[offset++] = 0 // Index number

	writeU32LE(block, offset, totalSamples)
	offset += 4

	writeU32LE(block, offset, blockIndex)
	offset += 4

	writeU32LE(block, offset, blockSamples)
	offset += 4

	writeU32LE(block, offset, flags)
	offset += 4

	writeU32LE(block, offset, 0) // CRC (placeholder)
	offset += 4

	// Metadata
	block.set(metadataBytes, offset)

	return block
}

/**
 * Apply joint stereo encoding (mid-side)
 */
function applyJointStereo(samples: Int32Array[]): Int32Array[] {
	const left = samples[0]!
	const right = samples[1]!
	const blockSamples = left.length

	const mid = new Int32Array(blockSamples)
	const side = new Int32Array(blockSamples)

	for (let i = 0; i < blockSamples; i++) {
		const l = left[i]!
		const r = right[i]!
		mid[i] = (l + r) >> 1
		side[i] = l - r
	}

	return [mid, side]
}

/**
 * Calculate residuals using simple prediction
 */
function calculateResiduals(samples: Int32Array[]): Int32Array[] {
	const residuals: Int32Array[] = []

	for (const channelSamples of samples) {
		const blockSamples = channelSamples.length
		const residual = new Int32Array(blockSamples)

		// First sample is verbatim
		residual[0] = channelSamples[0]!

		// Rest use order-1 prediction
		for (let i = 1; i < blockSamples; i++) {
			residual[i] = channelSamples[i]! - channelSamples[i - 1]!
		}

		residuals.push(residual)
	}

	return residuals
}

/**
 * Encode decorrelation terms metadata
 */
function encodeDecorrTerms(): Uint8Array {
	// Simple order-1 prediction
	const data = new Uint8Array(2)
	data[0] = 1 // Term = 1 (predict from previous sample)
	data[1] = 0 // Delta = 0

	return encodeMetadataBlock(2, data) // ID_DECORR_TERMS = 2
}

/**
 * Encode decorrelation weights metadata
 */
function encodeDecorrWeights(): Uint8Array {
	// Weight for order-1 prediction (typically 1.0 = weight 256, but use 0 for simplicity)
	const data = new Uint8Array(2)
	data[0] = 0 // Weight A
	data[1] = 0 // Weight B

	return encodeMetadataBlock(3, data) // ID_DECORR_WEIGHTS = 3
}

/**
 * Encode decorrelation samples metadata
 */
function encodeDecorrSamples(samples: Int32Array[]): Uint8Array {
	const channels = samples.length
	const data = new Uint8Array(channels * 2)

	for (let ch = 0; ch < channels; ch++) {
		const sample = samples[ch]![0] ?? 0
		writeI16LE(data, ch * 2, sample)
	}

	return encodeMetadataBlock(4, data) // ID_DECORR_SAMPLES = 4
}

/**
 * Encode entropy variables metadata
 */
function encodeEntropyVars(): Uint8Array {
	// Simple entropy values
	const data = new Uint8Array(6)
	writeU16LE(data, 0, 0) // Median 0
	writeU16LE(data, 2, 0) // Median 1
	writeU16LE(data, 4, 0) // Median 2

	return encodeMetadataBlock(5, data) // ID_ENTROPY_VARS = 5
}

/**
 * Encode residuals to bitstream using Rice coding
 */
function encodeBitstream(residuals: Int32Array[]): Uint8Array {
	const bitWriter = new BitWriter()
	const k = 4 // Rice parameter

	for (const channelResiduals of residuals) {
		for (let i = 0; i < channelResiduals.length; i++) {
			const value = channelResiduals[i]!

			// Convert signed to unsigned (zigzag encoding)
			const unsigned = value >= 0 ? value * 2 : -value * 2 - 1

			// Rice coding
			const quotient = unsigned >> k
			const remainder = unsigned & ((1 << k) - 1)

			// Write unary coded quotient
			for (let j = 0; j < quotient; j++) {
				bitWriter.writeBit(0)
			}
			bitWriter.writeBit(1)

			// Write binary coded remainder
			if (k > 0) {
				bitWriter.writeBits(remainder, k)
			}
		}
	}

	return bitWriter.getBytes()
}

/**
 * Encode bitstream metadata block
 */
function encodeBitstreamMetadata(bitstream: Uint8Array): Uint8Array {
	return encodeMetadataBlock(10, bitstream) // ID_WV_BITSTREAM = 10
}

/**
 * Encode a metadata block
 */
function encodeMetadataBlock(id: number, data: Uint8Array): Uint8Array {
	const size = data.length
	const oddSize = size % 2 !== 0
	const largeSize = size > 510

	const header: number[] = []

	// First byte: ID (6 bits) + large flag + odd flag
	let byte1 = id & 0x3f
	if (largeSize) byte1 |= 0x40
	if (oddSize) byte1 |= 0x80
	header.push(byte1)

	// Size bytes
	const sizeValue = size >> 1
	if (largeSize) {
		header.push((sizeValue >> 8) & 0xff)
		header.push(sizeValue & 0xff)
	} else {
		header.push(sizeValue & 0xff)
	}

	// Build block
	const block = new Uint8Array(header.length + size + (oddSize ? 0 : 0))
	let offset = 0

	for (const byte of header) {
		block[offset++] = byte
	}

	block.set(data, offset)
	offset += data.length

	return block
}

/**
 * Get sample rate flags
 */
function getSampleRateFlags(sampleRate: number): number {
	switch (sampleRate) {
		case 6000:
			return 0
		case 8000:
			return 1
		case 9600:
			return 2
		case 11025:
			return 3
		case 12000:
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
		case 64000:
			return 11
		case 88200:
			return 12
		case 96000:
			return 13
		case 192000:
			return 14
		default:
			return 9 // Default to 44100
	}
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

	getBytes(): Uint8Array {
		// Flush remaining bits
		if (this.bitsInByte > 0) {
			this.currentByte <<= 8 - this.bitsInByte
			this.buffer.push(this.currentByte)
		}

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

function writeI16LE(data: Uint8Array, offset: number, value: number): void {
	const unsigned = value < 0 ? value + 65536 : value
	writeU16LE(data, offset, unsigned)
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

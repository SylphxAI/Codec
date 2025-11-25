/**
 * DSF (DSD Stream File) decoder
 * Pure TypeScript implementation of DSF decoding
 */

import type { AudioData } from '@sylphx/codec-core'
import { DATA_MAGIC, DSF_MAGIC, FMT_MAGIC, type DsfFormatChunk, type DsfInfo } from './types'

/**
 * Check if data is DSF
 */
export function isDsf(data: Uint8Array): boolean {
	if (data.length < 4) return false
	return data[0] === 0x44 && data[1] === 0x53 && data[2] === 0x44 && data[3] === 0x20 // "DSD "
}

/**
 * Parse DSF info without full decode
 */
export function parseDsfInfo(data: Uint8Array): DsfInfo {
	const reader = new DsfReader(data)

	// Check DSD chunk
	if (!isDsf(data)) {
		throw new Error('Invalid DSF: missing DSD magic')
	}

	// Skip magic (already validated)
	reader.skip(4)

	const dsdChunkSize = reader.readU64LE()
	const totalFileSize = reader.readU64LE()
	const metadataPointer = reader.readU64LE()

	// Read format chunk
	const fmtMagic = reader.readU8()
	const fmtMagic2 = reader.readU8()
	const fmtMagic3 = reader.readU8()
	const fmtMagic4 = reader.readU8()
	if (fmtMagic !== 0x66 || fmtMagic2 !== 0x6d || fmtMagic3 !== 0x74 || fmtMagic4 !== 0x20) {
		throw new Error('Invalid DSF: missing fmt chunk')
	}

	const format = parseFormatChunk(reader)

	const duration = format.sampleCount / format.samplingFrequency

	return {
		format,
		channels: format.channelNum,
		sampleRate: format.samplingFrequency,
		bitsPerSample: format.bitsPerSample,
		totalSamples: format.sampleCount,
		duration,
		hasMetadata: metadataPointer > 0,
	}
}

/**
 * Decode DSF to normalized audio samples
 */
export function decodeDsf(data: Uint8Array): AudioData {
	const info = parseDsfInfo(data)
	const reader = new DsfReader(data)

	// Skip DSD chunk header
	reader.skip(28)

	// Skip format chunk (4 bytes magic + 8 bytes size + 40 bytes data = 52 total)
	reader.skip(52)

	// Read data chunk
	const dataMagic = reader.readU8()
	const dataMagic2 = reader.readU8()
	const dataMagic3 = reader.readU8()
	const dataMagic4 = reader.readU8()
	if (dataMagic !== 0x64 || dataMagic2 !== 0x61 || dataMagic3 !== 0x74 || dataMagic4 !== 0x61) {
		throw new Error('Invalid DSF: missing data chunk')
	}

	const dataChunkSize = reader.readU64LE()
	const dataSize = Number(dataChunkSize) - 12 // Subtract header

	// Read DSD data
	const dsdData = reader.readBytes(dataSize)

	// Decode DSD to PCM
	const samples = decodeDsdToPcm(dsdData, info)

	return {
		samples,
		sampleRate: info.sampleRate,
		channels: info.channels,
	}
}

/**
 * Parse format chunk
 */
function parseFormatChunk(reader: DsfReader): DsfFormatChunk {
	const chunkSize = reader.readU64LE()

	const formatVersion = reader.readU32LE()
	const formatId = reader.readU32LE()
	const channelType = reader.readU32LE()
	const channelNum = reader.readU32LE()
	const samplingFrequency = reader.readU32LE()
	const bitsPerSample = reader.readU32LE()
	const sampleCount = Number(reader.readU64LE())
	const blockSizePerChannel = reader.readU32LE()
	const reserved = reader.readU32LE()

	if (formatVersion !== 1) {
		throw new Error(`Unsupported DSF format version: ${formatVersion}`)
	}

	if (formatId !== 0) {
		throw new Error(`Unsupported DSF format ID: ${formatId}`)
	}

	if (bitsPerSample !== 1 && bitsPerSample !== 8) {
		throw new Error(`Unsupported bits per sample: ${bitsPerSample}`)
	}

	return {
		formatVersion,
		formatId,
		channelType,
		channelNum,
		samplingFrequency,
		bitsPerSample,
		sampleCount,
		blockSizePerChannel,
		reserved,
	}
}

/**
 * Decode DSD bitstream to PCM samples
 * Uses simple 1-bit to float conversion with decimation
 */
function decodeDsdToPcm(dsdData: Uint8Array, info: DsfInfo): Float32Array[] {
	const channels = info.channels
	const blockSize = info.format.blockSizePerChannel
	const totalSamples = info.totalSamples
	const totalBlocks = Math.ceil((totalSamples * channels) / blockSize / 8)

	// Initialize output arrays
	const samples: Float32Array[] = []
	for (let ch = 0; ch < channels; ch++) {
		samples.push(new Float32Array(totalSamples))
	}

	// DSF stores data in blocks: all blocks for channel 0, then all for channel 1, etc.
	let dataOffset = 0

	for (let ch = 0; ch < channels; ch++) {
		let sampleIndex = 0
		const channelSamples = samples[ch]!
		const blocksPerChannel = Math.ceil(totalSamples / blockSize / 8)

		for (let block = 0; block < blocksPerChannel && sampleIndex < totalSamples; block++) {
			const blockBytes = Math.min(blockSize, dsdData.length - dataOffset)

			for (let byteIdx = 0; byteIdx < blockBytes && sampleIndex < totalSamples; byteIdx++) {
				const byte = dsdData[dataOffset++]!

				// Each bit represents one sample in LSB-first order
				for (let bit = 0; bit < 8 && sampleIndex < totalSamples; bit++) {
					const bitValue = (byte >> bit) & 1
					// Convert 1-bit to normalized float: 0 -> -1.0, 1 -> 1.0
					// This is a simplified conversion; proper DSD->PCM needs more sophisticated filtering
					channelSamples[sampleIndex++] = bitValue === 1 ? 1.0 : -1.0
				}
			}
		}
	}

	// Apply simple decimation filter to smooth the 1-bit signal
	// This is a basic implementation; production code would use proper DSD decimation
	for (let ch = 0; ch < channels; ch++) {
		applySimpleFilter(samples[ch]!)
	}

	return samples
}

/**
 * Apply simple moving average filter to smooth DSD signal
 * In a production decoder, this would be replaced with a proper decimation filter
 */
function applySimpleFilter(samples: Float32Array): void {
	const filterSize = 8 // Small filter for basic smoothing
	const temp = new Float32Array(samples.length)

	for (let i = 0; i < samples.length; i++) {
		let sum = 0
		let count = 0

		for (let j = Math.max(0, i - filterSize); j <= Math.min(samples.length - 1, i + filterSize); j++) {
			sum += samples[j]!
			count++
		}

		temp[i] = sum / count
	}

	samples.set(temp)
}

/**
 * Byte reader helper
 */
class DsfReader {
	private data: Uint8Array
	private position: number = 0

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

	readU32LE(): number {
		const v =
			this.data[this.position]! |
			(this.data[this.position + 1]! << 8) |
			(this.data[this.position + 2]! << 16) |
			(this.data[this.position + 3]! << 24)
		this.position += 4
		return v >>> 0
	}

	readU64LE(): bigint {
		const low = this.readU32LE()
		const high = this.readU32LE()
		return (BigInt(high) << 32n) | BigInt(low)
	}

	readBytes(n: number): Uint8Array {
		const bytes = this.data.slice(this.position, this.position + n)
		this.position += n
		return bytes
	}
}

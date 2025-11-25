/**
 * DSF (DSD Stream File) encoder
 * Pure TypeScript implementation of DSF encoding
 */

import type { AudioData } from '@sylphx/codec-core'
import { DATA_MAGIC, DSF_MAGIC, DsdSampleRate, FMT_MAGIC, type DsfEncodeOptions } from './types'

/**
 * Encode audio to DSF
 */
export function encodeDsf(audio: AudioData, options: DsfEncodeOptions = {}): Uint8Array {
	const { sampleRate = DsdSampleRate.DSD64 } = options

	const { samples } = audio
	const channels = samples.length

	if (channels === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	if (channels > 6) {
		throw new Error('DSF supports maximum 6 channels')
	}

	// Validate sample rate
	const validRates = [
		DsdSampleRate.DSD64,
		DsdSampleRate.DSD128,
		DsdSampleRate.DSD256,
		DsdSampleRate.DSD512,
	]
	if (!validRates.includes(sampleRate)) {
		throw new Error(
			`Invalid sample rate: ${sampleRate}. Must be one of: ${validRates.join(', ')}`
		)
	}

	const totalSamples = samples[0]!.length
	const blockSizePerChannel = 4096

	// Convert PCM to DSD
	const dsdData = encodePcmToDsd(samples, totalSamples, channels, blockSizePerChannel)

	// Build DSF file
	const parts: Uint8Array[] = []

	// DSD chunk
	const dsdChunk = buildDsdChunk(dsdData.length, 0) // No metadata
	parts.push(dsdChunk)

	// Format chunk
	const fmtChunk = buildFormatChunk(
		channels,
		sampleRate,
		totalSamples,
		blockSizePerChannel
	)
	parts.push(fmtChunk)

	// Data chunk
	const dataChunk = buildDataChunk(dsdData)
	parts.push(dataChunk)

	return concatArrays(parts)
}

/**
 * Build DSD chunk header
 */
function buildDsdChunk(dataSize: number, metadataPointer: number): Uint8Array {
	const chunk = new Uint8Array(28)
	let offset = 0

	// Magic "DSD " (written as ASCII bytes)
	chunk[offset++] = 0x44 // 'D'
	chunk[offset++] = 0x53 // 'S'
	chunk[offset++] = 0x44 // 'D'
	chunk[offset++] = 0x20 // ' '

	// Chunk size (always 28)
	writeU64LE(chunk, offset, 28n)
	offset += 8

	// Total file size (DSD + fmt + data)
	const totalSize = 28 + 52 + (12 + dataSize)
	writeU64LE(chunk, offset, BigInt(totalSize))
	offset += 8

	// Metadata pointer (0 = no metadata)
	writeU64LE(chunk, offset, BigInt(metadataPointer))
	offset += 8

	return chunk
}

/**
 * Build format chunk
 */
function buildFormatChunk(
	channels: number,
	sampleRate: number,
	sampleCount: number,
	blockSizePerChannel: number
): Uint8Array {
	const chunk = new Uint8Array(52)
	let offset = 0

	// Magic "fmt " (written as ASCII bytes)
	chunk[offset++] = 0x66 // 'f'
	chunk[offset++] = 0x6d // 'm'
	chunk[offset++] = 0x74 // 't'
	chunk[offset++] = 0x20 // ' '

	// Chunk size (always 52)
	writeU64LE(chunk, offset, 52n)
	offset += 8

	// Format version (always 1)
	writeU32LE(chunk, offset, 1)
	offset += 4

	// Format ID (0 = DSD raw)
	writeU32LE(chunk, offset, 0)
	offset += 4

	// Channel type
	const channelType = getChannelType(channels)
	writeU32LE(chunk, offset, channelType)
	offset += 4

	// Channel number
	writeU32LE(chunk, offset, channels)
	offset += 4

	// Sampling frequency
	writeU32LE(chunk, offset, sampleRate)
	offset += 4

	// Bits per sample (always 1 for DSD)
	writeU32LE(chunk, offset, 1)
	offset += 4

	// Sample count (per channel)
	writeU64LE(chunk, offset, BigInt(sampleCount))
	offset += 8

	// Block size per channel (always 4096)
	writeU32LE(chunk, offset, blockSizePerChannel)
	offset += 4

	// Reserved (0)
	writeU32LE(chunk, offset, 0)
	offset += 4

	return chunk
}

/**
 * Build data chunk
 */
function buildDataChunk(dsdData: Uint8Array): Uint8Array {
	const chunkSize = 12 + dsdData.length
	const chunk = new Uint8Array(chunkSize)
	let offset = 0

	// Magic "data" (written as ASCII bytes)
	chunk[offset++] = 0x64 // 'd'
	chunk[offset++] = 0x61 // 'a'
	chunk[offset++] = 0x74 // 't'
	chunk[offset++] = 0x61 // 'a'

	// Chunk size
	writeU64LE(chunk, offset, BigInt(chunkSize))
	offset += 8

	// DSD data
	chunk.set(dsdData, offset)

	return chunk
}

/**
 * Convert PCM samples to DSD bitstream
 * Uses simple sigma-delta modulation
 */
function encodePcmToDsd(
	samples: Float32Array[],
	totalSamples: number,
	channels: number,
	blockSizePerChannel: number
): Uint8Array {
	const blocksPerChannel = Math.ceil(totalSamples / (blockSizePerChannel * 8))
	const totalBytes = blocksPerChannel * blockSizePerChannel * channels
	const dsdData = new Uint8Array(totalBytes)

	let dataOffset = 0

	// Encode each channel
	for (let ch = 0; ch < channels; ch++) {
		const channelSamples = samples[ch]!
		let sampleIndex = 0

		// Sigma-delta modulator state
		let integrator = 0

		for (let block = 0; block < blocksPerChannel; block++) {
			for (let byteIdx = 0; byteIdx < blockSizePerChannel; byteIdx++) {
				let byte = 0

				// Encode 8 samples into one byte (LSB first)
				for (let bit = 0; bit < 8; bit++) {
					if (sampleIndex < totalSamples) {
						const sample = channelSamples[sampleIndex++]!

						// Sigma-delta modulation
						const error = sample - integrator
						const output = error >= 0 ? 1 : 0

						// Update integrator
						integrator += (output === 1 ? 0.125 : -0.125)
						// Apply simple leaky integrator
						integrator *= 0.99

						// Pack bit into byte (LSB first)
						byte |= output << bit
					}
				}

				dsdData[dataOffset++] = byte
			}
		}
	}

	return dsdData
}

/**
 * Get channel type from channel count
 */
function getChannelType(channels: number): number {
	switch (channels) {
		case 1:
			return 1 // Mono
		case 2:
			return 2 // Stereo
		case 3:
			return 3 // 3 channel
		case 4:
			return 4 // Quad
		case 5:
			return 6 // 5 channel
		case 6:
			return 7 // 5.1
		default:
			return 2 // Default to stereo
	}
}

// Binary helpers
function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

function writeU64LE(data: Uint8Array, offset: number, value: bigint): void {
	const low = Number(value & 0xffffffffn)
	const high = Number(value >> 32n)
	writeU32LE(data, offset, low)
	writeU32LE(data, offset + 4, high)
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

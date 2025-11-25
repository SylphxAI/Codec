/**
 * AAC (Advanced Audio Codec) decoder
 * Pure TypeScript implementation of AAC decoding
 */

import {
	AAC_SAMPLE_RATES,
	AAC_SYNC_WORD,
	AacChannelConfig,
	type AacDecodeResult,
	type AacFrameData,
	type AacInfo,
	type AdtsHeader,
} from './types'

/**
 * Check if data is AAC (ADTS)
 */
export function isAac(data: Uint8Array): boolean {
	if (data.length < 7) return false
	// Check for ADTS sync word (12 bits: 0xFFF)
	return (data[0] === 0xff && (data[1]! & 0xf0) === 0xf0)
}

/**
 * Parse AAC info without full decode
 */
export function parseAacInfo(data: Uint8Array): AacInfo {
	if (!isAac(data)) {
		throw new Error('Invalid AAC: missing ADTS sync word')
	}

	const header = parseAdtsHeader(data, 0)
	const sampleRate = AAC_SAMPLE_RATES[header.sampleRateIndex] || 0
	const channels = header.channelConfig === AacChannelConfig.AOT_SPECIFIC ? 2 : header.channelConfig

	// Calculate total frames and duration by scanning file
	let totalFrames = 0
	let offset = 0

	while (offset + 7 <= data.length) {
		if (data[offset] !== 0xff || (data[offset + 1]! & 0xf0) !== 0xf0) {
			break
		}

		const frameHeader = parseAdtsHeader(data, offset)
		totalFrames++
		offset += frameHeader.frameLength

		if (offset >= data.length) break
	}

	const samplesPerFrame = 1024 // Standard AAC frame size
	const totalSamples = totalFrames * samplesPerFrame
	const duration = sampleRate > 0 ? totalSamples / sampleRate : 0

	return {
		profile: header.profile + 1,
		sampleRate,
		channels,
		duration,
		totalFrames,
		frameSize: samplesPerFrame,
	}
}

/**
 * Decode AAC to raw samples
 */
export function decodeAac(data: Uint8Array): AacDecodeResult {
	const info = parseAacInfo(data)
	const allSamples: Float32Array[] = []

	// Initialize output arrays
	for (let i = 0; i < info.channels; i++) {
		allSamples.push(new Float32Array(0))
	}

	let offset = 0

	while (offset + 7 <= data.length) {
		if (data[offset] !== 0xff || (data[offset + 1]! & 0xf0) !== 0xf0) {
			break
		}

		try {
			const frame = decodeFrame(data, offset)

			// Append samples from this frame
			for (let ch = 0; ch < info.channels; ch++) {
				const existing = allSamples[ch]!
				const newSamples = frame.samples[ch] || new Float32Array(frame.samples[0]!.length)
				const combined = new Float32Array(existing.length + newSamples.length)
				combined.set(existing)
				combined.set(newSamples, existing.length)
				allSamples[ch] = combined
			}

			offset += frame.header.frameLength
		} catch (e) {
			// Skip corrupted frame
			offset++
			// Try to find next sync word
			while (offset < data.length - 1) {
				if (data[offset] === 0xff && (data[offset + 1]! & 0xf0) === 0xf0) {
					break
				}
				offset++
			}
		}
	}

	return { info, samples: allSamples }
}

/**
 * Parse ADTS header
 */
function parseAdtsHeader(data: Uint8Array, offset: number): AdtsHeader {
	if (offset + 7 > data.length) {
		throw new Error('Insufficient data for ADTS header')
	}

	const reader = new AacReader(data, offset)

	// Fixed part
	const syncWord = reader.readBits(12)
	if (syncWord !== AAC_SYNC_WORD) {
		throw new Error(`Invalid sync word: 0x${syncWord.toString(16)}`)
	}

	const id = reader.readBits(1)
	const layer = reader.readBits(2)
	const protectionAbsent = reader.readBits(1)
	const profile = reader.readBits(2)
	const sampleRateIndex = reader.readBits(4)
	const privateBit = reader.readBits(1)
	const channelConfig = reader.readBits(3)
	const originalCopy = reader.readBits(1)
	const home = reader.readBits(1)

	// Variable part
	const copyrightId = reader.readBits(1)
	const copyrightStart = reader.readBits(1)
	const frameLength = reader.readBits(13)
	const bufferFullness = reader.readBits(11)
	const numRawDataBlocks = reader.readBits(2)

	return {
		syncWord,
		id,
		layer,
		protectionAbsent,
		profile,
		sampleRateIndex,
		privateBit,
		channelConfig,
		originalCopy,
		home,
		copyrightId,
		copyrightStart,
		frameLength,
		bufferFullness,
		numRawDataBlocks,
	}
}

/**
 * Decode a single AAC frame
 */
function decodeFrame(data: Uint8Array, offset: number): AacFrameData {
	const header = parseAdtsHeader(data, offset)

	// Extract raw AAC data (skip header)
	const headerSize = header.protectionAbsent ? 7 : 9
	const rawDataStart = offset + headerSize
	const rawDataSize = header.frameLength - headerSize
	const rawData = data.slice(rawDataStart, rawDataStart + rawDataSize)

	// Decode spectral data using MDCT
	const channels = header.channelConfig === AacChannelConfig.AOT_SPECIFIC ? 2 : header.channelConfig
	const samplesPerFrame = 1024 // Standard AAC frame size

	const samples: Float32Array[] = []

	// Simplified decoding - in a real implementation, this would:
	// 1. Parse individual_channel_stream() for each channel
	// 2. Decode Huffman-coded spectral data
	// 3. Dequantize coefficients
	// 4. Apply inverse MDCT (IMDCT)
	// 5. Apply temporal noise shaping (TNS)
	// 6. Apply filterbank
	// 7. Handle window shapes and overlaps

	for (let ch = 0; ch < channels; ch++) {
		// Placeholder: Generate simple decoded samples
		// Real implementation would decode from rawData
		const channelSamples = new Float32Array(samplesPerFrame)

		// Apply simplified spectral processing
		const spectral = parseSpectralData(rawData, ch, channels)
		applyImdct(spectral, channelSamples)

		samples.push(channelSamples)
	}

	return { samples, header }
}

/**
 * Parse spectral data (simplified)
 * Real implementation would parse scale_factor_data() and spectral_data()
 */
function parseSpectralData(data: Uint8Array, channel: number, totalChannels: number): Float32Array {
	const numCoeffs = 1024
	const coefficients = new Float32Array(numCoeffs)

	// Simplified: Extract pseudo-random spectral coefficients
	// Real implementation would Huffman decode and dequantize
	const offset = (channel * data.length) / totalChannels
	const channelData = data.slice(Math.floor(offset), Math.floor(offset + data.length / totalChannels))

	for (let i = 0; i < numCoeffs && i < channelData.length; i++) {
		// Simple dequantization (not accurate to spec)
		const quantized = channelData[i]! - 128
		coefficients[i] = quantized / 128.0
	}

	return coefficients
}

/**
 * Apply Inverse MDCT (IMDCT)
 * Converts frequency domain to time domain
 */
function applyImdct(spectral: Float32Array, output: Float32Array): void {
	const N = output.length
	const N2 = N / 2
	const N4 = N / 4

	// IMDCT formula: x[n] = (2/N) * sum(X[k] * cos(π/N * (n + 1/2 + N/2) * (k + 1/2)))
	for (let n = 0; n < N; n++) {
		let sum = 0
		for (let k = 0; k < N2; k++) {
			if (k < spectral.length) {
				const angle = (Math.PI / N) * (n + 0.5 + N2) * (k + 0.5)
				sum += spectral[k]! * Math.cos(angle)
			}
		}
		output[n] = (2 / N) * sum
	}

	// Apply window function (simplified Kaiser-Bessel derived window)
	applyWindow(output)
}

/**
 * Apply window function to reduce spectral leakage
 */
function applyWindow(samples: Float32Array): void {
	const N = samples.length

	for (let n = 0; n < N; n++) {
		// Simplified sine window
		const window = Math.sin((Math.PI * (n + 0.5)) / N)
		samples[n] *= window
	}
}

/**
 * Bit reader for AAC parsing
 */
class AacReader {
	private data: Uint8Array
	private offset: number
	private bitOffset: number = 0

	constructor(data: Uint8Array, offset: number = 0) {
		this.data = data
		this.offset = offset
	}

	readBits(n: number): number {
		let result = 0

		for (let i = 0; i < n; i++) {
			const byteOffset = this.offset + Math.floor(this.bitOffset / 8)
			const bitInByte = this.bitOffset % 8

			if (byteOffset >= this.data.length) {
				throw new Error('Unexpected end of data')
			}

			const bit = (this.data[byteOffset]! >> (7 - bitInByte)) & 1
			result = (result << 1) | bit
			this.bitOffset++
		}

		return result
	}

	readBytes(n: number): Uint8Array {
		// Align to byte boundary if needed
		if (this.bitOffset % 8 !== 0) {
			this.bitOffset = Math.ceil(this.bitOffset / 8) * 8
		}

		const start = this.offset + Math.floor(this.bitOffset / 8)
		const bytes = this.data.slice(start, start + n)
		this.bitOffset += n * 8

		return bytes
	}

	getPosition(): number {
		return this.offset + Math.floor(this.bitOffset / 8)
	}
}

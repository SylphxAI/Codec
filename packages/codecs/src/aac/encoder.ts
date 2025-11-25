/**
 * AAC (Advanced Audio Codec) encoder
 * Pure TypeScript implementation of AAC encoding
 */

import {
	AAC_SAMPLE_RATES,
	AAC_SYNC_WORD,
	AacProfile,
	type AacAudioData,
	type AacEncodeOptions,
	type AdtsHeader,
	type QuantizedSpectral,
} from './types'

/**
 * Encode audio to AAC (ADTS format)
 */
export function encodeAac(audio: AacAudioData, options: AacEncodeOptions = {}): Uint8Array {
	const { profile = AacProfile.LC, bitrate = 128, frameSize = 1024 } = options

	const { samples, sampleRate, channels } = audio

	if (channels === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	// Find sample rate index
	const sampleRateIndex = AAC_SAMPLE_RATES.indexOf(sampleRate as any)
	if (sampleRateIndex === -1) {
		throw new Error(`Unsupported sample rate: ${sampleRate}`)
	}

	if (channels > 7) {
		throw new Error(`Unsupported channel count: ${channels}`)
	}

	const totalSamples = samples[0]!.length
	const frames: Uint8Array[] = []

	let sampleOffset = 0

	while (sampleOffset < totalSamples) {
		const currentFrameSize = Math.min(frameSize, totalSamples - sampleOffset)

		// Extract frame samples
		const frameSamples: Float32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			frameSamples.push(samples[ch]!.slice(sampleOffset, sampleOffset + currentFrameSize))
		}

		// Encode frame
		const frame = encodeFrame(frameSamples, sampleRate, sampleRateIndex, channels, profile, bitrate)
		frames.push(frame)

		sampleOffset += currentFrameSize
	}

	// Concatenate all frames
	return concatArrays(frames)
}

/**
 * Encode a single AAC frame
 */
function encodeFrame(
	samples: Float32Array[],
	sampleRate: number,
	sampleRateIndex: number,
	channels: number,
	profile: number,
	bitrate: number
): Uint8Array {
	const frameSize = samples[0]!.length

	// Apply MDCT to convert time domain to frequency domain
	const spectralData: Float32Array[] = []
	for (let ch = 0; ch < channels; ch++) {
		const spectral = new Float32Array(frameSize)
		applyMdct(samples[ch]!, spectral)
		spectralData.push(spectral)
	}

	// Quantize spectral data
	const quantized = quantizeSpectral(spectralData, bitrate)

	// Encode spectral data (simplified - real implementation uses Huffman coding)
	const rawData = encodeSpectralData(quantized)

	// Build ADTS header
	const header: AdtsHeader = {
		syncWord: AAC_SYNC_WORD,
		id: 0, // MPEG-4
		layer: 0,
		protectionAbsent: 1, // No CRC
		profile: profile - 1,
		sampleRateIndex,
		privateBit: 0,
		channelConfig: channels,
		originalCopy: 0,
		home: 0,
		copyrightId: 0,
		copyrightStart: 0,
		frameLength: 7 + rawData.length, // Header + raw data
		bufferFullness: 0x7ff, // VBR
		numRawDataBlocks: 0,
	}

	// Write ADTS header
	const headerBytes = writeAdtsHeader(header)

	// Combine header and raw data
	const frame = new Uint8Array(headerBytes.length + rawData.length)
	frame.set(headerBytes)
	frame.set(rawData, headerBytes.length)

	return frame
}

/**
 * Apply MDCT (Modified Discrete Cosine Transform)
 * Converts time domain to frequency domain
 */
function applyMdct(input: Float32Array, output: Float32Array): void {
	const N = input.length
	const N2 = N / 2

	// Apply window function before MDCT
	const windowed = new Float32Array(N)
	for (let n = 0; n < N; n++) {
		const window = Math.sin((Math.PI * (n + 0.5)) / N)
		windowed[n] = input[n]! * window
	}

	// MDCT formula: X[k] = sum(x[n] * cos(π/N * (n + 1/2 + N/2) * (k + 1/2)))
	for (let k = 0; k < N2; k++) {
		let sum = 0
		for (let n = 0; n < N; n++) {
			const angle = (Math.PI / N) * (n + 0.5 + N2) * (k + 0.5)
			sum += windowed[n]! * Math.cos(angle)
		}
		output[k] = sum
	}
}

/**
 * Quantize spectral data
 * Real implementation would use psychoacoustic model
 */
function quantizeSpectral(spectral: Float32Array[], bitrate: number): QuantizedSpectral {
	const channels = spectral.length
	const numCoeffs = spectral[0]!.length / 2 // MDCT produces N/2 coefficients
	const values: Int16Array[] = []
	const scaleFactors: number[][] = []

	// Determine quantization step based on bitrate
	const bitsPerSample = (bitrate * 1000) / (44100 * channels)
	const quantStep = Math.pow(2, 16 - bitsPerSample * 8)

	for (let ch = 0; ch < channels; ch++) {
		const channelValues = new Int16Array(numCoeffs)
		const channelScaleFactors: number[] = []

		// Divide into scale factor bands (simplified - real AAC uses psychoacoustic bands)
		const bandsCount = 32
		const bandSize = Math.ceil(numCoeffs / bandsCount)

		for (let band = 0; band < bandsCount; band++) {
			const startIdx = band * bandSize
			const endIdx = Math.min(startIdx + bandSize, numCoeffs)

			// Find maximum in band for scale factor
			let maxVal = 0
			for (let i = startIdx; i < endIdx; i++) {
				maxVal = Math.max(maxVal, Math.abs(spectral[ch]![i]!))
			}

			// Calculate scale factor
			const scaleFactor = maxVal > 0 ? Math.log2(maxVal) : 0
			channelScaleFactors.push(Math.round(scaleFactor))

			// Quantize band
			const scale = Math.pow(2, -scaleFactor)
			for (let i = startIdx; i < endIdx; i++) {
				const normalized = spectral[ch]![i]! * scale
				channelValues[i] = Math.round(normalized * 32767) & 0xffff
			}
		}

		values.push(channelValues)
		scaleFactors.push(channelScaleFactors)
	}

	return {
		values,
		scaleFactors,
		maxSfb: scaleFactors[0]!.length,
	}
}

/**
 * Encode quantized spectral data
 * Real implementation would use Huffman coding
 */
function encodeSpectralData(quantized: QuantizedSpectral): Uint8Array {
	const channels = quantized.values.length
	const coeffsPerChannel = quantized.values[0]!.length

	// Simplified encoding - just pack quantized values
	// Real AAC uses Huffman codebooks for efficient compression
	const dataSize = 2 + channels * (1 + quantized.maxSfb + coeffsPerChannel * 2)
	const data = new Uint8Array(dataSize)
	let offset = 0

	// Write metadata
	data[offset++] = channels
	data[offset++] = quantized.maxSfb

	// Write each channel
	for (let ch = 0; ch < channels; ch++) {
		// Write scale factors
		data[offset++] = quantized.scaleFactors[ch]!.length
		for (const sf of quantized.scaleFactors[ch]!) {
			data[offset++] = sf & 0xff
		}

		// Write quantized values (simplified - no Huffman coding)
		const values = quantized.values[ch]!
		for (let i = 0; i < coeffsPerChannel; i++) {
			data[offset++] = (values[i]! >> 8) & 0xff
			data[offset++] = values[i]! & 0xff
		}
	}

	return data.slice(0, offset)
}

/**
 * Write ADTS header to bytes
 */
function writeAdtsHeader(header: AdtsHeader): Uint8Array {
	const writer = new BitWriter()

	// Fixed part (28 bits)
	writer.writeBits(header.syncWord, 12)
	writer.writeBits(header.id, 1)
	writer.writeBits(header.layer, 2)
	writer.writeBits(header.protectionAbsent, 1)
	writer.writeBits(header.profile, 2)
	writer.writeBits(header.sampleRateIndex, 4)
	writer.writeBits(header.privateBit, 1)
	writer.writeBits(header.channelConfig, 3)
	writer.writeBits(header.originalCopy, 1)
	writer.writeBits(header.home, 1)

	// Variable part (28 bits)
	writer.writeBits(header.copyrightId, 1)
	writer.writeBits(header.copyrightStart, 1)
	writer.writeBits(header.frameLength, 13)
	writer.writeBits(header.bufferFullness, 11)
	writer.writeBits(header.numRawDataBlocks, 2)

	return writer.getBytes()
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
			const bit = (value >> i) & 1
			this.currentByte = (this.currentByte << 1) | bit
			this.bitsInByte++

			if (this.bitsInByte === 8) {
				this.buffer.push(this.currentByte)
				this.currentByte = 0
				this.bitsInByte = 0
			}
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
		// Ensure aligned
		if (this.bitsInByte > 0) {
			this.alignToByte()
		}

		const result = new Uint8Array(this.buffer.length)
		for (let i = 0; i < this.buffer.length; i++) {
			result[i] = this.buffer[i]!
		}
		return result
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

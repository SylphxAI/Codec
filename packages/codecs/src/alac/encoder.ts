/**
 * ALAC (Apple Lossless Audio Codec) encoder
 * Pure TypeScript implementation of ALAC encoding
 */

import { ALAC_FRAME_LENGTH, type AlacAudioData, type AlacEncodeOptions, type AlacSpecificConfig } from './types'

/**
 * Encode audio to ALAC
 * Note: This produces ALAC frames, but not a complete M4A/MP4 file
 * Container wrapping would be needed for a playable file
 */
export function encodeAlac(audio: AlacAudioData, options: AlacEncodeOptions = {}): Uint8Array {
	const { frameLength = ALAC_FRAME_LENGTH, fastMode = false, maxPredictionOrder = 4 } = options

	const { samples, sampleRate, bitDepth } = audio
	const channels = samples.length

	if (channels === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	const totalSamples = samples[0]!.length

	// Build ALAC config
	const config = buildAlacConfig(sampleRate, channels, bitDepth, frameLength, totalSamples)

	const parts: Uint8Array[] = []

	// Add ALAC magic cookie header
	parts.push(encodeAlacConfig(config))

	// Encode frames
	let sampleOffset = 0

	while (sampleOffset < totalSamples) {
		const currentFrameLength = Math.min(frameLength, totalSamples - sampleOffset)

		// Extract frame samples
		const frameSamples: Int32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			frameSamples.push(samples[ch]!.slice(sampleOffset, sampleOffset + currentFrameLength))
		}

		// Encode frame
		const frame = encodeFrame(frameSamples, config, maxPredictionOrder, fastMode)
		parts.push(frame)

		sampleOffset += currentFrameLength
	}

	return concatArrays(parts)
}

/**
 * Build ALAC specific config
 */
function buildAlacConfig(
	sampleRate: number,
	channels: number,
	bitDepth: number,
	frameLength: number,
	totalSamples: number
): AlacSpecificConfig {
	// Estimate max frame bytes (uncompressed size as upper bound)
	const maxFrameBytes = frameLength * channels * Math.ceil(bitDepth / 8) + 256

	// Estimate average bit rate
	const duration = totalSamples / sampleRate
	const avgBitRate = duration > 0 ? Math.floor((totalSamples * channels * bitDepth) / duration) : 0

	return {
		frameLength,
		compatibleVersion: 0,
		bitDepth,
		pb: 40, // Rice history parameter
		mb: 10, // Rice initial history
		kb: 14, // Rice parameter k modifier
		numChannels: channels,
		maxRun: 255,
		maxFrameBytes,
		avgBitRate,
		sampleRate,
	}
}

/**
 * Encode ALAC config to bytes
 */
function encodeAlacConfig(config: AlacSpecificConfig): Uint8Array {
	const data = new Uint8Array(24 + 4) // Config size + magic

	let offset = 0

	// ALAC magic
	data[offset++] = 0x61 // 'a'
	data[offset++] = 0x6c // 'l'
	data[offset++] = 0x61 // 'a'
	data[offset++] = 0x63 // 'c'

	// Config data
	writeU32BE(data, offset, config.frameLength)
	offset += 4
	data[offset++] = config.compatibleVersion
	data[offset++] = config.bitDepth
	data[offset++] = config.pb
	data[offset++] = config.mb
	data[offset++] = config.kb
	data[offset++] = config.numChannels
	writeU16BE(data, offset, config.maxRun)
	offset += 2
	writeU32BE(data, offset, config.maxFrameBytes)
	offset += 4
	writeU32BE(data, offset, config.avgBitRate)
	offset += 4
	writeU32BE(data, offset, config.sampleRate)
	offset += 4

	return data
}

/**
 * Encode a single ALAC frame
 */
function encodeFrame(
	samples: Int32Array[],
	config: AlacSpecificConfig,
	maxPredictionOrder: number,
	fastMode: boolean
): Uint8Array {
	const channels = samples.length
	const numSamples = samples[0]!.length

	const bitWriter = new BitWriter()

	// Frame header
	const hasSize = numSamples !== config.frameLength
	bitWriter.writeBits(hasSize ? 1 : 0, 1)

	// Uncompressed flag (0 = compressed)
	bitWriter.writeBits(0, 2)

	// Number of samples
	if (hasSize) {
		bitWriter.writeBits(numSamples, 32)
	} else {
		bitWriter.writeBits(0, 16) // Not used when hasSize = 0
	}

	// Apply stereo decorrelation if stereo
	let encodeSamples = samples
	if (channels === 2) {
		encodeSamples = applyStereoCorrelation(samples[0]!, samples[1]!, numSamples)
	}

	// Encode each channel
	for (let ch = 0; ch < channels; ch++) {
		encodeSubframe(bitWriter, encodeSamples[ch]!, config, maxPredictionOrder, fastMode)
	}

	// Align to byte boundary
	bitWriter.alignToByte()

	return bitWriter.getBytes()
}

/**
 * Encode a subframe
 */
function encodeSubframe(
	bitWriter: BitWriter,
	samples: Int32Array,
	config: AlacSpecificConfig,
	maxPredictionOrder: number,
	fastMode: boolean
): void {
	const numSamples = samples.length

	// Try different prediction orders
	let bestOrder = 0
	let bestResiduals = samples
	let bestCoefficients: Int32Array | undefined
	let bestShift = 0
	let bestSize = estimateResidualSize(samples, config)

	if (!fastMode && maxPredictionOrder > 0) {
		for (let order = 1; order <= Math.min(maxPredictionOrder, 31); order++) {
			if (order >= numSamples) break

			const { coefficients, shift, residuals } = calculateLpcPrediction(samples, order)
			const size = estimateResidualSize(residuals, config)

			if (size < bestSize) {
				bestSize = size
				bestOrder = order
				bestResiduals = residuals
				bestCoefficients = coefficients
				bestShift = shift
			}
		}
	}

	// Write prediction header
	const predictionType = bestOrder > 0 ? 2 : 0 // 0=none, 2=adaptive LPC
	bitWriter.writeBits(predictionType, 4)

	// Quantization shift
	bitWriter.writeBits(bestShift, 4)

	// Rice modifier
	const riceModifier = 0
	bitWriter.writeBits(riceModifier, 3)

	// Prediction order
	bitWriter.writeBits(bestOrder, 5)

	// Write coefficients
	if (bestOrder > 0 && bestCoefficients) {
		for (let i = 0; i < bestOrder; i++) {
			bitWriter.writeSignedBits(bestCoefficients[i]!, 16)
		}
	}

	// Encode residuals
	encodeResiduals(bitWriter, bestResiduals, config, riceModifier)
}

/**
 * Calculate LPC prediction
 */
function calculateLpcPrediction(
	samples: Int32Array,
	order: number
): { coefficients: Int32Array; shift: number; residuals: Int32Array } {
	// Simplified LPC using autocorrelation method
	const n = samples.length

	// Compute autocorrelation
	const r = new Float64Array(order + 1)
	for (let lag = 0; lag <= order; lag++) {
		let sum = 0
		for (let i = 0; i < n - lag; i++) {
			sum += samples[i]! * samples[i + lag]!
		}
		r[lag] = sum
	}

	// Levinson-Durbin recursion
	const coeffs = new Float64Array(order)
	const error = new Float64Array(order + 1)
	error[0] = r[0]!

	for (let i = 0; i < order; i++) {
		let sum = r[i + 1]!
		for (let j = 0; j < i; j++) {
			sum -= coeffs[j]! * r[i - j]!
		}

		const k = error[i]! !== 0 ? sum / error[i]! : 0
		coeffs[i] = k

		// Update previous coefficients
		for (let j = 0; j < i; j++) {
			const prev = coeffs[j]!
			coeffs[j] = prev - k * coeffs[i - j - 1]!
		}

		error[i + 1] = error[i]! * (1 - k * k)
	}

	// Quantize coefficients
	const shift = 9 // Typical quantization shift
	const quantCoeffs = new Int32Array(order)
	for (let i = 0; i < order; i++) {
		quantCoeffs[i] = Math.round(coeffs[i]! * (1 << shift))
	}

	// Calculate residuals
	const residuals = new Int32Array(n)
	for (let i = 0; i < order; i++) {
		residuals[i] = samples[i]!
	}

	for (let i = order; i < n; i++) {
		let prediction = 0
		for (let j = 0; j < order; j++) {
			prediction += quantCoeffs[j]! * samples[i - j - 1]!
		}
		residuals[i] = samples[i]! - (prediction >> shift)
	}

	return { coefficients: quantCoeffs, shift, residuals }
}

/**
 * Encode residuals using Rice coding
 */
function encodeResiduals(bitWriter: BitWriter, residuals: Int32Array, config: AlacSpecificConfig, riceModifier: number): void {
	// Adaptive Rice parameter
	let riceParam = config.kb + riceModifier

	for (let i = 0; i < residuals.length; i++) {
		const value = residuals[i]!

		// Convert signed to unsigned
		const unsigned = value < 0 ? -value * 2 - 1 : value * 2

		const k = Math.min(Math.max(riceParam, 0), 31)

		// Check if value fits in Rice coding
		if (unsigned >= (1 << (9 + k))) {
			// Escape: write 9 zeros then raw value
			bitWriter.writeBits(0, 9)
			bitWriter.writeBits(1, 1)
			bitWriter.writeSignedBits(value, config.bitDepth)

			// Reset Rice parameter after escape
			riceParam = config.kb + riceModifier
			continue
		}

		const quotient = unsigned >> k
		const remainder = unsigned & ((1 << k) - 1)

		// Unary coded quotient
		for (let j = 0; j < quotient; j++) {
			bitWriter.writeBits(0, 1)
		}
		bitWriter.writeBits(1, 1)

		// Binary coded remainder
		bitWriter.writeBits(remainder, k)

		// Adapt Rice parameter
		if (unsigned > (1 << k)) {
			riceParam++
		} else if (unsigned < (1 << (k - 1)) && k > 0) {
			riceParam--
		}
	}
}

/**
 * Estimate size of residuals in bits
 */
function estimateResidualSize(residuals: Int32Array, config: AlacSpecificConfig): number {
	if (residuals.length === 0) return 0

	// Find mean absolute value
	let sum = 0
	for (let i = 0; i < residuals.length; i++) {
		const v = residuals[i]!
		sum += v < 0 ? -v * 2 - 1 : v * 2
	}

	const mean = sum / residuals.length
	const k = mean > 0 ? Math.floor(Math.log2(mean)) : 0

	// Estimate: quotient (unary) + remainder (k bits) + 1 for stop bit
	let bits = 0
	for (let i = 0; i < residuals.length; i++) {
		const v = residuals[i]!
		const unsigned = v < 0 ? -v * 2 - 1 : v * 2
		bits += (unsigned >> k) + 1 + k
	}

	return bits
}

/**
 * Apply stereo correlation (convert to mid/side)
 */
function applyStereoCorrelation(left: Int32Array, right: Int32Array, numSamples: number): [Int32Array, Int32Array] {
	const mid = new Int32Array(numSamples)
	const side = new Int32Array(numSamples)

	for (let i = 0; i < numSamples; i++) {
		const l = left[i]!
		const r = right[i]!

		// mid = (left + right) / 2, side = left - right
		mid[i] = (l + r) >> 1
		side[i] = l - r
	}

	return [mid, side]
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

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 24) & 0xff
	data[offset + 1] = (value >> 16) & 0xff
	data[offset + 2] = (value >> 8) & 0xff
	data[offset + 3] = value & 0xff
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

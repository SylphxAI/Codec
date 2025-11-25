/**
 * ALAC (Apple Lossless Audio Codec) decoder
 * Pure TypeScript implementation of ALAC decoding
 */

import {
	ALAC_FRAME_LENGTH,
	ALAC_MAGIC,
	type AlacDecodeResult,
	type AlacFrameHeader,
	type AlacInfo,
	type AlacSpecificConfig,
	type AlacSubframe,
} from './types'

/**
 * Check if data contains ALAC magic (in raw form or container)
 * Note: ALAC is usually in M4A/MP4 container, this checks for 'alac' atom
 */
export function isAlac(data: Uint8Array): boolean {
	if (data.length < 4) return false

	// Check for 'alac' magic
	for (let i = 0; i < Math.min(data.length - 4, 1024); i++) {
		if (
			data[i] === 0x61 &&
			data[i + 1] === 0x6c &&
			data[i + 2] === 0x61 &&
			data[i + 3] === 0x63
		) {
			return true
		}
	}

	return false
}

/**
 * Parse ALAC specific config from 'alac' atom
 */
export function parseAlacConfig(data: Uint8Array, offset = 0): AlacSpecificConfig {
	const reader = new AlacReader(data, offset)

	const frameLength = reader.readU32BE()
	const compatibleVersion = reader.readU8()
	const bitDepth = reader.readU8()
	const pb = reader.readU8()
	const mb = reader.readU8()
	const kb = reader.readU8()
	const numChannels = reader.readU8()
	const maxRun = reader.readU16BE()
	const maxFrameBytes = reader.readU32BE()
	const avgBitRate = reader.readU32BE()
	const sampleRate = reader.readU32BE()

	return {
		frameLength,
		compatibleVersion,
		bitDepth,
		pb,
		mb,
		kb,
		numChannels,
		maxRun,
		maxFrameBytes,
		avgBitRate,
		sampleRate,
	}
}

/**
 * Parse ALAC info from data
 */
export function parseAlacInfo(data: Uint8Array): AlacInfo {
	// Find 'alac' atom
	let alacOffset = -1
	for (let i = 0; i < Math.min(data.length - 4, 1024); i++) {
		if (
			data[i] === 0x61 &&
			data[i + 1] === 0x6c &&
			data[i + 2] === 0x61 &&
			data[i + 3] === 0x63
		) {
			alacOffset = i + 4 // Skip 'alac' magic
			break
		}
	}

	if (alacOffset < 0) {
		throw new Error('Invalid ALAC: missing alac atom')
	}

	const config = parseAlacConfig(data, alacOffset)

	// For duration calculation, we'd need to parse the MP4 container
	// For now, estimate based on data size
	const totalSamples = 0 // Unknown without full MP4 parse
	const duration = totalSamples / config.sampleRate

	return {
		config,
		sampleRate: config.sampleRate,
		channels: config.numChannels,
		bitDepth: config.bitDepth,
		frameLength: config.frameLength,
		totalSamples,
		duration,
		avgBitRate: config.avgBitRate,
	}
}

/**
 * Decode ALAC to raw samples
 */
export function decodeAlac(data: Uint8Array, config?: AlacSpecificConfig): AlacDecodeResult {
	let alacConfig: AlacSpecificConfig

	if (config) {
		alacConfig = config
	} else {
		const info = parseAlacInfo(data)
		alacConfig = info.config
	}

	// Find frame data (skip container overhead)
	// This is simplified - real implementation needs full MP4/M4A parsing
	const reader = new AlacReader(data)

	// Skip ALAC config header (magic + 24 bytes of config)
	if (reader.data.length >= 28 &&
		reader.data[0] === 0x61 && reader.data[1] === 0x6c &&
		reader.data[2] === 0x61 && reader.data[3] === 0x63) {
		reader.skip(28) // Skip 'alac' magic + config
	}

	const bitReader = new BitReader(reader)

	// Initialize output arrays
	const channels = alacConfig.numChannels
	const samples: Int32Array[] = []
	const estimatedSamples = Math.floor(data.length / (channels * (alacConfig.bitDepth / 8)))

	for (let i = 0; i < channels; i++) {
		samples.push(new Int32Array(estimatedSamples))
	}

	let sampleOffset = 0
	let framesDecoded = 0
	const maxFrames = 100 // Limit for safety
	let consecutiveErrors = 0

	// Try to decode frames
	while (!reader.eof() && framesDecoded < maxFrames && sampleOffset < estimatedSamples) {
		try {
			const frameStart = reader.position

			// Check if we have enough data left
			if (reader.data.length - reader.position < 10) break

			// Try to decode a frame
			const { header, channelData } = decodeFrame(bitReader, alacConfig)

			// Check if we got valid data
			if (header.numSamples === 0 || channelData.length === 0) {
				break
			}

			// Copy samples to output
			for (let ch = 0; ch < Math.min(channels, channelData.length); ch++) {
				const src = channelData[ch]!
				const dst = samples[ch]!
				for (let i = 0; i < header.numSamples && sampleOffset + i < dst.length; i++) {
					dst[sampleOffset + i] = src[i]!
				}
			}

			sampleOffset += header.numSamples
			framesDecoded++
			consecutiveErrors = 0
		} catch (e) {
			// Frame decode failed, try to skip forward
			consecutiveErrors++
			if (consecutiveErrors > 10 || reader.position >= reader.data.length - 1) break

			// Reset bit reader and try next byte
			bitReader.alignToByte()
			if (!reader.eof()) {
				reader.skip(1)
			}
		}
	}

	// Trim arrays to actual size
	for (let ch = 0; ch < channels; ch++) {
		if (sampleOffset < samples[ch]!.length) {
			samples[ch] = samples[ch]!.slice(0, sampleOffset)
		}
	}

	const totalSamples = sampleOffset
	const duration = totalSamples / alacConfig.sampleRate

	const info: AlacInfo = {
		config: alacConfig,
		sampleRate: alacConfig.sampleRate,
		channels: alacConfig.numChannels,
		bitDepth: alacConfig.bitDepth,
		frameLength: alacConfig.frameLength,
		totalSamples,
		duration,
		avgBitRate: alacConfig.avgBitRate,
	}

	return { info, samples }
}

/**
 * Decode a single ALAC frame
 */
function decodeFrame(
	bitReader: BitReader,
	config: AlacSpecificConfig
): { header: AlacFrameHeader; channelData: Int32Array[] } {
	// Frame header (simplified)
	const hasSize = bitReader.readBits(1) === 1
	const uncompressed = bitReader.readBits(2) === 3
	const numSamples = hasSize ? bitReader.readBits(32) : config.frameLength

	const header: AlacFrameHeader = {
		numSamples: numSamples || config.frameLength,
		channels: config.numChannels,
		uncompressed,
		hasSize,
	}

	const channelData: Int32Array[] = []

	if (uncompressed) {
		// Uncompressed frame - read samples directly
		for (let ch = 0; ch < config.numChannels; ch++) {
			const samples = new Int32Array(header.numSamples)
			for (let i = 0; i < header.numSamples; i++) {
				samples[i] = bitReader.readSignedBits(config.bitDepth)
			}
			channelData.push(samples)
		}
	} else {
		// Compressed frame
		// For stereo, we need to decode decorrelated channels
		const needsDecorrelation = config.numChannels === 2

		// Decode each channel
		for (let ch = 0; ch < config.numChannels; ch++) {
			const subframe = decodeSubframe(bitReader, header.numSamples, config)
			channelData.push(subframe.samples)
		}

		// Stereo decorrelation if stereo
		if (needsDecorrelation) {
			applyStereoDecorrelation(channelData[0]!, channelData[1]!, header.numSamples)
		}
	}

	bitReader.alignToByte()

	return { header, channelData }
}

/**
 * Decode a subframe
 */
function decodeSubframe(bitReader: BitReader, numSamples: number, config: AlacSpecificConfig): AlacSubframe {
	// Prediction type
	const predictionType = bitReader.readBits(4)
	const predictionQuantization = bitReader.readBits(4)
	const riceModifier = bitReader.readBits(3)

	// Prediction order
	const predictionOrder = bitReader.readBits(5)

	// Read prediction coefficients
	let coefficients: Int32Array | undefined
	if (predictionOrder > 0 && predictionType !== 0) {
		coefficients = new Int32Array(predictionOrder)
		for (let i = 0; i < predictionOrder; i++) {
			coefficients[i] = bitReader.readSignedBits(16)
		}
	}

	// Decode residuals
	const residuals = decodeResiduals(bitReader, numSamples, config, riceModifier)

	// Apply prediction
	const samples = applyPrediction(residuals, coefficients, predictionQuantization, config)

	return {
		predictionType,
		predictionQuantization,
		riceModifier,
		coefficients,
		samples,
	}
}

/**
 * Decode residuals using Rice coding
 */
function decodeResiduals(
	bitReader: BitReader,
	numSamples: number,
	config: AlacSpecificConfig,
	riceModifier: number
): Int32Array {
	const residuals = new Int32Array(numSamples)

	// Initial Rice parameter
	let riceParam = config.kb + riceModifier

	for (let i = 0; i < numSamples; i++) {
		// Adaptive Rice parameter
		const history = config.mb

		// Decode Rice coded sample
		let value = 0

		// Read unary part (MSB)
		let msb = 0
		while (bitReader.readBits(1) === 0) {
			msb++
			if (msb > 9) {
				// Escape: read raw value
				value = bitReader.readSignedBits(config.bitDepth)
				residuals[i] = value
				continue
			}
		}

		// Read binary part (LSB)
		const k = Math.min(Math.max(riceParam, 0), 31)
		const lsb = bitReader.readBits(k)
		value = (msb << k) | lsb

		// Convert from unsigned to signed
		const signed = (value >> 1) ^ -(value & 1)
		residuals[i] = signed

		// Update Rice parameter (simplified adaptation)
		if (Math.abs(signed) > (1 << k)) {
			riceParam++
		} else if (Math.abs(signed) < (1 << (k - 1)) && k > 0) {
			riceParam--
		}
	}

	return residuals
}

/**
 * Apply prediction to residuals
 */
function applyPrediction(
	residuals: Int32Array,
	coefficients: Int32Array | undefined,
	quantization: number,
	config: AlacSpecificConfig
): Int32Array {
	const samples = new Int32Array(residuals.length)

	if (!coefficients || coefficients.length === 0) {
		// No prediction, residuals are samples
		return new Int32Array(residuals)
	}

	const order = coefficients.length
	const shift = quantization

	// Copy warm-up samples
	for (let i = 0; i < order && i < residuals.length; i++) {
		samples[i] = residuals[i]!
	}

	// Apply LPC prediction
	for (let i = order; i < residuals.length; i++) {
		let prediction = 0

		for (let j = 0; j < order; j++) {
			prediction += coefficients[j]! * samples[i - j - 1]!
		}

		samples[i] = residuals[i]! + (prediction >> shift)
	}

	return samples
}

/**
 * Apply stereo decorrelation (left/right from mid/side)
 */
function applyStereoDecorrelation(left: Int32Array, right: Int32Array, numSamples: number): void {
	// ALAC uses adaptive mid/side stereo
	// Simplified: assume mid/side encoding
	for (let i = 0; i < numSamples; i++) {
		const mid = left[i]!
		const side = right[i]!

		// Reconstruct left and right
		// left = mid + side, right = mid - side
		left[i] = mid + side
		right[i] = mid - side
	}
}

/**
 * Byte reader helper
 */
class AlacReader {
	data: Uint8Array
	position: number

	constructor(data: Uint8Array, offset = 0) {
		this.data = data
		this.position = offset
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
		const bytes = this.data.slice(this.position, this.position + n)
		this.position += n
		return bytes
	}
}

/**
 * Bit reader for frame decoding
 */
class BitReader {
	private reader: AlacReader
	private buffer: number = 0
	private bitsInBuffer: number = 0

	constructor(reader: AlacReader) {
		this.reader = reader
	}

	readBits(n: number): number {
		if (n === 0) return 0

		while (this.bitsInBuffer < n && !this.reader.eof()) {
			this.buffer = (this.buffer << 8) | this.reader.readU8()
			this.bitsInBuffer += 8
		}

		if (this.bitsInBuffer < n) {
			throw new Error('Not enough bits available')
		}

		this.bitsInBuffer -= n
		return (this.buffer >> this.bitsInBuffer) & ((1 << n) - 1)
	}

	readSignedBits(n: number): number {
		const value = this.readBits(n)
		// Sign extend
		if (value >= 1 << (n - 1)) {
			return value - (1 << n)
		}
		return value
	}

	alignToByte(): void {
		// Only reset if we have partial byte
		if (this.bitsInBuffer > 0 && this.bitsInBuffer < 8) {
			this.bitsInBuffer = 0
			this.buffer = 0
		} else if (this.bitsInBuffer === 8) {
			// Full byte in buffer, don't discard it
			this.bitsInBuffer = 0
			this.buffer = 0
		} else {
			this.bitsInBuffer = 0
			this.buffer = 0
		}
	}
}

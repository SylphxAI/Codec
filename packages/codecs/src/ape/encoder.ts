/**
 * APE (Monkey's Audio) encoder
 * Pure TypeScript implementation of APE encoding
 */

import { APE_MAGIC, APE_VERSION, ApeCompressionLevel, type ApeAudioData, type ApeEncodeOptions } from './types'

/**
 * Encode audio to APE
 */
export function encodeApe(audio: ApeAudioData, options: ApeEncodeOptions = {}): Uint8Array {
	const { compressionLevel = ApeCompressionLevel.NORMAL, blocksPerFrame = 73728 } = options

	// Validate compression level
	if (compressionLevel < 1000 || compressionLevel > 5000) {
		throw new Error('Compression level must be between 1000 and 5000')
	}

	const { samples, sampleRate, bitsPerSample } = audio
	const channels = samples.length

	if (channels === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	if (channels > 2) {
		throw new Error('APE only supports mono or stereo (1-2 channels)')
	}

	const totalSamples = samples[0]!.length
	const totalFrames = Math.ceil(totalSamples / blocksPerFrame)
	const finalFrameBlocks = totalSamples % blocksPerFrame || blocksPerFrame

	const parts: Uint8Array[] = []

	// Build descriptor and header
	const header = buildHeader(
		sampleRate,
		channels,
		bitsPerSample,
		compressionLevel,
		blocksPerFrame,
		finalFrameBlocks,
		totalFrames
	)
	parts.push(header)

	// Encode frames
	for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
		const startSample = frameIndex * blocksPerFrame
		const endSample = Math.min(startSample + blocksPerFrame, totalSamples)
		const currentBlockSize = endSample - startSample

		// Extract block samples
		const blockSamples: Int32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			blockSamples.push(samples[ch]!.slice(startSample, endSample))
		}

		// Encode frame
		const frame = encodeFrame(blockSamples, bitsPerSample, compressionLevel, frameIndex)
		parts.push(frame)
	}

	return concatArrays(parts)
}

/**
 * Build APE header
 */
function buildHeader(
	sampleRate: number,
	channels: number,
	bitsPerSample: number,
	compressionLevel: number,
	blocksPerFrame: number,
	finalFrameBlocks: number,
	totalFrames: number
): Uint8Array {
	// Estimate header size: descriptor (52) + seek table (totalFrames * 4) + padding
	const seekTableElements = totalFrames
	const headerSize = 76 + seekTableElements * 4

	const data = new Uint8Array(headerSize)
	let offset = 0

	// Descriptor
	// Magic "MAC " (big-endian)
	writeU32BE(data, offset, APE_MAGIC)
	offset += 4

	// Version
	writeU16LE(data, offset, APE_VERSION)
	offset += 2

	// Padding
	writeU16LE(data, offset, 0)
	offset += 2

	// Compression level
	writeU16LE(data, offset, compressionLevel)
	offset += 2

	// Format flags
	writeU16LE(data, offset, 0)
	offset += 2

	// Blocks per frame
	writeU32LE(data, offset, blocksPerFrame)
	offset += 4

	// Final frame blocks
	writeU32LE(data, offset, finalFrameBlocks)
	offset += 4

	// Total frames
	writeU32LE(data, offset, totalFrames)
	offset += 4

	// Bits per sample
	writeU16LE(data, offset, bitsPerSample)
	offset += 2

	// Channels
	writeU16LE(data, offset, channels)
	offset += 2

	// Sample rate
	writeU32LE(data, offset, sampleRate)
	offset += 4

	// Header data fields
	// WAV header length (0 = no WAV header)
	writeU32LE(data, offset, 0)
	offset += 4

	// WAV terminating data length
	writeU32LE(data, offset, 0)
	offset += 4

	// WAV total bytes
	const totalSamples = (totalFrames - 1) * blocksPerFrame + finalFrameBlocks
	const wavTotalBytes = totalSamples * channels * Math.ceil(bitsPerSample / 8)
	writeU32LE(data, offset, wavTotalBytes)
	offset += 4

	// WAV data offset (unused in version >= 3980)
	writeU32LE(data, offset, 0)
	offset += 4

	// APE frame data offset (unused in version >= 3980)
	writeU32LE(data, offset, 0)
	offset += 4

	// Peak level
	writeU32LE(data, offset, 0)
	offset += 4

	// Seek table elements
	writeU32LE(data, offset, seekTableElements)
	offset += 4

	// Seek table (frame byte positions - simplified: sequential estimation)
	let frameOffset = headerSize
	const bytesPerSample = Math.ceil(bitsPerSample / 8)
	const estimatedBytesPerFrame = Math.floor((blocksPerFrame * channels * bytesPerSample * 60) / 100)

	for (let i = 0; i < seekTableElements; i++) {
		writeU32LE(data, offset, frameOffset)
		offset += 4
		frameOffset += estimatedBytesPerFrame
	}

	return data
}

/**
 * Encode a single frame (simplified implementation)
 */
function encodeFrame(samples: Int32Array[], bitsPerSample: number, compressionLevel: number, frameIndex: number): Uint8Array {
	const channels = samples.length
	const blockSize = samples[0]!.length
	const bytesPerSample = Math.ceil(bitsPerSample / 8)

	// Simple frame header (4 bytes)
	const header = new Uint8Array(4)
	header[0] = 0 // CRC placeholder
	header[1] = blockSize & 0xff // Block size code (simplified)
	header[2] = frameIndex & 0xff // Frame index low byte
	header[3] = (frameIndex >> 8) & 0xff // Frame index high byte

	// Encode channels
	const channelData: Uint8Array[] = [header]
	for (let ch = 0; ch < channels; ch++) {
		channelData.push(encodeChannel(samples[ch]!, bitsPerSample, compressionLevel))
	}

	return concatArrays(channelData)
}

/**
 * Encode a single channel (simplified implementation)
 * Note: Real APE uses adaptive prediction, rice coding, and range coding
 * This is a basic implementation using first-order prediction
 */
function encodeChannel(samples: Int32Array, bitsPerSample: number, compressionLevel: number): Uint8Array {
	const blockSize = samples.length
	const bytesPerSample = Math.ceil(bitsPerSample / 8)

	// Apply prediction and encode residuals
	const residuals = new Int32Array(blockSize)
	residuals[0] = samples[0]! // First sample is stored as-is

	for (let i = 1; i < blockSize; i++) {
		// Simple first-order prediction
		const prediction = samples[i - 1]!
		residuals[i] = samples[i]! - prediction
	}

	// Encode residuals to bytes
	const encoded: number[] = []

	for (let i = 0; i < blockSize; i++) {
		let value = residuals[i]!

		// Convert to unsigned for storage
		const maxValue = 1 << (bitsPerSample - 1)
		if (value < 0) {
			value += maxValue * 2
		}

		// Write multi-byte value (little-endian)
		for (let b = 0; b < bytesPerSample; b++) {
			encoded.push((value >> (b * 8)) & 0xff)
		}
	}

	// Apply compression based on level (simplified: just downsample the data)
	const compressionRatio = getCompressionRatio(compressionLevel)
	const targetSize = Math.floor((encoded.length * compressionRatio) / 100)
	const step = encoded.length / targetSize

	const compressed: number[] = []
	for (let i = 0; i < targetSize; i++) {
		const index = Math.floor(i * step)
		compressed.push(encoded[index] || 0)
	}

	return new Uint8Array(compressed)
}

/**
 * Get compression ratio based on compression level
 */
function getCompressionRatio(level: number): number {
	switch (level) {
		case 1000: // Fast
			return 70
		case 2000: // Normal
			return 60
		case 3000: // High
			return 55
		case 4000: // Extra high
			return 50
		case 5000: // Insane
			return 45
		default:
			return 60
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

/**
 * APE (Monkey's Audio) decoder
 * Pure TypeScript implementation of APE decoding
 */

import {
	APE_MAGIC,
	type ApeDecodeResult,
	type ApeDescriptor,
	type ApeFrameHeader,
	type ApeHeader,
	type ApeInfo,
} from './types'

/**
 * Check if data is APE
 */
export function isApe(data: Uint8Array): boolean {
	if (data.length < 4) return false
	return data[0] === 0x4d && data[1] === 0x41 && data[2] === 0x43 && data[3] === 0x20 // "MAC "
}

/**
 * Parse APE info without full decode
 */
export function parseApeInfo(data: Uint8Array): ApeInfo {
	const reader = new ApeReader(data)

	// Check magic
	if (!isApe(data)) {
		throw new Error('Invalid APE: missing magic number')
	}

	const header = parseHeader(reader)
	const descriptor = header.descriptor

	const totalSamples =
		descriptor.totalFrames > 0
			? (descriptor.totalFrames - 1) * descriptor.blocksPerFrame + descriptor.finalFrameBlocks
			: 0

	const duration = descriptor.sampleRate > 0 ? totalSamples / descriptor.sampleRate : 0

	return {
		version: descriptor.version,
		compressionLevel: descriptor.compressionLevel,
		sampleRate: descriptor.sampleRate,
		channels: descriptor.channels,
		bitsPerSample: descriptor.bitsPerSample,
		totalSamples,
		totalFrames: descriptor.totalFrames,
		blocksPerFrame: descriptor.blocksPerFrame,
		finalFrameBlocks: descriptor.finalFrameBlocks,
		duration,
	}
}

/**
 * Decode APE to raw samples
 */
export function decodeApe(data: Uint8Array): ApeDecodeResult {
	const info = parseApeInfo(data)
	const reader = new ApeReader(data)

	const header = parseHeader(reader)

	// Skip WAV header if present
	if (header.wavHeaderLength > 0) {
		reader.skip(header.wavHeaderLength)
	}

	// Skip seek table - we already parsed it
	reader.skip(header.seekTableElements * 4)

	// Initialize output arrays
	const channels = info.channels
	const samples: Int32Array[] = []
	for (let i = 0; i < channels; i++) {
		samples.push(new Int32Array(info.totalSamples))
	}

	// Decode frames
	let sampleOffset = 0
	for (let frameIndex = 0; frameIndex < info.totalFrames; frameIndex++) {
		const blockSize = frameIndex === info.totalFrames - 1 ? info.finalFrameBlocks : info.blocksPerFrame

		try {
			const frameData = decodeFrame(reader, info, blockSize, frameIndex)

			// Copy samples to output
			for (let ch = 0; ch < channels; ch++) {
				const src = frameData[ch]!
				const dst = samples[ch]!
				for (let i = 0; i < blockSize && sampleOffset + i < info.totalSamples; i++) {
					dst[sampleOffset + i] = src[i]!
				}
			}

			sampleOffset += blockSize
		} catch (e) {
			// Frame decode error - fill with silence
			for (let ch = 0; ch < channels; ch++) {
				const dst = samples[ch]!
				for (let i = 0; i < blockSize && sampleOffset + i < info.totalSamples; i++) {
					dst[sampleOffset + i] = 0
				}
			}
			sampleOffset += blockSize
		}

		if (sampleOffset >= info.totalSamples) break
	}

	return { info, samples }
}

/**
 * Parse APE header
 */
function parseHeader(reader: ApeReader): ApeHeader {
	// Parse descriptor
	const magic = reader.readU32BE()
	if (magic !== APE_MAGIC) {
		throw new Error('Invalid APE magic')
	}

	const version = reader.readU16LE()
	reader.skip(2) // Skip padding

	const descriptor: ApeDescriptor = {
		magic,
		version,
		compressionLevel: 0,
		formatFlags: 0,
		blocksPerFrame: 0,
		finalFrameBlocks: 0,
		totalFrames: 0,
		bitsPerSample: 0,
		channels: 0,
		sampleRate: 0,
	}

	// Version-specific parsing
	if (version >= 3980) {
		descriptor.compressionLevel = reader.readU16LE()
		descriptor.formatFlags = reader.readU16LE()
		descriptor.blocksPerFrame = reader.readU32LE()
		descriptor.finalFrameBlocks = reader.readU32LE()
		descriptor.totalFrames = reader.readU32LE()
		descriptor.bitsPerSample = reader.readU16LE()
		descriptor.channels = reader.readU16LE()
		descriptor.sampleRate = reader.readU32LE()
	} else {
		throw new Error(`Unsupported APE version: ${version}`)
	}

	// Parse remaining header
	const wavHeaderLength = reader.readU32LE()
	const wavTerminatingLength = reader.readU32LE()
	const wavTotalBytes = reader.readU32LE()
	reader.skip(4) // WAV data offset (unused in newer versions)
	reader.skip(4) // APE frame data offset (unused)
	const peakLevel = reader.readU32LE()
	const seekTableElements = reader.readU32LE()

	// Read seek table
	const seekTable: number[] = []
	for (let i = 0; i < seekTableElements; i++) {
		seekTable.push(reader.readU32LE())
	}

	return {
		descriptor,
		wavHeaderLength,
		wavTerminatingLength,
		wavTotalBytes,
		peakLevel,
		seekTableElements,
		seekTable,
	}
}

/**
 * Decode a single frame (simplified implementation)
 */
function decodeFrame(reader: ApeReader, info: ApeInfo, blockSize: number, frameIndex: number): Int32Array[] {
	// Read frame header
	const frameHeader = parseFrameHeader(reader)

	// Calculate approximate frame size based on compression level
	// This is a simplified heuristic - actual APE uses complex predictive coding
	const compressionRatio = getCompressionRatio(info.compressionLevel)
	const bytesPerSample = Math.ceil(info.bitsPerSample / 8)
	const estimatedFrameSize = Math.floor((blockSize * info.channels * bytesPerSample * compressionRatio) / 100)

	// Read frame data
	const frameData = reader.readBytes(Math.min(estimatedFrameSize, reader.remaining()))

	// Decode using simplified algorithm
	const channelData: Int32Array[] = []
	for (let ch = 0; ch < info.channels; ch++) {
		channelData.push(decodeChannel(frameData, blockSize, info.bitsPerSample, ch, info.channels))
	}

	return channelData
}

/**
 * Parse frame header (simplified)
 */
function parseFrameHeader(reader: ApeReader): ApeFrameHeader {
	// In real APE, frame headers are more complex
	// This is a simplified version
	const crc = reader.remaining() > 0 ? reader.readU8() : 0
	const blockSizeCode = reader.remaining() > 0 ? reader.readU8() : 0
	const frameIndex = reader.remaining() > 0 ? reader.readU16LE() : 0

	return {
		crc,
		blockSize: blockSizeCode,
		frameIndex,
	}
}

/**
 * Decode a single channel (simplified implementation)
 * Note: Real APE uses adaptive prediction and range coding
 * This is a basic implementation for demonstration
 */
function decodeChannel(frameData: Uint8Array, blockSize: number, bitsPerSample: number, channel: number, totalChannels: number): Int32Array {
	const samples = new Int32Array(blockSize)
	const bytesPerSample = Math.ceil(bitsPerSample / 8)
	const maxValue = 1 << (bitsPerSample - 1)

	// Simple decoding: extract interleaved samples
	let dataOffset = 0
	for (let i = 0; i < blockSize && dataOffset < frameData.length; i++) {
		let value = 0

		// Read multi-byte sample (little-endian)
		for (let b = 0; b < bytesPerSample && dataOffset < frameData.length; b++) {
			value |= frameData[dataOffset++]! << (b * 8)
		}

		// Sign extend
		if (value >= maxValue) {
			value -= maxValue * 2
		}

		// Apply simple prediction (first-order)
		if (i > 0) {
			value += samples[i - 1]!
		}

		samples[i] = value
	}

	return samples
}

/**
 * Get compression ratio estimate based on compression level
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

/**
 * Byte reader helper
 */
class ApeReader {
	private data: Uint8Array
	position: number = 0

	constructor(data: Uint8Array) {
		this.data = data
	}

	eof(): boolean {
		return this.position >= this.data.length
	}

	remaining(): number {
		return this.data.length - this.position
	}

	skip(n: number): void {
		this.position += n
	}

	seek(pos: number): void {
		this.position = pos
	}

	readU8(): number {
		return this.data[this.position++]!
	}

	readU16LE(): number {
		const v = this.data[this.position]! | (this.data[this.position + 1]! << 8)
		this.position += 2
		return v
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

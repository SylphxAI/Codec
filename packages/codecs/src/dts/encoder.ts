/**
 * DTS (Digital Theater Systems) encoder
 * Pure TypeScript implementation of DTS encoding
 */

import {
	DTS_BITRATES,
	DTS_SAMPLE_RATES,
	DTS_SYNC_WORD,
	DtsChannelArrangement,
	type DtsAudioData,
	type DtsEncodeOptions,
} from './types'

/**
 * Encode audio to DTS
 */
export function encodeDts(audio: DtsAudioData, options: DtsEncodeOptions = {}): Uint8Array {
	const { samples, sampleRate: inputSampleRate, channels: inputChannels } = audio

	if (inputChannels === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	// Validate and set encoding parameters
	const sampleRate = options.sampleRate || inputSampleRate
	const channels = inputChannels

	// Validate sample rate
	if (!DTS_SAMPLE_RATES.includes(sampleRate as any)) {
		throw new Error(`Unsupported sample rate: ${sampleRate}. Use one of: ${DTS_SAMPLE_RATES.join(', ')}`)
	}

	// Determine channel arrangement
	const channelArrangement = options.channelArrangement ?? getDefaultChannelArrangement(channels)
	const lfe = options.lfe ?? (channels === 6) // Auto-detect LFE for 5.1

	// Determine bitrate
	const bitrate = options.bitrate ?? getDefaultBitrate(channels)
	const bitrateIndex = findBitrateIndex(bitrate)
	if (bitrateIndex < 0) {
		throw new Error(`Unsupported bitrate: ${bitrate}. Use one of: ${DTS_BITRATES.filter((b) => b > 0).join(', ')}`)
	}

	// Get sample rate index
	const sampleRateIndex = DTS_SAMPLE_RATES.indexOf(sampleRate as any)
	if (sampleRateIndex < 0) {
		throw new Error(`Invalid sample rate: ${sampleRate}`)
	}

	const pcmResolution = options.pcmResolution || 24
	const dialogNorm = options.dialogNorm || 0
	const surroundDiff = options.surroundDiff ?? true

	// Frame parameters
	const sampleBlocks = 8 // Typical: 8 blocks per frame
	const samplesPerFrame = sampleBlocks * 32 // 32 samples per block
	const totalSamples = samples[0]!.length

	// Calculate frame size based on bitrate
	const frameSize = calculateFrameSize(bitrate, sampleRate, samplesPerFrame)

	const parts: Uint8Array[] = []
	let sampleOffset = 0

	// Encode frames
	while (sampleOffset < totalSamples) {
		const currentBlockSamples = Math.min(samplesPerFrame, totalSamples - sampleOffset)

		// Extract block samples
		const blockSamples: Float32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			blockSamples.push(samples[ch]!.slice(sampleOffset, sampleOffset + currentBlockSamples))
		}

		// Encode frame
		const frame = encodeFrame(blockSamples, {
			sampleRate,
			sampleRateIndex,
			channels,
			channelArrangement,
			lfe,
			bitrate,
			bitrateIndex,
			sampleBlocks,
			frameSize,
			pcmResolution,
			dialogNorm,
			surroundDiff,
		})

		parts.push(frame)
		sampleOffset += currentBlockSamples
	}

	return concatArrays(parts)
}

/**
 * Encode a single frame
 */
function encodeFrame(
	samples: Float32Array[],
	params: {
		sampleRate: number
		sampleRateIndex: number
		channels: number
		channelArrangement: number
		lfe: boolean
		bitrate: number
		bitrateIndex: number
		sampleBlocks: number
		frameSize: number
		pcmResolution: number
		dialogNorm: number
		surroundDiff: boolean
	}
): Uint8Array {
	const {
		sampleRate,
		sampleRateIndex,
		channels,
		channelArrangement,
		lfe,
		bitrateIndex,
		sampleBlocks,
		frameSize,
		pcmResolution,
		dialogNorm,
		surroundDiff,
	} = params

	const bitWriter = new BitWriter()

	// Sync word (32 bits)
	bitWriter.writeBits((DTS_SYNC_WORD >> 24) & 0xff, 8)
	bitWriter.writeBits((DTS_SYNC_WORD >> 16) & 0xff, 8)
	bitWriter.writeBits((DTS_SYNC_WORD >> 8) & 0xff, 8)
	bitWriter.writeBits(DTS_SYNC_WORD & 0xff, 8)

	// Frame type (1 bit): 1 = normal frame
	bitWriter.writeBits(1, 1)

	// Deficit sample count (5 bits): 31 = no deficit
	bitWriter.writeBits(31, 5)

	// CRC present flag (1 bit): 0 = no CRC
	bitWriter.writeBits(0, 1)

	// Number of PCM sample blocks (7 bits): value - 1
	bitWriter.writeBits(sampleBlocks - 1, 7)

	// Primary frame byte size (14 bits): value - 1
	bitWriter.writeBits(frameSize - 1, 14)

	// Audio channel arrangement (6 bits)
	bitWriter.writeBits(channelArrangement, 6)

	// Core audio sample rate (4 bits)
	bitWriter.writeBits(sampleRateIndex, 4)

	// Transmission bit rate (5 bits)
	bitWriter.writeBits(bitrateIndex, 5)

	// Downmix (1 bit): 0 = not embedded
	bitWriter.writeBits(0, 1)

	// Dynamic range (1 bit): 0 = not embedded
	bitWriter.writeBits(0, 1)

	// Time stamp (1 bit): 0 = not embedded
	bitWriter.writeBits(0, 1)

	// Auxiliary data (1 bit): 0 = not present
	bitWriter.writeBits(0, 1)

	// HDCD (1 bit): 0 = no HDCD
	bitWriter.writeBits(0, 1)

	// Extension audio descriptor (3 bits): 0 = none
	bitWriter.writeBits(0, 3)

	// Extended coding (1 bit): 0 = not present
	bitWriter.writeBits(0, 1)

	// Audio sync word insertion (1 bit): 0 = not present
	bitWriter.writeBits(0, 1)

	// Low frequency effects (2 bits): 0=none, 1=128Hz, 2=64Hz
	bitWriter.writeBits(lfe ? 1 : 0, 2)

	// Predictor history flag (1 bit): 0 = off
	bitWriter.writeBits(0, 1)

	// Multirate interpolator (1 bit): 0 = off
	bitWriter.writeBits(0, 1)

	// Encoder software revision (4 bits): 7 = generic
	bitWriter.writeBits(7, 4)

	// Copy history (2 bits): 0 = no copy
	bitWriter.writeBits(0, 2)

	// Source PCM resolution (3 bits)
	const pcmrCode = pcmResolution === 16 ? 0 : pcmResolution === 20 ? 2 : 4 // 24-bit
	bitWriter.writeBits(pcmrCode, 3)

	// Front sum/difference flag (1 bit): 0 = off
	bitWriter.writeBits(0, 1)

	// Surround sum/difference flag (1 bit)
	bitWriter.writeBits(surroundDiff ? 1 : 0, 1)

	// Dialog normalization (4 bits)
	bitWriter.writeBits(dialogNorm & 0x0f, 4)

	// Encode audio data (simplified stub)
	// Real DTS encoding requires:
	// - QMF analysis filter bank
	// - Subband decomposition
	// - Adaptive bit allocation
	// - ADPCM encoding
	// - Huffman/Rice coding
	//
	// This is a placeholder that writes zeros
	const headerBytes = bitWriter.getBytes().length
	const audioDataSize = frameSize - headerBytes

	for (let i = 0; i < audioDataSize; i++) {
		bitWriter.writeBits(0, 8)
	}

	// Pad to frame size if needed
	const frameData = bitWriter.getBytes()
	if (frameData.length < frameSize) {
		const padded = new Uint8Array(frameSize)
		padded.set(frameData)
		return padded
	}

	return frameData.slice(0, frameSize)
}

/**
 * Get default channel arrangement from channel count
 */
function getDefaultChannelArrangement(channels: number): number {
	switch (channels) {
		case 1:
			return DtsChannelArrangement.MONO
		case 2:
			return DtsChannelArrangement.STEREO
		case 3:
			return DtsChannelArrangement.THREE_CHANNEL
		case 4:
			return DtsChannelArrangement.TWO_PLUS_TWO
		case 5:
			return DtsChannelArrangement.THREE_PLUS_TWO
		case 6:
			return DtsChannelArrangement.THREE_PLUS_TWO_PLUS_ONE // 5.1
		case 8:
			return DtsChannelArrangement.FOUR_PLUS_TWO
		default:
			throw new Error(`Unsupported channel count: ${channels}`)
	}
}

/**
 * Get default bitrate for channel count
 */
function getDefaultBitrate(channels: number): number {
	// Recommended bitrates per channel configuration
	switch (channels) {
		case 1:
			return 256 // Mono
		case 2:
			return 960 // Stereo (768 is not valid in DTS)
		case 3:
		case 4:
		case 5:
			return 1024 // Multi-channel
		case 6:
			return 1536 // 5.1 surround
		case 8:
			return 2048 // 7.1 surround
		default:
			return 960
	}
}

/**
 * Find bitrate index
 */
function findBitrateIndex(bitrate: number): number {
	return DTS_BITRATES.indexOf(bitrate as any)
}

/**
 * Calculate frame size based on bitrate and sample rate
 */
function calculateFrameSize(bitrate: number, sampleRate: number, samplesPerFrame: number): number {
	// Frame size in bytes = (bitrate * 1000 / 8) * (samplesPerFrame / sampleRate)
	const frameSize = Math.floor(((bitrate * 1000) / 8) * (samplesPerFrame / sampleRate))

	// Align to word boundary and ensure minimum size
	return Math.max(96, Math.floor(frameSize / 4) * 4)
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

	alignToByte(): void {
		if (this.bitsInByte > 0) {
			this.currentByte <<= 8 - this.bitsInByte
			this.buffer.push(this.currentByte)
			this.currentByte = 0
			this.bitsInByte = 0
		}
	}

	getBytes(): Uint8Array {
		// Flush any remaining bits
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

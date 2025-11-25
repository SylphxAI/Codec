/**
 * TAK (Tom's Audio Kompressor) encoder
 * Pure TypeScript implementation of TAK encoding
 */

import type { AudioData } from '@sylphx/codec-core'
import { TakFrameType, type TakAudioData, type TakEncodeOptions } from './types'

/**
 * Encode audio to TAK
 */
export function encodeTak(audio: TakAudioData, options: TakEncodeOptions = {}): Uint8Array {
	const { compressionLevel = 2, frameSize = 16384 } = options

	const { samples, sampleRate, bitsPerSample } = audio
	const channels = samples.length

	if (channels === 0 || samples[0]!.length === 0) {
		throw new Error('No audio data to encode')
	}

	const totalSamples = samples[0]!.length
	const parts: Uint8Array[] = []

	// Magic number
	parts.push(new Uint8Array([0x74, 0x42, 0x61, 0x4b])) // "tBaK"

	// STREAMINFO frame
	parts.push(buildStreamInfo(sampleRate, channels, bitsPerSample, totalSamples, frameSize))

	// ENCODER frame
	parts.push(buildEncoderFrame('mconv TAK encoder v1.0'))

	// WAVEDATA frame marker
	parts.push(new Uint8Array([TakFrameType.WAVEDATA, 0, 0, 0])) // Frame type + size placeholder

	// Encode frames
	let sampleOffset = 0

	while (sampleOffset < totalSamples) {
		const currentFrameSize = Math.min(frameSize, totalSamples - sampleOffset)

		// Extract frame samples
		const frameSamples: Int32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			frameSamples.push(samples[ch]!.slice(sampleOffset, sampleOffset + currentFrameSize))
		}

		// Encode frame (simplified verbatim encoding)
		const frame = encodeFrame(frameSamples, bitsPerSample, compressionLevel)
		parts.push(frame)

		sampleOffset += currentFrameSize
	}

	return concatArrays(parts)
}

/**
 * Encode AudioData to TAK
 */
export function encodeAudioDataToTak(audio: AudioData, options: TakEncodeOptions = {}): Uint8Array {
	// Determine bits per sample from input (default to 16-bit)
	const bitsPerSample = options.verifyEncoding ? 24 : 16
	const maxValue = 1 << (bitsPerSample - 1)

	// Convert Float32Array to Int32Array
	const samples: Int32Array[] = audio.channelData.map((channel) => {
		const intChannel = new Int32Array(channel.length)
		for (let i = 0; i < channel.length; i++) {
			// Clamp to [-1, 1] and scale to integer range
			const sample = Math.max(-1, Math.min(1, channel[i]!))
			intChannel[i] = Math.round(sample * maxValue)
		}
		return intChannel
	})

	const takAudio: TakAudioData = {
		samples,
		sampleRate: audio.sampleRate,
		bitsPerSample,
	}

	return encodeTak(takAudio, options)
}

/**
 * Build STREAMINFO frame
 */
function buildStreamInfo(
	sampleRate: number,
	channels: number,
	bitsPerSample: number,
	totalSamples: number,
	frameSize: number
): Uint8Array {
	const data = new Uint8Array(32)
	let offset = 0

	// Frame type
	data[offset++] = TakFrameType.STREAMINFO

	// Frame size (28 bytes for STREAMINFO payload)
	data[offset++] = 28
	data[offset++] = 0
	data[offset++] = 0

	// Format descriptor
	const dataType = 0 // Integer PCM
	const formatFlags = (dataType << 12) | ((channels - 1) << 8) | (bitsPerSample - 1)
	writeU16LE(data, offset, formatFlags)
	offset += 2

	// Sample rate
	writeU32LE(data, offset, sampleRate)
	offset += 4

	// Sample count
	writeU64LE(data, offset, totalSamples)
	offset += 8

	// Frame size
	writeU16LE(data, offset, frameSize)
	offset += 2

	// Rest size (samples in last frame)
	const restSize = totalSamples % frameSize
	writeU16LE(data, offset, restSize === 0 ? frameSize : restSize)
	offset += 2

	// Codec version
	data[offset++] = 0x22 // Version 2.2

	// Flags (no seek table, no MD5 for simplicity)
	data[offset++] = 0x00

	return data
}

/**
 * Build ENCODER frame
 */
function buildEncoderFrame(encoder: string): Uint8Array {
	const encoderBytes = new TextEncoder().encode(encoder)
	const data = new Uint8Array(4 + encoderBytes.length)

	// Frame type
	data[0] = TakFrameType.ENCODER

	// Frame size
	data[1] = encoderBytes.length & 0xff
	data[2] = (encoderBytes.length >> 8) & 0xff
	data[3] = (encoderBytes.length >> 16) & 0xff

	// Encoder string
	data.set(encoderBytes, 4)

	return data
}

/**
 * Encode a single frame (simplified verbatim encoding)
 */
function encodeFrame(samples: Int32Array[], bitsPerSample: number, compressionLevel: number): Uint8Array {
	const channels = samples.length
	const sampleCount = samples[0]!.length

	// Calculate frame size
	const bytesPerSample = Math.ceil(bitsPerSample / 8)
	const frameDataSize = channels * sampleCount * bytesPerSample
	const data = new Uint8Array(2 + frameDataSize)

	// Frame header (simplified)
	writeU16LE(data, 0, 0x0000) // Flags: verbatim encoding

	let offset = 2

	// Write samples (interleaved by sample, not by channel)
	for (let i = 0; i < sampleCount; i++) {
		for (let ch = 0; ch < channels; ch++) {
			const sample = samples[ch]![i]!

			// Write sample based on bit depth
			if (bitsPerSample <= 8) {
				data[offset++] = sample & 0xff
			} else if (bitsPerSample <= 16) {
				writeS16LE(data, offset, sample)
				offset += 2
			} else if (bitsPerSample <= 24) {
				writeS24LE(data, offset, sample)
				offset += 3
			} else {
				writeS32LE(data, offset, sample)
				offset += 4
			}
		}
	}

	return data
}

// Binary helpers
function writeU16LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
}

function writeS16LE(data: Uint8Array, offset: number, value: number): void {
	const unsigned = value < 0 ? value + 65536 : value
	data[offset] = unsigned & 0xff
	data[offset + 1] = (unsigned >> 8) & 0xff
}

function writeS24LE(data: Uint8Array, offset: number, value: number): void {
	const unsigned = value < 0 ? value + 16777216 : value
	data[offset] = unsigned & 0xff
	data[offset + 1] = (unsigned >> 8) & 0xff
	data[offset + 2] = (unsigned >> 16) & 0xff
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

function writeS32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

function writeU64LE(data: Uint8Array, offset: number, value: number): void {
	const low = value & 0xffffffff
	const high = Math.floor(value / 0x100000000)

	data[offset] = low & 0xff
	data[offset + 1] = (low >> 8) & 0xff
	data[offset + 2] = (low >> 16) & 0xff
	data[offset + 3] = (low >> 24) & 0xff
	data[offset + 4] = high & 0xff
	data[offset + 5] = (high >> 8) & 0xff
	data[offset + 6] = (high >> 16) & 0xff
	data[offset + 7] = (high >> 24) & 0xff
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

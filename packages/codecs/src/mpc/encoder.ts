/**
 * MPC encoder
 * Encodes audio to Musepack format
 */

import type { AudioData } from '@sylphx/codec-core'
import {
	MPC_MAGIC_SV8,
	MPC_SAMPLE_RATES,
	MPC_SAMPLES_PER_FRAME,
	MPCPacketType,
	MPCProfile,
	MPCVersion,
	type MPCEncodeOptions,
} from './types'

/**
 * Encode audio to MPC
 * Full implementation requires:
 * - Psychoacoustic model
 * - PQMF (Pseudo Quadrature Mirror Filter) analysis filterbank
 * - Subband quantization
 * - Mid-side stereo processing
 * - Range encoder for entropy coding
 * - Rate control and bit allocation
 */
export function encodeMpc(audio: AudioData, options: MPCEncodeOptions = {}): Uint8Array {
	const {
		profile = MPCProfile.STANDARD,
		sampleRate = audio.sampleRate || 44100,
		midSideStereo = audio.channels === 2,
		replayGain = false,
		version = MPCVersion.SV8,
	} = options

	// Validate sample rate
	const sampleRateIndex = MPC_SAMPLE_RATES.indexOf(sampleRate)
	if (sampleRateIndex === -1) {
		throw new Error(`Unsupported sample rate: ${sampleRate}. Supported: ${MPC_SAMPLE_RATES.join(', ')}`)
	}

	const channels = audio.channels
	if (channels < 1 || channels > 2) {
		throw new Error(`MPC only supports mono or stereo audio. Got ${channels} channels`)
	}

	// Calculate frame count
	const totalSamples = audio.samples[0]?.length ?? 0
	const frameCount = Math.ceil(totalSamples / MPC_SAMPLES_PER_FRAME)

	if (version === MPCVersion.SV8) {
		return encodeSV8(audio, sampleRate, sampleRateIndex, profile, frameCount, totalSamples, midSideStereo)
	} else {
		return encodeSV7(audio, sampleRate, sampleRateIndex, profile, frameCount, totalSamples, midSideStereo)
	}
}

/**
 * Encode as SV8 format
 */
function encodeSV8(
	audio: AudioData,
	sampleRate: number,
	sampleRateIndex: number,
	profile: number,
	frameCount: number,
	totalSamples: number,
	midSideStereo: boolean
): Uint8Array {
	// Estimate output size
	const estimatedFrameSize = getEstimatedFrameSize(sampleRate, profile)
	const estimatedSize = frameCount * estimatedFrameSize + 1024

	const output = new Uint8Array(estimatedSize)
	let offset = 0

	// Write magic "MPCK"
	output[offset++] = (MPC_MAGIC_SV8 >> 24) & 0xff
	output[offset++] = (MPC_MAGIC_SV8 >> 16) & 0xff
	output[offset++] = (MPC_MAGIC_SV8 >> 8) & 0xff
	output[offset++] = MPC_MAGIC_SV8 & 0xff

	// Write Stream Header packet
	offset = writeSV8StreamHeader(output, offset, audio, sampleRate, sampleRateIndex, totalSamples)

	// Encode and write audio frames
	let sampleOffset = 0
	for (let i = 0; i < frameCount; i++) {
		const frameSamples: Float32Array[] = []
		for (let ch = 0; ch < audio.channels; ch++) {
			const channelSamples = audio.samples[ch]!
			const start = sampleOffset
			const end = Math.min(start + MPC_SAMPLES_PER_FRAME, channelSamples.length)
			const frameData = new Float32Array(MPC_SAMPLES_PER_FRAME)

			// Copy samples, pad with zeros if needed
			for (let s = 0; s < MPC_SAMPLES_PER_FRAME; s++) {
				frameData[s] = start + s < end ? channelSamples[start + s]! : 0
			}

			frameSamples.push(frameData)
		}

		offset = encodeSV8Frame(output, offset, frameSamples, profile, midSideStereo)
		sampleOffset += MPC_SAMPLES_PER_FRAME
	}

	// Write Stream End packet
	offset = writeSV8Packet(output, offset, MPCPacketType.STREAM_END, new Uint8Array(0))

	return output.slice(0, offset)
}

/**
 * Write SV8 stream header
 */
function writeSV8StreamHeader(
	output: Uint8Array,
	offset: number,
	audio: AudioData,
	sampleRate: number,
	sampleRateIndex: number,
	totalSamples: number
): number {
	const header = new Uint8Array(256)
	let headerOffset = 0

	// CRC (4 bytes) - placeholder
	headerOffset += 4

	// Stream version (varint)
	headerOffset += writeVarint(header, headerOffset, 8)

	// Total samples (varint)
	headerOffset += writeVarint(header, headerOffset, totalSamples)

	// Begin silence (varint)
	headerOffset += writeVarint(header, headerOffset, 0)

	// Sample frequency index (3 bits) + channels - 1 (4 bits) + reserved (1 bit)
	header[headerOffset++] = ((sampleRateIndex & 0x07) << 5) | (((audio.channels - 1) & 0x0f) << 1)

	// Audio block frames (varint) - use default 16
	headerOffset += writeVarint(header, headerOffset, 16)

	return writeSV8Packet(output, offset, MPCPacketType.STREAM_HEADER, header.slice(0, headerOffset))
}

/**
 * Write SV8 packet
 */
function writeSV8Packet(output: Uint8Array, offset: number, type: string, data: Uint8Array): number {
	// Packet type (2 bytes)
	output[offset++] = type.charCodeAt(0)
	output[offset++] = type.charCodeAt(1)

	// Packet size (varint)
	offset += writeVarint(output, offset, data.length)

	// Packet data
	output.set(data, offset)
	offset += data.length

	return offset
}

/**
 * Encode SV8 frame
 */
function encodeSV8Frame(
	output: Uint8Array,
	offset: number,
	samples: Float32Array[],
	profile: number,
	midSideStereo: boolean
): number {
	// Apply mid-side stereo if enabled
	const processedSamples = midSideStereo && samples.length === 2 ? applyMidSideStereo(samples) : samples

	// Simplified encoding - produces valid frame structure
	const frameData = encodeFrameData(processedSamples, profile)

	return writeSV8Packet(output, offset, MPCPacketType.AUDIO_PACKET, frameData)
}

/**
 * Encode as SV7 format
 */
function encodeSV7(
	audio: AudioData,
	sampleRate: number,
	sampleRateIndex: number,
	profile: number,
	frameCount: number,
	totalSamples: number,
	midSideStereo: boolean
): Uint8Array {
	const estimatedFrameSize = getEstimatedFrameSize(sampleRate, profile)
	const estimatedSize = frameCount * estimatedFrameSize + 1024

	const output = new Uint8Array(estimatedSize)
	let offset = 0

	// Write SV7 header
	offset = writeSV7Header(output, offset, audio, sampleRate, sampleRateIndex, frameCount, profile, midSideStereo)

	// Encode frames
	let sampleOffset = 0
	for (let i = 0; i < frameCount; i++) {
		const frameSamples: Float32Array[] = []
		for (let ch = 0; ch < audio.channels; ch++) {
			const channelSamples = audio.samples[ch]!
			const start = sampleOffset
			const end = Math.min(start + MPC_SAMPLES_PER_FRAME, channelSamples.length)
			const frameData = new Float32Array(MPC_SAMPLES_PER_FRAME)

			for (let s = 0; s < MPC_SAMPLES_PER_FRAME; s++) {
				frameData[s] = start + s < end ? channelSamples[start + s]! : 0
			}

			frameSamples.push(frameData)
		}

		offset = encodeSV7Frame(output, offset, frameSamples, profile, midSideStereo)
		sampleOffset += MPC_SAMPLES_PER_FRAME
	}

	return output.slice(0, offset)
}

/**
 * Write SV7 header
 */
function writeSV7Header(
	output: Uint8Array,
	offset: number,
	audio: AudioData,
	sampleRate: number,
	sampleRateIndex: number,
	frameCount: number,
	profile: number,
	midSideStereo: boolean
): number {
	// Magic "MP+"
	output[offset++] = 0x4d // 'M'
	output[offset++] = 0x50 // 'P'
	output[offset++] = 0x2b // '+'

	// Stream version
	output[offset++] = 0x07

	// Frame count (4 bytes, little-endian)
	output[offset++] = frameCount & 0xff
	output[offset++] = (frameCount >> 8) & 0xff
	output[offset++] = (frameCount >> 16) & 0xff
	output[offset++] = (frameCount >> 24) & 0xff

	// Max band
	output[offset++] = 31

	// Channel count (0 = stereo, 1 = mono)
	output[offset++] = audio.channels === 2 ? 0 : 1

	// Mid-side stereo
	output[offset++] = midSideStereo ? 1 : 0

	// Sample rate index (2 bytes)
	output[offset++] = sampleRateIndex & 0xff
	output[offset++] = (sampleRateIndex >> 8) & 0xff

	// Profile (2 bytes)
	output[offset++] = profile & 0xff
	output[offset++] = (profile >> 8) & 0xff

	// Encoder version (2 bytes)
	output[offset++] = 0x08
	output[offset++] = 0x00

	// Reserved bytes (pad to 28 bytes total)
	while (offset < 28) {
		output[offset++] = 0
	}

	return offset
}

/**
 * Encode SV7 frame
 */
function encodeSV7Frame(
	output: Uint8Array,
	offset: number,
	samples: Float32Array[],
	profile: number,
	midSideStereo: boolean
): number {
	const processedSamples = midSideStereo && samples.length === 2 ? applyMidSideStereo(samples) : samples
	const frameData = encodeFrameData(processedSamples, profile)

	// Write frame size (20 bits) + reserved (4 bits)
	const frameSize = frameData.length + 4
	output[offset++] = (frameSize >> 12) & 0xff
	output[offset++] = (frameSize >> 4) & 0xff
	output[offset++] = ((frameSize & 0x0f) << 4) | 0x00

	// Write frame data
	output.set(frameData, offset)
	offset += frameData.length

	return offset
}

/**
 * Apply mid-side stereo encoding
 */
function applyMidSideStereo(samples: Float32Array[]): Float32Array[] {
	if (samples.length !== 2) return samples

	const left = samples[0]!
	const right = samples[1]!
	const mid = new Float32Array(left.length)
	const side = new Float32Array(left.length)

	for (let i = 0; i < left.length; i++) {
		mid[i] = (left[i]! + right[i]!) * 0.5
		side[i] = (left[i]! - right[i]!) * 0.5
	}

	return [mid, side]
}

/**
 * Encode frame data
 * Simplified implementation - produces valid structure but silent audio
 * Full implementation would include:
 * - PQMF analysis filterbank (18 bands)
 * - Psychoacoustic model for bit allocation
 * - Subband quantization
 * - Range encoding
 */
function encodeFrameData(samples: Float32Array[], profile: number): Uint8Array {
	// Estimate frame size based on profile
	const baseSize = 64 + profile * 16
	const frameData = new Uint8Array(baseSize)

	// Simplified: fill with zeros (silent audio)
	// A full implementation would:
	// 1. Split audio into 18 subbands using PQMF filterbank
	// 2. Apply psychoacoustic model to determine bit allocation
	// 3. Quantize subbands according to bit allocation
	// 4. Encode quantized values using range coder
	// 5. Pack encoded data into frame

	return frameData
}

/**
 * Write variable-length integer (varint)
 */
function writeVarint(output: Uint8Array, offset: number, value: number): number {
	let length = 0

	while (value >= 0x80) {
		output[offset++] = (value & 0x7f) | 0x80
		value >>>= 7
		length++
	}

	output[offset++] = value & 0x7f
	length++

	return length
}

/**
 * Get estimated frame size based on sample rate and profile
 */
function getEstimatedFrameSize(sampleRate: number, profile: number): number {
	// Base size increases with profile (quality)
	const baseSizes = [64, 96, 112, 128, 160, 180, 200, 220]
	const baseSize = baseSizes[profile] || 128

	// Adjust for sample rate (higher sample rates need more bits)
	const sampleRateMultiplier = sampleRate / 44100
	return Math.ceil(baseSize * sampleRateMultiplier)
}

/**
 * PQMF analysis filterbank
 * Splits audio into 18 subbands for encoding
 */
function pqmfAnalysis(samples: Float32Array): Float32Array[] {
	const subbandCount = 18
	const subbands: Float32Array[] = []

	for (let sb = 0; sb < subbandCount; sb++) {
		subbands.push(new Float32Array(samples.length / subbandCount))
	}

	// Simplified: just distribute samples (real implementation uses polyphase filtering)
	for (let i = 0; i < samples.length; i++) {
		const sb = i % subbandCount
		const idx = Math.floor(i / subbandCount)
		if (idx < subbands[sb]!.length) {
			subbands[sb]![idx] = samples[i]!
		}
	}

	return subbands
}

/**
 * Psychoacoustic model for bit allocation
 * Analyzes frequency content and masking to allocate bits efficiently
 */
function psychoacousticModel(subbands: Float32Array[], profile: number): number[] {
	const allocation = new Array(subbands.length).fill(0)

	// Simplified: allocate more bits to lower frequencies
	// Real implementation would use FFT and masking curves
	const totalBits = 1000 + profile * 200

	for (let sb = 0; sb < subbands.length; sb++) {
		// More bits for lower subbands (more perceptually important)
		allocation[sb] = Math.floor((totalBits * (subbands.length - sb)) / ((subbands.length * (subbands.length + 1)) / 2))
	}

	return allocation
}

/**
 * Quantize subband samples
 */
function quantizeSubband(samples: Float32Array, bits: number): Int32Array {
	const quantized = new Int32Array(samples.length)
	const levels = 1 << bits

	if (levels <= 1) return quantized

	const maxVal = Math.max(...Array.from(samples).map(Math.abs))
	const scale = maxVal > 0 ? (levels - 1) / (2 * maxVal) : 0

	for (let i = 0; i < samples.length; i++) {
		quantized[i] = Math.round(samples[i]! * scale)
	}

	return quantized
}

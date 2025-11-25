/**
 * AIFF audio encoder
 * Encodes audio to Audio Interchange File Format (Apple)
 */

import { AIFF_MAGIC, COMM_MAGIC, FORM_MAGIC, SSND_MAGIC, type AiffEncodeOptions } from './types'

/**
 * Encode audio samples to AIFF
 * @param channels Array of Float32Arrays (one per channel), samples normalized -1 to 1
 * @param options Encoding options
 */
export function encodeAiff(channels: Float32Array[], options: AiffEncodeOptions = {}): Uint8Array {
	if (channels.length === 0 || channels[0]!.length === 0) {
		return new Uint8Array(0)
	}

	const { sampleRate = 44100, bitsPerSample = 16 } = options

	const numChannels = channels.length
	const numSampleFrames = channels[0]!.length
	const bytesPerSample = bitsPerSample / 8
	const dataSize = numSampleFrames * numChannels * bytesPerSample

	// Calculate chunk sizes
	const commChunkSize = 18 // Standard COMM chunk
	const ssndChunkSize = 8 + dataSize // offset + blockSize + data

	// FORM size = type + chunks
	const formSize = 4 + (8 + commChunkSize) + (8 + ssndChunkSize)

	const output = new Uint8Array(8 + formSize)
	let offset = 0

	// FORM header
	writeU32BE(output, offset, FORM_MAGIC)
	offset += 4
	writeU32BE(output, offset, formSize)
	offset += 4

	// AIFF type
	writeU32BE(output, offset, AIFF_MAGIC)
	offset += 4

	// COMM chunk
	writeU32BE(output, offset, COMM_MAGIC)
	offset += 4
	writeU32BE(output, offset, commChunkSize)
	offset += 4
	writeU16BE(output, offset, numChannels)
	offset += 2
	writeU32BE(output, offset, numSampleFrames)
	offset += 4
	writeU16BE(output, offset, bitsPerSample)
	offset += 2
	writeExtended(output, offset, sampleRate)
	offset += 10

	// SSND chunk
	writeU32BE(output, offset, SSND_MAGIC)
	offset += 4
	writeU32BE(output, offset, ssndChunkSize)
	offset += 4
	writeU32BE(output, offset, 0) // offset
	offset += 4
	writeU32BE(output, offset, 0) // blockSize
	offset += 4

	// Write interleaved samples
	for (let i = 0; i < numSampleFrames; i++) {
		for (let c = 0; c < numChannels; c++) {
			encodeSample(output, offset, channels[c]![i]!, bitsPerSample)
			offset += bytesPerSample
		}
	}

	return output
}

/**
 * Create AIFF from mono audio
 */
export function encodeAiffMono(samples: Float32Array, options: AiffEncodeOptions = {}): Uint8Array {
	return encodeAiff([samples], options)
}

/**
 * Create AIFF from stereo audio
 */
export function encodeAiffStereo(
	left: Float32Array,
	right: Float32Array,
	options: AiffEncodeOptions = {}
): Uint8Array {
	return encodeAiff([left, right], options)
}

function encodeSample(data: Uint8Array, offset: number, sample: number, bitsPerSample: number): void {
	// Clamp sample to -1 to 1
	const clamped = Math.max(-1, Math.min(1, sample))

	switch (bitsPerSample) {
		case 8: {
			// 8-bit signed (unlike WAV which is unsigned)
			const val = Math.round(clamped * 127)
			data[offset] = val < 0 ? val + 256 : val
			break
		}
		case 16: {
			// 16-bit signed big-endian
			const val = Math.round(clamped * 32767)
			writeI16BE(data, offset, val)
			break
		}
		case 24: {
			// 24-bit signed big-endian
			const val = Math.round(clamped * 8388607)
			writeI24BE(data, offset, val)
			break
		}
		case 32: {
			// 32-bit signed big-endian
			const val = Math.round(clamped * 2147483647)
			writeI32BE(data, offset, val)
			break
		}
	}
}

/**
 * Write 80-bit extended precision float (IEEE 754)
 */
function writeExtended(data: Uint8Array, offset: number, value: number): void {
	if (value === 0) {
		for (let i = 0; i < 10; i++) data[offset + i] = 0
		return
	}

	const sign = value < 0 ? 1 : 0
	const absValue = Math.abs(value)

	// Find exponent
	const exp = Math.floor(Math.log2(absValue))
	const biasedExp = exp + 16383

	// Normalize mantissa
	// Extended precision has explicit integer bit (always 1 for normalized)
	const mantissa = absValue / 2 ** exp

	// Convert mantissa to 64-bit integer
	let mantissaInt = BigInt(Math.round(mantissa * 2 ** 63))

	// Write sign and exponent
	data[offset] = (sign << 7) | ((biasedExp >> 8) & 0x7f)
	data[offset + 1] = biasedExp & 0xff

	// Write mantissa (big-endian, MSB first)
	for (let i = 0; i < 8; i++) {
		data[offset + 2 + i] = Number((mantissaInt >> BigInt((7 - i) * 8)) & 0xffn)
	}
}

// Binary writing helpers (big-endian)
function writeU16BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 8) & 0xff
	data[offset + 1] = value & 0xff
}

function writeI16BE(data: Uint8Array, offset: number, value: number): void {
	writeU16BE(data, offset, value < 0 ? value + 0x10000 : value)
}

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 24) & 0xff
	data[offset + 1] = (value >> 16) & 0xff
	data[offset + 2] = (value >> 8) & 0xff
	data[offset + 3] = value & 0xff
}

function writeI24BE(data: Uint8Array, offset: number, value: number): void {
	const v = value < 0 ? value + 0x1000000 : value
	data[offset] = (v >> 16) & 0xff
	data[offset + 1] = (v >> 8) & 0xff
	data[offset + 2] = v & 0xff
}

function writeI32BE(data: Uint8Array, offset: number, value: number): void {
	writeU32BE(data, offset, value < 0 ? value + 0x100000000 : value)
}

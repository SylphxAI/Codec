/**
 * AU audio encoder
 * Encodes audio to Sun/NeXT audio format
 */

import { AU_MAGIC, AuEncoding, type AuEncodeOptions, type AuEncodingType } from './types'

/**
 * Encode audio samples to AU
 * @param channels Array of Float32Arrays (one per channel), samples normalized -1 to 1
 * @param options Encoding options
 */
export function encodeAu(channels: Float32Array[], options: AuEncodeOptions = {}): Uint8Array {
	if (channels.length === 0 || channels[0]!.length === 0) {
		return new Uint8Array(0)
	}

	const { sampleRate = 44100, bitsPerSample = 16, annotation = '' } = options

	const numChannels = channels.length
	const sampleCount = channels[0]!.length
	const bytesPerSample = bitsPerSample / 8
	const dataSize = sampleCount * numChannels * bytesPerSample

	// Calculate header size (minimum 24 bytes, plus annotation)
	// Annotation must be null-terminated and aligned to 8 bytes
	const annotationBytes = new TextEncoder().encode(annotation)
	const annotationSize = annotationBytes.length + 1 // Include null terminator
	const headerSize = Math.ceil((24 + annotationSize) / 8) * 8

	const encoding = getEncoding(bitsPerSample)
	const totalSize = headerSize + dataSize

	const output = new Uint8Array(totalSize)

	// Write header
	writeU32BE(output, 0, AU_MAGIC)
	writeU32BE(output, 4, headerSize)
	writeU32BE(output, 8, dataSize)
	writeU32BE(output, 12, encoding)
	writeU32BE(output, 16, sampleRate)
	writeU32BE(output, 20, numChannels)

	// Write annotation
	if (annotationBytes.length > 0) {
		output.set(annotationBytes, 24)
	}

	// Write interleaved samples
	let offset = headerSize
	for (let i = 0; i < sampleCount; i++) {
		for (let c = 0; c < numChannels; c++) {
			encodeSample(output, offset, channels[c]![i]!, bitsPerSample)
			offset += bytesPerSample
		}
	}

	return output
}

/**
 * Create AU from mono audio
 */
export function encodeAuMono(samples: Float32Array, options: AuEncodeOptions = {}): Uint8Array {
	return encodeAu([samples], options)
}

/**
 * Create AU from stereo audio
 */
export function encodeAuStereo(
	left: Float32Array,
	right: Float32Array,
	options: AuEncodeOptions = {}
): Uint8Array {
	return encodeAu([left, right], options)
}

function getEncoding(bitsPerSample: number): AuEncodingType {
	switch (bitsPerSample) {
		case 8:
			return AuEncoding.LINEAR_8
		case 16:
			return AuEncoding.LINEAR_16
		case 24:
			return AuEncoding.LINEAR_24
		case 32:
			return AuEncoding.LINEAR_32
		default:
			return AuEncoding.LINEAR_16
	}
}

function encodeSample(data: Uint8Array, offset: number, sample: number, bitsPerSample: number): void {
	// Clamp sample to -1 to 1
	const clamped = Math.max(-1, Math.min(1, sample))

	switch (bitsPerSample) {
		case 8: {
			// 8-bit signed
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

// Binary writing helpers (big-endian)
function writeU32BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 24) & 0xff
	data[offset + 1] = (value >> 16) & 0xff
	data[offset + 2] = (value >> 8) & 0xff
	data[offset + 3] = value & 0xff
}

function writeI16BE(data: Uint8Array, offset: number, value: number): void {
	const v = value < 0 ? value + 0x10000 : value
	data[offset] = (v >> 8) & 0xff
	data[offset + 1] = v & 0xff
}

function writeI24BE(data: Uint8Array, offset: number, value: number): void {
	const v = value < 0 ? value + 0x1000000 : value
	data[offset] = (v >> 16) & 0xff
	data[offset + 1] = (v >> 8) & 0xff
	data[offset + 2] = v & 0xff
}

function writeI32BE(data: Uint8Array, offset: number, value: number): void {
	const v = value < 0 ? value + 0x100000000 : value
	data[offset] = (v >> 24) & 0xff
	data[offset + 1] = (v >> 16) & 0xff
	data[offset + 2] = (v >> 8) & 0xff
	data[offset + 3] = v & 0xff
}

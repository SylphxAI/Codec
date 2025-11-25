/**
 * WAV audio encoder
 * Encodes audio to RIFF WAVE format
 */

import {
	DATA_MAGIC,
	FMT_MAGIC,
	RIFF_MAGIC,
	WAVE_MAGIC,
	WavFormat,
	type WavEncodeOptions,
} from './types'

/**
 * Encode audio samples to WAV
 * @param channels Array of Float32Arrays (one per channel), samples normalized -1 to 1
 * @param options Encoding options
 */
export function encodeWav(channels: Float32Array[], options: WavEncodeOptions = {}): Uint8Array {
	if (channels.length === 0 || channels[0]!.length === 0) {
		return new Uint8Array(0)
	}

	const { sampleRate = 44100, bitsPerSample = 16, floatingPoint = false } = options

	const numChannels = channels.length
	const sampleCount = channels[0]!.length
	const bytesPerSample = bitsPerSample / 8
	const blockAlign = numChannels * bytesPerSample
	const byteRate = sampleRate * blockAlign
	const dataSize = sampleCount * blockAlign

	// Calculate total size
	const fmtChunkSize = 16
	const dataChunkSize = dataSize
	const riffSize = 4 + (8 + fmtChunkSize) + (8 + dataChunkSize)

	const output = new Uint8Array(8 + riffSize)
	let offset = 0

	// RIFF header
	writeU32LE(output, offset, RIFF_MAGIC)
	offset += 4
	writeU32LE(output, offset, riffSize)
	offset += 4

	// WAVE format
	writeU32LE(output, offset, WAVE_MAGIC)
	offset += 4

	// fmt chunk
	writeU32LE(output, offset, FMT_MAGIC)
	offset += 4
	writeU32LE(output, offset, fmtChunkSize)
	offset += 4

	const audioFormat = floatingPoint && bitsPerSample === 32 ? WavFormat.IEEE_FLOAT : WavFormat.PCM
	writeU16LE(output, offset, audioFormat)
	offset += 2
	writeU16LE(output, offset, numChannels)
	offset += 2
	writeU32LE(output, offset, sampleRate)
	offset += 4
	writeU32LE(output, offset, byteRate)
	offset += 4
	writeU16LE(output, offset, blockAlign)
	offset += 2
	writeU16LE(output, offset, bitsPerSample)
	offset += 2

	// data chunk
	writeU32LE(output, offset, DATA_MAGIC)
	offset += 4
	writeU32LE(output, offset, dataChunkSize)
	offset += 4

	// Write interleaved samples
	if (audioFormat === WavFormat.IEEE_FLOAT) {
		for (let i = 0; i < sampleCount; i++) {
			for (let c = 0; c < numChannels; c++) {
				writeF32LE(output, offset, channels[c]![i]!)
				offset += 4
			}
		}
	} else {
		for (let i = 0; i < sampleCount; i++) {
			for (let c = 0; c < numChannels; c++) {
				encodePcmSample(output, offset, channels[c]![i]!, bitsPerSample)
				offset += bytesPerSample
			}
		}
	}

	return output
}

/**
 * Create WAV from mono audio
 */
export function encodeWavMono(
	samples: Float32Array,
	options: WavEncodeOptions = {}
): Uint8Array {
	return encodeWav([samples], options)
}

/**
 * Create WAV from stereo audio
 */
export function encodeWavStereo(
	left: Float32Array,
	right: Float32Array,
	options: WavEncodeOptions = {}
): Uint8Array {
	return encodeWav([left, right], options)
}

function encodePcmSample(
	data: Uint8Array,
	offset: number,
	sample: number,
	bitsPerSample: number
): void {
	// Clamp sample to -1 to 1
	const clamped = Math.max(-1, Math.min(1, sample))

	switch (bitsPerSample) {
		case 8: {
			// 8-bit unsigned, centered at 128
			const val = Math.round(clamped * 127 + 128)
			data[offset] = Math.max(0, Math.min(255, val))
			break
		}
		case 16: {
			// 16-bit signed
			const val = Math.round(clamped * 32767)
			writeI16LE(data, offset, val)
			break
		}
		case 24: {
			// 24-bit signed
			const val = Math.round(clamped * 8388607)
			writeI24LE(data, offset, val)
			break
		}
		case 32: {
			// 32-bit signed
			const val = Math.round(clamped * 2147483647)
			writeI32LE(data, offset, val)
			break
		}
	}
}

// Binary writing helpers
function writeU16LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
}

function writeI16LE(data: Uint8Array, offset: number, value: number): void {
	writeU16LE(data, offset, value < 0 ? value + 0x10000 : value)
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

function writeI24LE(data: Uint8Array, offset: number, value: number): void {
	const v = value < 0 ? value + 0x1000000 : value
	data[offset] = v & 0xff
	data[offset + 1] = (v >> 8) & 0xff
	data[offset + 2] = (v >> 16) & 0xff
}

function writeI32LE(data: Uint8Array, offset: number, value: number): void {
	writeU32LE(data, offset, value < 0 ? value + 0x100000000 : value)
}

function writeF32LE(data: Uint8Array, offset: number, value: number): void {
	const view = new DataView(data.buffer, data.byteOffset + offset, 4)
	view.setFloat32(0, value, true)
}

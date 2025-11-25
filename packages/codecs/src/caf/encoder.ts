/**
 * CAF audio encoder
 * Encodes audio to Core Audio Format
 */

import {
	CAF_MAGIC,
	CAF_VERSION,
	CafChunkType,
	CafFormatFlag,
	CafFormatId,
	type CafEncodeOptions,
} from './types'

/**
 * Encode audio samples to CAF
 * @param channels Array of Float32Arrays (one per channel), samples normalized -1 to 1
 * @param options Encoding options
 */
export function encodeCaf(channels: Float32Array[], options: CafEncodeOptions = {}): Uint8Array {
	if (channels.length === 0 || channels[0]!.length === 0) {
		return new Uint8Array(0)
	}

	const {
		sampleRate = 44100,
		bitsPerChannel = 16,
		floatingPoint = false,
		littleEndian = false,
	} = options

	const numChannels = channels.length
	const frameCount = channels[0]!.length
	const bytesPerSample = bitsPerChannel / 8
	const bytesPerPacket = numChannels * bytesPerSample
	const framesPerPacket = 1

	// Calculate format flags
	let formatFlags = 0
	if (floatingPoint && bitsPerChannel === 32) {
		formatFlags |= CafFormatFlag.FLOAT
	}
	if (littleEndian) {
		formatFlags |= CafFormatFlag.LITTLE_ENDIAN
	}

	// Calculate sizes
	const audioDescSize = 32 // mSampleRate(8) + mFormatID(4) + mFormatFlags(4) + mBytesPerPacket(4) + mFramesPerPacket(4) + mChannelsPerFrame(4) + mBitsPerChannel(4)
	const audioDataSize = 4 + frameCount * bytesPerPacket // editCount(4) + audio data

	// Total: file header(8) + desc chunk header(12) + desc data(32) + data chunk header(12) + data(audioDataSize)
	const totalSize = 8 + 12 + audioDescSize + 12 + audioDataSize

	const output = new Uint8Array(totalSize)
	let offset = 0

	// File header
	writeU32BE(output, offset, CAF_MAGIC)
	offset += 4
	writeU16BE(output, offset, CAF_VERSION)
	offset += 2
	writeU16BE(output, offset, 0) // flags
	offset += 2

	// Audio Description chunk
	writeU32BE(output, offset, CafChunkType.AUDIO_DESC)
	offset += 4
	writeI64BE(output, offset, audioDescSize)
	offset += 8

	writeF64BE(output, offset, sampleRate) // mSampleRate
	offset += 8
	writeU32BE(output, offset, CafFormatId.LINEAR_PCM) // mFormatID
	offset += 4
	writeU32BE(output, offset, formatFlags) // mFormatFlags
	offset += 4
	writeU32BE(output, offset, bytesPerPacket) // mBytesPerPacket
	offset += 4
	writeU32BE(output, offset, framesPerPacket) // mFramesPerPacket
	offset += 4
	writeU32BE(output, offset, numChannels) // mChannelsPerFrame
	offset += 4
	writeU32BE(output, offset, bitsPerChannel) // mBitsPerChannel
	offset += 4

	// Audio Data chunk
	writeU32BE(output, offset, CafChunkType.AUDIO_DATA)
	offset += 4
	writeI64BE(output, offset, audioDataSize)
	offset += 8

	// Edit count (always 0 for new files)
	writeU32BE(output, offset, 0)
	offset += 4

	// Write interleaved samples
	const isFloat = floatingPoint && bitsPerChannel === 32

	if (isFloat) {
		for (let i = 0; i < frameCount; i++) {
			for (let c = 0; c < numChannels; c++) {
				if (littleEndian) {
					writeF32LE(output, offset, channels[c]![i]!)
				} else {
					writeF32BE(output, offset, channels[c]![i]!)
				}
				offset += 4
			}
		}
	} else {
		for (let i = 0; i < frameCount; i++) {
			for (let c = 0; c < numChannels; c++) {
				encodePcmSample(output, offset, channels[c]![i]!, bitsPerChannel, littleEndian)
				offset += bytesPerSample
			}
		}
	}

	return output
}

/**
 * Create CAF from mono audio
 */
export function encodeCafMono(samples: Float32Array, options: CafEncodeOptions = {}): Uint8Array {
	return encodeCaf([samples], options)
}

/**
 * Create CAF from stereo audio
 */
export function encodeCafStereo(
	left: Float32Array,
	right: Float32Array,
	options: CafEncodeOptions = {}
): Uint8Array {
	return encodeCaf([left, right], options)
}

function encodePcmSample(
	data: Uint8Array,
	offset: number,
	sample: number,
	bitsPerChannel: number,
	littleEndian: boolean
): void {
	// Clamp sample to -1 to 1
	const clamped = Math.max(-1, Math.min(1, sample))

	switch (bitsPerChannel) {
		case 8: {
			// 8-bit signed (CAF uses signed, unlike WAV)
			const val = Math.round(clamped * 127)
			data[offset] = val < 0 ? val + 256 : val
			break
		}
		case 16: {
			// 16-bit signed
			const val = Math.round(clamped * 32767)
			if (littleEndian) {
				writeI16LE(data, offset, val)
			} else {
				writeI16BE(data, offset, val)
			}
			break
		}
		case 24: {
			// 24-bit signed
			const val = Math.round(clamped * 8388607)
			if (littleEndian) {
				writeI24LE(data, offset, val)
			} else {
				writeI24BE(data, offset, val)
			}
			break
		}
		case 32: {
			// 32-bit signed
			const val = Math.round(clamped * 2147483647)
			if (littleEndian) {
				writeI32LE(data, offset, val)
			} else {
				writeI32BE(data, offset, val)
			}
			break
		}
	}
}

// Binary writing helpers (Big Endian - CAF default)
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

function writeI32BE(data: Uint8Array, offset: number, value: number): void {
	writeU32BE(data, offset, value < 0 ? value + 0x100000000 : value)
}

function writeI64BE(data: Uint8Array, offset: number, value: number): void {
	// JavaScript bitwise operations are 32-bit
	const high = Math.floor(value / 0x100000000)
	const low = value >>> 0
	writeI32BE(data, offset, high)
	writeU32BE(data, offset + 4, low)
}

function writeI24BE(data: Uint8Array, offset: number, value: number): void {
	const v = value < 0 ? value + 0x1000000 : value
	data[offset] = (v >> 16) & 0xff
	data[offset + 1] = (v >> 8) & 0xff
	data[offset + 2] = v & 0xff
}

function writeF32BE(data: Uint8Array, offset: number, value: number): void {
	const view = new DataView(data.buffer, data.byteOffset + offset, 4)
	view.setFloat32(0, value, false)
}

function writeF64BE(data: Uint8Array, offset: number, value: number): void {
	const view = new DataView(data.buffer, data.byteOffset + offset, 8)
	view.setFloat64(0, value, false)
}

// Little Endian helpers (for non-standard CAF files)
function writeI16LE(data: Uint8Array, offset: number, value: number): void {
	const v = value < 0 ? value + 0x10000 : value
	data[offset] = v & 0xff
	data[offset + 1] = (v >> 8) & 0xff
}

function writeI24LE(data: Uint8Array, offset: number, value: number): void {
	const v = value < 0 ? value + 0x1000000 : value
	data[offset] = v & 0xff
	data[offset + 1] = (v >> 8) & 0xff
	data[offset + 2] = (v >> 16) & 0xff
}

function writeI32LE(data: Uint8Array, offset: number, value: number): void {
	const v = value < 0 ? value + 0x100000000 : value
	writeU32LE(data, offset, v)
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

function writeF32LE(data: Uint8Array, offset: number, value: number): void {
	const view = new DataView(data.buffer, data.byteOffset + offset, 4)
	view.setFloat32(0, value, true)
}

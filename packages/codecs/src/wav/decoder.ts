/**
 * WAV audio decoder
 * Decodes RIFF WAVE audio files
 */

import {
	DATA_MAGIC,
	FMT_MAGIC,
	RIFF_MAGIC,
	WAVE_MAGIC,
	WavFormat,
	type WavAudio,
	type WavFormatCode,
	type WavHeader,
	type WavInfo,
} from './types'

/**
 * Check if data is a WAV file
 */
export function isWav(data: Uint8Array): boolean {
	if (data.length < 12) return false
	const riff = readU32LE(data, 0)
	const wave = readU32LE(data, 8)
	return riff === RIFF_MAGIC && wave === WAVE_MAGIC
}

/**
 * Parse WAV header
 */
export function parseWavHeader(data: Uint8Array): WavHeader {
	if (!isWav(data)) {
		throw new Error('Invalid WAV: bad magic number')
	}

	const fileSize = readU32LE(data, 4) + 8

	// Find fmt chunk
	let offset = 12
	let audioFormat: WavFormatCode = WavFormat.PCM
	let numChannels = 0
	let sampleRate = 0
	let byteRate = 0
	let blockAlign = 0
	let bitsPerSample = 0
	let dataOffset = 0
	let dataSize = 0

	while (offset < data.length - 8) {
		const chunkId = readU32LE(data, offset)
		const chunkSize = readU32LE(data, offset + 4)

		if (chunkId === FMT_MAGIC) {
			audioFormat = readU16LE(data, offset + 8) as WavFormatCode
			numChannels = readU16LE(data, offset + 10)
			sampleRate = readU32LE(data, offset + 12)
			byteRate = readU32LE(data, offset + 16)
			blockAlign = readU16LE(data, offset + 20)
			bitsPerSample = readU16LE(data, offset + 22)
		} else if (chunkId === DATA_MAGIC) {
			dataOffset = offset + 8
			dataSize = chunkSize
		}

		// Move to next chunk (chunks are word-aligned)
		offset += 8 + chunkSize
		if (chunkSize % 2 === 1) offset++
	}

	if (numChannels === 0 || sampleRate === 0) {
		throw new Error('Invalid WAV: missing fmt chunk')
	}

	return {
		fileSize,
		audioFormat,
		numChannels,
		sampleRate,
		byteRate,
		blockAlign,
		bitsPerSample,
		dataOffset,
		dataSize,
	}
}

/**
 * Parse WAV info without decoding samples
 */
export function parseWavInfo(data: Uint8Array): WavInfo {
	const header = parseWavHeader(data)
	const bytesPerSample = header.bitsPerSample / 8
	const sampleCount = Math.floor(header.dataSize / (header.numChannels * bytesPerSample))
	const duration = sampleCount / header.sampleRate

	return {
		numChannels: header.numChannels,
		sampleRate: header.sampleRate,
		bitsPerSample: header.bitsPerSample,
		format: header.audioFormat,
		duration,
		sampleCount,
	}
}

/**
 * Decode WAV audio
 */
export function decodeWav(data: Uint8Array): WavAudio {
	const header = parseWavHeader(data)
	const info = parseWavInfo(data)

	// Decode samples based on format
	const samples = decodeSamples(data, header)

	return { info, samples }
}

function decodeSamples(data: Uint8Array, header: WavHeader): Float32Array[] {
	const { audioFormat, numChannels, bitsPerSample, dataOffset, dataSize } = header
	const bytesPerSample = bitsPerSample / 8
	const sampleCount = Math.floor(dataSize / (numChannels * bytesPerSample))

	// Create channel arrays
	const channels: Float32Array[] = []
	for (let c = 0; c < numChannels; c++) {
		channels.push(new Float32Array(sampleCount))
	}

	let offset = dataOffset

	for (let i = 0; i < sampleCount; i++) {
		for (let c = 0; c < numChannels; c++) {
			let sample: number

			if (audioFormat === WavFormat.IEEE_FLOAT) {
				// IEEE floating point
				if (bitsPerSample === 32) {
					sample = readF32LE(data, offset)
				} else if (bitsPerSample === 64) {
					sample = readF64LE(data, offset)
				} else {
					sample = 0
				}
			} else {
				// PCM (integer)
				sample = decodePcmSample(data, offset, bitsPerSample)
			}

			channels[c]![i] = sample
			offset += bytesPerSample
		}
	}

	return channels
}

function decodePcmSample(data: Uint8Array, offset: number, bitsPerSample: number): number {
	switch (bitsPerSample) {
		case 8:
			// 8-bit is unsigned, centered at 128
			return (data[offset]! - 128) / 128
		case 16: {
			// 16-bit signed
			const val = readI16LE(data, offset)
			return val / 32768
		}
		case 24: {
			// 24-bit signed
			const val = readI24LE(data, offset)
			return val / 8388608
		}
		case 32: {
			// 32-bit signed
			const val = readI32LE(data, offset)
			return val / 2147483648
		}
		default:
			return 0
	}
}

// Binary reading helpers
function readU16LE(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8)
}

function readI16LE(data: Uint8Array, offset: number): number {
	const u = readU16LE(data, offset)
	return u > 0x7fff ? u - 0x10000 : u
}

function readU32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! |
		(data[offset + 1]! << 8) |
		(data[offset + 2]! << 16) |
		((data[offset + 3]! << 24) >>> 0)
	)
}

function readI24LE(data: Uint8Array, offset: number): number {
	const u = data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16)
	return u > 0x7fffff ? u - 0x1000000 : u
}

function readI32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! |
		(data[offset + 1]! << 8) |
		(data[offset + 2]! << 16) |
		(data[offset + 3]! << 24)
	)
}

function readF32LE(data: Uint8Array, offset: number): number {
	const view = new DataView(data.buffer, data.byteOffset + offset, 4)
	return view.getFloat32(0, true)
}

function readF64LE(data: Uint8Array, offset: number): number {
	const view = new DataView(data.buffer, data.byteOffset + offset, 8)
	return view.getFloat64(0, true)
}

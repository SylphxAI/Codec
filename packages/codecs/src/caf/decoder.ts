/**
 * CAF audio decoder
 * Decodes Core Audio Format files
 */

import {
	CAF_MAGIC,
	CafChunkType,
	CafFormatFlag,
	CafFormatId,
	type CafAudio,
	type CafAudioDescription,
	type CafChunkHeader,
	type CafFormatIdCode,
	type CafHeader,
	type CafInfo,
} from './types'

/**
 * Check if data is a CAF file
 */
export function isCaf(data: Uint8Array): boolean {
	if (data.length < 8) return false
	const magic = readU32BE(data, 0)
	return magic === CAF_MAGIC
}

/**
 * Parse CAF header
 */
export function parseCafHeader(data: Uint8Array): CafHeader {
	if (!isCaf(data)) {
		throw new Error('Invalid CAF: bad magic number')
	}

	// Read file header
	const version = readU16BE(data, 4)
	const flags = readU16BE(data, 6)

	let offset = 8
	let audioDesc: CafAudioDescription | null = null
	let audioDataOffset = 0
	let audioDataSize = 0
	const chunks: CafChunkHeader[] = []

	// Parse chunks
	while (offset < data.length - 12) {
		const chunkType = readU32BE(data, offset)
		const chunkSize = readI64BE(data, offset + 4)

		const chunkHeader: CafChunkHeader = {
			type: chunkType as CafFormatIdCode,
			size: chunkSize,
			offset: offset + 12,
		}
		chunks.push(chunkHeader)

		if (chunkType === CafChunkType.AUDIO_DESC) {
			// Parse audio description
			const descOffset = offset + 12
			audioDesc = {
				mSampleRate: readF64BE(data, descOffset),
				mFormatID: readU32BE(data, descOffset + 8) as CafFormatIdCode,
				mFormatFlags: readU32BE(data, descOffset + 12),
				mBytesPerPacket: readU32BE(data, descOffset + 16),
				mFramesPerPacket: readU32BE(data, descOffset + 20),
				mChannelsPerFrame: readU32BE(data, descOffset + 24),
				mBitsPerChannel: readU32BE(data, descOffset + 28),
			}
		} else if (chunkType === CafChunkType.AUDIO_DATA) {
			// Audio data chunk
			const dataOffset = offset + 12
			// Read edit count (first 4 bytes of data chunk)
			// const editCount = readU32BE(data, dataOffset)
			audioDataOffset = dataOffset + 4 // Skip edit count
			audioDataSize = chunkSize >= 0 ? chunkSize - 4 : -1
		}

		// Move to next chunk
		offset += 12
		if (chunkSize >= 0) {
			offset += chunkSize
		} else {
			// Unknown size, must be last chunk
			break
		}
	}

	if (!audioDesc) {
		throw new Error('Invalid CAF: missing audio description chunk')
	}

	return {
		version,
		flags,
		audioDesc,
		audioDataOffset,
		audioDataSize,
		chunks,
	}
}

/**
 * Parse CAF info without decoding samples
 */
export function parseCafInfo(data: Uint8Array): CafInfo {
	const header = parseCafHeader(data)
	const { audioDesc, audioDataSize } = header

	const isFloat = (audioDesc.mFormatFlags & CafFormatFlag.FLOAT) !== 0
	const isLittleEndian = (audioDesc.mFormatFlags & CafFormatFlag.LITTLE_ENDIAN) !== 0

	const bytesPerSample = audioDesc.mBitsPerChannel / 8
	const bytesPerFrame = bytesPerSample * audioDesc.mChannelsPerFrame
	const frameCount =
		audioDataSize >= 0 && bytesPerFrame > 0 ? Math.floor(audioDataSize / bytesPerFrame) : 0
	const duration = frameCount / audioDesc.mSampleRate

	return {
		numChannels: audioDesc.mChannelsPerFrame,
		sampleRate: audioDesc.mSampleRate,
		bitsPerChannel: audioDesc.mBitsPerChannel,
		format: audioDesc.mFormatID,
		formatFlags: audioDesc.mFormatFlags,
		duration,
		sampleCount: frameCount,
		isFloat,
		isLittleEndian,
	}
}

/**
 * Decode CAF audio
 */
export function decodeCaf(data: Uint8Array): CafAudio {
	const header = parseCafHeader(data)
	const info = parseCafInfo(data)

	// Only support Linear PCM for now
	if (header.audioDesc.mFormatID !== CafFormatId.LINEAR_PCM) {
		throw new Error(
			`Unsupported CAF format: ${header.audioDesc.mFormatID.toString(16)} (only Linear PCM is supported)`
		)
	}

	// Decode samples
	const samples = decodeSamples(data, header)

	return { info, samples }
}

function decodeSamples(data: Uint8Array, header: CafHeader): Float32Array[] {
	const { audioDesc, audioDataOffset, audioDataSize } = header
	const { mChannelsPerFrame, mBitsPerChannel, mFormatFlags } = audioDesc

	const isFloat = (mFormatFlags & CafFormatFlag.FLOAT) !== 0
	const isLittleEndian = (mFormatFlags & CafFormatFlag.LITTLE_ENDIAN) !== 0

	const bytesPerSample = mBitsPerChannel / 8
	const bytesPerFrame = bytesPerSample * mChannelsPerFrame
	const frameCount =
		audioDataSize >= 0 ? Math.floor(audioDataSize / bytesPerFrame) : Math.floor((data.length - audioDataOffset) / bytesPerFrame)

	// Create channel arrays
	const channels: Float32Array[] = []
	for (let c = 0; c < mChannelsPerFrame; c++) {
		channels.push(new Float32Array(frameCount))
	}

	let offset = audioDataOffset

	for (let i = 0; i < frameCount; i++) {
		for (let c = 0; c < mChannelsPerFrame; c++) {
			let sample: number

			if (isFloat) {
				// IEEE floating point
				if (mBitsPerChannel === 32) {
					sample = isLittleEndian ? readF32LE(data, offset) : readF32BE(data, offset)
				} else if (mBitsPerChannel === 64) {
					sample = isLittleEndian ? readF64LE(data, offset) : readF64BE(data, offset)
				} else {
					sample = 0
				}
			} else {
				// PCM (integer)
				sample = decodePcmSample(data, offset, mBitsPerChannel, isLittleEndian)
			}

			channels[c]![i] = sample
			offset += bytesPerSample
		}
	}

	return channels
}

function decodePcmSample(
	data: Uint8Array,
	offset: number,
	bitsPerChannel: number,
	isLittleEndian: boolean
): number {
	switch (bitsPerChannel) {
		case 8: {
			// 8-bit signed (CAF uses signed, unlike WAV)
			const val = data[offset]!
			return val > 127 ? (val - 256) / 128 : val / 127
		}
		case 16: {
			// 16-bit signed
			const val = isLittleEndian ? readI16LE(data, offset) : readI16BE(data, offset)
			return val / 32768
		}
		case 24: {
			// 24-bit signed
			const val = isLittleEndian ? readI24LE(data, offset) : readI24BE(data, offset)
			return val / 8388608
		}
		case 32: {
			// 32-bit signed
			const val = isLittleEndian ? readI32LE(data, offset) : readI32BE(data, offset)
			return val / 2147483648
		}
		default:
			return 0
	}
}

// Binary reading helpers (Big Endian - CAF default)
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

function readI16BE(data: Uint8Array, offset: number): number {
	const u = readU16BE(data, offset)
	return u > 0x7fff ? u - 0x10000 : u
}

function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) >>> 0) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

function readI32BE(data: Uint8Array, offset: number): number {
	return (
		(data[offset]! << 24) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

function readI64BE(data: Uint8Array, offset: number): number {
	// JavaScript bitwise operations are 32-bit, so we need to handle 64-bit carefully
	const high = readI32BE(data, offset)
	const low = readU32BE(data, offset + 4)
	// For practical purposes, we assume sizes fit in 53 bits (JavaScript safe integer range)
	return high * 0x100000000 + low
}

function readI24BE(data: Uint8Array, offset: number): number {
	const u = (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!
	return u > 0x7fffff ? u - 0x1000000 : u
}

function readF32BE(data: Uint8Array, offset: number): number {
	const view = new DataView(data.buffer, data.byteOffset + offset, 4)
	return view.getFloat32(0, false)
}

function readF64BE(data: Uint8Array, offset: number): number {
	const view = new DataView(data.buffer, data.byteOffset + offset, 8)
	return view.getFloat64(0, false)
}

// Little Endian helpers (for non-standard CAF files)
function readI16LE(data: Uint8Array, offset: number): number {
	const u = data[offset]! | (data[offset + 1]! << 8)
	return u > 0x7fff ? u - 0x10000 : u
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

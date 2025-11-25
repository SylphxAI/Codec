/**
 * AU audio decoder
 * Decodes Sun/NeXT audio files
 */

import {
	AU_MAGIC,
	AuEncoding,
	type AuAudio,
	type AuEncodingType,
	type AuHeader,
	type AuInfo,
} from './types'

/**
 * Check if data is an AU file
 */
export function isAu(data: Uint8Array): boolean {
	if (data.length < 24) return false
	const magic = readU32BE(data, 0)
	return magic === AU_MAGIC
}

/**
 * Parse AU header
 */
export function parseAuHeader(data: Uint8Array): AuHeader {
	if (!isAu(data)) {
		throw new Error('Invalid AU: bad magic number')
	}

	const dataOffset = readU32BE(data, 4)
	const dataSize = readU32BE(data, 8)
	const encoding = readU32BE(data, 12) as AuEncodingType
	const sampleRate = readU32BE(data, 16)
	const numChannels = readU32BE(data, 20)

	// Read annotation if present
	let annotation: string | undefined
	if (dataOffset > 24) {
		const annotationBytes = data.slice(24, dataOffset)
		// Trim null bytes
		let end = annotationBytes.indexOf(0)
		if (end === -1) end = annotationBytes.length
		annotation = new TextDecoder().decode(annotationBytes.slice(0, end))
	}

	return {
		dataOffset,
		dataSize: dataSize === 0xffffffff ? data.length - dataOffset : dataSize,
		encoding,
		sampleRate,
		numChannels,
		annotation,
	}
}

/**
 * Parse AU info without decoding samples
 */
export function parseAuInfo(data: Uint8Array): AuInfo {
	const header = parseAuHeader(data)
	const bytesPerSample = getBytesPerSample(header.encoding)
	const sampleCount = Math.floor(header.dataSize / (header.numChannels * bytesPerSample))
	const duration = sampleCount / header.sampleRate

	return {
		numChannels: header.numChannels,
		sampleRate: header.sampleRate,
		bitsPerSample: bytesPerSample * 8,
		encoding: header.encoding,
		duration,
		sampleCount,
	}
}

/**
 * Decode AU audio
 */
export function decodeAu(data: Uint8Array): AuAudio {
	const header = parseAuHeader(data)
	const info = parseAuInfo(data)

	// Decode samples
	const samples = decodeSamples(data, header)

	return { info, samples }
}

function getBytesPerSample(encoding: AuEncodingType): number {
	switch (encoding) {
		case AuEncoding.MULAW:
		case AuEncoding.ALAW:
		case AuEncoding.LINEAR_8:
			return 1
		case AuEncoding.LINEAR_16:
			return 2
		case AuEncoding.LINEAR_24:
			return 3
		case AuEncoding.LINEAR_32:
		case AuEncoding.FLOAT:
			return 4
		case AuEncoding.DOUBLE:
			return 8
		default:
			return 2
	}
}

function decodeSamples(data: Uint8Array, header: AuHeader): Float32Array[] {
	const { encoding, numChannels, dataOffset, dataSize } = header
	const bytesPerSample = getBytesPerSample(encoding)
	const sampleCount = Math.floor(dataSize / (numChannels * bytesPerSample))

	// Create channel arrays
	const channels: Float32Array[] = []
	for (let c = 0; c < numChannels; c++) {
		channels.push(new Float32Array(sampleCount))
	}

	let offset = dataOffset

	for (let i = 0; i < sampleCount; i++) {
		for (let c = 0; c < numChannels; c++) {
			const sample = decodeSample(data, offset, encoding)
			channels[c]![i] = sample
			offset += bytesPerSample
		}
	}

	return channels
}

function decodeSample(data: Uint8Array, offset: number, encoding: AuEncodingType): number {
	switch (encoding) {
		case AuEncoding.MULAW:
			return decodeUlaw(data[offset]!)
		case AuEncoding.ALAW:
			return decodeAlaw(data[offset]!)
		case AuEncoding.LINEAR_8: {
			// 8-bit signed
			const val = data[offset]!
			return (val > 127 ? val - 256 : val) / 128
		}
		case AuEncoding.LINEAR_16: {
			// 16-bit signed big-endian
			const val = readI16BE(data, offset)
			return val / 32768
		}
		case AuEncoding.LINEAR_24: {
			// 24-bit signed big-endian
			const val = readI24BE(data, offset)
			return val / 8388608
		}
		case AuEncoding.LINEAR_32: {
			// 32-bit signed big-endian
			const val = readI32BE(data, offset)
			return val / 2147483648
		}
		case AuEncoding.FLOAT: {
			// 32-bit IEEE float
			return readF32BE(data, offset)
		}
		case AuEncoding.DOUBLE: {
			// 64-bit IEEE float
			return readF64BE(data, offset)
		}
		default:
			return 0
	}
}

/**
 * Decode μ-law sample
 */
function decodeUlaw(byte: number): number {
	// Invert bits
	const u = ~byte & 0xff

	const sign = u & 0x80
	const exponent = (u >> 4) & 0x07
	const mantissa = u & 0x0f

	// Reconstruct 14-bit sample
	let sample = ((mantissa << 3) + 0x84) << exponent
	sample -= 0x84

	return (sign ? -sample : sample) / 32768
}

/**
 * Decode A-law sample
 */
function decodeAlaw(byte: number): number {
	// Invert alternate bits
	const a = byte ^ 0x55

	const sign = a & 0x80
	const exponent = (a >> 4) & 0x07
	const mantissa = a & 0x0f

	let sample: number
	if (exponent === 0) {
		sample = (mantissa << 4) + 8
	} else {
		sample = ((mantissa << 4) + 0x108) << (exponent - 1)
	}

	return (sign ? -sample : sample) / 32768
}

// Binary reading helpers (big-endian)
function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) >>> 0) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

function readI16BE(data: Uint8Array, offset: number): number {
	const u = (data[offset]! << 8) | data[offset + 1]!
	return u > 0x7fff ? u - 0x10000 : u
}

function readI24BE(data: Uint8Array, offset: number): number {
	const u = (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!
	return u > 0x7fffff ? u - 0x1000000 : u
}

function readI32BE(data: Uint8Array, offset: number): number {
	return (
		(data[offset]! << 24) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

function readF32BE(data: Uint8Array, offset: number): number {
	const view = new DataView(data.buffer, data.byteOffset + offset, 4)
	return view.getFloat32(0, false)
}

function readF64BE(data: Uint8Array, offset: number): number {
	const view = new DataView(data.buffer, data.byteOffset + offset, 8)
	return view.getFloat64(0, false)
}

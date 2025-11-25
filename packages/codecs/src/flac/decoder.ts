/**
 * FLAC (Free Lossless Audio Codec) decoder
 * Pure TypeScript implementation of FLAC decoding
 */

import {
	FLAC_MAGIC,
	FlacBlockType,
	FlacChannelAssignment,
	FlacSubframeType,
	type FlacDecodeResult,
	type FlacFrameHeader,
	type FlacInfo,
	type FlacMetadataBlock,
	type FlacSeekPoint,
	type FlacStreamInfo,
	type FlacSubframe,
	type FlacVorbisComment,
} from './types'

/**
 * Check if data is FLAC
 */
export function isFlac(data: Uint8Array): boolean {
	if (data.length < 4) return false
	return data[0] === 0x66 && data[1] === 0x4c && data[2] === 0x61 && data[3] === 0x43 // "fLaC"
}

/**
 * Parse FLAC info without full decode
 */
export function parseFlacInfo(data: Uint8Array): FlacInfo {
	const reader = new FlacReader(data)

	// Check magic
	if (!isFlac(data)) {
		throw new Error('Invalid FLAC: missing magic number')
	}
	reader.skip(4)

	// Parse metadata blocks
	let streamInfo: FlacStreamInfo | undefined
	let seekTable: FlacSeekPoint[] | undefined
	let vorbisComment: FlacVorbisComment | undefined

	while (!reader.eof()) {
		const block = parseMetadataBlock(reader)

		switch (block.type) {
			case FlacBlockType.STREAMINFO:
				streamInfo = parseStreamInfo(block.data)
				break
			case FlacBlockType.SEEKTABLE:
				seekTable = parseSeekTable(block.data)
				break
			case FlacBlockType.VORBIS_COMMENT:
				vorbisComment = parseVorbisComment(block.data)
				break
		}

		if (block.isLast) break
	}

	if (!streamInfo) {
		throw new Error('Invalid FLAC: missing STREAMINFO block')
	}

	const duration = streamInfo.totalSamples / streamInfo.sampleRate

	return {
		streamInfo,
		seekTable,
		vorbisComment,
		sampleRate: streamInfo.sampleRate,
		channels: streamInfo.channels,
		bitsPerSample: streamInfo.bitsPerSample,
		totalSamples: streamInfo.totalSamples,
		duration,
	}
}

/**
 * Decode FLAC to raw samples
 */
export function decodeFlac(data: Uint8Array): FlacDecodeResult {
	const info = parseFlacInfo(data)
	const reader = new FlacReader(data)

	// Skip to audio data
	reader.skip(4) // magic
	while (!reader.eof()) {
		const header = reader.readU8()
		const isLast = (header & 0x80) !== 0
		const length = reader.readU24BE()
		reader.skip(length)
		if (isLast) break
	}

	// Initialize output arrays
	const channels = info.channels
	const samples: Int32Array[] = []
	for (let i = 0; i < channels; i++) {
		samples.push(new Int32Array(info.totalSamples))
	}

	// Decode frames
	let sampleOffset = 0
	while (!reader.eof() && sampleOffset < info.totalSamples) {
		const frameStart = reader.position
		try {
			const { header, channelData } = decodeFrame(reader, info)

			// Copy samples to output
			for (let ch = 0; ch < channels; ch++) {
				const src = channelData[ch]!
				const dst = samples[ch]!
				for (let i = 0; i < header.blockSize && sampleOffset + i < info.totalSamples; i++) {
					dst[sampleOffset + i] = src[i]!
				}
			}

			sampleOffset += header.blockSize
		} catch (e) {
			// Try to find next sync code
			reader.seek(frameStart + 1)
			if (!reader.findSyncCode()) break
		}
	}

	return { info, samples }
}

/**
 * Parse metadata block header and data
 */
function parseMetadataBlock(reader: FlacReader): FlacMetadataBlock {
	const header = reader.readU8()
	const isLast = (header & 0x80) !== 0
	const type = header & 0x7f
	const length = reader.readU24BE()
	const data = reader.readBytes(length)

	return { type, isLast, data }
}

/**
 * Parse STREAMINFO block
 */
function parseStreamInfo(data: Uint8Array): FlacStreamInfo {
	const r = new FlacReader(data)

	const minBlockSize = r.readU16BE()
	const maxBlockSize = r.readU16BE()
	const minFrameSize = r.readU24BE()
	const maxFrameSize = r.readU24BE()

	// 20 bits sample rate, 3 bits channels-1, 5 bits bps-1, 36 bits total samples
	const packed = r.readBytes(8)
	const sampleRate = (packed[0]! << 12) | (packed[1]! << 4) | (packed[2]! >> 4)
	const channels = ((packed[2]! >> 1) & 0x07) + 1
	const bitsPerSample = (((packed[2]! & 0x01) << 4) | (packed[3]! >> 4)) + 1

	// 36-bit total samples
	const totalSamples =
		((packed[3]! & 0x0f) * 0x100000000 + (packed[4]! << 24) + (packed[5]! << 16) + (packed[6]! << 8) + packed[7]!) >>>
		0

	const md5 = r.readBytes(16)

	return {
		minBlockSize,
		maxBlockSize,
		minFrameSize,
		maxFrameSize,
		sampleRate,
		channels,
		bitsPerSample,
		totalSamples,
		md5,
	}
}

/**
 * Parse SEEKTABLE block
 */
function parseSeekTable(data: Uint8Array): FlacSeekPoint[] {
	const points: FlacSeekPoint[] = []
	const r = new FlacReader(data)

	while (!r.eof()) {
		const sampleNumber = r.readU64BE()
		const offset = r.readU64BE()
		const samples = r.readU16BE()

		// Skip placeholder points
		if (sampleNumber !== 0xffffffffffffffff) {
			points.push({ sampleNumber, offset, samples })
		}
	}

	return points
}

/**
 * Parse VORBIS_COMMENT block
 */
function parseVorbisComment(data: Uint8Array): FlacVorbisComment {
	const r = new FlacReader(data)

	// Vendor string (little-endian length)
	const vendorLen = r.readU32LE()
	const vendor = r.readString(vendorLen)

	// Comment count
	const count = r.readU32LE()
	const comments = new Map<string, string>()

	for (let i = 0; i < count; i++) {
		const len = r.readU32LE()
		const comment = r.readString(len)
		const eq = comment.indexOf('=')
		if (eq > 0) {
			const key = comment.substring(0, eq).toUpperCase()
			const value = comment.substring(eq + 1)
			comments.set(key, value)
		}
	}

	return { vendor, comments }
}

/**
 * Decode a single frame
 */
function decodeFrame(
	reader: FlacReader,
	info: FlacInfo
): { header: FlacFrameHeader; channelData: Int32Array[] } {
	const bitReader = new BitReader(reader)

	// Frame sync code: 0x3FFE (14 bits)
	const sync = bitReader.readBits(14)
	if (sync !== 0x3ffe) {
		throw new Error('Invalid frame sync code')
	}

	// Reserved bit
	bitReader.readBits(1)

	// Blocking strategy (0 = fixed, 1 = variable)
	const blockingStrategy = bitReader.readBits(1)

	// Block size code
	const blockSizeCode = bitReader.readBits(4)

	// Sample rate code
	const sampleRateCode = bitReader.readBits(4)

	// Channel assignment
	const channelAssignment = bitReader.readBits(4)

	// Sample size code
	const sampleSizeCode = bitReader.readBits(3)

	// Reserved
	bitReader.readBits(1)

	// Frame/sample number (UTF-8 coded)
	const frameOrSampleNumber = readUtf8Number(bitReader)

	// Block size
	let blockSize: number
	switch (blockSizeCode) {
		case 0:
			throw new Error('Reserved block size')
		case 1:
			blockSize = 192
			break
		case 2:
		case 3:
		case 4:
		case 5:
			blockSize = 576 << (blockSizeCode - 2)
			break
		case 6:
			blockSize = bitReader.readBits(8) + 1
			break
		case 7:
			blockSize = bitReader.readBits(16) + 1
			break
		default:
			blockSize = 256 << (blockSizeCode - 8)
	}

	// Sample rate
	let sampleRate: number
	switch (sampleRateCode) {
		case 0:
			sampleRate = info.sampleRate
			break
		case 1:
			sampleRate = 88200
			break
		case 2:
			sampleRate = 176400
			break
		case 3:
			sampleRate = 192000
			break
		case 4:
			sampleRate = 8000
			break
		case 5:
			sampleRate = 16000
			break
		case 6:
			sampleRate = 22050
			break
		case 7:
			sampleRate = 24000
			break
		case 8:
			sampleRate = 32000
			break
		case 9:
			sampleRate = 44100
			break
		case 10:
			sampleRate = 48000
			break
		case 11:
			sampleRate = 96000
			break
		case 12:
			sampleRate = bitReader.readBits(8) * 1000
			break
		case 13:
			sampleRate = bitReader.readBits(16)
			break
		case 14:
			sampleRate = bitReader.readBits(16) * 10
			break
		default:
			throw new Error('Invalid sample rate code')
	}

	// Bits per sample
	let bitsPerSample: number
	switch (sampleSizeCode) {
		case 0:
			bitsPerSample = info.bitsPerSample
			break
		case 1:
			bitsPerSample = 8
			break
		case 2:
			bitsPerSample = 12
			break
		case 3:
			throw new Error('Reserved sample size')
		case 4:
			bitsPerSample = 16
			break
		case 5:
			bitsPerSample = 20
			break
		case 6:
			bitsPerSample = 24
			break
		case 7:
			bitsPerSample = 32
			break
		default:
			bitsPerSample = info.bitsPerSample
	}

	// Channel count and assignment
	let channels: number
	let chAssignment: number

	if (channelAssignment < 8) {
		channels = channelAssignment + 1
		chAssignment = FlacChannelAssignment.INDEPENDENT
	} else if (channelAssignment === 8) {
		channels = 2
		chAssignment = FlacChannelAssignment.LEFT_SIDE
	} else if (channelAssignment === 9) {
		channels = 2
		chAssignment = FlacChannelAssignment.RIGHT_SIDE
	} else if (channelAssignment === 10) {
		channels = 2
		chAssignment = FlacChannelAssignment.MID_SIDE
	} else {
		throw new Error('Reserved channel assignment')
	}

	// CRC-8 of frame header
	bitReader.readBits(8)

	const header: FlacFrameHeader = {
		blockSize,
		sampleRate,
		channels,
		channelAssignment: chAssignment,
		bitsPerSample,
		frameNumber: blockingStrategy === 0 ? frameOrSampleNumber : 0,
		sampleNumber: blockingStrategy === 1 ? frameOrSampleNumber : undefined,
	}

	// Decode subframes
	const channelData: Int32Array[] = []

	for (let ch = 0; ch < channels; ch++) {
		// Adjust bits per sample for side channel
		let effectiveBps = bitsPerSample
		if (chAssignment === FlacChannelAssignment.LEFT_SIDE && ch === 1) {
			effectiveBps++
		} else if (chAssignment === FlacChannelAssignment.RIGHT_SIDE && ch === 0) {
			effectiveBps++
		} else if (chAssignment === FlacChannelAssignment.MID_SIDE && ch === 1) {
			effectiveBps++
		}

		const subframe = decodeSubframe(bitReader, blockSize, effectiveBps)
		channelData.push(subframe.data)
	}

	// Apply channel decorrelation
	if (chAssignment === FlacChannelAssignment.LEFT_SIDE) {
		// Left + side -> left, right (side = left - right, so right = left - side)
		const left = channelData[0]!
		const side = channelData[1]!
		for (let i = 0; i < blockSize; i++) {
			side[i] = left[i]! - side[i]!
		}
	} else if (chAssignment === FlacChannelAssignment.RIGHT_SIDE) {
		// Side + right -> left, right (side = left - right, so left = side + right)
		const side = channelData[0]!
		const right = channelData[1]!
		for (let i = 0; i < blockSize; i++) {
			side[i] = side[i]! + right[i]!
		}
	} else if (chAssignment === FlacChannelAssignment.MID_SIDE) {
		// Mid + side -> left, right
		// mid = (left + right), side = left - right
		// left = (mid + side) / 2, right = (mid - side) / 2
		const mid = channelData[0]!
		const side = channelData[1]!
		for (let i = 0; i < blockSize; i++) {
			const m = mid[i]!
			const s = side[i]!
			// Handle the division properly
			channelData[0]![i] = (m + s) >> 1
			channelData[1]![i] = (m - s) >> 1
		}
	}

	// Align to byte boundary and read CRC-16
	bitReader.alignToByte()
	reader.skip(2) // CRC-16

	return { header, channelData }
}

/**
 * Decode a subframe
 */
function decodeSubframe(bitReader: BitReader, blockSize: number, bitsPerSample: number): FlacSubframe {
	// Zero padding
	const zeroPad = bitReader.readBits(1)
	if (zeroPad !== 0) {
		throw new Error('Invalid subframe padding')
	}

	// Subframe type
	const typeCode = bitReader.readBits(6)

	// Wasted bits per sample
	let wastedBits = 0
	const hasWastedBits = bitReader.readBits(1)
	if (hasWastedBits) {
		wastedBits = 1
		while (bitReader.readBits(1) === 0) {
			wastedBits++
		}
	}

	const effectiveBps = bitsPerSample - wastedBits
	let data: Int32Array

	if (typeCode === 0) {
		// Constant
		const value = bitReader.readSignedBits(effectiveBps)
		data = new Int32Array(blockSize)
		data.fill(value << wastedBits)
	} else if (typeCode === 1) {
		// Verbatim
		data = new Int32Array(blockSize)
		for (let i = 0; i < blockSize; i++) {
			data[i] = bitReader.readSignedBits(effectiveBps) << wastedBits
		}
	} else if (typeCode >= 8 && typeCode <= 12) {
		// Fixed prediction
		const order = typeCode - 8
		data = decodeFixedSubframe(bitReader, blockSize, effectiveBps, order)
		if (wastedBits > 0) {
			for (let i = 0; i < blockSize; i++) {
				data[i] <<= wastedBits
			}
		}
	} else if (typeCode >= 32) {
		// LPC
		const order = typeCode - 31
		data = decodeLpcSubframe(bitReader, blockSize, effectiveBps, order)
		if (wastedBits > 0) {
			for (let i = 0; i < blockSize; i++) {
				data[i] <<= wastedBits
			}
		}
	} else {
		throw new Error(`Invalid subframe type: ${typeCode}`)
	}

	return { type: typeCode, wastedBits, data }
}

/**
 * Decode fixed prediction subframe
 */
function decodeFixedSubframe(bitReader: BitReader, blockSize: number, bitsPerSample: number, order: number): Int32Array {
	const data = new Int32Array(blockSize)

	// Read warm-up samples
	for (let i = 0; i < order; i++) {
		data[i] = bitReader.readSignedBits(bitsPerSample)
	}

	// Decode residual
	const residual = decodeResidual(bitReader, blockSize, order)

	// Apply fixed prediction
	for (let i = order; i < blockSize; i++) {
		let prediction = 0
		switch (order) {
			case 0:
				prediction = 0
				break
			case 1:
				prediction = data[i - 1]!
				break
			case 2:
				prediction = 2 * data[i - 1]! - data[i - 2]!
				break
			case 3:
				prediction = 3 * data[i - 1]! - 3 * data[i - 2]! + data[i - 3]!
				break
			case 4:
				prediction = 4 * data[i - 1]! - 6 * data[i - 2]! + 4 * data[i - 3]! - data[i - 4]!
				break
		}
		data[i] = prediction + residual[i - order]!
	}

	return data
}

/**
 * Decode LPC subframe
 */
function decodeLpcSubframe(bitReader: BitReader, blockSize: number, bitsPerSample: number, order: number): Int32Array {
	const data = new Int32Array(blockSize)

	// Read warm-up samples
	for (let i = 0; i < order; i++) {
		data[i] = bitReader.readSignedBits(bitsPerSample)
	}

	// Quantized LP coefficient precision
	const precision = bitReader.readBits(4) + 1
	if (precision === 16) {
		throw new Error('Invalid LPC precision')
	}

	// Quantized LP coefficient shift
	const shift = bitReader.readSignedBits(5)

	// Read coefficients
	const coefficients = new Int32Array(order)
	for (let i = 0; i < order; i++) {
		coefficients[i] = bitReader.readSignedBits(precision)
	}

	// Decode residual
	const residual = decodeResidual(bitReader, blockSize, order)

	// Apply LPC prediction
	for (let i = order; i < blockSize; i++) {
		let prediction = 0
		for (let j = 0; j < order; j++) {
			prediction += coefficients[j]! * data[i - j - 1]!
		}
		data[i] = (prediction >> shift) + residual[i - order]!
	}

	return data
}

/**
 * Decode residual using Rice coding
 */
function decodeResidual(bitReader: BitReader, blockSize: number, predictorOrder: number): Int32Array {
	const residualCount = blockSize - predictorOrder
	const residual = new Int32Array(residualCount)

	// Residual coding method
	const method = bitReader.readBits(2)
	if (method > 1) {
		throw new Error('Invalid residual coding method')
	}

	const paramBits = method === 0 ? 4 : 5
	const escapeCode = method === 0 ? 0x0f : 0x1f

	// Partition order
	const partitionOrder = bitReader.readBits(4)
	const partitions = 1 << partitionOrder

	let sampleIndex = 0
	for (let p = 0; p < partitions; p++) {
		const param = bitReader.readBits(paramBits)

		// Samples in this partition
		let samplesInPartition: number
		if (partitionOrder === 0) {
			samplesInPartition = residualCount
		} else if (p === 0) {
			samplesInPartition = (blockSize >> partitionOrder) - predictorOrder
		} else {
			samplesInPartition = blockSize >> partitionOrder
		}

		if (param === escapeCode) {
			// Escape: unencoded binary
			const bitsPerSample = bitReader.readBits(5)
			for (let i = 0; i < samplesInPartition; i++) {
				residual[sampleIndex++] = bitReader.readSignedBits(bitsPerSample)
			}
		} else {
			// Rice coded
			for (let i = 0; i < samplesInPartition; i++) {
				// Unary coded quotient
				let quotient = 0
				while (bitReader.readBits(1) === 0) {
					quotient++
				}

				// Binary coded remainder
				const remainder = param > 0 ? bitReader.readBits(param) : 0

				// Combine and convert from unsigned to signed
				const unsigned = (quotient << param) | remainder
				const signed = (unsigned >> 1) ^ -(unsigned & 1)

				residual[sampleIndex++] = signed
			}
		}
	}

	return residual
}

/**
 * Read UTF-8 coded number (used for frame/sample number)
 */
function readUtf8Number(bitReader: BitReader): number {
	const first = bitReader.readBits(8)

	if ((first & 0x80) === 0) {
		return first
	}

	let length = 0
	let mask = 0x40
	while ((first & mask) !== 0) {
		length++
		mask >>= 1
	}

	let value = first & (mask - 1)
	for (let i = 0; i < length; i++) {
		const byte = bitReader.readBits(8)
		if ((byte & 0xc0) !== 0x80) {
			throw new Error('Invalid UTF-8 sequence')
		}
		value = (value << 6) | (byte & 0x3f)
	}

	return value
}

/**
 * Byte reader helper
 */
class FlacReader {
	private data: Uint8Array
	position: number = 0

	constructor(data: Uint8Array) {
		this.data = data
	}

	eof(): boolean {
		return this.position >= this.data.length
	}

	skip(n: number): void {
		this.position += n
	}

	seek(pos: number): void {
		this.position = pos
	}

	readU8(): number {
		return this.data[this.position++]!
	}

	readU16BE(): number {
		const v = (this.data[this.position]! << 8) | this.data[this.position + 1]!
		this.position += 2
		return v
	}

	readU24BE(): number {
		const v = (this.data[this.position]! << 16) | (this.data[this.position + 1]! << 8) | this.data[this.position + 2]!
		this.position += 3
		return v
	}

	readU32LE(): number {
		const v =
			this.data[this.position]! |
			(this.data[this.position + 1]! << 8) |
			(this.data[this.position + 2]! << 16) |
			(this.data[this.position + 3]! << 24)
		this.position += 4
		return v >>> 0
	}

	readU64BE(): number {
		// JavaScript can't handle 64-bit integers precisely, but this is fine for our use
		const high =
			(this.data[this.position]! << 24) |
			(this.data[this.position + 1]! << 16) |
			(this.data[this.position + 2]! << 8) |
			this.data[this.position + 3]!
		const low =
			(this.data[this.position + 4]! << 24) |
			(this.data[this.position + 5]! << 16) |
			(this.data[this.position + 6]! << 8) |
			this.data[this.position + 7]!
		this.position += 8
		return high * 0x100000000 + (low >>> 0)
	}

	readBytes(n: number): Uint8Array {
		const bytes = this.data.slice(this.position, this.position + n)
		this.position += n
		return bytes
	}

	readString(n: number): string {
		let str = ''
		for (let i = 0; i < n; i++) {
			str += String.fromCharCode(this.data[this.position + i]!)
		}
		this.position += n
		return str
	}

	findSyncCode(): boolean {
		while (this.position < this.data.length - 1) {
			if (this.data[this.position] === 0xff && (this.data[this.position + 1]! & 0xfc) === 0xf8) {
				return true
			}
			this.position++
		}
		return false
	}
}

/**
 * Bit reader for frame decoding
 */
class BitReader {
	private reader: FlacReader
	private buffer: number = 0
	private bitsInBuffer: number = 0

	constructor(reader: FlacReader) {
		this.reader = reader
	}

	readBits(n: number): number {
		while (this.bitsInBuffer < n) {
			this.buffer = (this.buffer << 8) | this.reader.readU8()
			this.bitsInBuffer += 8
		}

		this.bitsInBuffer -= n
		return (this.buffer >> this.bitsInBuffer) & ((1 << n) - 1)
	}

	readSignedBits(n: number): number {
		const value = this.readBits(n)
		// Sign extend
		if (value >= 1 << (n - 1)) {
			return value - (1 << n)
		}
		return value
	}

	alignToByte(): void {
		this.bitsInBuffer = 0
	}
}

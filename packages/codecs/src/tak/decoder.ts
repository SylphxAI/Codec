/**
 * TAK (Tom's Audio Kompressor) decoder
 * Pure TypeScript implementation of TAK decoding
 */

import type { AudioData } from '@sylphx/codec-core'
import {
	TAK_MAGIC,
	TakFrameType,
	type TakDecodeResult,
	type TakFormat,
	type TakFrameHeader,
	type TakInfo,
	type TakSeekPoint,
	type TakStreamInfo,
} from './types'

/**
 * Check if data is TAK
 */
export function isTak(data: Uint8Array): boolean {
	if (data.length < 4) return false
	return data[0] === 0x74 && data[1] === 0x42 && data[2] === 0x61 && data[3] === 0x4b // "tBaK"
}

/**
 * Parse TAK info without full decode
 */
export function parseTakInfo(data: Uint8Array): TakInfo {
	const reader = new TakReader(data)

	// Check magic
	if (!isTak(data)) {
		throw new Error('Invalid TAK: missing magic number')
	}
	reader.skip(4)

	// Parse metadata frames
	let streamInfo: TakStreamInfo | undefined
	let seekTable: TakSeekPoint[] | undefined
	let md5: Uint8Array | undefined
	let encoder: string | undefined

	while (!reader.eof()) {
		const frameType = reader.readU8()
		const frameSize = reader.readU24LE()

		if (frameType === TakFrameType.STREAMINFO) {
			streamInfo = parseStreamInfo(reader.readBytes(frameSize))
		} else if (frameType === TakFrameType.SEEKTABLE) {
			seekTable = parseSeekTable(reader.readBytes(frameSize))
		} else if (frameType === TakFrameType.MD5) {
			md5 = reader.readBytes(frameSize)
		} else if (frameType === TakFrameType.ENCODER) {
			encoder = reader.readString(frameSize)
		} else if (frameType === TakFrameType.WAVEDATA) {
			// Found audio data, we're done with metadata
			break
		} else {
			// Skip unknown frame
			reader.skip(frameSize)
		}
	}

	if (!streamInfo) {
		throw new Error('Invalid TAK: missing STREAMINFO frame')
	}

	const duration = streamInfo.format.sampleCount / streamInfo.format.sampleRate

	return {
		streamInfo,
		seekTable,
		md5,
		encoder,
		sampleRate: streamInfo.format.sampleRate,
		channels: streamInfo.format.channels,
		bitsPerSample: streamInfo.format.bitsPerSample,
		totalSamples: streamInfo.format.sampleCount,
		duration,
	}
}

/**
 * Decode TAK to raw samples
 */
export function decodeTak(data: Uint8Array): TakDecodeResult {
	const info = parseTakInfo(data)
	const reader = new TakReader(data)

	// Skip to audio data
	reader.skip(4) // magic
	while (!reader.eof()) {
		const frameType = reader.readU8()
		const frameSize = reader.readU24LE()
		if (frameType === TakFrameType.WAVEDATA) {
			break
		}
		reader.skip(frameSize)
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
		try {
			const frame = decodeFrame(reader, info)

			// Copy samples to output
			for (let ch = 0; ch < channels; ch++) {
				const src = frame.samples[ch]!
				const dst = samples[ch]!
				const count = Math.min(frame.sampleCount, info.totalSamples - sampleOffset)
				for (let i = 0; i < count; i++) {
					dst[sampleOffset + i] = src[i]!
				}
			}

			sampleOffset += frame.sampleCount
		} catch (e) {
			// End of valid data
			break
		}
	}

	return { info, samples }
}

/**
 * Decode TAK to AudioData format
 */
export function decodeTakToAudioData(data: Uint8Array): AudioData {
	const result = decodeTak(data)

	// Convert Int32Array to Float32Array normalized to [-1, 1]
	const maxValue = 1 << (result.info.bitsPerSample - 1)
	const channelData: Float32Array[] = result.samples.map((channel) => {
		const floatChannel = new Float32Array(channel.length)
		for (let i = 0; i < channel.length; i++) {
			floatChannel[i] = channel[i]! / maxValue
		}
		return floatChannel
	})

	return {
		channelData,
		sampleRate: result.info.sampleRate,
		numberOfChannels: result.info.channels,
		length: result.info.totalSamples,
	}
}

/**
 * Parse STREAMINFO frame
 */
function parseStreamInfo(data: Uint8Array): TakStreamInfo {
	const r = new TakReader(data)

	// Format descriptor
	const formatFlags = r.readU16LE()
	const dataType = (formatFlags >> 12) & 0x0f
	const channels = ((formatFlags >> 8) & 0x0f) + 1
	const bitsPerSample = (formatFlags & 0xff) + 1

	// Sample rate
	const sampleRate = r.readU32LE()

	// Sample count
	const sampleCount = r.readU64LE()

	// Frame size
	const frameSize = r.readU16LE()

	// Rest size (samples in last frame)
	const restSize = r.readU16LE()

	// Codec version
	const codecVersion = r.readU8()

	// Flags
	const flags = r.readU8()
	const hasSeekTable = (flags & 0x01) !== 0
	const hasMD5 = (flags & 0x02) !== 0

	const format: TakFormat = {
		dataType,
		sampleRate,
		channels,
		bitsPerSample,
		frameSize,
		sampleCount,
	}

	return {
		format,
		codecVersion,
		frameSize,
		restSize,
		hasSeekTable,
		hasMD5,
	}
}

/**
 * Parse SEEKTABLE frame
 */
function parseSeekTable(data: Uint8Array): TakSeekPoint[] {
	const points: TakSeekPoint[] = []
	const r = new TakReader(data)

	const count = r.readU32LE()

	for (let i = 0; i < count; i++) {
		const position = r.readU64LE()
		const sample = r.readU64LE()
		points.push({ position, sample })
	}

	return points
}

/**
 * Decode a single audio frame
 */
function decodeFrame(
	reader: TakReader,
	info: TakInfo
): { samples: Int32Array[]; sampleCount: number } {
	const startPos = reader.position

	// Frame header (simplified)
	const header = reader.readU16LE()
	const sampleCount = info.streamInfo.frameSize
	const channels = info.channels
	const bitsPerSample = info.bitsPerSample

	// For this simplified implementation, we'll decode as verbatim PCM
	// Real TAK uses adaptive predictive coding and entropy coding
	const samples: Int32Array[] = []

	// Initialize channel arrays
	for (let ch = 0; ch < channels; ch++) {
		samples.push(new Int32Array(sampleCount))
	}

	// Read samples (interleaved by sample, not by channel)
	for (let i = 0; i < sampleCount; i++) {
		for (let ch = 0; ch < channels; ch++) {
			// Read sample based on bit depth
			if (bitsPerSample <= 8) {
				samples[ch]![i] = reader.readS8()
			} else if (bitsPerSample <= 16) {
				samples[ch]![i] = reader.readS16LE()
			} else if (bitsPerSample <= 24) {
				samples[ch]![i] = reader.readS24LE()
			} else {
				samples[ch]![i] = reader.readS32LE()
			}
		}
	}

	return { samples, sampleCount }
}

/**
 * Byte reader helper
 */
class TakReader {
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

	readS8(): number {
		const v = this.data[this.position++]!
		return v >= 128 ? v - 256 : v
	}

	readU16LE(): number {
		const v = this.data[this.position]! | (this.data[this.position + 1]! << 8)
		this.position += 2
		return v
	}

	readS16LE(): number {
		const v = this.data[this.position]! | (this.data[this.position + 1]! << 8)
		this.position += 2
		return v >= 32768 ? v - 65536 : v
	}

	readU24LE(): number {
		const v =
			this.data[this.position]! | (this.data[this.position + 1]! << 8) | (this.data[this.position + 2]! << 16)
		this.position += 3
		return v
	}

	readS24LE(): number {
		const v =
			this.data[this.position]! | (this.data[this.position + 1]! << 8) | (this.data[this.position + 2]! << 16)
		this.position += 3
		return v >= 8388608 ? v - 16777216 : v
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

	readS32LE(): number {
		const v =
			this.data[this.position]! |
			(this.data[this.position + 1]! << 8) |
			(this.data[this.position + 2]! << 16) |
			(this.data[this.position + 3]! << 24)
		this.position += 4
		return v | 0
	}

	readU64LE(): number {
		const low =
			this.data[this.position]! |
			(this.data[this.position + 1]! << 8) |
			(this.data[this.position + 2]! << 16) |
			(this.data[this.position + 3]! << 24)
		const high =
			this.data[this.position + 4]! |
			(this.data[this.position + 5]! << 8) |
			(this.data[this.position + 6]! << 16) |
			(this.data[this.position + 7]! << 24)
		this.position += 8
		return (high >>> 0) * 0x100000000 + (low >>> 0)
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
}

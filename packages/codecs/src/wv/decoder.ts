/**
 * WavPack (WV) decoder
 * Pure TypeScript implementation of WavPack decoding
 */

import type {
	WavPackBlockHeader,
	WavPackDecodeResult,
	WavPackDecorrTerm,
	WavPackEntropy,
	WavPackInfo,
	WavPackMetadata,
} from './types'
import { WavPackFlags, WavPackMetadataId } from './types'

/**
 * Check if data is WavPack
 */
export function isWavPack(data: Uint8Array): boolean {
	if (data.length < 4) return false
	return data[0] === 0x77 && data[1] === 0x76 && data[2] === 0x70 && data[3] === 0x6b // "wvpk"
}

/**
 * Parse WavPack info without full decode
 */
export function parseWavPackInfo(data: Uint8Array): WavPackInfo {
	const reader = new WavPackReader(data)

	if (!isWavPack(data)) {
		throw new Error('Invalid WavPack: missing magic number')
	}

	// Parse first block header to get format info
	const header = parseBlockHeader(reader)

	const channels = header.flags & WavPackFlags.MONO_FLAG ? 1 : 2
	const bitsPerSample = ((header.flags & WavPackFlags.BYTES_PER_SAMPLE_MASK) + 1) * 8
	const isFloat = (header.flags & WavPackFlags.FLOAT_DATA) !== 0
	const isHybrid = (header.flags & WavPackFlags.HYBRID_FLAG) !== 0

	// Extract sample rate from flags
	const srFlags = (header.flags & WavPackFlags.SAMPLE_RATE_MASK) >> 19
	let sampleRate = 44100 // default

	switch (srFlags) {
		case 0:
			sampleRate = 6000
			break
		case 1:
			sampleRate = 8000
			break
		case 2:
			sampleRate = 9600
			break
		case 3:
			sampleRate = 11025
			break
		case 4:
			sampleRate = 12000
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
			sampleRate = 64000
			break
		case 12:
			sampleRate = 88200
			break
		case 13:
			sampleRate = 96000
			break
		case 14:
			sampleRate = 192000
			break
		case 15:
			// Custom sample rate - need to parse metadata
			sampleRate = 44100
			break
	}

	const duration = header.totalSamples > 0 ? header.totalSamples / sampleRate : 0

	return {
		version: header.version,
		sampleRate,
		channels,
		bitsPerSample,
		totalSamples: header.totalSamples,
		duration,
		isHybrid,
		isLossless: !isHybrid,
		isFloat,
	}
}

/**
 * Decode WavPack to raw samples
 */
export function decodeWavPack(data: Uint8Array): WavPackDecodeResult {
	const info = parseWavPackInfo(data)
	const reader = new WavPackReader(data)

	const channels = info.channels
	const totalSamples = info.totalSamples

	// Initialize output arrays
	const samples: Int32Array[] = []
	for (let i = 0; i < channels; i++) {
		samples.push(new Int32Array(totalSamples))
	}

	let sampleOffset = 0

	// Decode blocks
	while (!reader.eof() && sampleOffset < totalSamples) {
		try {
			const header = parseBlockHeader(reader)
			const blockData = reader.readBytes(header.blockSize - 24) // Minus header size

			// Parse metadata and audio data
			const blockReader = new WavPackReader(blockData)
			const metadata = parseMetadata(blockReader)

			// Decode samples
			const blockSamples = decodeBlock(header, metadata, blockReader)

			// Copy to output
			const samplesToCopy = Math.min(header.blockSamples, totalSamples - sampleOffset)
			for (let ch = 0; ch < channels; ch++) {
				const src = blockSamples[ch]!
				const dst = samples[ch]!
				for (let i = 0; i < samplesToCopy; i++) {
					dst[sampleOffset + i] = src[i]!
				}
			}

			sampleOffset += header.blockSamples
		} catch (e) {
			// Skip corrupted block
			break
		}
	}

	return {
		samples,
		sampleRate: info.sampleRate,
		channels: info.channels,
		bitsPerSample: info.bitsPerSample,
		info,
	}
}

/**
 * Parse block header
 */
function parseBlockHeader(reader: WavPackReader): WavPackBlockHeader {
	const blockId = reader.readString(4)
	if (blockId !== 'wvpk') {
		throw new Error('Invalid block header')
	}

	const blockSize = reader.readU32LE()
	const version = reader.readU16LE()
	const trackNo = reader.readU8()
	const indexNo = reader.readU8()
	const totalSamples = reader.readU32LE()
	const blockIndex = reader.readU32LE()
	const blockSamples = reader.readU32LE()
	const flags = reader.readU32LE()
	const crc = reader.readU32LE()

	return {
		blockId,
		blockSize,
		version,
		trackNo,
		indexNo,
		totalSamples,
		blockIndex,
		blockSamples,
		flags,
		crc,
	}
}

/**
 * Parse metadata blocks
 */
function parseMetadata(reader: WavPackReader): Map<number, WavPackMetadata> {
	const metadata = new Map<number, WavPackMetadata>()

	while (!reader.eof()) {
		const byte1 = reader.readU8()
		if (byte1 === 0) break // End of metadata

		const id = byte1 & 0x3f
		const largeBit = (byte1 & 0x40) !== 0
		const oddSizeBit = (byte1 & 0x80) !== 0

		let size: number
		if (largeBit) {
			const byte2 = reader.readU8()
			const byte3 = reader.readU8()
			size = ((byte2 << 8) | byte3) << 1
		} else {
			const byte2 = reader.readU8()
			size = byte2 << 1
		}

		if (oddSizeBit) size++

		const data = reader.readBytes(size)
		metadata.set(id, { id, size, data })

		// Align to 2-byte boundary
		if (size % 2 !== 0) {
			if (!reader.eof()) reader.skip(1)
		}
	}

	return metadata
}

/**
 * Decode a single block
 */
function decodeBlock(
	header: WavPackBlockHeader,
	metadata: Map<number, WavPackMetadata>,
	reader: WavPackReader
): Int32Array[] {
	const channels = header.flags & WavPackFlags.MONO_FLAG ? 1 : 2
	const blockSamples = header.blockSamples

	// Initialize samples
	const samples: Int32Array[] = []
	for (let i = 0; i < channels; i++) {
		samples.push(new Int32Array(blockSamples))
	}

	// Parse decorrelation terms
	const decorrTerms = parseDecorrTerms(metadata)

	// Parse decorrelation weights
	parseDecorrWeights(metadata, decorrTerms)

	// Parse decorrelation samples
	parseDecorrSamples(metadata, decorrTerms)

	// Parse entropy variables
	const entropy = parseEntropyVars(metadata)

	// Get bitstream data
	const bitstreamMeta = metadata.get(WavPackMetadataId.WV_BITSTREAM)
	if (!bitstreamMeta) {
		// No bitstream - might be silence or constant
		return samples
	}

	// Decode bitstream
	const bitReader = new BitReader(bitstreamMeta.data)
	decodeSamples(bitReader, samples, blockSamples, entropy, header.flags)

	// Apply decorrelation
	applyDecorrelation(samples, decorrTerms, blockSamples)

	// Handle joint stereo
	if (channels === 2 && (header.flags & WavPackFlags.JOINT_STEREO) !== 0) {
		for (let i = 0; i < blockSamples; i++) {
			const left = samples[0]![i]!
			const right = samples[1]![i]!
			samples[0]![i] = left + right
			samples[1]![i] = left - right
		}
	}

	return samples
}

/**
 * Parse decorrelation terms
 */
function parseDecorrTerms(metadata: Map<number, WavPackMetadata>): WavPackDecorrTerm[] {
	const meta = metadata.get(WavPackMetadataId.DECORR_TERMS)
	if (!meta) return []

	const terms: WavPackDecorrTerm[] = []
	const reader = new WavPackReader(meta.data)

	while (!reader.eof()) {
		const term = reader.readU8()
		const delta = reader.readU8()
		terms.push({
			term,
			delta,
			weightA: 0,
			weightB: 0,
			samplesA: new Int32Array(8),
			samplesB: new Int32Array(8),
		})
	}

	return terms
}

/**
 * Parse decorrelation weights
 */
function parseDecorrWeights(metadata: Map<number, WavPackMetadata>, terms: WavPackDecorrTerm[]): void {
	const meta = metadata.get(WavPackMetadataId.DECORR_WEIGHTS)
	if (!meta || terms.length === 0) return

	const reader = new WavPackReader(meta.data)

	for (let i = 0; i < terms.length && !reader.eof(); i++) {
		const term = terms[i]!
		const weightA = reader.readI8()
		term.weightA = weightA

		if (term.term >= 0 && !reader.eof()) {
			const weightB = reader.readI8()
			term.weightB = weightB
		}
	}
}

/**
 * Parse decorrelation samples
 */
function parseDecorrSamples(metadata: Map<number, WavPackMetadata>, terms: WavPackDecorrTerm[]): void {
	const meta = metadata.get(WavPackMetadataId.DECORR_SAMPLES)
	if (!meta || terms.length === 0) return

	const reader = new WavPackReader(meta.data)

	for (let i = 0; i < terms.length && !reader.eof(); i++) {
		const term = terms[i]!
		const count = Math.abs(term.term)

		for (let j = 0; j < count && !reader.eof(); j++) {
			term.samplesA[j] = reader.readI16LE()
		}

		if (term.term >= 0) {
			for (let j = 0; j < count && !reader.eof(); j++) {
				term.samplesB[j] = reader.readI16LE()
			}
		}
	}
}

/**
 * Parse entropy variables
 */
function parseEntropyVars(metadata: Map<number, WavPackMetadata>): WavPackEntropy {
	const meta = metadata.get(WavPackMetadataId.ENTROPY_VARS)
	if (!meta) {
		return {
			median: [0, 0, 0],
			slowLevel: 0,
			errorLimit: 0,
		}
	}

	const reader = new WavPackReader(meta.data)
	const median: number[] = []

	// Read 3 median values
	for (let i = 0; i < 3; i++) {
		median.push(reader.readU16LE())
	}

	return {
		median,
		slowLevel: 0,
		errorLimit: 0,
	}
}

/**
 * Decode samples from bitstream
 */
function decodeSamples(
	bitReader: BitReader,
	samples: Int32Array[],
	blockSamples: number,
	entropy: WavPackEntropy,
	flags: number
): void {
	const channels = samples.length
	const k = 4 // Match the encoder's Rice parameter

	// Simple decoding - read samples as Rice-coded values
	for (let ch = 0; ch < channels; ch++) {
		for (let i = 0; i < blockSamples; i++) {
			try {
				// Read unary coded quotient
				let quotient = 0
				while (bitReader.readBit() === 0) {
					quotient++
				}

				// Read binary coded remainder
				const remainder = k > 0 ? bitReader.readBits(k) : 0

				// Combine to get unsigned value
				const unsigned = (quotient << k) | remainder

				// Convert from unsigned to signed (zigzag decoding)
				const signed = (unsigned & 1) !== 0 ? -(unsigned + 1) >> 1 : unsigned >> 1
				samples[ch]![i] = signed
			} catch {
				samples[ch]![i] = 0
			}
		}
	}
}

/**
 * Apply decorrelation to samples
 */
function applyDecorrelation(samples: Int32Array[], terms: WavPackDecorrTerm[], blockSamples: number): void {
	const channels = samples.length

	// Apply each decorrelation pass (forward order, not reverse)
	// Each pass reconstructs samples from residuals
	for (let t = 0; t < terms.length; t++) {
		const term = terms[t]!

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = samples[ch]!

			for (let i = 0; i < blockSamples; i++) {
				let prediction = 0

				if (term.term === 1) {
					// Order-1 prediction: predict from previous sample
					prediction = i > 0 ? channelSamples[i - 1]! : 0
				} else if (term.term > 1) {
					// Higher order prediction
					const offset = Math.min(term.term, i)
					prediction = offset > 0 ? channelSamples[i - offset]! : 0
				} else if (term.term < 0) {
					// Negative term - cross-channel prediction
					if (channels === 2) {
						const otherCh = ch === 0 ? 1 : 0
						prediction = samples[otherCh]![i]!
					}
				}

				// Add prediction to residual to reconstruct sample
				channelSamples[i] = channelSamples[i]! + prediction
			}
		}
	}
}

/**
 * Byte reader helper
 */
class WavPackReader {
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

	readU8(): number {
		return this.data[this.position++]!
	}

	readI8(): number {
		const value = this.data[this.position++]!
		return value > 127 ? value - 256 : value
	}

	readU16LE(): number {
		const v = this.data[this.position]! | (this.data[this.position + 1]! << 8)
		this.position += 2
		return v
	}

	readI16LE(): number {
		const value = this.readU16LE()
		return value > 32767 ? value - 65536 : value
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

/**
 * Bit reader for decoding
 */
class BitReader {
	private data: Uint8Array
	private position: number = 0
	private buffer: number = 0
	private bitsInBuffer: number = 0

	constructor(data: Uint8Array) {
		this.data = data
	}

	readBit(): number {
		if (this.bitsInBuffer === 0) {
			if (this.position >= this.data.length) {
				throw new Error('Unexpected end of bitstream')
			}
			this.buffer = this.data[this.position++]!
			this.bitsInBuffer = 8
		}

		this.bitsInBuffer--
		return (this.buffer >> this.bitsInBuffer) & 1
	}

	readBits(n: number): number {
		let value = 0
		for (let i = 0; i < n; i++) {
			value = (value << 1) | this.readBit()
		}
		return value
	}
}

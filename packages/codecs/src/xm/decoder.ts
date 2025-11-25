/**
 * XM (Extended Module / FastTracker 2) decoder
 * Pure TypeScript implementation of XM decoding
 */

import type {
	XMEnvelope,
	XMEnvelopePoint,
	XMFile,
	XMInfo,
	XMInstrument,
	XMNote,
	XMPattern,
	XMSample,
} from './types'
import { XM_MAGIC } from './types'

/**
 * Check if data is an XM file
 */
export function isXM(data: Uint8Array): boolean {
	if (data.length < 60) return false

	// Check for "Extended Module: " magic (17 bytes)
	const magic = new TextDecoder('ascii').decode(data.slice(0, 17))
	return magic === XM_MAGIC
}

/**
 * Parse XM info without full decode
 */
export function parseXMInfo(data: Uint8Array): XMInfo {
	if (!isXM(data)) {
		throw new Error('Invalid XM file: missing magic number')
	}

	const reader = new XMReader(data)

	// Skip magic
	reader.skip(17)

	// Read module name (20 bytes)
	const name = reader.readString(20)

	// Skip 0x1A separator
	reader.skip(1)

	// Read tracker name (20 bytes)
	const trackerName = reader.readString(20)

	// Read version (word)
	const version = reader.readU16LE()

	// Read header size
	const headerSize = reader.readU32LE()

	// Read song length
	const songLength = reader.readU16LE()

	// Skip restart position
	reader.skip(2)

	// Read number of channels
	const numChannels = reader.readU16LE()

	// Read number of patterns
	const numPatterns = reader.readU16LE()

	// Read number of instruments
	const numInstruments = reader.readU16LE()

	// Skip flags
	reader.skip(2)

	// Read default tempo
	const defaultTempo = reader.readU16LE()

	// Read default BPM
	const defaultBPM = reader.readU16LE()

	// Calculate estimated duration
	// Rough estimate: rows per pattern * patterns / (BPM / 2.5)
	const avgRowsPerPattern = 64
	const totalRows = songLength * avgRowsPerPattern
	const rowsPerSecond = (defaultBPM * defaultTempo) / 60 / 24
	const duration = totalRows / rowsPerSecond

	return {
		name,
		trackerName,
		version,
		songLength,
		numChannels,
		numPatterns,
		numInstruments,
		defaultTempo,
		defaultBPM,
		duration,
		totalSamples: 0, // Would need full parse to count
	}
}

/**
 * Decode XM file
 */
export function decodeXM(data: Uint8Array): XMFile {
	if (!isXM(data)) {
		throw new Error('Invalid XM file: missing magic number')
	}

	const reader = new XMReader(data)

	// Skip magic (17 bytes)
	reader.skip(17)

	// Read module name (20 bytes)
	const name = reader.readString(20)

	// Skip 0x1A separator
	reader.skip(1)

	// Read tracker name (20 bytes)
	const trackerName = reader.readString(20)

	// Read version (word)
	const version = reader.readU16LE()

	// Read header size
	const headerSize = reader.readU32LE()

	// Read song length
	const songLength = reader.readU16LE()

	// Read restart position
	const restartPosition = reader.readU16LE()

	// Read number of channels
	const numChannels = reader.readU16LE()

	// Read number of patterns
	const numPatterns = reader.readU16LE()

	// Read number of instruments
	const numInstruments = reader.readU16LE()

	// Read flags
	const flags = reader.readU16LE()

	// Read default tempo
	const defaultTempo = reader.readU16LE()

	// Read default BPM
	const defaultBPM = reader.readU16LE()

	// Read pattern order table (256 bytes)
	const patternOrder: number[] = []
	for (let i = 0; i < 256; i++) {
		patternOrder.push(reader.readU8())
	}

	// Parse patterns
	const patterns: XMPattern[] = []
	for (let i = 0; i < numPatterns; i++) {
		patterns.push(parsePattern(reader, numChannels))
	}

	// Parse instruments
	const instruments: XMInstrument[] = []
	for (let i = 0; i < numInstruments; i++) {
		instruments.push(parseInstrument(reader))
	}

	return {
		name,
		trackerName,
		version,
		headerSize,
		songLength,
		restartPosition,
		numChannels,
		numPatterns,
		numInstruments,
		flags,
		defaultTempo,
		defaultBPM,
		patternOrder,
		patterns,
		instruments,
	}
}

/**
 * Parse a single pattern
 */
function parsePattern(reader: XMReader, numChannels: number): XMPattern {
	// Read pattern header length
	const headerLength = reader.readU32LE()

	// Read packing type (always 0)
	const packingType = reader.readU8()

	// Read number of rows
	const rows = reader.readU16LE()

	// Read packed pattern data size
	const packedDataSize = reader.readU16LE()

	// Initialize pattern data
	const data: XMNote[][] = []
	for (let row = 0; row < rows; row++) {
		data[row] = []
		for (let ch = 0; ch < numChannels; ch++) {
			data[row]![ch] = {
				note: 0,
				instrument: 0,
				volume: 0,
				effectType: 0,
				effectParam: 0,
			}
		}
	}

	// Parse pattern data
	if (packedDataSize > 0) {
		for (let row = 0; row < rows; row++) {
			for (let ch = 0; ch < numChannels; ch++) {
				const note = data[row]![ch]!
				const pack = reader.readU8()

				if (pack & 0x80) {
					// Packed note
					if (pack & 0x01) note.note = reader.readU8()
					if (pack & 0x02) note.instrument = reader.readU8()
					if (pack & 0x04) note.volume = reader.readU8()
					if (pack & 0x08) note.effectType = reader.readU8()
					if (pack & 0x10) note.effectParam = reader.readU8()
				} else {
					// Unpacked note (pack byte is the note)
					note.note = pack
					note.instrument = reader.readU8()
					note.volume = reader.readU8()
					note.effectType = reader.readU8()
					note.effectParam = reader.readU8()
				}
			}
		}
	}

	return { rows, data }
}

/**
 * Parse a single instrument
 */
function parseInstrument(reader: XMReader): XMInstrument {
	// Read instrument header size
	const instrumentSize = reader.readU32LE()

	// Read instrument name (22 bytes)
	const name = reader.readString(22)

	// Read instrument type (always 0)
	const type = reader.readU8()

	// Read number of samples
	const numSamples = reader.readU16LE()

	// Default values
	let sampleHeaderSize = 0
	let sampleForNote: number[] = []
	let volumeEnvelope: XMEnvelope = createEmptyEnvelope()
	let panningEnvelope: XMEnvelope = createEmptyEnvelope()
	let vibratoType = 0
	let vibratoSweep = 0
	let vibratoDepth = 0
	let vibratoRate = 0
	let volumeFadeout = 0

	if (numSamples > 0) {
		// Read sample header size
		sampleHeaderSize = reader.readU32LE()

		// Read sample number for all notes (96 bytes)
		sampleForNote = []
		for (let i = 0; i < 96; i++) {
			sampleForNote.push(reader.readU8())
		}

		// Read volume envelope (48 bytes: 12 points × 4 bytes)
		volumeEnvelope = parseEnvelope(reader)

		// Read panning envelope (48 bytes: 12 points × 4 bytes)
		panningEnvelope = parseEnvelope(reader)

		// Read vibrato settings
		vibratoType = reader.readU8()
		vibratoSweep = reader.readU8()
		vibratoDepth = reader.readU8()
		vibratoRate = reader.readU8()

		// Read volume fadeout
		volumeFadeout = reader.readU16LE()

		// Skip reserved bytes (11 bytes)
		reader.skip(11)
	} else {
		// No samples, skip remaining header
		const remaining = instrumentSize - 29
		reader.skip(remaining)
	}

	// Parse samples
	const samples: XMSample[] = []
	for (let i = 0; i < numSamples; i++) {
		samples.push(parseSampleHeader(reader))
	}

	// Read sample data
	for (const sample of samples) {
		parseSampleData(reader, sample)
	}

	return {
		name,
		type,
		numSamples,
		sampleHeaderSize,
		sampleForNote,
		volumeEnvelope,
		panningEnvelope,
		vibratoType,
		vibratoSweep,
		vibratoDepth,
		vibratoRate,
		volumeFadeout,
		samples,
	}
}

/**
 * Parse envelope
 */
function parseEnvelope(reader: XMReader): XMEnvelope {
	// Read 12 points (48 bytes total)
	const points: XMEnvelopePoint[] = []
	for (let i = 0; i < 12; i++) {
		const frame = reader.readU16LE()
		const value = reader.readU16LE()
		points.push({ frame, value })
	}

	// Read number of points
	const numPoints = reader.readU8()

	// Read sustain point
	const sustainPoint = reader.readU8()

	// Read loop start point
	const loopStartPoint = reader.readU8()

	// Read loop end point
	const loopEndPoint = reader.readU8()

	// Read type
	const type = reader.readU8()

	// Skip reserved (3 bytes)
	reader.skip(3)

	return {
		type,
		numPoints,
		sustainPoint,
		loopStartPoint,
		loopEndPoint,
		points: points.slice(0, numPoints),
	}
}

/**
 * Parse sample header
 */
function parseSampleHeader(reader: XMReader): XMSample {
	// Read sample length
	const length = reader.readU32LE()

	// Read loop start
	const loopStart = reader.readU32LE()

	// Read loop length
	const loopLength = reader.readU32LE()

	// Read volume
	const volume = reader.readU8()

	// Read finetune
	const finetune = reader.readI8()

	// Read type
	const type = reader.readU8()

	// Read panning
	const panning = reader.readU8()

	// Read relative note
	const relativeNote = reader.readI8()

	// Skip reserved
	reader.skip(1)

	// Read sample name (22 bytes)
	const name = reader.readString(22)

	const is16Bit = (type & 0x10) !== 0

	return {
		length,
		loopStart,
		loopLength,
		volume,
		finetune,
		type,
		panning,
		relativeNote,
		name,
		data: is16Bit ? new Int16Array(0) : new Int8Array(0),
	}
}

/**
 * Parse sample data
 */
function parseSampleData(reader: XMReader, sample: XMSample): void {
	if (sample.length === 0) return

	const is16Bit = (sample.type & 0x10) !== 0

	if (is16Bit) {
		// 16-bit sample
		const numSamples = sample.length / 2
		const data = new Int16Array(numSamples)
		let old = 0
		for (let i = 0; i < numSamples; i++) {
			const delta = reader.readI16LE()
			old = (old + delta) & 0xffff
			data[i] = old > 32767 ? old - 65536 : old
		}
		sample.data = data
	} else {
		// 8-bit sample
		const data = new Int8Array(sample.length)
		let old = 0
		for (let i = 0; i < sample.length; i++) {
			const delta = reader.readI8()
			old = (old + delta) & 0xff
			data[i] = old > 127 ? old - 256 : old
		}
		sample.data = data
	}
}

/**
 * Create empty envelope
 */
function createEmptyEnvelope(): XMEnvelope {
	return {
		type: 0,
		numPoints: 0,
		sustainPoint: 0,
		loopStartPoint: 0,
		loopEndPoint: 0,
		points: [],
	}
}

/**
 * XM file reader helper
 */
class XMReader {
	private offset = 0

	constructor(private data: Uint8Array) {}

	readU8(): number {
		return this.data[this.offset++]!
	}

	readI8(): number {
		const val = this.data[this.offset++]!
		return val > 127 ? val - 256 : val
	}

	readU16LE(): number {
		const val = this.data[this.offset]! | (this.data[this.offset + 1]! << 8)
		this.offset += 2
		return val
	}

	readI16LE(): number {
		const val = this.data[this.offset]! | (this.data[this.offset + 1]! << 8)
		this.offset += 2
		return val > 32767 ? val - 65536 : val
	}

	readU32LE(): number {
		const val =
			(this.data[this.offset]! |
				(this.data[this.offset + 1]! << 8) |
				(this.data[this.offset + 2]! << 16) |
				(this.data[this.offset + 3]! << 24)) >>>
			0
		this.offset += 4
		return val
	}

	readString(length: number): string {
		const bytes = this.data.slice(this.offset, this.offset + length)
		this.offset += length
		// Trim null bytes and whitespace
		const nullIndex = bytes.indexOf(0)
		const trimmed = nullIndex >= 0 ? bytes.slice(0, nullIndex) : bytes
		return new TextDecoder('ascii').decode(trimmed).trim()
	}

	skip(bytes: number): void {
		this.offset += bytes
	}

	eof(): boolean {
		return this.offset >= this.data.length
	}

	getOffset(): number {
		return this.offset
	}
}

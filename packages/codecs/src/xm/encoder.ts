/**
 * XM (Extended Module / FastTracker 2) encoder
 * Pure TypeScript implementation of XM encoding
 */

import type {
	XMEncodeOptions,
	XMEnvelope,
	XMFile,
	XMInstrument,
	XMPattern,
	XMSample,
} from './types'
import { XM_MAGIC } from './types'

/**
 * Encode XM file
 */
export function encodeXM(file: XMFile, options: XMEncodeOptions = {}): Uint8Array {
	const chunks: Uint8Array[] = []

	// Encode header
	chunks.push(encodeHeader(file))

	// Encode patterns
	for (const pattern of file.patterns) {
		chunks.push(encodePattern(pattern, file.numChannels))
	}

	// Encode instruments
	for (const instrument of file.instruments) {
		chunks.push(encodeInstrument(instrument))
	}

	return concatArrays(chunks)
}

/**
 * Create a simple XM file from basic parameters
 */
export function createSimpleXM(options: XMEncodeOptions = {}): Uint8Array {
	const name = options.name ?? 'Untitled'
	const tempo = options.tempo ?? 6
	const bpm = options.bpm ?? 125
	const channels = options.channels ?? 4

	// Create an empty pattern (64 rows)
	const pattern: XMPattern = {
		rows: 64,
		data: [],
	}

	for (let row = 0; row < 64; row++) {
		pattern.data[row] = []
		for (let ch = 0; ch < channels; ch++) {
			pattern.data[row]![ch] = {
				note: 0,
				instrument: 0,
				volume: 0,
				effectType: 0,
				effectParam: 0,
			}
		}
	}

	// Create pattern order
	const patternOrder: number[] = new Array(256).fill(0)
	patternOrder[0] = 0

	const file: XMFile = {
		name: name.slice(0, 20),
		trackerName: 'FastTracker v2.00   ',
		version: 0x0104,
		headerSize: 276,
		songLength: 1,
		restartPosition: 0,
		numChannels: channels,
		numPatterns: 1,
		numInstruments: 0,
		flags: 1, // Linear frequency table
		defaultTempo: tempo,
		defaultBPM: bpm,
		patternOrder,
		patterns: [pattern],
		instruments: [],
	}

	return encodeXM(file)
}

/**
 * Encode header
 */
function encodeHeader(file: XMFile): Uint8Array {
	const writer = new XMWriter()

	// Write magic (17 bytes)
	writer.writeString(XM_MAGIC, 17)

	// Write module name (20 bytes)
	writer.writeString(file.name, 20)

	// Write 0x1A separator
	writer.writeU8(0x1a)

	// Write tracker name (20 bytes)
	writer.writeString(file.trackerName, 20)

	// Write version
	writer.writeU16LE(file.version)

	// Write header size
	writer.writeU32LE(file.headerSize)

	// Write song length
	writer.writeU16LE(file.songLength)

	// Write restart position
	writer.writeU16LE(file.restartPosition)

	// Write number of channels
	writer.writeU16LE(file.numChannels)

	// Write number of patterns
	writer.writeU16LE(file.numPatterns)

	// Write number of instruments
	writer.writeU16LE(file.numInstruments)

	// Write flags
	writer.writeU16LE(file.flags)

	// Write default tempo
	writer.writeU16LE(file.defaultTempo)

	// Write default BPM
	writer.writeU16LE(file.defaultBPM)

	// Write pattern order table (256 bytes)
	for (let i = 0; i < 256; i++) {
		writer.writeU8(file.patternOrder[i] ?? 0)
	}

	return writer.toArray()
}

/**
 * Encode pattern
 */
function encodePattern(pattern: XMPattern, numChannels: number): Uint8Array {
	// Encode pattern data first to get size
	const patternData = encodePatternData(pattern, numChannels)

	const writer = new XMWriter()

	// Write pattern header length (always 9)
	writer.writeU32LE(9)

	// Write packing type (always 0)
	writer.writeU8(0)

	// Write number of rows
	writer.writeU16LE(pattern.rows)

	// Write packed pattern data size
	writer.writeU16LE(patternData.length)

	// Append pattern data
	writer.writeBytes(patternData)

	return writer.toArray()
}

/**
 * Encode pattern data with packing
 */
function encodePatternData(pattern: XMPattern, numChannels: number): Uint8Array {
	const writer = new XMWriter()

	for (let row = 0; row < pattern.rows; row++) {
		for (let ch = 0; ch < numChannels; ch++) {
			const note = pattern.data[row]?.[ch] ?? {
				note: 0,
				instrument: 0,
				volume: 0,
				effectType: 0,
				effectParam: 0,
			}

			// Check if we should pack
			const hasNote = note.note !== 0
			const hasInstrument = note.instrument !== 0
			const hasVolume = note.volume !== 0
			const hasEffect = note.effectType !== 0 || note.effectParam !== 0

			if (!hasNote && !hasInstrument && !hasVolume && !hasEffect) {
				// Empty note - write packed byte
				writer.writeU8(0x80)
			} else {
				// Packed note
				let pack = 0x80
				if (hasNote) pack |= 0x01
				if (hasInstrument) pack |= 0x02
				if (hasVolume) pack |= 0x04
				if (hasEffect) pack |= 0x08 | 0x10

				writer.writeU8(pack)
				if (hasNote) writer.writeU8(note.note)
				if (hasInstrument) writer.writeU8(note.instrument)
				if (hasVolume) writer.writeU8(note.volume)
				if (hasEffect) {
					writer.writeU8(note.effectType)
					writer.writeU8(note.effectParam)
				}
			}
		}
	}

	return writer.toArray()
}

/**
 * Encode instrument
 */
function encodeInstrument(instrument: XMInstrument): Uint8Array {
	const chunks: Uint8Array[] = []

	// Encode instrument header
	chunks.push(encodeInstrumentHeader(instrument))

	// Encode sample data
	for (const sample of instrument.samples) {
		chunks.push(encodeSampleData(sample))
	}

	return concatArrays(chunks)
}

/**
 * Encode instrument header
 */
function encodeInstrumentHeader(instrument: XMInstrument): Uint8Array {
	const writer = new XMWriter()

	// Calculate instrument size
	const instrumentSize = instrument.numSamples > 0 ? 263 : 29

	// Write instrument size
	writer.writeU32LE(instrumentSize)

	// Write instrument name (22 bytes)
	writer.writeString(instrument.name, 22)

	// Write instrument type
	writer.writeU8(instrument.type)

	// Write number of samples
	writer.writeU16LE(instrument.numSamples)

	if (instrument.numSamples > 0) {
		// Write sample header size
		writer.writeU32LE(instrument.sampleHeaderSize || 40)

		// Write sample number for all notes (96 bytes)
		for (let i = 0; i < 96; i++) {
			writer.writeU8(instrument.sampleForNote[i] ?? 0)
		}

		// Write volume envelope
		encodeEnvelope(writer, instrument.volumeEnvelope)

		// Write panning envelope
		encodeEnvelope(writer, instrument.panningEnvelope)

		// Write vibrato settings
		writer.writeU8(instrument.vibratoType)
		writer.writeU8(instrument.vibratoSweep)
		writer.writeU8(instrument.vibratoDepth)
		writer.writeU8(instrument.vibratoRate)

		// Write volume fadeout
		writer.writeU16LE(instrument.volumeFadeout)

		// Write reserved bytes (11 bytes)
		for (let i = 0; i < 11; i++) {
			writer.writeU8(0)
		}

		// Write sample headers
		for (const sample of instrument.samples) {
			encodeSampleHeader(writer, sample)
		}
	}

	return writer.toArray()
}

/**
 * Encode envelope
 */
function encodeEnvelope(writer: XMWriter, envelope: XMEnvelope): void {
	// Write 12 points (48 bytes total)
	for (let i = 0; i < 12; i++) {
		const point = envelope.points[i]
		if (point) {
			writer.writeU16LE(point.frame)
			writer.writeU16LE(point.value)
		} else {
			writer.writeU16LE(0)
			writer.writeU16LE(0)
		}
	}

	// Write number of points
	writer.writeU8(envelope.numPoints)

	// Write sustain point
	writer.writeU8(envelope.sustainPoint)

	// Write loop start point
	writer.writeU8(envelope.loopStartPoint)

	// Write loop end point
	writer.writeU8(envelope.loopEndPoint)

	// Write type
	writer.writeU8(envelope.type)

	// Write reserved (3 bytes)
	for (let i = 0; i < 3; i++) {
		writer.writeU8(0)
	}
}

/**
 * Encode sample header
 */
function encodeSampleHeader(writer: XMWriter, sample: XMSample): void {
	// Write sample length
	writer.writeU32LE(sample.length)

	// Write loop start
	writer.writeU32LE(sample.loopStart)

	// Write loop length
	writer.writeU32LE(sample.loopLength)

	// Write volume
	writer.writeU8(sample.volume)

	// Write finetune
	writer.writeI8(sample.finetune)

	// Write type
	writer.writeU8(sample.type)

	// Write panning
	writer.writeU8(sample.panning)

	// Write relative note
	writer.writeI8(sample.relativeNote)

	// Write reserved
	writer.writeU8(0)

	// Write sample name (22 bytes)
	writer.writeString(sample.name, 22)
}

/**
 * Encode sample data with delta encoding
 */
function encodeSampleData(sample: XMSample): Uint8Array {
	if (sample.length === 0) return new Uint8Array(0)

	const writer = new XMWriter()
	const is16Bit = (sample.type & 0x10) !== 0

	if (is16Bit) {
		// 16-bit sample
		const data = sample.data as Int16Array
		let old = 0
		for (let i = 0; i < data.length; i++) {
			const current = data[i]!
			const delta = current - old
			writer.writeI16LE(delta)
			old = current
		}
	} else {
		// 8-bit sample
		const data = sample.data as Int8Array
		let old = 0
		for (let i = 0; i < data.length; i++) {
			const current = data[i]!
			const delta = current - old
			writer.writeI8(delta)
			old = current
		}
	}

	return writer.toArray()
}

/**
 * XM file writer helper
 */
class XMWriter {
	private chunks: Uint8Array[] = []

	writeU8(value: number): void {
		this.chunks.push(new Uint8Array([value & 0xff]))
	}

	writeI8(value: number): void {
		this.chunks.push(new Uint8Array([value < 0 ? 256 + value : value]))
	}

	writeU16LE(value: number): void {
		this.chunks.push(new Uint8Array([value & 0xff, (value >> 8) & 0xff]))
	}

	writeI16LE(value: number): void {
		const unsigned = value < 0 ? 65536 + value : value
		this.chunks.push(new Uint8Array([unsigned & 0xff, (unsigned >> 8) & 0xff]))
	}

	writeU32LE(value: number): void {
		this.chunks.push(
			new Uint8Array([
				value & 0xff,
				(value >> 8) & 0xff,
				(value >> 16) & 0xff,
				(value >> 24) & 0xff,
			])
		)
	}

	writeString(str: string, length: number): void {
		const bytes = new Uint8Array(length)
		const encoded = new TextEncoder().encode(str.slice(0, length))
		bytes.set(encoded)
		this.chunks.push(bytes)
	}

	writeBytes(data: Uint8Array): void {
		this.chunks.push(data)
	}

	toArray(): Uint8Array {
		return concatArrays(this.chunks)
	}
}

/**
 * Concatenate arrays
 */
function concatArrays(arrays: Uint8Array[]): Uint8Array {
	const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
	const result = new Uint8Array(totalLength)
	let offset = 0

	for (const arr of arrays) {
		result.set(arr, offset)
		offset += arr.length
	}

	return result
}

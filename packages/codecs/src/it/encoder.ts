/**
 * IT file encoder
 * Creates Impulse Tracker Module files
 */

import type {
	ITCell,
	ITEncodeOptions,
	ITEnvelope,
	ITFile,
	ITInstrument,
	ITPattern,
	ITSample,
} from './types'

/**
 * Encode IT file
 */
export function encodeIT(file: ITFile, options: ITEncodeOptions = {}): Uint8Array {
	const initialSpeed = options.initialSpeed ?? file.initialSpeed
	const initialTempo = options.initialTempo ?? file.initialTempo
	const globalVolume = options.globalVolume ?? file.globalVolume
	const mixVolume = options.mixVolume ?? file.mixVolume
	const useInstruments = options.useInstruments ?? file.usesInstruments

	// Calculate sizes and create header
	const orderCount = file.orders.length
	const instrumentCount = useInstruments ? file.instruments.length : 0
	const sampleCount = file.samples.length
	const patternCount = file.patterns.length

	// Encode all components
	const header = encodeHeader(
		file,
		orderCount,
		instrumentCount,
		sampleCount,
		patternCount,
		initialSpeed,
		initialTempo,
		globalVolume,
		mixVolume,
		useInstruments
	)

	// Encode orders
	const orders = encodeOrders(file.orders, orderCount)

	// Encode patterns
	const encodedPatterns: Uint8Array[] = []
	for (const pattern of file.patterns) {
		encodedPatterns.push(encodePattern(pattern))
	}

	// Encode instruments
	const encodedInstruments: Uint8Array[] = []
	if (useInstruments) {
		for (const instrument of file.instruments) {
			encodedInstruments.push(encodeInstrument(instrument))
		}
	}

	// Encode samples
	const encodedSamples: Uint8Array[] = []
	for (const sample of file.samples) {
		encodedSamples.push(encodeSample(sample))
	}

	// Calculate offsets
	let currentOffset = 192 + orderCount + (instrumentCount * 4) + (sampleCount * 4) + (patternCount * 4)

	// Instrument offsets
	const instrumentOffsets: number[] = []
	if (useInstruments) {
		for (const inst of encodedInstruments) {
			instrumentOffsets.push(currentOffset)
			currentOffset += inst.length
		}
	}

	// Sample offsets
	const sampleOffsets: number[] = []
	for (const sample of encodedSamples) {
		sampleOffsets.push(currentOffset)
		currentOffset += sample.length
	}

	// Pattern offsets
	const patternOffsets: number[] = []
	for (const pattern of encodedPatterns) {
		patternOffsets.push(currentOffset)
		currentOffset += pattern.length
	}

	// Sample data offsets
	const sampleDataOffsets: number[] = []
	for (const sample of file.samples) {
		if (sample.data.length > 0) {
			sampleDataOffsets.push(currentOffset)
			currentOffset += sample.data.length
		} else {
			sampleDataOffsets.push(0)
		}
	}

	// Update sample headers with data offsets
	for (let i = 0; i < sampleCount; i++) {
		if (sampleDataOffsets[i]! > 0) {
			writeU32LE(encodedSamples[i]!, 72, sampleDataOffsets[i]!)
		}
	}

	// Create instrument pointer table
	const instrumentPointers = new Uint8Array(instrumentCount * 4)
	for (let i = 0; i < instrumentCount; i++) {
		writeU32LE(instrumentPointers, i * 4, instrumentOffsets[i]!)
	}

	// Create sample pointer table
	const samplePointers = new Uint8Array(sampleCount * 4)
	for (let i = 0; i < sampleCount; i++) {
		writeU32LE(samplePointers, i * 4, sampleOffsets[i]!)
	}

	// Create pattern pointer table
	const patternPointers = new Uint8Array(patternCount * 4)
	for (let i = 0; i < patternCount; i++) {
		writeU32LE(patternPointers, i * 4, patternOffsets[i]!)
	}

	// Concatenate all parts
	const parts: Uint8Array[] = [
		header,
		orders,
		instrumentPointers,
		samplePointers,
		patternPointers,
	]

	// Add instruments
	for (const inst of encodedInstruments) {
		parts.push(inst)
	}

	// Add samples
	for (const sample of encodedSamples) {
		parts.push(sample)
	}

	// Add patterns
	for (const pattern of encodedPatterns) {
		parts.push(pattern)
	}

	// Add sample data
	for (const sample of file.samples) {
		if (sample.data.length > 0) {
			parts.push(sample.data)
		}
	}

	return concatArrays(parts)
}

/**
 * Create a simple IT file from samples and patterns
 */
export function createITFromSamples(
	samples: ITSample[],
	patterns: ITPattern[],
	orders: number[],
	options: ITEncodeOptions = {}
): Uint8Array {
	const channels: Array<{ enabled: boolean; panning: number; volume: number; muted: boolean; surround: boolean }> = []
	for (let i = 0; i < 64; i++) {
		channels.push({
			enabled: i < 32,
			panning: 32,
			volume: 64,
			muted: false,
			surround: false,
		})
	}

	const channelPan: number[] = []
	const channelVolume: number[] = []
	for (let i = 0; i < 64; i++) {
		channelPan.push(i < 32 ? 32 : 255)
		channelVolume.push(64)
	}

	const file: ITFile = {
		name: 'Created by mconv',
		patternRowHighlight: 0x0410,
		version: 0x0200,
		createdWith: 0x0200,
		compatibleWith: 0x0200,
		flags: 1, // Stereo
		special: 0,
		orderCount: orders.length,
		instrumentCount: 0,
		sampleCount: samples.length,
		patternCount: patterns.length,
		globalVolume: options.globalVolume ?? 128,
		mixVolume: options.mixVolume ?? 48,
		initialSpeed: options.initialSpeed ?? 6,
		initialTempo: options.initialTempo ?? 125,
		stereoSeparation: 128,
		pitchWheelDepth: 0,
		messageLength: 0,
		messageOffset: 0,
		channelPan,
		channelVolume,
		channels,
		orders,
		instruments: [],
		samples,
		patterns,
		isStereo: true,
		usesInstruments: false,
		usesLinearSlides: false,
		usesOldEffects: false,
	}

	return encodeIT(file, options)
}

/**
 * Encode header (192 bytes)
 */
function encodeHeader(
	file: ITFile,
	orderCount: number,
	instrumentCount: number,
	sampleCount: number,
	patternCount: number,
	initialSpeed: number,
	initialTempo: number,
	globalVolume: number,
	mixVolume: number,
	useInstruments: boolean
): Uint8Array {
	const header = new Uint8Array(192)
	let offset = 0

	// 'IMPM' signature
	header[offset] = 0x49 // 'I'
	header[offset + 1] = 0x4d // 'M'
	header[offset + 2] = 0x50 // 'P'
	header[offset + 3] = 0x4d // 'M'
	offset += 4

	// Song name (26 bytes)
	writeString(header, offset, file.name, 26)
	offset += 26

	// Pattern row highlight
	writeU16LE(header, offset, file.patternRowHighlight)
	offset += 2

	// Order count
	writeU16LE(header, offset, orderCount)
	offset += 2

	// Instrument count
	writeU16LE(header, offset, instrumentCount)
	offset += 2

	// Sample count
	writeU16LE(header, offset, sampleCount)
	offset += 2

	// Pattern count
	writeU16LE(header, offset, patternCount)
	offset += 2

	// Created with version
	writeU16LE(header, offset, file.version)
	offset += 2

	// Compatible with version
	writeU16LE(header, offset, file.compatibleWith)
	offset += 2

	// Flags
	let flags = file.flags
	if (useInstruments) flags |= 4
	writeU16LE(header, offset, flags)
	offset += 2

	// Special
	writeU16LE(header, offset, file.special)
	offset += 2

	// Global volume
	header[offset] = globalVolume
	offset++

	// Mix volume
	header[offset] = mixVolume
	offset++

	// Initial speed
	header[offset] = initialSpeed
	offset++

	// Initial tempo
	header[offset] = initialTempo
	offset++

	// Stereo separation
	header[offset] = file.stereoSeparation
	offset++

	// Pitch wheel depth
	header[offset] = file.pitchWheelDepth
	offset++

	// Message length
	writeU16LE(header, offset, 0)
	offset += 2

	// Message offset
	writeU32LE(header, offset, 0)
	offset += 4

	// Reserved
	offset += 4

	// Channel pan positions (64 channels)
	for (let i = 0; i < 64; i++) {
		const pan = file.channelPan[i] ?? 255
		header[offset] = pan
		offset++
	}

	// Channel volumes (64 channels)
	for (let i = 0; i < 64; i++) {
		const vol = file.channelVolume[i] ?? 64
		header[offset] = vol
		offset++
	}

	return header
}

/**
 * Encode orders
 */
function encodeOrders(orders: number[], orderCount: number): Uint8Array {
	const data = new Uint8Array(orderCount)
	for (let i = 0; i < orderCount; i++) {
		data[i] = orders[i] ?? 255
	}
	return data
}

/**
 * Encode instrument
 */
function encodeInstrument(instrument: ITInstrument): Uint8Array {
	const data = new Uint8Array(554)
	let offset = 0

	// 'IMPI' signature
	writeU32LE(data, offset, 0x49504d49)
	offset += 4

	// DOS filename
	writeString(data, offset, instrument.filename, 12)
	offset += 12

	// Reserved
	offset++

	// New note action
	data[offset] = instrument.newNoteAction
	offset++

	// Duplicate check type
	data[offset] = instrument.duplicateCheckType
	offset++

	// Duplicate check action
	data[offset] = instrument.duplicateCheckAction
	offset++

	// Fadeout
	writeU16LE(data, offset, instrument.fadeout)
	offset += 2

	// Pitch pan separation
	data[offset] = instrument.pitchPanSeparation < 0 ? instrument.pitchPanSeparation + 256 : instrument.pitchPanSeparation
	offset++

	// Pitch pan center
	data[offset] = instrument.pitchPanCenter
	offset++

	// Global volume
	data[offset] = instrument.globalVolume
	offset++

	// Default pan
	data[offset] = instrument.defaultPan
	offset++

	// Random volume, random panning
	data[offset] = instrument.randomVolume
	offset++
	data[offset] = instrument.randomPanning
	offset++

	// Reserved
	offset += 4

	// Instrument name (26 bytes)
	writeString(data, offset, instrument.name, 26)
	offset += 26

	// Initial filter cutoff, resonance
	offset += 2

	// MIDI channel, program
	offset += 2

	// MIDI bank
	offset += 2

	// Note-sample table (120 entries, 2 bytes each)
	for (let i = 0; i < 120; i++) {
		const entry = instrument.noteSampleTable[i] ?? { note: i, sample: 0 }
		data[offset] = entry.note
		offset++
		data[offset] = entry.sample
		offset++
	}

	// Volume envelope
	encodeEnvelope(data, offset, instrument.volumeEnvelope)
	offset += 82

	// Panning envelope
	encodeEnvelope(data, offset, instrument.panningEnvelope)
	offset += 82

	// Pitch envelope
	encodeEnvelope(data, offset, instrument.pitchEnvelope)

	return data
}

/**
 * Encode envelope
 */
function encodeEnvelope(data: Uint8Array, offset: number, envelope: ITEnvelope): void {
	// Flags
	let flags = 0
	if (envelope.enabled) flags |= 1
	if (envelope.loop) flags |= 2
	if (envelope.sustainLoop) flags |= 4
	data[offset] = flags
	offset++

	// Number of points
	data[offset] = Math.min(envelope.points.length, 25)
	offset++

	// Loop start, loop end
	data[offset] = envelope.loopStart
	offset++
	data[offset] = envelope.loopEnd
	offset++

	// Sustain loop start, sustain loop end
	data[offset] = envelope.sustainLoopStart
	offset++
	data[offset] = envelope.sustainLoopEnd
	offset++

	// Points (25 max)
	for (let i = 0; i < 25; i++) {
		if (i < envelope.points.length) {
			const point = envelope.points[i]!
			data[offset] = point.value
			offset++
			writeU16LE(data, offset, point.tick)
			offset += 2
		} else {
			offset += 3
		}
	}

	// Reserved
	offset++
}

/**
 * Encode sample header
 */
function encodeSample(sample: ITSample): Uint8Array {
	const data = new Uint8Array(80)
	let offset = 0

	// 'IMPS' signature
	writeU32LE(data, offset, 0x53504d49)
	offset += 4

	// DOS filename
	writeString(data, offset, sample.filename, 12)
	offset += 12

	// Reserved
	offset++

	// Global volume
	data[offset] = sample.globalVolume
	offset++

	// Flags
	data[offset] = sample.flags
	offset++

	// Volume
	data[offset] = sample.volume
	offset++

	// Sample name (26 bytes)
	writeString(data, offset, sample.name, 26)
	offset += 26

	// Convert
	data[offset] = sample.convert
	offset++

	// Default pan
	data[offset] = sample.panning | (sample.defaultPan ? 128 : 0)
	offset++

	// Length
	writeU32LE(data, offset, sample.length)
	offset += 4

	// Loop start
	writeU32LE(data, offset, sample.loopStart)
	offset += 4

	// Loop end
	writeU32LE(data, offset, sample.loopEnd)
	offset += 4

	// C5 speed
	writeU32LE(data, offset, sample.c5Speed)
	offset += 4

	// Sustain loop start
	writeU32LE(data, offset, sample.sustainLoopStart)
	offset += 4

	// Sustain loop end
	writeU32LE(data, offset, sample.sustainLoopEnd)
	offset += 4

	// Sample pointer (to be filled later)
	writeU32LE(data, offset, 0)
	offset += 4

	// Vibrato speed, depth, rate, waveform
	data[offset] = sample.vibratoSpeed
	offset++
	data[offset] = sample.vibratoDepth
	offset++
	data[offset] = sample.vibratoRate
	offset++
	data[offset] = sample.vibratoWaveform
	offset++

	return data
}

/**
 * Encode pattern
 */
function encodePattern(pattern: ITPattern): Uint8Array {
	const data: number[] = []
	const lastMaskVariable: number[] = new Array(64).fill(0)
	const lastNote: number[] = new Array(64).fill(0xff)
	const lastInstrument: number[] = new Array(64).fill(0)
	const lastVolumePan: number[] = new Array(64).fill(0xff)
	const lastCommand: number[] = new Array(64).fill(0)
	const lastParam: number[] = new Array(64).fill(0)

	for (let row = 0; row < pattern.rows; row++) {
		const rowData = pattern.data[row]!

		for (let ch = 0; ch < 64; ch++) {
			const cell = rowData[ch]!

			// Check if cell has any data
			const hasNote = cell.note !== 0xff
			const hasInstrument = cell.instrument !== 0
			const hasVolumePan = cell.volumePan !== 0xff
			const hasCommand = cell.command !== 0 || cell.param !== 0

			if (!hasNote && !hasInstrument && !hasVolumePan && !hasCommand) {
				continue
			}

			// Build mask variable
			let maskVariable = 0
			if (hasNote) maskVariable |= 1
			if (hasInstrument) maskVariable |= 2
			if (hasVolumePan) maskVariable |= 4
			if (hasCommand) maskVariable |= 8

			// Check if we can use last values
			const canUseLast = maskVariable === lastMaskVariable[ch]
			const noteMatches = cell.note === lastNote[ch]
			const instrumentMatches = cell.instrument === lastInstrument[ch]
			const volumePanMatches = cell.volumePan === lastVolumePan[ch]
			const commandMatches = cell.command === lastCommand[ch] && cell.param === lastParam[ch]

			// Channel byte
			const channelByte = (ch + 1) | 128
			data.push(channelByte)
			data.push(maskVariable)

			lastMaskVariable[ch] = maskVariable

			// Note
			if (hasNote) {
				data.push(cell.note)
				lastNote[ch] = cell.note
			}

			// Instrument
			if (hasInstrument) {
				data.push(cell.instrument)
				lastInstrument[ch] = cell.instrument
			}

			// Volume/panning
			if (hasVolumePan) {
				data.push(cell.volumePan)
				lastVolumePan[ch] = cell.volumePan
			}

			// Command and param
			if (hasCommand) {
				data.push(cell.command)
				data.push(cell.param)
				lastCommand[ch] = cell.command
				lastParam[ch] = cell.param
			}
		}

		// End of row marker
		data.push(0)
	}

	// Create pattern with header
	const packedLength = data.length
	const result = new Uint8Array(8 + packedLength)
	writeU16LE(result, 0, packedLength)
	writeU16LE(result, 2, pattern.rows)
	// Reserved (4 bytes at offset 4)
	for (let i = 0; i < packedLength; i++) {
		result[8 + i] = data[i]!
	}

	return result
}

/**
 * Create an empty cell
 */
export function createEmptyCell(): ITCell {
	return {
		note: 0xff,
		instrument: 0,
		volumePan: 0xff,
		command: 0,
		param: 0,
	}
}

/**
 * Create an empty pattern
 */
export function createEmptyPattern(rows: number = 64): ITPattern {
	const data: ITCell[][] = []
	for (let i = 0; i < rows; i++) {
		const row: ITCell[] = []
		for (let j = 0; j < 64; j++) {
			row.push(createEmptyCell())
		}
		data.push(row)
	}
	return { rows, data }
}

/**
 * Create a note cell
 */
export function createNoteCell(
	note: number,
	instrument: number,
	volumePan: number = 0xff
): ITCell {
	return {
		note,
		instrument,
		volumePan,
		command: 0,
		param: 0,
	}
}

/**
 * Write null-padded string
 */
function writeString(data: Uint8Array, offset: number, str: string, maxLength: number): void {
	const bytes = new TextEncoder().encode(str)
	const len = Math.min(bytes.length, maxLength)
	for (let i = 0; i < len; i++) {
		data[offset + i] = bytes[i]!
	}
	// Null padding
	for (let i = len; i < maxLength; i++) {
		data[offset + i] = 0
	}
}

/**
 * Write 16-bit little-endian
 */
function writeU16LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
}

/**
 * Write 32-bit little-endian
 */
function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
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

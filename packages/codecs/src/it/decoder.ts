/**
 * IT file decoder
 * Parses Impulse Tracker Module files
 */

import type {
	ITCell,
	ITChannelSettings,
	ITEnvelope,
	ITEnvelopePoint,
	ITFile,
	ITInfo,
	ITInstrument,
	ITPattern,
	ITSample,
	ITVersion,
} from './types'

/**
 * IT file signature
 */
const IT_MAGIC = 0x4d504d49 // 'IMPM' at offset 0

/**
 * Check if data is an IT file
 */
export function isIT(data: Uint8Array): boolean {
	if (data.length < 192) return false

	// Check for 'IMPM' signature at offset 0
	const magic = (data[3]! << 24) | (data[2]! << 16) | (data[1]! << 8) | data[0]!
	return magic === IT_MAGIC
}

/**
 * Parse IT info without full decode
 */
export function parseITInfo(data: Uint8Array): ITInfo {
	if (!isIT(data)) {
		throw new Error('Invalid IT file: missing IMPM signature')
	}

	// Parse name
	const name = readString(data, 4, 26)

	// Parse version
	const version = readU16LE(data, 42) as ITVersion

	// Parse counts
	const orderCount = readU16LE(data, 32)
	const instrumentCount = readU16LE(data, 34)
	const sampleCount = readU16LE(data, 36)
	const patternCount = readU16LE(data, 38)

	// Parse tempo and speed
	const initialSpeed = data[50]!
	const initialTempo = data[51]!

	// Check flags
	const flags = readU16LE(data, 40)
	const special = readU16LE(data, 42 + 2)
	const hasMessage = (special & 1) !== 0
	const usesInstruments = (flags & 4) !== 0

	// Count channels
	let channelCount = 0
	for (let i = 0; i < 64; i++) {
		const chPan = data[64 + i]!
		if (chPan < 128) {
			channelCount++
		}
	}

	// Estimate duration (very rough estimate)
	const ticksPerRow = initialSpeed
	const rowsPerPattern = 64 // Default, patterns can vary
	const ticksPerSecond = (initialTempo * 2.5) / 60
	const estimatedPatterns = Math.min(orderCount, patternCount)
	const totalTicks = estimatedPatterns * rowsPerPattern * ticksPerRow
	const durationSeconds = totalTicks / ticksPerSecond

	return {
		name,
		version,
		channelCount,
		patternCount,
		instrumentCount,
		sampleCount,
		initialTempo,
		initialSpeed,
		hasMessage,
		usesInstruments,
		durationSeconds,
	}
}

/**
 * Decode IT file
 */
export function decodeIT(data: Uint8Array): ITFile {
	if (!isIT(data)) {
		throw new Error('Invalid IT file: missing IMPM signature')
	}

	let offset = 0

	// Skip 'IMPM' signature
	offset += 4

	// Parse song name (26 bytes)
	const name = readString(data, offset, 26)
	offset += 26

	// Pattern row highlight
	const patternRowHighlight = readU16LE(data, offset)
	offset += 2

	// Order count, instrument count, sample count, pattern count
	const orderCount = readU16LE(data, offset)
	offset += 2
	const instrumentCount = readU16LE(data, offset)
	offset += 2
	const sampleCount = readU16LE(data, offset)
	offset += 2
	const patternCount = readU16LE(data, offset)
	offset += 2

	// Created with version, compatible with version
	const createdWith = readU16LE(data, offset)
	offset += 2
	const compatibleWith = readU16LE(data, offset)
	offset += 2

	// Flags
	const flags = readU16LE(data, offset)
	offset += 2

	// Special
	const special = readU16LE(data, offset)
	offset += 2

	// Global volume
	const globalVolume = data[offset]!
	offset++

	// Mix volume
	const mixVolume = data[offset]!
	offset++

	// Initial speed
	const initialSpeed = data[offset]!
	offset++

	// Initial tempo
	const initialTempo = data[offset]!
	offset++

	// Stereo separation
	const stereoSeparation = data[offset]!
	offset++

	// Pitch wheel depth
	const pitchWheelDepth = data[offset]!
	offset++

	// Message length
	const messageLength = readU16LE(data, offset)
	offset += 2

	// Message offset
	const messageOffset = readU32LE(data, offset)
	offset += 4

	// Reserved
	offset += 4

	// Channel pan positions (64 channels)
	const channelPan: number[] = []
	for (let i = 0; i < 64; i++) {
		channelPan.push(data[offset]!)
		offset++
	}

	// Channel volumes (64 channels)
	const channelVolume: number[] = []
	for (let i = 0; i < 64; i++) {
		channelVolume.push(data[offset]!)
		offset++
	}

	// Parse order list
	const orders: number[] = []
	for (let i = 0; i < orderCount; i++) {
		const order = data[offset]!
		offset++
		if (order < 254) {
			orders.push(order)
		}
	}

	// Parse instrument pointers
	const instrumentPointers: number[] = []
	for (let i = 0; i < instrumentCount; i++) {
		instrumentPointers.push(readU32LE(data, offset))
		offset += 4
	}

	// Parse sample pointers
	const samplePointers: number[] = []
	for (let i = 0; i < sampleCount; i++) {
		samplePointers.push(readU32LE(data, offset))
		offset += 4
	}

	// Parse pattern pointers
	const patternPointers: number[] = []
	for (let i = 0; i < patternCount; i++) {
		patternPointers.push(readU32LE(data, offset))
		offset += 4
	}

	// Parse message if present
	let message: string | undefined
	if ((special & 1) && messageOffset !== 0 && messageLength > 0) {
		message = readString(data, messageOffset, messageLength)
	}

	// Parse channel settings
	const channels: ITChannelSettings[] = []
	for (let i = 0; i < 64; i++) {
		const pan = channelPan[i]!
		const vol = channelVolume[i]!

		const enabled = pan < 128
		const muted = pan >= 128 && pan < 192
		const surround = pan === 100

		channels.push({
			enabled,
			panning: pan & 0x7f,
			volume: vol,
			muted,
			surround,
		})
	}

	// Parse instruments
	const instruments: ITInstrument[] = []
	for (const ptr of instrumentPointers) {
		if (ptr === 0) {
			instruments.push(createEmptyInstrument())
		} else {
			instruments.push(parseInstrument(data, ptr))
		}
	}

	// Parse samples
	const samples: ITSample[] = []
	for (const ptr of samplePointers) {
		if (ptr === 0) {
			samples.push(createEmptySample())
		} else {
			samples.push(parseSample(data, ptr))
		}
	}

	// Parse patterns
	const patterns: ITPattern[] = []
	for (const ptr of patternPointers) {
		if (ptr === 0) {
			patterns.push(createEmptyPattern())
		} else {
			patterns.push(parsePattern(data, ptr))
		}
	}

	const version = readU16LE(data, 42) as ITVersion

	return {
		name,
		patternRowHighlight,
		version,
		createdWith,
		compatibleWith,
		flags,
		special,
		orderCount,
		instrumentCount,
		sampleCount,
		patternCount,
		globalVolume,
		mixVolume,
		initialSpeed,
		initialTempo,
		stereoSeparation,
		pitchWheelDepth,
		messageLength,
		messageOffset,
		message,
		channelPan,
		channelVolume,
		channels,
		orders,
		instruments,
		samples,
		patterns,
		isStereo: (flags & 1) !== 0,
		usesInstruments: (flags & 4) !== 0,
		usesLinearSlides: (flags & 8) !== 0,
		usesOldEffects: (flags & 16) !== 0,
	}
}

/**
 * Parse an instrument
 */
function parseInstrument(data: Uint8Array, offset: number): ITInstrument {
	// Check for 'IMPI' signature
	const magic = readU32LE(data, offset)
	if (magic !== 0x49504d49) {
		// 'IMPI'
		return createEmptyInstrument()
	}
	offset += 4

	// DOS filename
	const filename = readString(data, offset, 12)
	offset += 12

	// Reserved
	offset++

	// New note action
	const newNoteAction = data[offset]!
	offset++

	// Duplicate check type
	const duplicateCheckType = data[offset]!
	offset++

	// Duplicate check action
	const duplicateCheckAction = data[offset]!
	offset++

	// Fadeout
	const fadeout = readU16LE(data, offset)
	offset += 2

	// Pitch pan separation
	const pitchPanSeparation = data[offset]! > 127 ? data[offset]! - 256 : data[offset]!
	offset++

	// Pitch pan center
	const pitchPanCenter = data[offset]!
	offset++

	// Global volume
	const globalVolume = data[offset]!
	offset++

	// Default pan
	const defaultPan = data[offset]!
	offset++

	// Random volume, random panning
	const randomVolume = data[offset]!
	offset++
	const randomPanning = data[offset]!
	offset++

	// Reserved
	offset += 4

	// Instrument name (26 bytes)
	const name = readString(data, offset, 26)
	offset += 26

	// Initial filter cutoff, resonance
	offset += 2

	// MIDI channel, program
	offset += 2

	// MIDI bank
	offset += 2

	// Note-sample table (120 entries, 2 bytes each)
	const noteSampleTable: Array<{ sample: number; note: number }> = []
	for (let i = 0; i < 120; i++) {
		const note = data[offset]!
		offset++
		const sample = data[offset]!
		offset++
		noteSampleTable.push({ sample, note })
	}

	// Volume envelope
	const volumeEnvelope = parseEnvelope(data, offset)
	offset += 82

	// Panning envelope
	const panningEnvelope = parseEnvelope(data, offset)
	offset += 82

	// Pitch envelope
	const pitchEnvelope = parseEnvelope(data, offset)

	return {
		filename,
		name,
		newNoteAction,
		duplicateCheckType,
		duplicateCheckAction,
		fadeout,
		pitchPanSeparation,
		pitchPanCenter,
		globalVolume,
		defaultPan,
		randomVolume,
		randomPanning,
		useVolumeEnvelope: volumeEnvelope.enabled,
		usePanningEnvelope: panningEnvelope.enabled,
		usePitchEnvelope: pitchEnvelope.enabled,
		volumeEnvelope,
		panningEnvelope,
		pitchEnvelope,
		noteSampleTable,
	}
}

/**
 * Parse an envelope
 */
function parseEnvelope(data: Uint8Array, offset: number): ITEnvelope {
	// Flags
	const flags = data[offset]!
	offset++

	// Number of points
	const numPoints = data[offset]!
	offset++

	// Loop start, loop end
	const loopStart = data[offset]!
	offset++
	const loopEnd = data[offset]!
	offset++

	// Sustain loop start, sustain loop end
	const sustainLoopStart = data[offset]!
	offset++
	const sustainLoopEnd = data[offset]!
	offset++

	// Parse points (25 max)
	const points: ITEnvelopePoint[] = []
	for (let i = 0; i < Math.min(numPoints, 25); i++) {
		const value = data[offset]!
		offset++
		const tick = readU16LE(data, offset)
		offset += 2
		points.push({ tick, value })
	}

	// Skip remaining point slots
	offset += (25 - Math.min(numPoints, 25)) * 3

	// Reserved
	offset++

	return {
		enabled: (flags & 1) !== 0,
		loop: (flags & 2) !== 0,
		sustainLoop: (flags & 4) !== 0,
		loopStart,
		loopEnd,
		sustainLoopStart,
		sustainLoopEnd,
		points,
	}
}

/**
 * Parse a sample
 */
function parseSample(data: Uint8Array, offset: number): ITSample {
	// Check for 'IMPS' signature
	const magic = readU32LE(data, offset)
	if (magic !== 0x53504d49) {
		// 'IMPS'
		return createEmptySample()
	}
	offset += 4

	// DOS filename
	const filename = readString(data, offset, 12)
	offset += 12

	// Reserved
	offset++

	// Global volume
	const globalVolume = data[offset]!
	offset++

	// Flags
	const flags = data[offset]!
	offset++

	// Volume
	const volume = data[offset]!
	offset++

	// Sample name (26 bytes)
	const name = readString(data, offset, 26)
	offset += 26

	// Convert
	const convert = data[offset]!
	offset++

	// Default pan
	const panning = data[offset]!
	offset++

	// Length
	const length = readU32LE(data, offset)
	offset += 4

	// Loop start
	const loopStart = readU32LE(data, offset)
	offset += 4

	// Loop end
	const loopEnd = readU32LE(data, offset)
	offset += 4

	// C5 speed
	const c5Speed = readU32LE(data, offset)
	offset += 4

	// Sustain loop start
	const sustainLoopStart = readU32LE(data, offset)
	offset += 4

	// Sustain loop end
	const sustainLoopEnd = readU32LE(data, offset)
	offset += 4

	// Sample pointer
	const samplePointer = readU32LE(data, offset)
	offset += 4

	// Vibrato speed, depth, rate, waveform
	const vibratoSpeed = data[offset]!
	offset++
	const vibratoDepth = data[offset]!
	offset++
	const vibratoRate = data[offset]!
	offset++
	const vibratoWaveform = data[offset]!
	offset++

	// Parse flags
	const hasData = (flags & 1) !== 0
	const is16Bit = (flags & 2) !== 0
	const isStereo = (flags & 4) !== 0
	const isCompressed = (flags & 8) !== 0
	const hasLoop = (flags & 16) !== 0
	const hasSustainLoop = (flags & 32) !== 0
	const isPingPongLoop = (flags & 64) !== 0
	const isPingPongSustainLoop = (flags & 128) !== 0

	// Read sample data
	let sampleData = new Uint8Array(0)
	if (hasData && length > 0 && samplePointer > 0 && samplePointer < data.length) {
		if (isCompressed) {
			// IT214 compression - simplified handling
			sampleData = new Uint8Array(length * (is16Bit ? 2 : 1))
		} else {
			const actualLength = length * (is16Bit ? 2 : 1) * (isStereo ? 2 : 1)
			const endPos = Math.min(samplePointer + actualLength, data.length)
			sampleData = data.slice(samplePointer, endPos)

			// Convert from delta encoding if needed
			if ((convert & 4) !== 0) {
				sampleData = convertFromDelta(sampleData, is16Bit)
			}
		}
	}

	return {
		filename,
		name,
		globalVolume,
		flags,
		volume,
		panning,
		length,
		loopStart,
		loopEnd,
		c5Speed,
		sustainLoopStart,
		sustainLoopEnd,
		convert,
		defaultPan: (panning & 128) !== 0,
		vibratoSpeed,
		vibratoDepth,
		vibratoRate,
		vibratoWaveform,
		data: sampleData,
		hasData,
		is16Bit,
		isStereo,
		isCompressed,
		hasLoop,
		hasSustainLoop,
		isPingPongLoop,
		isPingPongSustainLoop,
	}
}

/**
 * Parse a pattern
 */
function parsePattern(data: Uint8Array, offset: number): ITPattern {
	// Read packed length
	const packedLength = readU16LE(data, offset)
	offset += 2

	// Read number of rows
	const rows = readU16LE(data, offset)
	offset += 2

	// Reserved
	offset += 4

	const patternData: ITCell[][] = []
	for (let i = 0; i < rows; i++) {
		patternData.push([])
		for (let j = 0; j < 64; j++) {
			patternData[i]!.push({
				note: 0xff,
				instrument: 0,
				volumePan: 0xff,
				command: 0,
				param: 0,
			})
		}
	}

	const endOffset = offset + packedLength
	let row = 0
	const lastMaskVariable: number[] = new Array(64).fill(0)
	const lastNote: number[] = new Array(64).fill(0xff)
	const lastInstrument: number[] = new Array(64).fill(0)
	const lastVolumePan: number[] = new Array(64).fill(0xff)
	const lastCommand: number[] = new Array(64).fill(0)
	const lastParam: number[] = new Array(64).fill(0)

	while (offset < endOffset && row < rows) {
		const channelByte = data[offset]!
		offset++

		if (channelByte === 0) {
			// End of row
			row++
			continue
		}

		const channel = (channelByte - 1) & 63
		const cell = patternData[row]![channel]!

		let maskVariable = channelByte

		if (channelByte & 128) {
			maskVariable = data[offset]!
			offset++
			lastMaskVariable[channel] = maskVariable
		} else {
			maskVariable = lastMaskVariable[channel]!
		}

		// Note
		if (maskVariable & 1) {
			cell.note = data[offset]!
			offset++
			lastNote[channel] = cell.note
		} else if (maskVariable & 16) {
			cell.note = lastNote[channel]!
		}

		// Instrument
		if (maskVariable & 2) {
			cell.instrument = data[offset]!
			offset++
			lastInstrument[channel] = cell.instrument
		} else if (maskVariable & 32) {
			cell.instrument = lastInstrument[channel]!
		}

		// Volume/panning
		if (maskVariable & 4) {
			cell.volumePan = data[offset]!
			offset++
			lastVolumePan[channel] = cell.volumePan
		} else if (maskVariable & 64) {
			cell.volumePan = lastVolumePan[channel]!
		}

		// Command and param
		if (maskVariable & 8) {
			cell.command = data[offset]!
			offset++
			cell.param = data[offset]!
			offset++
			lastCommand[channel] = cell.command
			lastParam[channel] = cell.param
		} else if (maskVariable & 128) {
			cell.command = lastCommand[channel]!
			cell.param = lastParam[channel]!
		}
	}

	return { rows, data: patternData }
}

/**
 * Create an empty instrument
 */
function createEmptyInstrument(): ITInstrument {
	const noteSampleTable: Array<{ sample: number; note: number }> = []
	for (let i = 0; i < 120; i++) {
		noteSampleTable.push({ sample: 0, note: i })
	}

	return {
		filename: '',
		name: '',
		newNoteAction: 0,
		duplicateCheckType: 0,
		duplicateCheckAction: 0,
		fadeout: 0,
		pitchPanSeparation: 0,
		pitchPanCenter: 60,
		globalVolume: 128,
		defaultPan: 32,
		randomVolume: 0,
		randomPanning: 0,
		useVolumeEnvelope: false,
		usePanningEnvelope: false,
		usePitchEnvelope: false,
		volumeEnvelope: createEmptyEnvelope(),
		panningEnvelope: createEmptyEnvelope(),
		pitchEnvelope: createEmptyEnvelope(),
		noteSampleTable,
	}
}

/**
 * Create an empty envelope
 */
function createEmptyEnvelope(): ITEnvelope {
	return {
		enabled: false,
		loop: false,
		sustainLoop: false,
		loopStart: 0,
		loopEnd: 0,
		sustainLoopStart: 0,
		sustainLoopEnd: 0,
		points: [],
	}
}

/**
 * Create an empty sample
 */
function createEmptySample(): ITSample {
	return {
		filename: '',
		name: '',
		globalVolume: 64,
		flags: 0,
		volume: 64,
		panning: 32,
		length: 0,
		loopStart: 0,
		loopEnd: 0,
		c5Speed: 8363,
		sustainLoopStart: 0,
		sustainLoopEnd: 0,
		convert: 0,
		defaultPan: false,
		vibratoSpeed: 0,
		vibratoDepth: 0,
		vibratoRate: 0,
		vibratoWaveform: 0,
		data: new Uint8Array(0),
		hasData: false,
		is16Bit: false,
		isStereo: false,
		isCompressed: false,
		hasLoop: false,
		hasSustainLoop: false,
		isPingPongLoop: false,
		isPingPongSustainLoop: false,
	}
}

/**
 * Create an empty pattern
 */
function createEmptyPattern(): ITPattern {
	const data: ITCell[][] = []
	for (let i = 0; i < 64; i++) {
		const row: ITCell[] = []
		for (let j = 0; j < 64; j++) {
			row.push({
				note: 0xff,
				instrument: 0,
				volumePan: 0xff,
				command: 0,
				param: 0,
			})
		}
		data.push(row)
	}
	return { rows: 64, data }
}

/**
 * Convert from delta encoding
 */
function convertFromDelta(data: Uint8Array, is16Bit: boolean): Uint8Array {
	const result = new Uint8Array(data.length)
	if (is16Bit) {
		let last = 0
		for (let i = 0; i < data.length; i += 2) {
			const delta = (data[i + 1]! << 8) | data[i]!
			last = (last + delta) & 0xffff
			result[i] = last & 0xff
			result[i + 1] = (last >> 8) & 0xff
		}
	} else {
		let last = 0
		for (let i = 0; i < data.length; i++) {
			const delta = data[i]!
			last = (last + delta) & 0xff
			result[i] = last
		}
	}
	return result
}

/**
 * Read null-terminated string
 */
function readString(data: Uint8Array, offset: number, maxLength: number): string {
	let end = offset
	while (end < offset + maxLength && data[end] !== 0) {
		end++
	}
	return new TextDecoder('ascii').decode(data.slice(offset, end))
}

/**
 * Read 16-bit little-endian
 */
function readU16LE(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8)
}

/**
 * Read 32-bit little-endian
 */
function readU32LE(data: Uint8Array, offset: number): number {
	return (
		(data[offset]! |
		(data[offset + 1]! << 8) |
		(data[offset + 2]! << 16) |
		(data[offset + 3]! << 24)) >>> 0
	)
}

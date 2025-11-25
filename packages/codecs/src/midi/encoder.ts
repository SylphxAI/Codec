/**
 * MIDI file encoder
 * Creates Standard MIDI Files (SMF)
 */

import type {
	MidiEncodeOptions,
	MidiEvent,
	MidiFile,
	MidiMetaEvent,
	MidiTrack,
} from './types'

/**
 * Encode MIDI file
 */
export function encodeMidi(file: MidiFile, options: MidiEncodeOptions = {}): Uint8Array {
	const format = options.format ?? file.format
	const ticksPerBeat = options.ticksPerBeat ?? file.ticksPerBeat

	const chunks: Uint8Array[] = []

	// Header chunk
	chunks.push(encodeHeader(format, file.tracks.length, ticksPerBeat))

	// Track chunks
	for (const track of file.tracks) {
		chunks.push(encodeTrack(track))
	}

	// Concatenate
	return concatArrays(chunks)
}

/**
 * Create a simple MIDI file from notes
 */
export function createMidiFromNotes(
	notes: Array<{
		note: number
		velocity?: number
		startTime: number // in ticks
		duration: number // in ticks
		channel?: number
	}>,
	options: MidiEncodeOptions = {}
): Uint8Array {
	const ticksPerBeat = options.ticksPerBeat ?? 480

	// Sort notes by start time
	const sortedNotes = [...notes].sort((a, b) => a.startTime - b.startTime)

	// Create events
	const events: MidiEvent[] = []
	let lastTime = 0

	// Add tempo event (120 BPM)
	events.push({
		type: 'meta',
		deltaTime: 0,
		metaType: 'setTempo',
		metaTypeByte: 0x51,
		data: new Uint8Array([0x07, 0xa1, 0x20]), // 500000 microseconds
		tempo: 500000,
	} as MidiMetaEvent)

	// Create note on/off events
	const noteEvents: Array<{
		time: number
		type: 'noteOn' | 'noteOff'
		note: number
		velocity: number
		channel: number
	}> = []

	for (const note of sortedNotes) {
		const channel = note.channel ?? 0
		const velocity = note.velocity ?? 100

		noteEvents.push({
			time: note.startTime,
			type: 'noteOn',
			note: note.note,
			velocity,
			channel,
		})

		noteEvents.push({
			time: note.startTime + note.duration,
			type: 'noteOff',
			note: note.note,
			velocity: 0,
			channel,
		})
	}

	// Sort all note events by time
	noteEvents.sort((a, b) => a.time - b.time || (a.type === 'noteOff' ? -1 : 1))

	// Convert to MIDI events
	for (const event of noteEvents) {
		const deltaTime = event.time - lastTime
		lastTime = event.time

		events.push({
			type: event.type,
			deltaTime,
			channel: event.channel,
			note: event.note,
			velocity: event.velocity,
		} as MidiEvent)
	}

	// Add end of track
	events.push({
		type: 'meta',
		deltaTime: 0,
		metaType: 'endOfTrack',
		metaTypeByte: 0x2f,
		data: new Uint8Array(0),
	} as MidiMetaEvent)

	const track: MidiTrack = { events }

	return encodeMidi({
		format: 0,
		ticksPerBeat,
		tracks: [track],
		durationTicks: lastTime,
		durationSeconds: 0,
	})
}

/**
 * Encode header chunk
 */
function encodeHeader(format: number, numTracks: number, ticksPerBeat: number): Uint8Array {
	const header = new Uint8Array(14)

	// 'MThd'
	header[0] = 0x4d
	header[1] = 0x54
	header[2] = 0x68
	header[3] = 0x64

	// Length (always 6)
	header[4] = 0
	header[5] = 0
	header[6] = 0
	header[7] = 6

	// Format
	header[8] = (format >> 8) & 0xff
	header[9] = format & 0xff

	// Number of tracks
	header[10] = (numTracks >> 8) & 0xff
	header[11] = numTracks & 0xff

	// Ticks per beat
	header[12] = (ticksPerBeat >> 8) & 0xff
	header[13] = ticksPerBeat & 0xff

	return header
}

/**
 * Encode track chunk
 */
function encodeTrack(track: MidiTrack): Uint8Array {
	const eventData: Uint8Array[] = []

	for (const event of track.events) {
		eventData.push(encodeEvent(event))
	}

	const trackData = concatArrays(eventData)

	// Create chunk with header
	const chunk = new Uint8Array(8 + trackData.length)

	// 'MTrk'
	chunk[0] = 0x4d
	chunk[1] = 0x54
	chunk[2] = 0x72
	chunk[3] = 0x6b

	// Length
	const length = trackData.length
	chunk[4] = (length >> 24) & 0xff
	chunk[5] = (length >> 16) & 0xff
	chunk[6] = (length >> 8) & 0xff
	chunk[7] = length & 0xff

	chunk.set(trackData, 8)

	return chunk
}

/**
 * Encode a single event
 */
function encodeEvent(event: MidiEvent): Uint8Array {
	const deltaTime = encodeVariableLength(event.deltaTime)

	switch (event.type) {
		case 'noteOff':
			return concatArrays([
				deltaTime,
				new Uint8Array([0x80 | event.channel, event.note, event.velocity]),
			])

		case 'noteOn':
			return concatArrays([
				deltaTime,
				new Uint8Array([0x90 | event.channel, event.note, event.velocity]),
			])

		case 'noteAftertouch':
			return concatArrays([
				deltaTime,
				new Uint8Array([0xa0 | event.channel, event.note, event.pressure]),
			])

		case 'controller':
			return concatArrays([
				deltaTime,
				new Uint8Array([0xb0 | event.channel, event.controller, event.value]),
			])

		case 'programChange':
			return concatArrays([
				deltaTime,
				new Uint8Array([0xc0 | event.channel, event.program]),
			])

		case 'channelAftertouch':
			return concatArrays([
				deltaTime,
				new Uint8Array([0xd0 | event.channel, event.pressure]),
			])

		case 'pitchBend': {
			const value = event.value + 8192
			const lsb = value & 0x7f
			const msb = (value >> 7) & 0x7f
			return concatArrays([
				deltaTime,
				new Uint8Array([0xe0 | event.channel, lsb, msb]),
			])
		}

		case 'sysex':
			return concatArrays([
				deltaTime,
				new Uint8Array([0xf0]),
				encodeVariableLength(event.data.length),
				event.data,
			])

		case 'meta':
			return concatArrays([
				deltaTime,
				new Uint8Array([0xff, event.metaTypeByte]),
				encodeVariableLength(event.data.length),
				event.data,
			])

		default:
			return deltaTime
	}
}

/**
 * Encode variable-length quantity
 */
function encodeVariableLength(value: number): Uint8Array {
	if (value < 0) value = 0

	const bytes: number[] = []
	bytes.unshift(value & 0x7f)
	value >>= 7

	while (value > 0) {
		bytes.unshift((value & 0x7f) | 0x80)
		value >>= 7
	}

	return new Uint8Array(bytes)
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

/**
 * Create tempo meta event data
 */
export function createTempoData(bpm: number): Uint8Array {
	const microsecondsPerBeat = Math.round(60000000 / bpm)
	return new Uint8Array([
		(microsecondsPerBeat >> 16) & 0xff,
		(microsecondsPerBeat >> 8) & 0xff,
		microsecondsPerBeat & 0xff,
	])
}

/**
 * Create time signature meta event data
 */
export function createTimeSignatureData(
	numerator: number,
	denominatorPower: number, // 2 = quarter, 3 = eighth
	clocksPerClick: number = 24,
	notesPerQuarter: number = 8
): Uint8Array {
	return new Uint8Array([numerator, denominatorPower, clocksPerClick, notesPerQuarter])
}

/**
 * Create key signature meta event data
 */
export function createKeySignatureData(
	sharpsFlats: number, // -7 to 7 (negative = flats)
	isMinor: boolean
): Uint8Array {
	return new Uint8Array([sharpsFlats < 0 ? 256 + sharpsFlats : sharpsFlats, isMinor ? 1 : 0])
}

/**
 * Create text meta event
 */
export function createTextEvent(
	metaType: number,
	text: string,
	deltaTime: number = 0
): MidiMetaEvent {
	const data = new TextEncoder().encode(text)
	return {
		type: 'meta',
		deltaTime,
		metaType: 'text',
		metaTypeByte: metaType,
		data,
		text,
	}
}

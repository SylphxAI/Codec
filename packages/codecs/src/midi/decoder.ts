/**
 * MIDI file decoder
 * Parses Standard MIDI Files (SMF)
 */

import type {
	MidiEvent,
	MidiFile,
	MidiFormat,
	MidiInfo,
	MidiMetaEvent,
	MidiMetaType,
	MidiTrack,
} from './types'

/**
 * MIDI file signatures
 */
const MIDI_HEADER = 0x4d546864 // 'MThd'
const MIDI_TRACK = 0x4d54726b // 'MTrk'

/**
 * Check if data is a MIDI file
 */
export function isMidi(data: Uint8Array): boolean {
	if (data.length < 14) return false

	// Check for 'MThd' header
	const header = (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!
	return header === MIDI_HEADER
}

/**
 * Parse MIDI info without full decode
 */
export function parseMidiInfo(data: Uint8Array): MidiInfo {
	const file = decodeMidi(data)

	let noteCount = 0
	let hasTempoChanges = false

	for (const track of file.tracks) {
		for (const event of track.events) {
			if (event.type === 'noteOn' && event.velocity > 0) {
				noteCount++
			}
			if (event.type === 'meta' && event.metaType === 'setTempo') {
				hasTempoChanges = true
			}
		}
	}

	return {
		format: file.format,
		trackCount: file.tracks.length,
		ticksPerBeat: file.ticksPerBeat,
		durationTicks: file.durationTicks,
		durationSeconds: file.durationSeconds,
		hasTempoChanges,
		noteCount,
	}
}

/**
 * Decode MIDI file
 */
export function decodeMidi(data: Uint8Array): MidiFile {
	if (!isMidi(data)) {
		throw new Error('Invalid MIDI file: missing MThd header')
	}

	let offset = 0

	// Parse header chunk
	offset += 4 // Skip 'MThd'
	const headerLength = readU32BE(data, offset)
	offset += 4

	const format = readU16BE(data, offset) as MidiFormat
	offset += 2

	const numTracks = readU16BE(data, offset)
	offset += 2

	const division = readU16BE(data, offset)
	offset += 2

	// Parse time division
	let ticksPerBeat: number
	let smpte: { framesPerSecond: number; ticksPerFrame: number } | undefined

	if (division & 0x8000) {
		// SMPTE time
		const framesPerSecond = -(((division >> 8) & 0xff) - 256)
		const ticksPerFrame = division & 0xff
		ticksPerBeat = framesPerSecond * ticksPerFrame
		smpte = { framesPerSecond, ticksPerFrame }
	} else {
		ticksPerBeat = division
	}

	// Skip any extra header data
	offset = 8 + headerLength

	// Parse tracks
	const tracks: MidiTrack[] = []

	for (let i = 0; i < numTracks && offset < data.length; i++) {
		const track = parseTrack(data, offset)
		if (track) {
			tracks.push(track.track)
			offset = track.nextOffset
		} else {
			break
		}
	}

	// Calculate duration
	const { durationTicks, durationSeconds } = calculateDuration(tracks, ticksPerBeat)

	return {
		format,
		ticksPerBeat,
		smpte,
		tracks,
		durationTicks,
		durationSeconds,
	}
}

/**
 * Parse a single track
 */
function parseTrack(data: Uint8Array, offset: number): { track: MidiTrack; nextOffset: number } | null {
	if (offset + 8 > data.length) return null

	// Check for 'MTrk' header
	const header = (data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!
	if (header !== MIDI_TRACK) return null

	const trackLength = readU32BE(data, offset + 4)
	const trackStart = offset + 8
	const trackEnd = trackStart + trackLength

	const events: MidiEvent[] = []
	let pos = trackStart
	let runningStatus = 0
	let absoluteTime = 0
	let trackName: string | undefined

	while (pos < trackEnd) {
		// Read delta time
		const deltaResult = readVariableLength(data, pos)
		const deltaTime = deltaResult.value
		pos = deltaResult.nextOffset
		absoluteTime += deltaTime

		// Read event
		let statusByte = data[pos]!

		// Check for running status
		if (statusByte < 0x80) {
			statusByte = runningStatus
		} else {
			pos++
			if (statusByte < 0xf0) {
				runningStatus = statusByte
			}
		}

		const event = parseEvent(data, pos, statusByte, deltaTime, absoluteTime)
		if (event) {
			events.push(event.event)
			pos = event.nextOffset

			// Extract track name
			if (event.event.type === 'meta' && event.event.metaType === 'trackName' && event.event.text) {
				trackName = event.event.text
			}
		} else {
			break
		}
	}

	return {
		track: { events, name: trackName },
		nextOffset: trackEnd,
	}
}

/**
 * Parse a single event
 */
function parseEvent(
	data: Uint8Array,
	offset: number,
	statusByte: number,
	deltaTime: number,
	absoluteTime: number
): { event: MidiEvent; nextOffset: number } | null {
	const eventType = statusByte & 0xf0
	const channel = statusByte & 0x0f

	switch (eventType) {
		case 0x80: // Note Off
			return {
				event: {
					type: 'noteOff',
					deltaTime,
					absoluteTime,
					channel,
					note: data[offset]!,
					velocity: data[offset + 1]!,
				},
				nextOffset: offset + 2,
			}

		case 0x90: // Note On
			return {
				event: {
					type: 'noteOn',
					deltaTime,
					absoluteTime,
					channel,
					note: data[offset]!,
					velocity: data[offset + 1]!,
				},
				nextOffset: offset + 2,
			}

		case 0xa0: // Note Aftertouch
			return {
				event: {
					type: 'noteAftertouch',
					deltaTime,
					absoluteTime,
					channel,
					note: data[offset]!,
					pressure: data[offset + 1]!,
				},
				nextOffset: offset + 2,
			}

		case 0xb0: // Controller
			return {
				event: {
					type: 'controller',
					deltaTime,
					absoluteTime,
					channel,
					controller: data[offset]!,
					value: data[offset + 1]!,
				},
				nextOffset: offset + 2,
			}

		case 0xc0: // Program Change
			return {
				event: {
					type: 'programChange',
					deltaTime,
					absoluteTime,
					channel,
					program: data[offset]!,
				},
				nextOffset: offset + 1,
			}

		case 0xd0: // Channel Aftertouch
			return {
				event: {
					type: 'channelAftertouch',
					deltaTime,
					absoluteTime,
					channel,
					pressure: data[offset]!,
				},
				nextOffset: offset + 1,
			}

		case 0xe0: // Pitch Bend
			const lsb = data[offset]!
			const msb = data[offset + 1]!
			return {
				event: {
					type: 'pitchBend',
					deltaTime,
					absoluteTime,
					channel,
					value: ((msb << 7) | lsb) - 8192,
				},
				nextOffset: offset + 2,
			}

		case 0xf0: // System messages
			if (statusByte === 0xf0 || statusByte === 0xf7) {
				// SysEx
				const lenResult = readVariableLength(data, offset)
				const sysexData = data.slice(lenResult.nextOffset, lenResult.nextOffset + lenResult.value)
				return {
					event: {
						type: 'sysex',
						deltaTime,
						absoluteTime,
						data: sysexData,
					},
					nextOffset: lenResult.nextOffset + lenResult.value,
				}
			} else if (statusByte === 0xff) {
				// Meta event
				const metaTypeByte = data[offset]!
				const lenResult = readVariableLength(data, offset + 1)
				const metaData = data.slice(lenResult.nextOffset, lenResult.nextOffset + lenResult.value)

				const metaEvent = parseMetaEvent(metaTypeByte, metaData, deltaTime, absoluteTime)
				return {
					event: metaEvent,
					nextOffset: lenResult.nextOffset + lenResult.value,
				}
			}
			break
	}

	return null
}

/**
 * Parse meta event
 */
function parseMetaEvent(
	metaTypeByte: number,
	data: Uint8Array,
	deltaTime: number,
	absoluteTime: number
): MidiMetaEvent {
	let metaType: MidiMetaType = 'unknown'
	let text: string | undefined
	let tempo: number | undefined
	let numerator: number | undefined
	let denominator: number | undefined
	let key: number | undefined
	let scale: 'major' | 'minor' | undefined

	switch (metaTypeByte) {
		case 0x00:
			metaType = 'sequenceNumber'
			break
		case 0x01:
			metaType = 'text'
			text = decodeText(data)
			break
		case 0x02:
			metaType = 'copyright'
			text = decodeText(data)
			break
		case 0x03:
			metaType = 'trackName'
			text = decodeText(data)
			break
		case 0x04:
			metaType = 'instrumentName'
			text = decodeText(data)
			break
		case 0x05:
			metaType = 'lyrics'
			text = decodeText(data)
			break
		case 0x06:
			metaType = 'marker'
			text = decodeText(data)
			break
		case 0x07:
			metaType = 'cuePoint'
			text = decodeText(data)
			break
		case 0x20:
			metaType = 'channelPrefix'
			break
		case 0x2f:
			metaType = 'endOfTrack'
			break
		case 0x51:
			metaType = 'setTempo'
			if (data.length >= 3) {
				tempo = (data[0]! << 16) | (data[1]! << 8) | data[2]!
			}
			break
		case 0x54:
			metaType = 'smpteOffset'
			break
		case 0x58:
			metaType = 'timeSignature'
			if (data.length >= 2) {
				numerator = data[0]!
				denominator = Math.pow(2, data[1]!)
			}
			break
		case 0x59:
			metaType = 'keySignature'
			if (data.length >= 2) {
				key = data[0]! > 127 ? data[0]! - 256 : data[0]!
				scale = data[1] === 0 ? 'major' : 'minor'
			}
			break
		case 0x7f:
			metaType = 'sequencerSpecific'
			break
	}

	return {
		type: 'meta',
		deltaTime,
		absoluteTime,
		metaType,
		metaTypeByte,
		data,
		text,
		tempo,
		numerator,
		denominator,
		key,
		scale,
	}
}

/**
 * Calculate duration from tracks
 */
function calculateDuration(
	tracks: MidiTrack[],
	ticksPerBeat: number
): { durationTicks: number; durationSeconds: number } {
	let maxTicks = 0
	let tempo = 500000 // Default: 120 BPM (500000 microseconds per beat)

	// Find max duration and collect tempo changes
	const tempoChanges: { tick: number; tempo: number }[] = []

	for (const track of tracks) {
		let trackTicks = 0
		for (const event of track.events) {
			trackTicks += event.deltaTime

			if (event.type === 'meta' && event.metaType === 'setTempo' && event.tempo) {
				tempoChanges.push({ tick: trackTicks, tempo: event.tempo })
			}
		}
		maxTicks = Math.max(maxTicks, trackTicks)
	}

	// Sort tempo changes by tick
	tempoChanges.sort((a, b) => a.tick - b.tick)

	// Calculate duration in seconds
	let seconds = 0
	let lastTick = 0
	let currentTempo = tempo

	for (const change of tempoChanges) {
		const tickDelta = change.tick - lastTick
		seconds += (tickDelta / ticksPerBeat) * (currentTempo / 1000000)
		currentTempo = change.tempo
		lastTick = change.tick
	}

	// Add remaining time
	const remainingTicks = maxTicks - lastTick
	seconds += (remainingTicks / ticksPerBeat) * (currentTempo / 1000000)

	return {
		durationTicks: maxTicks,
		durationSeconds: seconds,
	}
}

/**
 * Read variable-length quantity
 */
function readVariableLength(data: Uint8Array, offset: number): { value: number; nextOffset: number } {
	let value = 0
	let pos = offset

	while (pos < data.length) {
		const byte = data[pos]!
		value = (value << 7) | (byte & 0x7f)
		pos++

		if (!(byte & 0x80)) {
			break
		}
	}

	return { value, nextOffset: pos }
}

/**
 * Read 16-bit big-endian
 */
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

/**
 * Read 32-bit big-endian
 */
function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) >>> 0) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	) >>> 0
}

/**
 * Decode text from bytes
 */
function decodeText(data: Uint8Array): string {
	return new TextDecoder('utf-8').decode(data)
}

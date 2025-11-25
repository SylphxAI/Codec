import { describe, expect, it } from 'bun:test'
import {
	createMidiFromNotes,
	createTempoData,
	createTimeSignatureData,
	createKeySignatureData,
	decodeMidi,
	encodeMidi,
	getNoteName,
	getNoteNumber,
	isMidi,
	parseMidiInfo,
	type MidiFile,
	type MidiMetaEvent,
	type MidiNoteOnEvent,
	type MidiTrack,
} from './index'

describe('MIDI Codec', () => {
	// Helper to create a minimal MIDI file
	function createTestMidi(): MidiFile {
		const events = [
			{
				type: 'meta' as const,
				deltaTime: 0,
				metaType: 'setTempo' as const,
				metaTypeByte: 0x51,
				data: new Uint8Array([0x07, 0xa1, 0x20]), // 500000 us = 120 BPM
				tempo: 500000,
			},
			{
				type: 'noteOn' as const,
				deltaTime: 0,
				channel: 0,
				note: 60, // Middle C
				velocity: 100,
			},
			{
				type: 'noteOff' as const,
				deltaTime: 480, // Quarter note
				channel: 0,
				note: 60,
				velocity: 0,
			},
			{
				type: 'meta' as const,
				deltaTime: 0,
				metaType: 'endOfTrack' as const,
				metaTypeByte: 0x2f,
				data: new Uint8Array(0),
			},
		]

		return {
			format: 0,
			ticksPerBeat: 480,
			tracks: [{ events }],
			durationTicks: 480,
			durationSeconds: 0.5,
		}
	}

	describe('isMidi', () => {
		it('should identify MIDI files', () => {
			const midi = encodeMidi(createTestMidi())
			expect(isMidi(midi)).toBe(true)
		})

		it('should reject non-MIDI files', () => {
			expect(isMidi(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isMidi(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isMidi(new Uint8Array([0x4d, 0x54]))).toBe(false)
		})
	})

	describe('getNoteName / getNoteNumber', () => {
		it('should convert note numbers to names', () => {
			expect(getNoteName(60)).toBe('C4') // Middle C
			expect(getNoteName(69)).toBe('A4') // A440
			expect(getNoteName(0)).toBe('C-1')
			expect(getNoteName(127)).toBe('G9')
		})

		it('should convert note names to numbers', () => {
			expect(getNoteNumber('C4')).toBe(60)
			expect(getNoteNumber('A4')).toBe(69)
			expect(getNoteNumber('C-1')).toBe(0)
		})

		it('should handle sharps', () => {
			expect(getNoteName(61)).toBe('C#4')
			expect(getNoteNumber('C#4')).toBe(61)
			expect(getNoteNumber('F#3')).toBe(54)
		})

		it('should return -1 for invalid names', () => {
			expect(getNoteNumber('invalid')).toBe(-1)
			expect(getNoteNumber('X4')).toBe(-1)
		})
	})

	describe('encodeMidi', () => {
		it('should encode basic MIDI file', () => {
			const midi = encodeMidi(createTestMidi())

			expect(midi[0]).toBe(0x4d) // 'M'
			expect(midi[1]).toBe(0x54) // 'T'
			expect(midi[2]).toBe(0x68) // 'h'
			expect(midi[3]).toBe(0x64) // 'd'
		})

		it('should encode header correctly', () => {
			const file = createTestMidi()
			const midi = encodeMidi(file)

			// Header length should be 6
			expect(midi[7]).toBe(6)

			// Format
			expect(midi[9]).toBe(0) // Format 0

			// Tracks
			expect(midi[11]).toBe(1) // 1 track

			// Ticks per beat
			expect((midi[12]! << 8) | midi[13]!).toBe(480)
		})

		it('should encode track chunk', () => {
			const midi = encodeMidi(createTestMidi())

			// Track header starts at byte 14
			expect(midi[14]).toBe(0x4d) // 'M'
			expect(midi[15]).toBe(0x54) // 'T'
			expect(midi[16]).toBe(0x72) // 'r'
			expect(midi[17]).toBe(0x6b) // 'k'
		})
	})

	describe('decodeMidi', () => {
		it('should decode basic MIDI file', () => {
			const original = createTestMidi()
			const encoded = encodeMidi(original)
			const decoded = decodeMidi(encoded)

			expect(decoded.format).toBe(0)
			expect(decoded.ticksPerBeat).toBe(480)
			expect(decoded.tracks.length).toBe(1)
		})

		it('should parse events', () => {
			const original = createTestMidi()
			const encoded = encodeMidi(original)
			const decoded = decodeMidi(encoded)

			const events = decoded.tracks[0]!.events
			expect(events.length).toBeGreaterThan(0)

			// Find note on event
			const noteOn = events.find(e => e.type === 'noteOn') as MidiNoteOnEvent
			expect(noteOn).toBeDefined()
			expect(noteOn.note).toBe(60)
			expect(noteOn.velocity).toBe(100)
		})

		it('should parse tempo', () => {
			const original = createTestMidi()
			const encoded = encodeMidi(original)
			const decoded = decodeMidi(encoded)

			const tempoEvent = decoded.tracks[0]!.events.find(
				e => e.type === 'meta' && e.metaType === 'setTempo'
			) as MidiMetaEvent

			expect(tempoEvent).toBeDefined()
			expect(tempoEvent.tempo).toBe(500000)
		})

		it('should throw on invalid data', () => {
			expect(() => decodeMidi(new Uint8Array([0, 0, 0, 0]))).toThrow()
		})
	})

	describe('parseMidiInfo', () => {
		it('should parse MIDI info', () => {
			const midi = encodeMidi(createTestMidi())
			const info = parseMidiInfo(midi)

			expect(info.format).toBe(0)
			expect(info.trackCount).toBe(1)
			expect(info.ticksPerBeat).toBe(480)
			expect(info.noteCount).toBe(1)
		})

		it('should detect tempo changes', () => {
			const midi = encodeMidi(createTestMidi())
			const info = parseMidiInfo(midi)

			expect(info.hasTempoChanges).toBe(true)
		})
	})

	describe('createMidiFromNotes', () => {
		it('should create MIDI from simple notes', () => {
			const notes = [
				{ note: 60, startTime: 0, duration: 480 },
				{ note: 62, startTime: 480, duration: 480 },
				{ note: 64, startTime: 960, duration: 480 },
			]

			const midi = createMidiFromNotes(notes)
			expect(isMidi(midi)).toBe(true)

			const decoded = decodeMidi(midi)
			expect(decoded.tracks.length).toBe(1)

			// Count note on events
			const noteOns = decoded.tracks[0]!.events.filter(
				e => e.type === 'noteOn' && e.velocity > 0
			)
			expect(noteOns.length).toBe(3)
		})

		it('should handle velocity', () => {
			const notes = [{ note: 60, velocity: 64, startTime: 0, duration: 480 }]

			const midi = createMidiFromNotes(notes)
			const decoded = decodeMidi(midi)

			const noteOn = decoded.tracks[0]!.events.find(
				e => e.type === 'noteOn' && e.velocity > 0
			) as MidiNoteOnEvent

			expect(noteOn.velocity).toBe(64)
		})

		it('should handle multiple channels', () => {
			const notes = [
				{ note: 60, channel: 0, startTime: 0, duration: 480 },
				{ note: 64, channel: 1, startTime: 0, duration: 480 },
			]

			const midi = createMidiFromNotes(notes)
			const decoded = decodeMidi(midi)

			const noteOns = decoded.tracks[0]!.events.filter(
				e => e.type === 'noteOn' && e.velocity > 0
			) as MidiNoteOnEvent[]

			expect(noteOns.some(n => n.channel === 0)).toBe(true)
			expect(noteOns.some(n => n.channel === 1)).toBe(true)
		})

		it('should handle custom ticks per beat', () => {
			const notes = [{ note: 60, startTime: 0, duration: 960 }]
			const midi = createMidiFromNotes(notes, { ticksPerBeat: 960 })
			const decoded = decodeMidi(midi)

			expect(decoded.ticksPerBeat).toBe(960)
		})
	})

	describe('meta event helpers', () => {
		it('should create tempo data', () => {
			const data = createTempoData(120) // 120 BPM
			expect(data.length).toBe(3)

			// 500000 microseconds = 0x07A120
			expect(data[0]).toBe(0x07)
			expect(data[1]).toBe(0xa1)
			expect(data[2]).toBe(0x20)
		})

		it('should create time signature data', () => {
			const data = createTimeSignatureData(4, 2) // 4/4 time
			expect(data.length).toBe(4)
			expect(data[0]).toBe(4) // numerator
			expect(data[1]).toBe(2) // denominator (2^2 = 4)
		})

		it('should create key signature data', () => {
			// C major
			const cMajor = createKeySignatureData(0, false)
			expect(cMajor[0]).toBe(0)
			expect(cMajor[1]).toBe(0)

			// G major (1 sharp)
			const gMajor = createKeySignatureData(1, false)
			expect(gMajor[0]).toBe(1)

			// F major (1 flat)
			const fMajor = createKeySignatureData(-1, false)
			expect(fMajor[0]).toBe(255) // -1 as unsigned
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip basic MIDI', () => {
			const original = createTestMidi()
			const encoded = encodeMidi(original)
			const decoded = decodeMidi(encoded)

			expect(decoded.format).toBe(original.format)
			expect(decoded.ticksPerBeat).toBe(original.ticksPerBeat)
			expect(decoded.tracks.length).toBe(original.tracks.length)
		})

		it('should preserve note events', () => {
			const notes = [
				{ note: 60, startTime: 0, duration: 480 },
				{ note: 62, startTime: 480, duration: 240 },
			]

			const midi = createMidiFromNotes(notes)
			const decoded = decodeMidi(midi)

			const noteOns = decoded.tracks[0]!.events.filter(
				e => e.type === 'noteOn' && e.velocity > 0
			) as MidiNoteOnEvent[]

			expect(noteOns.length).toBe(2)
			expect(noteOns[0]!.note).toBe(60)
			expect(noteOns[1]!.note).toBe(62)
		})

		it('should handle multiple tracks (Format 1)', () => {
			const track1: MidiTrack = {
				name: 'Track 1',
				events: [
					{
						type: 'meta',
						deltaTime: 0,
						metaType: 'trackName',
						metaTypeByte: 0x03,
						data: new TextEncoder().encode('Track 1'),
						text: 'Track 1',
					} as MidiMetaEvent,
					{ type: 'noteOn', deltaTime: 0, channel: 0, note: 60, velocity: 100 },
					{ type: 'noteOff', deltaTime: 480, channel: 0, note: 60, velocity: 0 },
					{
						type: 'meta',
						deltaTime: 0,
						metaType: 'endOfTrack',
						metaTypeByte: 0x2f,
						data: new Uint8Array(0),
					} as MidiMetaEvent,
				],
			}

			const track2: MidiTrack = {
				name: 'Track 2',
				events: [
					{
						type: 'meta',
						deltaTime: 0,
						metaType: 'trackName',
						metaTypeByte: 0x03,
						data: new TextEncoder().encode('Track 2'),
						text: 'Track 2',
					} as MidiMetaEvent,
					{ type: 'noteOn', deltaTime: 0, channel: 1, note: 64, velocity: 80 },
					{ type: 'noteOff', deltaTime: 480, channel: 1, note: 64, velocity: 0 },
					{
						type: 'meta',
						deltaTime: 0,
						metaType: 'endOfTrack',
						metaTypeByte: 0x2f,
						data: new Uint8Array(0),
					} as MidiMetaEvent,
				],
			}

			const file: MidiFile = {
				format: 1,
				ticksPerBeat: 480,
				tracks: [track1, track2],
				durationTicks: 480,
				durationSeconds: 0.5,
			}

			const encoded = encodeMidi(file)
			const decoded = decodeMidi(encoded)

			expect(decoded.format).toBe(1)
			expect(decoded.tracks.length).toBe(2)
		})
	})

	describe('edge cases', () => {
		it('should handle variable length encoding', () => {
			// Long delta time (requires multiple bytes)
			const track: MidiTrack = {
				events: [
					{ type: 'noteOn', deltaTime: 0, channel: 0, note: 60, velocity: 100 },
					{ type: 'noteOff', deltaTime: 10000, channel: 0, note: 60, velocity: 0 }, // Large delta
					{
						type: 'meta',
						deltaTime: 0,
						metaType: 'endOfTrack',
						metaTypeByte: 0x2f,
						data: new Uint8Array(0),
					} as MidiMetaEvent,
				],
			}

			const file: MidiFile = {
				format: 0,
				ticksPerBeat: 480,
				tracks: [track],
				durationTicks: 10000,
				durationSeconds: 0,
			}

			const encoded = encodeMidi(file)
			const decoded = decodeMidi(encoded)

			const noteOff = decoded.tracks[0]!.events.find(e => e.type === 'noteOff')
			expect(noteOff?.deltaTime).toBe(10000)
		})

		it('should handle controller events', () => {
			const track: MidiTrack = {
				events: [
					{ type: 'controller', deltaTime: 0, channel: 0, controller: 7, value: 100 }, // Volume
					{ type: 'controller', deltaTime: 0, channel: 0, controller: 10, value: 64 }, // Pan
					{
						type: 'meta',
						deltaTime: 0,
						metaType: 'endOfTrack',
						metaTypeByte: 0x2f,
						data: new Uint8Array(0),
					} as MidiMetaEvent,
				],
			}

			const file: MidiFile = {
				format: 0,
				ticksPerBeat: 480,
				tracks: [track],
				durationTicks: 0,
				durationSeconds: 0,
			}

			const encoded = encodeMidi(file)
			const decoded = decodeMidi(encoded)

			const controllers = decoded.tracks[0]!.events.filter(e => e.type === 'controller')
			expect(controllers.length).toBe(2)
		})

		it('should handle program change', () => {
			const track: MidiTrack = {
				events: [
					{ type: 'programChange', deltaTime: 0, channel: 0, program: 25 }, // Steel guitar
					{
						type: 'meta',
						deltaTime: 0,
						metaType: 'endOfTrack',
						metaTypeByte: 0x2f,
						data: new Uint8Array(0),
					} as MidiMetaEvent,
				],
			}

			const file: MidiFile = {
				format: 0,
				ticksPerBeat: 480,
				tracks: [track],
				durationTicks: 0,
				durationSeconds: 0,
			}

			const encoded = encodeMidi(file)
			const decoded = decodeMidi(encoded)

			const program = decoded.tracks[0]!.events.find(e => e.type === 'programChange')
			expect(program?.type).toBe('programChange')
			if (program?.type === 'programChange') {
				expect(program.program).toBe(25)
			}
		})

		it('should handle pitch bend', () => {
			const track: MidiTrack = {
				events: [
					{ type: 'pitchBend', deltaTime: 0, channel: 0, value: 0 }, // Center
					{ type: 'pitchBend', deltaTime: 100, channel: 0, value: 4096 }, // Up
					{ type: 'pitchBend', deltaTime: 100, channel: 0, value: -4096 }, // Down
					{
						type: 'meta',
						deltaTime: 0,
						metaType: 'endOfTrack',
						metaTypeByte: 0x2f,
						data: new Uint8Array(0),
					} as MidiMetaEvent,
				],
			}

			const file: MidiFile = {
				format: 0,
				ticksPerBeat: 480,
				tracks: [track],
				durationTicks: 200,
				durationSeconds: 0,
			}

			const encoded = encodeMidi(file)
			const decoded = decodeMidi(encoded)

			const pitchBends = decoded.tracks[0]!.events.filter(e => e.type === 'pitchBend')
			expect(pitchBends.length).toBe(3)
		})
	})
})

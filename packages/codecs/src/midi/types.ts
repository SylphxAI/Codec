/**
 * MIDI (Musical Instrument Digital Interface) types
 * Standard music file format
 */

/**
 * MIDI file format
 */
export type MidiFormat = 0 | 1 | 2

/**
 * MIDI event type
 */
export type MidiEventType =
	| 'noteOff'
	| 'noteOn'
	| 'noteAftertouch'
	| 'controller'
	| 'programChange'
	| 'channelAftertouch'
	| 'pitchBend'
	| 'sysex'
	| 'meta'

/**
 * MIDI meta event type
 */
export type MidiMetaType =
	| 'sequenceNumber'
	| 'text'
	| 'copyright'
	| 'trackName'
	| 'instrumentName'
	| 'lyrics'
	| 'marker'
	| 'cuePoint'
	| 'channelPrefix'
	| 'endOfTrack'
	| 'setTempo'
	| 'smpteOffset'
	| 'timeSignature'
	| 'keySignature'
	| 'sequencerSpecific'
	| 'unknown'

/**
 * Base MIDI event
 */
export interface MidiEventBase {
	/** Delta time from previous event (in ticks) */
	deltaTime: number
	/** Absolute time from track start (in ticks) */
	absoluteTime?: number
	/** Event type */
	type: MidiEventType
}

/**
 * Note Off event
 */
export interface MidiNoteOffEvent extends MidiEventBase {
	type: 'noteOff'
	channel: number
	note: number
	velocity: number
}

/**
 * Note On event
 */
export interface MidiNoteOnEvent extends MidiEventBase {
	type: 'noteOn'
	channel: number
	note: number
	velocity: number
}

/**
 * Note Aftertouch (polyphonic key pressure)
 */
export interface MidiNoteAftertouchEvent extends MidiEventBase {
	type: 'noteAftertouch'
	channel: number
	note: number
	pressure: number
}

/**
 * Controller change event
 */
export interface MidiControllerEvent extends MidiEventBase {
	type: 'controller'
	channel: number
	controller: number
	value: number
}

/**
 * Program (instrument) change event
 */
export interface MidiProgramChangeEvent extends MidiEventBase {
	type: 'programChange'
	channel: number
	program: number
}

/**
 * Channel Aftertouch (channel pressure)
 */
export interface MidiChannelAftertouchEvent extends MidiEventBase {
	type: 'channelAftertouch'
	channel: number
	pressure: number
}

/**
 * Pitch bend event
 */
export interface MidiPitchBendEvent extends MidiEventBase {
	type: 'pitchBend'
	channel: number
	value: number // -8192 to 8191
}

/**
 * System Exclusive event
 */
export interface MidiSysexEvent extends MidiEventBase {
	type: 'sysex'
	data: Uint8Array
}

/**
 * Meta event
 */
export interface MidiMetaEvent extends MidiEventBase {
	type: 'meta'
	metaType: MidiMetaType
	metaTypeByte: number
	data: Uint8Array
	// Parsed values for common meta events
	text?: string
	tempo?: number // microseconds per quarter note
	numerator?: number
	denominator?: number
	key?: number
	scale?: 'major' | 'minor'
}

/**
 * Any MIDI event
 */
export type MidiEvent =
	| MidiNoteOffEvent
	| MidiNoteOnEvent
	| MidiNoteAftertouchEvent
	| MidiControllerEvent
	| MidiProgramChangeEvent
	| MidiChannelAftertouchEvent
	| MidiPitchBendEvent
	| MidiSysexEvent
	| MidiMetaEvent

/**
 * MIDI track
 */
export interface MidiTrack {
	/** Track events */
	events: MidiEvent[]
	/** Track name (from meta event) */
	name?: string
}

/**
 * MIDI file
 */
export interface MidiFile {
	/** File format (0, 1, or 2) */
	format: MidiFormat
	/** Ticks per quarter note (or SMPTE frames) */
	ticksPerBeat: number
	/** SMPTE timing info (if negative ticksPerBeat) */
	smpte?: {
		framesPerSecond: number
		ticksPerFrame: number
	}
	/** Tracks */
	tracks: MidiTrack[]
	/** Duration in ticks */
	durationTicks: number
	/** Duration in seconds (estimated from tempo) */
	durationSeconds: number
}

/**
 * MIDI file info (quick parse)
 */
export interface MidiInfo {
	format: MidiFormat
	trackCount: number
	ticksPerBeat: number
	durationTicks: number
	durationSeconds: number
	hasTempoChanges: boolean
	noteCount: number
}

/**
 * MIDI encode options
 */
export interface MidiEncodeOptions {
	/** File format (default: 1) */
	format?: MidiFormat
	/** Ticks per quarter note (default: 480) */
	ticksPerBeat?: number
}

/**
 * Common MIDI controllers
 */
export const MidiController = {
	BANK_SELECT: 0,
	MODULATION: 1,
	BREATH: 2,
	FOOT: 4,
	PORTAMENTO_TIME: 5,
	DATA_ENTRY: 6,
	VOLUME: 7,
	BALANCE: 8,
	PAN: 10,
	EXPRESSION: 11,
	SUSTAIN: 64,
	PORTAMENTO: 65,
	SOSTENUTO: 66,
	SOFT: 67,
	LEGATO: 68,
	HOLD_2: 69,
	ALL_SOUND_OFF: 120,
	RESET_ALL: 121,
	LOCAL_CONTROL: 122,
	ALL_NOTES_OFF: 123,
} as const

/**
 * General MIDI instruments
 */
export const MidiInstrument = {
	// Piano
	ACOUSTIC_GRAND_PIANO: 0,
	BRIGHT_ACOUSTIC_PIANO: 1,
	ELECTRIC_GRAND_PIANO: 2,
	HONKY_TONK_PIANO: 3,
	ELECTRIC_PIANO_1: 4,
	ELECTRIC_PIANO_2: 5,
	HARPSICHORD: 6,
	CLAVINET: 7,
	// Chromatic Percussion
	CELESTA: 8,
	GLOCKENSPIEL: 9,
	MUSIC_BOX: 10,
	VIBRAPHONE: 11,
	MARIMBA: 12,
	XYLOPHONE: 13,
	TUBULAR_BELLS: 14,
	DULCIMER: 15,
	// Organ
	DRAWBAR_ORGAN: 16,
	PERCUSSIVE_ORGAN: 17,
	ROCK_ORGAN: 18,
	CHURCH_ORGAN: 19,
	REED_ORGAN: 20,
	ACCORDION: 21,
	HARMONICA: 22,
	TANGO_ACCORDION: 23,
	// Guitar
	ACOUSTIC_GUITAR_NYLON: 24,
	ACOUSTIC_GUITAR_STEEL: 25,
	ELECTRIC_GUITAR_JAZZ: 26,
	ELECTRIC_GUITAR_CLEAN: 27,
	ELECTRIC_GUITAR_MUTED: 28,
	OVERDRIVEN_GUITAR: 29,
	DISTORTION_GUITAR: 30,
	GUITAR_HARMONICS: 31,
	// Bass
	ACOUSTIC_BASS: 32,
	ELECTRIC_BASS_FINGER: 33,
	ELECTRIC_BASS_PICK: 34,
	FRETLESS_BASS: 35,
	SLAP_BASS_1: 36,
	SLAP_BASS_2: 37,
	SYNTH_BASS_1: 38,
	SYNTH_BASS_2: 39,
	// Strings
	VIOLIN: 40,
	VIOLA: 41,
	CELLO: 42,
	CONTRABASS: 43,
	TREMOLO_STRINGS: 44,
	PIZZICATO_STRINGS: 45,
	ORCHESTRAL_HARP: 46,
	TIMPANI: 47,
	// Ensemble
	STRING_ENSEMBLE_1: 48,
	STRING_ENSEMBLE_2: 49,
	SYNTH_STRINGS_1: 50,
	SYNTH_STRINGS_2: 51,
	CHOIR_AAHS: 52,
	VOICE_OOHS: 53,
	SYNTH_VOICE: 54,
	ORCHESTRA_HIT: 55,
	// Brass
	TRUMPET: 56,
	TROMBONE: 57,
	TUBA: 58,
	MUTED_TRUMPET: 59,
	FRENCH_HORN: 60,
	BRASS_SECTION: 61,
	SYNTH_BRASS_1: 62,
	SYNTH_BRASS_2: 63,
} as const

/**
 * Note names
 */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/**
 * Get note name from MIDI note number
 */
export function getNoteName(note: number): string {
	const octave = Math.floor(note / 12) - 1
	const name = NOTE_NAMES[note % 12]
	return `${name}${octave}`
}

/**
 * Get MIDI note number from note name
 */
export function getNoteNumber(name: string): number {
	const match = name.match(/^([A-G]#?)(-?\d+)$/)
	if (!match) return -1

	const noteName = match[1]!
	const octave = parseInt(match[2]!, 10)
	const noteIndex = NOTE_NAMES.indexOf(noteName as typeof NOTE_NAMES[number])

	if (noteIndex === -1) return -1
	return (octave + 1) * 12 + noteIndex
}

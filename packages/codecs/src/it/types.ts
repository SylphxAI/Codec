/**
 * IT (Impulse Tracker) types
 * Advanced tracker music format with instruments and more effects than S3M
 */

/**
 * IT file version
 */
export type ITVersion = 0x0200 | 0x0214 | 0x0215 | 0x0216 | 0x0217

/**
 * IT channel settings
 */
export interface ITChannelSettings {
	/** Channel enabled */
	enabled: boolean
	/** Channel panning (0-64, 32 = center) */
	panning: number
	/** Channel volume (0-64) */
	volume: number
	/** Channel muted */
	muted: boolean
	/** Channel surround */
	surround: boolean
}

/**
 * IT sample
 */
export interface ITSample {
	/** DOS filename */
	filename: string
	/** Sample name */
	name: string
	/** Global volume (0-64) */
	globalVolume: number
	/** Flags (1 = present, 2 = 16-bit, 4 = stereo, 8 = compressed, 16 = loop, 32 = sustain loop, 64 = ping-pong loop, 128 = ping-pong sustain) */
	flags: number
	/** Default volume (0-64) */
	volume: number
	/** Default panning (0-64, 32 = center) */
	panning: number
	/** Sample length */
	length: number
	/** Loop start */
	loopStart: number
	/** Loop end */
	loopEnd: number
	/** C5 speed (samples per second at middle C) */
	c5Speed: number
	/** Sustain loop start */
	sustainLoopStart: number
	/** Sustain loop end */
	sustainLoopEnd: number
	/** Convert flags (bit 0 = signed, bit 1 = big endian, bit 2 = delta, bit 3 = byte delta, bit 4 = TX wave, bit 5 = left/right stereo) */
	convert: number
	/** Default pan enabled */
	defaultPan: boolean
	/** Vibrato speed */
	vibratoSpeed: number
	/** Vibrato depth */
	vibratoDepth: number
	/** Vibrato rate */
	vibratoRate: number
	/** Vibrato waveform (0 = sine, 1 = ramp down, 2 = square, 3 = random) */
	vibratoWaveform: number
	/** Sample data */
	data: Uint8Array
	/** Sample has data */
	hasData: boolean
	/** Is 16-bit */
	is16Bit: boolean
	/** Is stereo */
	isStereo: boolean
	/** Is compressed */
	isCompressed: boolean
	/** Has loop */
	hasLoop: boolean
	/** Has sustain loop */
	hasSustainLoop: boolean
	/** Is ping-pong loop */
	isPingPongLoop: boolean
	/** Is ping-pong sustain loop */
	isPingPongSustainLoop: boolean
}

/**
 * IT instrument envelope point
 */
export interface ITEnvelopePoint {
	/** Tick value */
	tick: number
	/** Node value (0-64) */
	value: number
}

/**
 * IT instrument envelope
 */
export interface ITEnvelope {
	/** Envelope enabled */
	enabled: boolean
	/** Loop enabled */
	loop: boolean
	/** Sustain loop enabled */
	sustainLoop: boolean
	/** Loop start point */
	loopStart: number
	/** Loop end point */
	loopEnd: number
	/** Sustain loop start */
	sustainLoopStart: number
	/** Sustain loop end */
	sustainLoopEnd: number
	/** Envelope points */
	points: ITEnvelopePoint[]
}

/**
 * IT instrument
 */
export interface ITInstrument {
	/** DOS filename */
	filename: string
	/** Instrument name */
	name: string
	/** New note action (0 = cut, 1 = continue, 2 = note off, 3 = note fade) */
	newNoteAction: number
	/** Duplicate check type (0 = off, 1 = note, 2 = sample, 3 = instrument) */
	duplicateCheckType: number
	/** Duplicate check action (0 = cut, 1 = note off, 2 = note fade) */
	duplicateCheckAction: number
	/** Fadeout (0-256) */
	fadeout: number
	/** Pitch pan separation (-32 to 32) */
	pitchPanSeparation: number
	/** Pitch pan center (C-0 to B-9) */
	pitchPanCenter: number
	/** Global volume (0-128) */
	globalVolume: number
	/** Default pan (0-64, 32 = center) */
	defaultPan: number
	/** Random volume variation (0-100) */
	randomVolume: number
	/** Random panning variation (0-64) */
	randomPanning: number
	/** Use volume envelope */
	useVolumeEnvelope: boolean
	/** Use panning envelope */
	usePanningEnvelope: boolean
	/** Use pitch envelope */
	usePitchEnvelope: boolean
	/** Volume envelope */
	volumeEnvelope: ITEnvelope
	/** Panning envelope */
	panningEnvelope: ITEnvelope
	/** Pitch envelope */
	pitchEnvelope: ITEnvelope
	/** Note-sample table (maps note to sample/transpose) */
	noteSampleTable: Array<{ sample: number; note: number }>
}

/**
 * IT pattern cell/note
 */
export interface ITCell {
	/** Note (0xFF = no note, 0xFE = note cut, 0xFD = note off) */
	note: number
	/** Instrument number (0 = no instrument) */
	instrument: number
	/** Volume/panning column (0xFF = no volume) */
	volumePan: number
	/** Effect command */
	command: number
	/** Effect parameter */
	param: number
}

/**
 * IT pattern
 */
export interface ITPattern {
	/** Number of rows */
	rows: number
	/** Pattern data (rows x channels) */
	data: ITCell[][]
}

/**
 * IT file
 */
export interface ITFile {
	/** Song name */
	name: string
	/** Pattern row highlight */
	patternRowHighlight: number
	/** File format version */
	version: ITVersion
	/** Tracker version that created the file */
	createdWith: number
	/** Compatible with tracker version */
	compatibleWith: number
	/** Flags (bit 0 = stereo, bit 1 = vol0 mix optimizations, bit 2 = use instruments, bit 3 = linear slides, bit 4 = old effects, bit 5 = link G memory, bit 6 = use MIDI pitch controller, bit 7 = request embedded MIDI config) */
	flags: number
	/** Special flags (bit 0 = message, bit 1 = MIDI config embedded) */
	special: number
	/** Number of orders */
	orderCount: number
	/** Number of instruments */
	instrumentCount: number
	/** Number of samples */
	sampleCount: number
	/** Number of patterns */
	patternCount: number
	/** Initial global volume (0-128) */
	globalVolume: number
	/** Initial mix volume (0-128) */
	mixVolume: number
	/** Initial speed (1-255) */
	initialSpeed: number
	/** Initial tempo (32-255) */
	initialTempo: number
	/** Stereo separation (0-128) */
	stereoSeparation: number
	/** Pitch wheel depth */
	pitchWheelDepth: number
	/** Song message length */
	messageLength: number
	/** Message offset */
	messageOffset: number
	/** Song message (optional) */
	message?: string
	/** Channel pan positions */
	channelPan: number[]
	/** Channel volumes */
	channelVolume: number[]
	/** Channel settings */
	channels: ITChannelSettings[]
	/** Order list (pattern sequence) */
	orders: number[]
	/** Instruments */
	instruments: ITInstrument[]
	/** Samples */
	samples: ITSample[]
	/** Patterns */
	patterns: ITPattern[]
	/** Uses stereo */
	isStereo: boolean
	/** Uses instruments (vs samples) */
	usesInstruments: boolean
	/** Uses linear slides */
	usesLinearSlides: boolean
	/** Uses old effects */
	usesOldEffects: boolean
}

/**
 * IT file info (quick parse)
 */
export interface ITInfo {
	/** Song name */
	name: string
	/** File format version */
	version: ITVersion
	/** Number of channels used */
	channelCount: number
	/** Number of patterns */
	patternCount: number
	/** Number of instruments */
	instrumentCount: number
	/** Number of samples */
	sampleCount: number
	/** Initial tempo (BPM) */
	initialTempo: number
	/** Initial speed (ticks per row) */
	initialSpeed: number
	/** Has song message */
	hasMessage: boolean
	/** Uses instruments */
	usesInstruments: boolean
	/** Estimated duration in seconds */
	durationSeconds: number
}

/**
 * IT encode options
 */
export interface ITEncodeOptions {
	/** Initial speed (default: 6) */
	initialSpeed?: number
	/** Initial tempo (default: 125) */
	initialTempo?: number
	/** Global volume (default: 128) */
	globalVolume?: number
	/** Mix volume (default: 48) */
	mixVolume?: number
	/** Use instruments (default: false) */
	useInstruments?: boolean
}

/**
 * Note names for IT
 */
export const IT_NOTE_NAMES = [
	'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'
] as const

/**
 * Special note values
 */
export const IT_NOTE_NONE = 0xff
export const IT_NOTE_CUT = 0xfe
export const IT_NOTE_OFF = 0xfd

/**
 * Get note name from IT note value
 */
export function getITNoteName(note: number): string {
	if (note === IT_NOTE_NONE) return '...'
	if (note === IT_NOTE_CUT) return '^^^'
	if (note === IT_NOTE_OFF) return '==='

	if (note >= 120) return '???'

	const octave = Math.floor(note / 12)
	const noteIndex = note % 12

	return `${IT_NOTE_NAMES[noteIndex]}${octave}`
}

/**
 * Get IT note value from note name
 */
export function getITNoteValue(name: string): number {
	if (name === '...' || name === '---') return IT_NOTE_NONE
	if (name === '^^^') return IT_NOTE_CUT
	if (name === '===') return IT_NOTE_OFF

	const match = name.match(/^([A-G][#-])(\d+)$/)
	if (!match) return IT_NOTE_NONE

	const noteName = match[1]!
	const octave = parseInt(match[2]!, 10)
	const noteIndex = IT_NOTE_NAMES.indexOf(noteName as typeof IT_NOTE_NAMES[number])

	if (noteIndex === -1 || octave < 0 || octave > 9) return IT_NOTE_NONE

	return octave * 12 + noteIndex
}

/**
 * Common IT effects
 */
export const ITEffect = {
	NONE: 0,
	SET_SPEED: 1,         // A
	JUMP_TO_ORDER: 2,     // B
	BREAK_TO_ROW: 3,      // C
	VOLUME_SLIDE: 4,      // D
	PORTAMENTO_DOWN: 5,   // E
	PORTAMENTO_UP: 6,     // F
	TONE_PORTAMENTO: 7,   // G
	VIBRATO: 8,           // H
	TREMOR: 9,            // I
	ARPEGGIO: 10,         // J
	VIBRATO_VOLUME: 11,   // K
	TONE_PORTA_VOLUME: 12,// L
	CHANNEL_VOLUME: 13,   // M
	CHANNEL_VOLUME_SLIDE: 14, // N
	SAMPLE_OFFSET: 15,    // O
	PANNING_SLIDE: 16,    // P
	RETRIG_NOTE: 17,      // Q
	TREMOLO: 18,          // R
	EXTENDED: 19,         // S
	SET_TEMPO: 20,        // T
	FINE_VIBRATO: 21,     // U
	GLOBAL_VOLUME: 22,    // V
	GLOBAL_VOLUME_SLIDE: 23, // W
	SET_PANNING: 24,      // X
	PANBRELLO: 25,        // Y
	MIDI_MACRO: 26,       // Z
} as const

/**
 * XM (Extended Module / FastTracker 2) types
 * Tracker music format with instruments and samples
 */

/**
 * XM file format magic: "Extended Module: "
 */
export const XM_MAGIC = 'Extended Module: '

/**
 * XM pattern note
 */
export interface XMNote {
	/** Note value (0 = no note, 1-96 = notes, 97 = key off) */
	note: number
	/** Instrument number (0 = no instrument, 1-128) */
	instrument: number
	/** Volume column effect (0 = no volume column) */
	volume: number
	/** Effect type (0 = no effect) */
	effectType: number
	/** Effect parameter */
	effectParam: number
}

/**
 * XM pattern
 */
export interface XMPattern {
	/** Number of rows (1-256) */
	rows: number
	/** Pattern data: [row][channel] */
	data: XMNote[][]
}

/**
 * XM sample
 */
export interface XMSample {
	/** Sample length in bytes */
	length: number
	/** Sample loop start */
	loopStart: number
	/** Sample loop length */
	loopLength: number
	/** Volume (0-64) */
	volume: number
	/** Finetune (-128 to 127) */
	finetune: number
	/** Sample type flags (bit 0-1: loop type, bit 4: 16-bit) */
	type: number
	/** Panning (0-255) */
	panning: number
	/** Relative note number (-128 to 127) */
	relativeNote: number
	/** Sample name (max 22 chars) */
	name: string
	/** Sample data */
	data: Int8Array | Int16Array
}

/**
 * XM instrument envelope point
 */
export interface XMEnvelopePoint {
	/** Frame position */
	frame: number
	/** Value (0-64) */
	value: number
}

/**
 * XM instrument envelope
 */
export interface XMEnvelope {
	/** Envelope type flags */
	type: number
	/** Number of points */
	numPoints: number
	/** Sustain point */
	sustainPoint: number
	/** Loop start point */
	loopStartPoint: number
	/** Loop end point */
	loopEndPoint: number
	/** Envelope points */
	points: XMEnvelopePoint[]
}

/**
 * XM instrument
 */
export interface XMInstrument {
	/** Instrument name (max 22 chars) */
	name: string
	/** Instrument type (always 0 for XM) */
	type: number
	/** Number of samples */
	numSamples: number
	/** Sample header size (if samples > 0) */
	sampleHeaderSize: number
	/** Sample number for notes (96 values, one per key) */
	sampleForNote: number[]
	/** Volume envelope */
	volumeEnvelope: XMEnvelope
	/** Panning envelope */
	panningEnvelope: XMEnvelope
	/** Vibrato type */
	vibratoType: number
	/** Vibrato sweep */
	vibratoSweep: number
	/** Vibrato depth */
	vibratoDepth: number
	/** Vibrato rate */
	vibratoRate: number
	/** Volume fadeout */
	volumeFadeout: number
	/** Samples */
	samples: XMSample[]
}

/**
 * XM file
 */
export interface XMFile {
	/** Module name (max 20 chars) */
	name: string
	/** Tracker name (usually "FastTracker v2.00   ") */
	trackerName: string
	/** Version number */
	version: number
	/** Header size */
	headerSize: number
	/** Song length (in pattern order table) */
	songLength: number
	/** Restart position */
	restartPosition: number
	/** Number of channels (2-32) */
	numChannels: number
	/** Number of patterns (max 256) */
	numPatterns: number
	/** Number of instruments (max 128) */
	numInstruments: number
	/** Flags (bit 0: Amiga frequency table) */
	flags: number
	/** Default tempo (1-31) */
	defaultTempo: number
	/** Default BPM (32-255) */
	defaultBPM: number
	/** Pattern order table (max 256) */
	patternOrder: number[]
	/** Patterns */
	patterns: XMPattern[]
	/** Instruments */
	instruments: XMInstrument[]
}

/**
 * XM file info (quick parse)
 */
export interface XMInfo {
	name: string
	trackerName: string
	version: number
	songLength: number
	numChannels: number
	numPatterns: number
	numInstruments: number
	defaultTempo: number
	defaultBPM: number
	duration: number // estimated in seconds
	totalSamples: number
}

/**
 * XM encode options
 */
export interface XMEncodeOptions {
	/** Module name (max 20 chars) */
	name?: string
	/** Default tempo (1-31, default: 6) */
	tempo?: number
	/** Default BPM (32-255, default: 125) */
	bpm?: number
	/** Number of channels (2-32, default: 4) */
	channels?: number
}

/**
 * XM loop types
 */
export const XMLoopType = {
	NONE: 0,
	FORWARD: 1,
	PING_PONG: 2,
} as const

/**
 * XM envelope type flags
 */
export const XMEnvelopeType = {
	ENABLED: 1,
	SUSTAIN: 2,
	LOOP: 4,
} as const

/**
 * Note names for XM (C-0 to B-7, plus key off)
 */
export const XM_NOTE_NAMES = [
	'---', // 0: no note
	'C-0', 'C#0', 'D-0', 'D#0', 'E-0', 'F-0', 'F#0', 'G-0', 'G#0', 'A-0', 'A#0', 'B-0',
	'C-1', 'C#1', 'D-1', 'D#1', 'E-1', 'F-1', 'F#1', 'G-1', 'G#1', 'A-1', 'A#1', 'B-1',
	'C-2', 'C#2', 'D-2', 'D#2', 'E-2', 'F-2', 'F#2', 'G-2', 'G#2', 'A-2', 'A#2', 'B-2',
	'C-3', 'C#3', 'D-3', 'D#3', 'E-3', 'F-3', 'F#3', 'G-3', 'G#3', 'A-3', 'A#3', 'B-3',
	'C-4', 'C#4', 'D-4', 'D#4', 'E-4', 'F-4', 'F#4', 'G-4', 'G#4', 'A-4', 'A#4', 'B-4',
	'C-5', 'C#5', 'D-5', 'D#5', 'E-5', 'F-5', 'F#5', 'G-5', 'G#5', 'A-5', 'A#5', 'B-5',
	'C-6', 'C#6', 'D-6', 'D#6', 'E-6', 'F-6', 'F#6', 'G-6', 'G#6', 'A-6', 'A#6', 'B-6',
	'C-7', 'C#7', 'D-7', 'D#7', 'E-7', 'F-7', 'F#7', 'G-7', 'G#7', 'A-7', 'A#7', 'B-7',
	'===', // 97: key off
] as const

/**
 * Get XM note name from note number
 */
export function getXMNoteName(note: number): string {
	if (note >= 0 && note < XM_NOTE_NAMES.length) {
		return XM_NOTE_NAMES[note]
	}
	return '???'
}

/**
 * Get XM note number from note name
 */
export function getXMNoteNumber(name: string): number {
	const index = XM_NOTE_NAMES.indexOf(name as typeof XM_NOTE_NAMES[number])
	return index >= 0 ? index : 0
}

/**
 * Calculate sample rate from note and finetune
 */
export function calculateXMFrequency(note: number, relativeNote: number, finetune: number): number {
	// XM uses linear frequency table by default
	// Frequency = 8363 * 2^((note - 48 + relativeNote + finetune/128) / 12)
	const period = note - 1 + relativeNote + finetune / 128
	return 8363 * Math.pow(2, (period - 48) / 12)
}

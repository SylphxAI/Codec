/**
 * MOD (ProTracker) types
 * Amiga tracker music format
 */

/**
 * MOD format type based on signature
 */
export type ModFormat = 'M.K.' | 'M!K!' | 'FLT4' | 'FLT8' | '2CHN' | '4CHN' | '6CHN' | '8CHN'

/**
 * MOD sample (instrument)
 */
export interface ModSample {
	/** Sample name (22 characters) */
	name: string
	/** Sample length in words (multiply by 2 for bytes) */
	length: number
	/** Finetune value (-8 to 7) */
	finetune: number
	/** Volume (0-64) */
	volume: number
	/** Repeat point in words */
	repeatPoint: number
	/** Repeat length in words */
	repeatLength: number
	/** Raw 8-bit signed sample data */
	data: Int8Array
}

/**
 * MOD note entry in a pattern
 */
export interface ModNote {
	/** Sample number (0-31, 0 = no sample) */
	sample: number
	/** Period value (note pitch, 0 = no note) */
	period: number
	/** Effect type (0x0-0xF) */
	effect: number
	/** Effect parameter (0x00-0xFF) */
	effectParam: number
}

/**
 * MOD pattern row (one row per channel)
 */
export type ModPatternRow = ModNote[]

/**
 * MOD pattern (64 rows)
 */
export interface ModPattern {
	/** Pattern rows (64 rows, each with notes for all channels) */
	rows: ModPatternRow[]
}

/**
 * MOD file structure
 */
export interface ModFile {
	/** Song title (20 characters) */
	title: string
	/** Samples/instruments (31 samples) */
	samples: ModSample[]
	/** Song length (number of positions) */
	songLength: number
	/** Restart position (loop point) */
	restartPosition: number
	/** Pattern order table (0-127 positions) */
	patternTable: number[]
	/** Format signature */
	format: ModFormat
	/** Number of channels (4, 6, 8, etc.) */
	channels: number
	/** Patterns (max 128) */
	patterns: ModPattern[]
}

/**
 * MOD file info (quick parse)
 */
export interface ModInfo {
	title: string
	format: ModFormat
	channels: number
	songLength: number
	numPatterns: number
	numSamples: number
	duration: number // estimated duration in seconds
}

/**
 * MOD encode options
 */
export interface ModEncodeOptions {
	/** Format signature (default: 'M.K.' for 4 channels) */
	format?: ModFormat
	/** Default tempo (BPM, default: 125) */
	tempo?: number
	/** Default speed (ticks per row, default: 6) */
	speed?: number
}

/**
 * Period table for MOD notes (Amiga period values)
 * Period value determines the note pitch
 * Index 0 = C-1, Index 12 = C-2, Index 24 = C-3, Index 36 = C-4
 */
export const MOD_PERIOD_TABLE: readonly number[] = [
	// Octave 1 (C-1 to B-1)
	1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907,
	// Octave 2 (C-2 to B-2)
	856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
	// Octave 3 (C-3 to B-3)
	428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
	// Octave 4 (C-4 to B-4)
	214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
]

/**
 * Note names for MOD period values
 */
export const MOD_NOTE_NAMES = [
	'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-',
] as const

/**
 * Get note name from period value
 */
export function getPeriodNoteName(period: number): string {
	if (period === 0) return '---'

	// Find closest period
	let closest = 0
	let minDiff = Infinity

	for (let i = 0; i < MOD_PERIOD_TABLE.length; i++) {
		const diff = Math.abs(MOD_PERIOD_TABLE[i]! - period)
		if (diff < minDiff) {
			minDiff = diff
			closest = i
		}
	}

	const octave = Math.floor(closest / 12)
	const note = closest % 12
	return `${MOD_NOTE_NAMES[note]}${octave + 1}`
}

/**
 * Get period value from note name
 */
export function getNoteNamePeriod(name: string): number {
	if (name === '---') return 0

	const match = name.match(/^([A-G][#-])(\d)$/)
	if (!match) return 0

	const noteName = match[1]!
	const octave = parseInt(match[2]!, 10)

	const noteIndex = MOD_NOTE_NAMES.indexOf(noteName as typeof MOD_NOTE_NAMES[number])
	if (noteIndex === -1) return 0

	const index = (octave - 1) * 12 + noteIndex
	if (index < 0 || index >= MOD_PERIOD_TABLE.length) return 0

	return MOD_PERIOD_TABLE[index]!
}

/**
 * MOD effect types
 */
export const ModEffect = {
	ARPEGGIO: 0x0,
	SLIDE_UP: 0x1,
	SLIDE_DOWN: 0x2,
	TONE_PORTAMENTO: 0x3,
	VIBRATO: 0x4,
	TONE_PORTAMENTO_VOLUME_SLIDE: 0x5,
	VIBRATO_VOLUME_SLIDE: 0x6,
	TREMOLO: 0x7,
	SET_PANNING: 0x8,
	SAMPLE_OFFSET: 0x9,
	VOLUME_SLIDE: 0xa,
	POSITION_JUMP: 0xb,
	SET_VOLUME: 0xc,
	PATTERN_BREAK: 0xd,
	EXTENDED: 0xe,
	SET_SPEED_TEMPO: 0xf,
} as const

/**
 * Extended effect types (effect 0xE)
 */
export const ModExtendedEffect = {
	FINE_SLIDE_UP: 0x1,
	FINE_SLIDE_DOWN: 0x2,
	GLISSANDO_CONTROL: 0x3,
	SET_VIBRATO_WAVEFORM: 0x4,
	SET_FINETUNE: 0x5,
	PATTERN_LOOP: 0x6,
	SET_TREMOLO_WAVEFORM: 0x7,
	RETRIGGER_NOTE: 0x9,
	FINE_VOLUME_UP: 0xa,
	FINE_VOLUME_DOWN: 0xb,
	CUT_NOTE: 0xc,
	DELAY_NOTE: 0xd,
	PATTERN_DELAY: 0xe,
	INVERT_LOOP: 0xf,
} as const

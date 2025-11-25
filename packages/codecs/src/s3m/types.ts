/**
 * S3M (ScreamTracker 3 Module) types
 * Tracker music format from the demoscene era
 */

/**
 * S3M file version
 */
export type S3MVersion = 0x1300 | 0x1301 | 0x1302 | 0x1303 | 0x1304

/**
 * S3M channel settings
 */
export interface S3MChannelSettings {
	/** Channel enabled */
	enabled: boolean
	/** Channel panning (-1 = left, 0 = center, 1 = right) */
	panning: number
}

/**
 * S3M sample
 */
export interface S3MSample {
	/** Sample type (0 = empty, 1 = PCM) */
	type: number
	/** DOS filename */
	filename: string
	/** Sample name */
	name: string
	/** Sample length in bytes */
	length: number
	/** Loop start */
	loopStart: number
	/** Loop end */
	loopEnd: number
	/** Default volume (0-64) */
	volume: number
	/** Packing scheme (0 = unpacked) */
	pack: number
	/** Flags (1 = loop, 2 = stereo, 4 = 16-bit) */
	flags: number
	/** C4 speed (samples per second) */
	c4Speed: number
	/** Sample data */
	data: Uint8Array
	/** Is looped */
	isLooped: boolean
	/** Is stereo */
	isStereo: boolean
	/** Is 16-bit */
	is16Bit: boolean
}

/**
 * S3M pattern cell/note
 */
export interface S3MCell {
	/** Note (0xFF = no note, 0xFE = note cut) */
	note: number
	/** Instrument number (0 = no instrument) */
	instrument: number
	/** Volume column (0xFF = no volume) */
	volume: number
	/** Effect command */
	command: number
	/** Effect parameter */
	param: number
}

/**
 * S3M pattern
 */
export interface S3MPattern {
	/** Pattern rows (64 rows x 32 channels max) */
	rows: S3MCell[][]
}

/**
 * S3M file
 */
export interface S3MFile {
	/** Song name */
	name: string
	/** File format version */
	version: S3MVersion
	/** Number of orders */
	orderCount: number
	/** Number of instruments */
	instrumentCount: number
	/** Number of patterns */
	patternCount: number
	/** Flags (bit 0 = ST2 vibrato, bit 1 = ST2 tempo, bit 2 = Amiga slides, etc) */
	flags: number
	/** Tracker version that created the file */
	createdWith: number
	/** Sample format (1 = signed, 2 = unsigned) */
	sampleFormat: number
	/** Initial global volume (0-64) */
	globalVolume: number
	/** Initial speed (1-255) */
	initialSpeed: number
	/** Initial tempo (32-255) */
	initialTempo: number
	/** Master volume multiplier (0-127) */
	masterVolume: number
	/** Ultra click removal (0-15) */
	ultraClickRemoval: number
	/** Default pan positions (1 = yes, 0 = no) */
	defaultPan: boolean
	/** Song message (optional) */
	message?: string
	/** Channel settings */
	channels: S3MChannelSettings[]
	/** Order list (pattern sequence) */
	orders: number[]
	/** Instruments/samples */
	instruments: S3MSample[]
	/** Patterns */
	patterns: S3MPattern[]
}

/**
 * S3M file info (quick parse)
 */
export interface S3MInfo {
	/** Song name */
	name: string
	/** File format version */
	version: S3MVersion
	/** Number of channels used */
	channelCount: number
	/** Number of patterns */
	patternCount: number
	/** Number of instruments */
	instrumentCount: number
	/** Initial tempo (BPM) */
	initialTempo: number
	/** Initial speed (ticks per row) */
	initialSpeed: number
	/** Has song message */
	hasMessage: boolean
	/** Estimated duration in seconds */
	durationSeconds: number
}

/**
 * S3M encode options
 */
export interface S3MEncodeOptions {
	/** Initial speed (default: 6) */
	initialSpeed?: number
	/** Initial tempo (default: 125) */
	initialTempo?: number
	/** Global volume (default: 64) */
	globalVolume?: number
	/** Master volume (default: 48) */
	masterVolume?: number
}

/**
 * Note names for S3M
 */
export const S3M_NOTE_NAMES = [
	'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'
] as const

/**
 * Special note values
 */
export const S3M_NOTE_NONE = 0xff
export const S3M_NOTE_CUT = 0xfe

/**
 * Get note name from S3M note value
 */
export function getS3MNoteName(note: number): string {
	if (note === S3M_NOTE_NONE) return '...'
	if (note === S3M_NOTE_CUT) return '^^^'

	const octave = (note >> 4) & 0x0f
	const noteIndex = note & 0x0f

	if (noteIndex >= 12) return '???'

	return `${S3M_NOTE_NAMES[noteIndex]}${octave}`
}

/**
 * Get S3M note value from note name
 */
export function getS3MNoteValue(name: string): number {
	if (name === '...' || name === '---') return S3M_NOTE_NONE
	if (name === '^^^') return S3M_NOTE_CUT

	const match = name.match(/^([A-G][#-])(\d+)$/)
	if (!match) return S3M_NOTE_NONE

	const noteName = match[1]!
	const octave = parseInt(match[2]!, 10)
	const noteIndex = S3M_NOTE_NAMES.indexOf(noteName as typeof S3M_NOTE_NAMES[number])

	if (noteIndex === -1 || octave < 0 || octave > 9) return S3M_NOTE_NONE

	return (octave << 4) | noteIndex
}

/**
 * Common S3M effects
 */
export const S3MEffect = {
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
	SET_SAMPLE_OFFSET: 15,// O
	RETRIG_NOTE: 17,      // Q
	TREMOLO: 18,          // R
	EXTENDED: 19,         // S
	SET_TEMPO: 20,        // T
	FINE_VIBRATO: 21,     // U
	SET_GLOBAL_VOLUME: 22,// V
} as const

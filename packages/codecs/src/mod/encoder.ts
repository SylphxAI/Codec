/**
 * MOD file encoder
 * Creates ProTracker MOD files
 */

import type {
	ModEncodeOptions,
	ModFile,
	ModNote,
	ModPattern,
	ModSample,
} from './types'

/**
 * Encode MOD file
 */
export function encodeMod(file: ModFile, options: ModEncodeOptions = {}): Uint8Array {
	const format = options.format ?? file.format

	// Calculate size
	const headerSize = 20 // Title
	const sampleHeaderSize = 31 * 30 // 31 sample headers
	const songDataSize = 1 + 1 + 128 // Length + restart + pattern table
	const signatureSize = 4 // Format signature
	const patternSize = file.patterns.length * 64 * file.channels * 4
	const sampleDataSize = file.samples.reduce((sum, s) => sum + s.data.length, 0)

	const totalSize = headerSize + sampleHeaderSize + songDataSize + signatureSize + patternSize + sampleDataSize

	const data = new Uint8Array(totalSize)
	let offset = 0

	// Write title (20 bytes)
	offset = writeText(data, offset, file.title, 20)

	// Write 31 sample headers
	for (let i = 0; i < 31; i++) {
		const sample = file.samples[i]

		if (sample) {
			// Sample name (22 bytes)
			offset = writeText(data, offset, sample.name, 22)

			// Sample length in words
			writeU16BE(data, offset, Math.floor(sample.length / 2))
			offset += 2

			// Finetune (4 bits) and volume (1 byte)
			const finetune = sample.finetune < 0 ? sample.finetune + 16 : sample.finetune
			data[offset++] = finetune & 0x0f

			data[offset++] = Math.min(sample.volume, 64)

			// Repeat point in words
			writeU16BE(data, offset, Math.floor(sample.repeatPoint / 2))
			offset += 2

			// Repeat length in words
			writeU16BE(data, offset, Math.floor(sample.repeatLength / 2))
			offset += 2
		} else {
			// Empty sample
			offset = writeText(data, offset, '', 22)
			writeU16BE(data, offset, 0)
			offset += 2
			data[offset++] = 0 // finetune
			data[offset++] = 0 // volume
			writeU16BE(data, offset, 0) // repeat point
			offset += 2
			writeU16BE(data, offset, 0) // repeat length
			offset += 2
		}
	}

	// Song length
	data[offset++] = file.songLength

	// Restart position
	data[offset++] = file.restartPosition

	// Pattern table (128 bytes)
	for (let i = 0; i < 128; i++) {
		data[offset++] = file.patternTable[i] ?? 0
	}

	// Format signature
	for (let i = 0; i < 4; i++) {
		data[offset++] = format.charCodeAt(i)
	}

	// Write patterns
	for (const pattern of file.patterns) {
		for (const row of pattern.rows) {
			for (let ch = 0; ch < file.channels; ch++) {
				const note = row[ch] ?? { sample: 0, period: 0, effect: 0, effectParam: 0 }

				// Pack note data
				// Format: xxxx xxxx PPPP PPPP SSSS EEFF FFFF FFFF
				const byte0 = (note.sample & 0xf0) | ((note.period >> 8) & 0x0f)
				const byte1 = note.period & 0xff
				const byte2 = ((note.sample & 0x0f) << 4) | (note.effect & 0x0f)
				const byte3 = note.effectParam & 0xff

				data[offset++] = byte0
				data[offset++] = byte1
				data[offset++] = byte2
				data[offset++] = byte3
			}
		}
	}

	// Write sample data
	for (const sample of file.samples) {
		if (sample && sample.data.length > 0) {
			// Convert signed to unsigned
			for (let i = 0; i < sample.data.length; i++) {
				data[offset++] = sample.data[i]! + 128
			}
		}
	}

	return data
}

/**
 * Create a simple MOD file from audio samples
 */
export function createModFromAudio(
	samples: Float32Array[],
	sampleRate: number,
	options: ModEncodeOptions = {}
): Uint8Array {
	// Create a basic single-sample MOD file
	const format = options.format ?? 'M.K.'
	const channels = 4

	// Convert audio to 8-bit signed sample
	const audioData = samples[0] ?? new Float32Array(0)
	const sampleData = new Int8Array(audioData.length)
	for (let i = 0; i < audioData.length; i++) {
		sampleData[i] = Math.max(-128, Math.min(127, Math.round(audioData[i]! * 127)))
	}

	// Create sample
	const sample: ModSample = {
		name: 'Sample',
		length: sampleData.length,
		finetune: 0,
		volume: 64,
		repeatPoint: 0,
		repeatLength: 2, // No loop
		data: sampleData,
	}

	// Create empty samples for slots 2-31
	const allSamples: ModSample[] = [sample]
	for (let i = 1; i < 31; i++) {
		allSamples.push({
			name: '',
			length: 0,
			finetune: 0,
			volume: 0,
			repeatPoint: 0,
			repeatLength: 2,
			data: new Int8Array(0),
		})
	}

	// Create a simple pattern with one note
	const note: ModNote = {
		sample: 1,
		period: 428, // C-3
		effect: 0,
		effectParam: 0,
	}

	const rows: ModNote[][] = []
	for (let r = 0; r < 64; r++) {
		const rowNotes: ModNote[] = []
		for (let c = 0; c < channels; c++) {
			if (r === 0 && c === 0) {
				rowNotes.push(note)
			} else {
				rowNotes.push({ sample: 0, period: 0, effect: 0, effectParam: 0 })
			}
		}
		rows.push(rowNotes)
	}

	const pattern: ModPattern = { rows }

	// Create MOD file
	const modFile: ModFile = {
		title: 'Converted Audio',
		samples: allSamples,
		songLength: 1,
		restartPosition: 0,
		patternTable: [0, ...Array(127).fill(0)],
		format,
		channels,
		patterns: [pattern],
	}

	return encodeMod(modFile, options)
}

/**
 * Create an empty MOD file
 */
export function createEmptyMod(title: string = 'Untitled', channels: number = 4): ModFile {
	const format = channels === 4 ? 'M.K.' : `${channels}CHN` as 'M.K.' | '6CHN' | '8CHN'

	// Create empty samples
	const samples: ModSample[] = []
	for (let i = 0; i < 31; i++) {
		samples.push({
			name: '',
			length: 0,
			finetune: 0,
			volume: 64,
			repeatPoint: 0,
			repeatLength: 2,
			data: new Int8Array(0),
		})
	}

	// Create empty pattern
	const rows: ModNote[][] = []
	for (let r = 0; r < 64; r++) {
		const rowNotes: ModNote[] = []
		for (let c = 0; c < channels; c++) {
			rowNotes.push({
				sample: 0,
				period: 0,
				effect: 0,
				effectParam: 0,
			})
		}
		rows.push(rowNotes)
	}

	const pattern: ModPattern = { rows }

	return {
		title: title.substring(0, 20),
		samples,
		songLength: 1,
		restartPosition: 0,
		patternTable: [0, ...Array(127).fill(0)],
		format,
		channels,
		patterns: [pattern],
	}
}

/**
 * Write text to buffer
 */
function writeText(data: Uint8Array, offset: number, text: string, length: number): number {
	for (let i = 0; i < length; i++) {
		if (i < text.length) {
			data[offset + i] = text.charCodeAt(i)
		} else {
			data[offset + i] = 0
		}
	}
	return offset + length
}

/**
 * Write 16-bit big-endian
 */
function writeU16BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 8) & 0xff
	data[offset + 1] = value & 0xff
}

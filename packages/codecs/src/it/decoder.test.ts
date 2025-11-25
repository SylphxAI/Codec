import { describe, expect, it } from 'bun:test'
import {
	createEmptyCell,
	createEmptyPattern,
	createITFromSamples,
	createNoteCell,
	decodeIT,
	encodeIT,
	getITNoteName,
	getITNoteValue,
	isIT,
	IT_NOTE_CUT,
	IT_NOTE_NONE,
	IT_NOTE_OFF,
	parseITInfo,
	type ITFile,
	type ITPattern,
	type ITSample,
} from './index'

describe('IT Codec', () => {
	// Helper to create a minimal IT file
	function createTestIT(): ITFile {
		// Create a simple sample
		const sample: ITSample = {
			filename: 'test.wav',
			name: 'Test Sample',
			globalVolume: 64,
			flags: 1, // Has data
			volume: 64,
			panning: 32,
			length: 8,
			loopStart: 0,
			loopEnd: 8,
			c5Speed: 8363,
			sustainLoopStart: 0,
			sustainLoopEnd: 0,
			convert: 0,
			defaultPan: false,
			vibratoSpeed: 0,
			vibratoDepth: 0,
			vibratoRate: 0,
			vibratoWaveform: 0,
			data: new Uint8Array([0, 32, 64, 96, 127, 96, 64, 32]),
			hasData: true,
			is16Bit: false,
			isStereo: false,
			isCompressed: false,
			hasLoop: false,
			hasSustainLoop: false,
			isPingPongLoop: false,
			isPingPongSustainLoop: false,
		}

		// Create a simple pattern
		const pattern = createEmptyPattern(64)
		// Add a note at row 0, channel 0
		pattern.data[0]![0] = createNoteCell(60, 1, 64) // C-5, instrument 1, volume 64

		const channels = []
		for (let i = 0; i < 64; i++) {
			channels.push({
				enabled: i < 32,
				panning: 32,
				volume: 64,
				muted: false,
				surround: false,
			})
		}

		return {
			name: 'Test Song',
			patternRowHighlight: 0x0410,
			version: 0x0200,
			createdWith: 0x0200,
			compatibleWith: 0x0200,
			flags: 1, // Stereo
			special: 0,
			orderCount: 1,
			instrumentCount: 0,
			sampleCount: 1,
			patternCount: 1,
			globalVolume: 128,
			mixVolume: 48,
			initialSpeed: 6,
			initialTempo: 125,
			stereoSeparation: 128,
			pitchWheelDepth: 0,
			messageLength: 0,
			messageOffset: 0,
			channelPan: Array(64).fill(32),
			channelVolume: Array(64).fill(64),
			channels,
			orders: [0],
			instruments: [],
			samples: [sample],
			patterns: [pattern],
			isStereo: true,
			usesInstruments: false,
			usesLinearSlides: false,
			usesOldEffects: false,
		}
	}

	describe('isIT', () => {
		it('should identify IT files', () => {
			const itFile = encodeIT(createTestIT())
			expect(isIT(itFile)).toBe(true)
		})

		it('should reject non-IT files', () => {
			expect(isIT(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isIT(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isIT(new Uint8Array([0x49, 0x4d]))).toBe(false)
		})

		it('should verify IMPM magic at offset 0', () => {
			const data = new Uint8Array(192)
			// Wrong signature
			data[0] = 0x53 // 'S'
			data[1] = 0x43 // 'C'
			data[2] = 0x52 // 'R'
			data[3] = 0x4d // 'M'
			expect(isIT(data)).toBe(false)

			// Correct signature
			data[0] = 0x49 // 'I'
			data[1] = 0x4d // 'M'
			data[2] = 0x50 // 'P'
			data[3] = 0x4d // 'M'
			expect(isIT(data)).toBe(true)
		})
	})

	describe('getITNoteName / getITNoteValue', () => {
		it('should convert note values to names', () => {
			expect(getITNoteName(60)).toBe('C-5') // Middle C
			expect(getITNoteName(0)).toBe('C-0')
			expect(getITNoteName(12)).toBe('C-1')
			expect(getITNoteName(1)).toBe('C#0')
		})

		it('should handle special values', () => {
			expect(getITNoteName(IT_NOTE_NONE)).toBe('...')
			expect(getITNoteName(IT_NOTE_CUT)).toBe('^^^')
			expect(getITNoteName(IT_NOTE_OFF)).toBe('===')
		})

		it('should convert note names to values', () => {
			expect(getITNoteValue('C-5')).toBe(60)
			expect(getITNoteValue('C-0')).toBe(0)
			expect(getITNoteValue('C-1')).toBe(12)
			expect(getITNoteValue('...')).toBe(IT_NOTE_NONE)
			expect(getITNoteValue('^^^')).toBe(IT_NOTE_CUT)
			expect(getITNoteValue('===')).toBe(IT_NOTE_OFF)
		})

		it('should handle sharps', () => {
			expect(getITNoteName(61)).toBe('C#5')
			expect(getITNoteValue('C#5')).toBe(61)
			expect(getITNoteValue('F#2')).toBe(30)
		})

		it('should return special value for invalid names', () => {
			expect(getITNoteValue('invalid')).toBe(IT_NOTE_NONE)
			expect(getITNoteValue('X4')).toBe(IT_NOTE_NONE)
		})
	})

	describe('encodeIT', () => {
		it('should encode basic IT file', () => {
			const itFile = encodeIT(createTestIT())

			expect(itFile[0]).toBe(0x49) // 'I'
			expect(itFile[1]).toBe(0x4d) // 'M'
			expect(itFile[2]).toBe(0x50) // 'P'
			expect(itFile[3]).toBe(0x4d) // 'M'
		})

		it('should encode header correctly', () => {
			const file = createTestIT()
			const itFile = encodeIT(file)

			// Check initial speed and tempo
			expect(itFile[50]).toBe(6) // Initial speed
			expect(itFile[51]).toBe(125) // Initial tempo
		})

		it('should encode with custom options', () => {
			const file = createTestIT()
			const itFile = encodeIT(file, {
				initialSpeed: 8,
				initialTempo: 140,
				globalVolume: 100,
				mixVolume: 64,
			})

			expect(itFile[50]).toBe(8) // Custom speed
			expect(itFile[51]).toBe(140) // Custom tempo
		})
	})

	describe('decodeIT', () => {
		it('should decode basic IT file', () => {
			const original = createTestIT()
			const encoded = encodeIT(original)
			const decoded = decodeIT(encoded)

			expect(decoded.name).toBe('Test Song')
			expect(decoded.initialSpeed).toBe(6)
			expect(decoded.initialTempo).toBe(125)
			expect(decoded.orderCount).toBe(1)
			expect(decoded.sampleCount).toBe(1)
			expect(decoded.patternCount).toBe(1)
		})

		it('should parse orders', () => {
			const original = createTestIT()
			original.orders = [0, 1, 0, 2]
			original.orderCount = 4
			const encoded = encodeIT(original)
			const decoded = decodeIT(encoded)

			expect(decoded.orders.length).toBeGreaterThan(0)
			expect(decoded.orders[0]).toBe(0)
		})

		it('should parse samples', () => {
			const original = createTestIT()
			const encoded = encodeIT(original)
			const decoded = decodeIT(encoded)

			expect(decoded.samples.length).toBe(1)
			const sample = decoded.samples[0]!
			expect(sample.name).toBe('Test Sample')
			expect(sample.volume).toBe(64)
			expect(sample.c5Speed).toBe(8363)
		})

		it('should parse patterns', () => {
			const original = createTestIT()
			const encoded = encodeIT(original)
			const decoded = decodeIT(encoded)

			expect(decoded.patterns.length).toBe(1)
			const pattern = decoded.patterns[0]!
			expect(pattern.rows).toBe(64)
			expect(pattern.data.length).toBe(64)
			expect(pattern.data[0]!.length).toBe(64)

			// Check the note we added
			const cell = pattern.data[0]![0]!
			expect(cell.note).toBe(60) // C-5
			expect(cell.instrument).toBe(1)
		})

		it('should throw on invalid data', () => {
			expect(() => decodeIT(new Uint8Array([0, 0, 0, 0]))).toThrow()
		})
	})

	describe('parseITInfo', () => {
		it('should parse IT info', () => {
			const itFile = encodeIT(createTestIT())
			const info = parseITInfo(itFile)

			expect(info.name).toBe('Test Song')
			expect(info.initialSpeed).toBe(6)
			expect(info.initialTempo).toBe(125)
			expect(info.patternCount).toBe(1)
			expect(info.sampleCount).toBe(1)
		})

		it('should count channels', () => {
			const itFile = encodeIT(createTestIT())
			const info = parseITInfo(itFile)

			expect(info.channelCount).toBeGreaterThan(0)
			expect(info.channelCount).toBeLessThanOrEqual(64)
		})

		it('should estimate duration', () => {
			const itFile = encodeIT(createTestIT())
			const info = parseITInfo(itFile)

			expect(info.durationSeconds).toBeGreaterThan(0)
		})
	})

	describe('createITFromSamples', () => {
		it('should create IT from samples and patterns', () => {
			const sample: ITSample = {
				filename: 'test.wav',
				name: 'Test',
				globalVolume: 64,
				flags: 1,
				volume: 64,
				panning: 32,
				length: 4,
				loopStart: 0,
				loopEnd: 4,
				c5Speed: 8363,
				sustainLoopStart: 0,
				sustainLoopEnd: 0,
				convert: 0,
				defaultPan: false,
				vibratoSpeed: 0,
				vibratoDepth: 0,
				vibratoRate: 0,
				vibratoWaveform: 0,
				data: new Uint8Array([0, 64, 127, 64]),
				hasData: true,
				is16Bit: false,
				isStereo: false,
				isCompressed: false,
				hasLoop: false,
				hasSustainLoop: false,
				isPingPongLoop: false,
				isPingPongSustainLoop: false,
			}

			const pattern = createEmptyPattern(64)
			pattern.data[0]![0] = createNoteCell(60, 1, 64)

			const itFile = createITFromSamples([sample], [pattern], [0])
			expect(isIT(itFile)).toBe(true)

			const decoded = decodeIT(itFile)
			expect(decoded.samples.length).toBe(1)
			expect(decoded.patterns.length).toBe(1)
		})

		it('should handle custom options', () => {
			const sample: ITSample = {
				filename: 'test.wav',
				name: 'Test',
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

			const pattern = createEmptyPattern(64)

			const itFile = createITFromSamples([sample], [pattern], [0], {
				initialSpeed: 8,
				initialTempo: 140,
			})

			const decoded = decodeIT(itFile)
			expect(decoded.initialSpeed).toBe(8)
			expect(decoded.initialTempo).toBe(140)
		})
	})

	describe('pattern helpers', () => {
		it('should create empty cell', () => {
			const cell = createEmptyCell()
			expect(cell.note).toBe(IT_NOTE_NONE)
			expect(cell.instrument).toBe(0)
			expect(cell.volumePan).toBe(0xff)
			expect(cell.command).toBe(0)
			expect(cell.param).toBe(0)
		})

		it('should create note cell', () => {
			const cell = createNoteCell(60, 1, 64)
			expect(cell.note).toBe(60)
			expect(cell.instrument).toBe(1)
			expect(cell.volumePan).toBe(64)
			expect(cell.command).toBe(0)
			expect(cell.param).toBe(0)
		})

		it('should create note cell with default volume', () => {
			const cell = createNoteCell(60, 1)
			expect(cell.note).toBe(60)
			expect(cell.instrument).toBe(1)
			expect(cell.volumePan).toBe(0xff)
		})

		it('should create empty pattern', () => {
			const pattern = createEmptyPattern(64)
			expect(pattern.rows).toBe(64)
			expect(pattern.data.length).toBe(64)
			expect(pattern.data[0]!.length).toBe(64)

			// Check all cells are empty
			for (const row of pattern.data) {
				for (const cell of row) {
					expect(cell.note).toBe(IT_NOTE_NONE)
				}
			}
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip basic IT', () => {
			const original = createTestIT()
			const encoded = encodeIT(original)
			const decoded = decodeIT(encoded)

			expect(decoded.name).toBe(original.name)
			expect(decoded.initialSpeed).toBe(original.initialSpeed)
			expect(decoded.initialTempo).toBe(original.initialTempo)
			expect(decoded.globalVolume).toBe(original.globalVolume)
			expect(decoded.orderCount).toBe(original.orderCount)
		})

		it('should preserve sample data', () => {
			const original = createTestIT()
			const encoded = encodeIT(original)
			const decoded = decodeIT(encoded)

			const originalSample = original.samples[0]!
			const decodedSample = decoded.samples[0]!

			expect(decodedSample.name).toBe(originalSample.name)
			expect(decodedSample.volume).toBe(originalSample.volume)
			expect(decodedSample.c5Speed).toBe(originalSample.c5Speed)
		})

		it('should preserve pattern data', () => {
			const original = createTestIT()
			const encoded = encodeIT(original)
			const decoded = decodeIT(encoded)

			const originalCell = original.patterns[0]!.data[0]![0]!
			const decodedCell = decoded.patterns[0]!.data[0]![0]!

			expect(decodedCell.note).toBe(originalCell.note)
			expect(decodedCell.instrument).toBe(originalCell.instrument)
		})

		it('should handle multiple patterns', () => {
			const file = createTestIT()
			file.patterns = [createEmptyPattern(64), createEmptyPattern(64), createEmptyPattern(64)]
			file.patternCount = 3
			file.patterns[1]!.data[10]![5] = createNoteCell(72, 1, 64)

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			expect(decoded.patterns.length).toBe(3)
			expect(decoded.patterns[1]!.data[10]![5]!.note).toBe(72)
		})

		it('should handle multiple samples', () => {
			const file = createTestIT()
			const sample2: ITSample = {
				filename: 'test2.wav',
				name: 'Sample 2',
				globalVolume: 64,
				flags: 17, // Has data + loop
				volume: 48,
				panning: 32,
				length: 4,
				loopStart: 0,
				loopEnd: 4,
				c5Speed: 16000,
				sustainLoopStart: 0,
				sustainLoopEnd: 0,
				convert: 0,
				defaultPan: false,
				vibratoSpeed: 0,
				vibratoDepth: 0,
				vibratoRate: 0,
				vibratoWaveform: 0,
				data: new Uint8Array([127, 64, 0, 64]),
				hasData: true,
				is16Bit: false,
				isStereo: false,
				isCompressed: false,
				hasLoop: true,
				hasSustainLoop: false,
				isPingPongLoop: false,
				isPingPongSustainLoop: false,
			}
			file.samples.push(sample2)
			file.sampleCount = 2

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.samples[1]!.name).toBe('Sample 2')
			expect(decoded.samples[1]!.hasLoop).toBe(true)
		})
	})

	describe('edge cases', () => {
		it('should handle empty patterns', () => {
			const file = createTestIT()
			file.patterns = [createEmptyPattern(64)]

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			expect(decoded.patterns.length).toBe(1)
			// All cells should be empty
			const cell = decoded.patterns[0]!.data[0]![0]!
			expect(cell.note).toBe(IT_NOTE_NONE)
		})

		it('should handle sparse patterns', () => {
			const pattern = createEmptyPattern(64)
			// Only add notes at specific positions
			pattern.data[0]![0] = createNoteCell(60, 1)
			pattern.data[32]![15] = createNoteCell(72, 2)
			pattern.data[63]![63] = createNoteCell(84, 3)

			const file = createTestIT()
			file.patterns = [pattern]

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			expect(decoded.patterns[0]!.data[0]![0]!.note).toBe(60)
			expect(decoded.patterns[0]!.data[32]![15]!.note).toBe(72)
			expect(decoded.patterns[0]!.data[63]![63]!.note).toBe(84)
		})

		it('should handle note cut and note off', () => {
			const pattern = createEmptyPattern(64)
			pattern.data[0]![0] = { ...createNoteCell(60, 1), note: IT_NOTE_CUT }
			pattern.data[1]![0] = { ...createNoteCell(60, 1), note: IT_NOTE_OFF }

			const file = createTestIT()
			file.patterns = [pattern]

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			expect(decoded.patterns[0]!.data[0]![0]!.note).toBe(IT_NOTE_CUT)
			expect(decoded.patterns[0]!.data[1]![0]!.note).toBe(IT_NOTE_OFF)
		})

		it('should handle sample loops', () => {
			const sample: ITSample = {
				filename: 'loop.wav',
				name: 'Looped',
				globalVolume: 64,
				flags: 17, // Has data + loop
				volume: 64,
				panning: 32,
				length: 100,
				loopStart: 20,
				loopEnd: 80,
				c5Speed: 8363,
				sustainLoopStart: 0,
				sustainLoopEnd: 0,
				convert: 0,
				defaultPan: false,
				vibratoSpeed: 0,
				vibratoDepth: 0,
				vibratoRate: 0,
				vibratoWaveform: 0,
				data: new Uint8Array(100),
				hasData: true,
				is16Bit: false,
				isStereo: false,
				isCompressed: false,
				hasLoop: true,
				hasSustainLoop: false,
				isPingPongLoop: false,
				isPingPongSustainLoop: false,
			}

			const file = createTestIT()
			file.samples = [sample]

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			const decodedSample = decoded.samples[0]!
			expect(decodedSample.loopStart).toBe(20)
			expect(decodedSample.loopEnd).toBe(80)
			expect(decodedSample.hasLoop).toBe(true)
		})

		it('should handle long song names', () => {
			const file = createTestIT()
			file.name = 'This is a very long song name that exceeds the limit'

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			// Name should be truncated to 26 characters
			expect(decoded.name.length).toBeLessThanOrEqual(26)
		})

		it('should handle high note values', () => {
			const pattern = createEmptyPattern(64)
			pattern.data[0]![0] = createNoteCell(119, 1) // Highest note

			const file = createTestIT()
			file.patterns = [pattern]

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			expect(decoded.patterns[0]!.data[0]![0]!.note).toBe(119)
		})

		it('should handle volume/panning column', () => {
			const pattern = createEmptyPattern(64)
			pattern.data[0]![0] = createNoteCell(60, 1, 32) // Half volume

			const file = createTestIT()
			file.patterns = [pattern]

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			expect(decoded.patterns[0]!.data[0]![0]!.volumePan).toBe(32)
		})

		it('should handle effects', () => {
			const pattern = createEmptyPattern(64)
			const cell = createNoteCell(60, 1)
			cell.command = 20 // Set tempo
			cell.param = 140
			pattern.data[0]![0] = cell

			const file = createTestIT()
			file.patterns = [pattern]

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			const decodedCell = decoded.patterns[0]!.data[0]![0]!
			expect(decodedCell.command).toBe(20)
			expect(decodedCell.param).toBe(140)
		})

		it('should handle different pattern sizes', () => {
			const pattern = createEmptyPattern(32)
			pattern.data[0]![0] = createNoteCell(60, 1)

			const file = createTestIT()
			file.patterns = [pattern]

			const encoded = encodeIT(file)
			const decoded = decodeIT(encoded)

			expect(decoded.patterns[0]!.rows).toBe(32)
		})
	})
})

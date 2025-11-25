import { describe, expect, it } from 'bun:test'
import {
	createEmptyCell,
	createEmptyPattern,
	createNoteCell,
	createS3MFromSamples,
	decodeS3M,
	encodeS3M,
	getS3MNoteName,
	getS3MNoteValue,
	isS3M,
	parseS3MInfo,
	S3M_NOTE_CUT,
	S3M_NOTE_NONE,
	type S3MFile,
	type S3MPattern,
	type S3MSample,
} from './index'

describe('S3M Codec', () => {
	// Helper to create a minimal S3M file
	function createTestS3M(): S3MFile {
		// Create a simple sample
		const sample: S3MSample = {
			type: 1,
			filename: 'test.wav',
			name: 'Test Sample',
			length: 8,
			loopStart: 0,
			loopEnd: 8,
			volume: 64,
			pack: 0,
			flags: 0,
			c4Speed: 8363,
			data: new Uint8Array([0, 32, 64, 96, 127, 96, 64, 32]),
			isLooped: false,
			isStereo: false,
			is16Bit: false,
		}

		// Create a simple pattern
		const pattern = createEmptyPattern()
		// Add a note at row 0, channel 0
		pattern.rows[0]![0] = createNoteCell(48, 1, 64) // C-3, instrument 1, volume 64

		const channels = []
		for (let i = 0; i < 32; i++) {
			channels.push({ enabled: i < 16, panning: i < 8 ? -0.5 : 0.5 })
		}

		return {
			name: 'Test Song',
			version: 0x1300,
			orderCount: 1,
			instrumentCount: 1,
			patternCount: 1,
			flags: 0,
			createdWith: 0x1300,
			sampleFormat: 1,
			globalVolume: 64,
			initialSpeed: 6,
			initialTempo: 125,
			masterVolume: 48,
			ultraClickRemoval: 0,
			defaultPan: false,
			channels,
			orders: [0],
			instruments: [sample],
			patterns: [pattern],
		}
	}

	describe('isS3M', () => {
		it('should identify S3M files', () => {
			const s3m = encodeS3M(createTestS3M())
			expect(isS3M(s3m)).toBe(true)
		})

		it('should reject non-S3M files', () => {
			expect(isS3M(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isS3M(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isS3M(new Uint8Array([0x53, 0x43]))).toBe(false)
		})

		it('should verify SCRM magic at offset 44', () => {
			const data = new Uint8Array(96)
			// Wrong position
			data[0] = 0x53 // 'S'
			data[1] = 0x43 // 'C'
			data[2] = 0x52 // 'R'
			data[3] = 0x4d // 'M'
			expect(isS3M(data)).toBe(false)

			// Correct position
			data[44] = 0x53 // 'S'
			data[45] = 0x43 // 'C'
			data[46] = 0x52 // 'R'
			data[47] = 0x4d // 'M'
			expect(isS3M(data)).toBe(true)
		})
	})

	describe('getS3MNoteName / getS3MNoteValue', () => {
		it('should convert note values to names', () => {
			expect(getS3MNoteName(48)).toBe('C-3') // 0x30 = octave 3, note 0
			expect(getS3MNoteName(0)).toBe('C-0') // 0x00 = octave 0, note 0
			expect(getS3MNoteName(16)).toBe('C-1') // 0x10 = octave 1, note 0
			expect(getS3MNoteName(1)).toBe('C#0') // 0x01 = octave 0, note 1
		})

		it('should handle special values', () => {
			expect(getS3MNoteName(S3M_NOTE_NONE)).toBe('...')
			expect(getS3MNoteName(S3M_NOTE_CUT)).toBe('^^^')
		})

		it('should convert note names to values', () => {
			expect(getS3MNoteValue('C-3')).toBe(48) // 0x30
			expect(getS3MNoteValue('C-0')).toBe(0) // 0x00
			expect(getS3MNoteValue('C-1')).toBe(16) // 0x10
			expect(getS3MNoteValue('...')).toBe(S3M_NOTE_NONE)
			expect(getS3MNoteValue('^^^')).toBe(S3M_NOTE_CUT)
		})

		it('should handle sharps', () => {
			expect(getS3MNoteName(49)).toBe('C#3')
			expect(getS3MNoteValue('C#3')).toBe(49)
			expect(getS3MNoteValue('F#2')).toBe(38)
		})

		it('should return special value for invalid names', () => {
			expect(getS3MNoteValue('invalid')).toBe(S3M_NOTE_NONE)
			expect(getS3MNoteValue('X4')).toBe(S3M_NOTE_NONE)
		})
	})

	describe('encodeS3M', () => {
		it('should encode basic S3M file', () => {
			const s3m = encodeS3M(createTestS3M())

			expect(s3m[44]).toBe(0x53) // 'S'
			expect(s3m[45]).toBe(0x43) // 'C'
			expect(s3m[46]).toBe(0x52) // 'R'
			expect(s3m[47]).toBe(0x4d) // 'M'
		})

		it('should encode header correctly', () => {
			const file = createTestS3M()
			const s3m = encodeS3M(file)

			// Check type marker
			expect(s3m[28]).toBe(0x1a)
			expect(s3m[29]).toBe(16) // S3M module type

			// Check initial speed and tempo (at offsets 49, 50)
			expect(s3m[49]).toBe(6) // Initial speed
			expect(s3m[50]).toBe(125) // Initial tempo
		})

		it('should encode with custom options', () => {
			const file = createTestS3M()
			const s3m = encodeS3M(file, {
				initialSpeed: 8,
				initialTempo: 140,
				globalVolume: 48,
				masterVolume: 64,
			})

			expect(s3m[49]).toBe(8) // Custom speed
			expect(s3m[50]).toBe(140) // Custom tempo
		})
	})

	describe('decodeS3M', () => {
		it('should decode basic S3M file', () => {
			const original = createTestS3M()
			const encoded = encodeS3M(original)
			const decoded = decodeS3M(encoded)

			expect(decoded.name).toBe('Test Song')
			expect(decoded.initialSpeed).toBe(6)
			expect(decoded.initialTempo).toBe(125)
			expect(decoded.orderCount).toBe(1)
			expect(decoded.instrumentCount).toBe(1)
			expect(decoded.patternCount).toBe(1)
		})

		it('should parse orders', () => {
			const original = createTestS3M()
			original.orders = [0, 1, 0, 2]
			original.orderCount = 4
			const encoded = encodeS3M(original)
			const decoded = decodeS3M(encoded)

			expect(decoded.orders.length).toBeGreaterThan(0)
			expect(decoded.orders[0]).toBe(0)
		})

		it('should parse samples', () => {
			const original = createTestS3M()
			const encoded = encodeS3M(original)
			const decoded = decodeS3M(encoded)

			expect(decoded.instruments.length).toBe(1)
			const sample = decoded.instruments[0]!
			expect(sample.name).toBe('Test Sample')
			expect(sample.volume).toBe(64)
			expect(sample.c4Speed).toBe(8363)
		})

		it('should parse patterns', () => {
			const original = createTestS3M()
			const encoded = encodeS3M(original)
			const decoded = decodeS3M(encoded)

			expect(decoded.patterns.length).toBe(1)
			const pattern = decoded.patterns[0]!
			expect(pattern.rows.length).toBe(64)
			expect(pattern.rows[0]!.length).toBe(32)

			// Check the note we added
			const cell = pattern.rows[0]![0]!
			expect(cell.note).toBe(48) // C-3
			expect(cell.instrument).toBe(1)
		})

		it('should throw on invalid data', () => {
			expect(() => decodeS3M(new Uint8Array([0, 0, 0, 0]))).toThrow()
		})
	})

	describe('parseS3MInfo', () => {
		it('should parse S3M info', () => {
			const s3m = encodeS3M(createTestS3M())
			const info = parseS3MInfo(s3m)

			expect(info.name).toBe('Test Song')
			expect(info.initialSpeed).toBe(6)
			expect(info.initialTempo).toBe(125)
			expect(info.patternCount).toBe(1)
			expect(info.instrumentCount).toBe(1)
		})

		it('should count channels', () => {
			const s3m = encodeS3M(createTestS3M())
			const info = parseS3MInfo(s3m)

			expect(info.channelCount).toBeGreaterThan(0)
			expect(info.channelCount).toBeLessThanOrEqual(32)
		})

		it('should estimate duration', () => {
			const s3m = encodeS3M(createTestS3M())
			const info = parseS3MInfo(s3m)

			expect(info.durationSeconds).toBeGreaterThan(0)
		})
	})

	describe('createS3MFromSamples', () => {
		it('should create S3M from samples and patterns', () => {
			const sample: S3MSample = {
				type: 1,
				filename: 'test.wav',
				name: 'Test',
				length: 4,
				loopStart: 0,
				loopEnd: 4,
				volume: 64,
				pack: 0,
				flags: 0,
				c4Speed: 8363,
				data: new Uint8Array([0, 64, 127, 64]),
				isLooped: false,
				isStereo: false,
				is16Bit: false,
			}

			const pattern = createEmptyPattern()
			pattern.rows[0]![0] = createNoteCell(48, 1, 64)

			const s3m = createS3MFromSamples([sample], [pattern], [0])
			expect(isS3M(s3m)).toBe(true)

			const decoded = decodeS3M(s3m)
			expect(decoded.instruments.length).toBe(1)
			expect(decoded.patterns.length).toBe(1)
		})

		it('should handle custom options', () => {
			const sample: S3MSample = {
				type: 1,
				filename: 'test.wav',
				name: 'Test',
				length: 0,
				loopStart: 0,
				loopEnd: 0,
				volume: 64,
				pack: 0,
				flags: 0,
				c4Speed: 8363,
				data: new Uint8Array(0),
				isLooped: false,
				isStereo: false,
				is16Bit: false,
			}

			const pattern = createEmptyPattern()

			const s3m = createS3MFromSamples([sample], [pattern], [0], {
				initialSpeed: 8,
				initialTempo: 140,
			})

			const decoded = decodeS3M(s3m)
			expect(decoded.initialSpeed).toBe(8)
			expect(decoded.initialTempo).toBe(140)
		})
	})

	describe('pattern helpers', () => {
		it('should create empty cell', () => {
			const cell = createEmptyCell()
			expect(cell.note).toBe(S3M_NOTE_NONE)
			expect(cell.instrument).toBe(0)
			expect(cell.volume).toBe(0xff)
			expect(cell.command).toBe(0)
			expect(cell.param).toBe(0)
		})

		it('should create note cell', () => {
			const cell = createNoteCell(48, 1, 64)
			expect(cell.note).toBe(48)
			expect(cell.instrument).toBe(1)
			expect(cell.volume).toBe(64)
			expect(cell.command).toBe(0)
			expect(cell.param).toBe(0)
		})

		it('should create note cell with default volume', () => {
			const cell = createNoteCell(48, 1)
			expect(cell.note).toBe(48)
			expect(cell.instrument).toBe(1)
			expect(cell.volume).toBe(0xff)
		})

		it('should create empty pattern', () => {
			const pattern = createEmptyPattern()
			expect(pattern.rows.length).toBe(64)
			expect(pattern.rows[0]!.length).toBe(32)

			// Check all cells are empty
			for (const row of pattern.rows) {
				for (const cell of row) {
					expect(cell.note).toBe(S3M_NOTE_NONE)
				}
			}
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip basic S3M', () => {
			const original = createTestS3M()
			const encoded = encodeS3M(original)
			const decoded = decodeS3M(encoded)

			expect(decoded.name).toBe(original.name)
			expect(decoded.initialSpeed).toBe(original.initialSpeed)
			expect(decoded.initialTempo).toBe(original.initialTempo)
			expect(decoded.globalVolume).toBe(original.globalVolume)
			expect(decoded.orderCount).toBe(original.orderCount)
		})

		it('should preserve sample data', () => {
			const original = createTestS3M()
			const encoded = encodeS3M(original)
			const decoded = decodeS3M(encoded)

			const originalSample = original.instruments[0]!
			const decodedSample = decoded.instruments[0]!

			expect(decodedSample.name).toBe(originalSample.name)
			expect(decodedSample.volume).toBe(originalSample.volume)
			expect(decodedSample.c4Speed).toBe(originalSample.c4Speed)
		})

		it('should preserve pattern data', () => {
			const original = createTestS3M()
			const encoded = encodeS3M(original)
			const decoded = decodeS3M(encoded)

			const originalCell = original.patterns[0]!.rows[0]![0]!
			const decodedCell = decoded.patterns[0]!.rows[0]![0]!

			expect(decodedCell.note).toBe(originalCell.note)
			expect(decodedCell.instrument).toBe(originalCell.instrument)
		})

		it('should handle multiple patterns', () => {
			const file = createTestS3M()
			file.patterns = [createEmptyPattern(), createEmptyPattern(), createEmptyPattern()]
			file.patternCount = 3
			file.patterns[1]!.rows[10]![5] = createNoteCell(60, 1, 64)

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			expect(decoded.patterns.length).toBe(3)
			expect(decoded.patterns[1]!.rows[10]![5]!.note).toBe(60)
		})

		it('should handle multiple samples', () => {
			const file = createTestS3M()
			const sample2: S3MSample = {
				type: 1,
				filename: 'test2.wav',
				name: 'Sample 2',
				length: 4,
				loopStart: 0,
				loopEnd: 4,
				volume: 48,
				pack: 0,
				flags: 1, // Looped
				c4Speed: 16000,
				data: new Uint8Array([127, 64, 0, 64]),
				isLooped: true,
				isStereo: false,
				is16Bit: false,
			}
			file.instruments.push(sample2)
			file.instrumentCount = 2

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			expect(decoded.instruments.length).toBe(2)
			expect(decoded.instruments[1]!.name).toBe('Sample 2')
			expect(decoded.instruments[1]!.isLooped).toBe(true)
		})
	})

	describe('edge cases', () => {
		it('should handle empty patterns', () => {
			const file = createTestS3M()
			file.patterns = [createEmptyPattern()]

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			expect(decoded.patterns.length).toBe(1)
			// All cells should be empty
			const cell = decoded.patterns[0]!.rows[0]![0]!
			expect(cell.note).toBe(S3M_NOTE_NONE)
		})

		it('should handle sparse patterns', () => {
			const pattern = createEmptyPattern()
			// Only add notes at specific positions
			pattern.rows[0]![0] = createNoteCell(48, 1)
			pattern.rows[32]![15] = createNoteCell(60, 2)
			pattern.rows[63]![31] = createNoteCell(72, 3)

			const file = createTestS3M()
			file.patterns = [pattern]

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			expect(decoded.patterns[0]!.rows[0]![0]!.note).toBe(48)
			expect(decoded.patterns[0]!.rows[32]![15]!.note).toBe(60)
			expect(decoded.patterns[0]!.rows[63]![31]!.note).toBe(72)
		})

		it('should handle note cut', () => {
			const pattern = createEmptyPattern()
			pattern.rows[0]![0] = { ...createNoteCell(48, 1), note: S3M_NOTE_CUT }

			const file = createTestS3M()
			file.patterns = [pattern]

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			expect(decoded.patterns[0]!.rows[0]![0]!.note).toBe(S3M_NOTE_CUT)
		})

		it('should handle sample loops', () => {
			const sample: S3MSample = {
				type: 1,
				filename: 'loop.wav',
				name: 'Looped',
				length: 100,
				loopStart: 20,
				loopEnd: 80,
				volume: 64,
				pack: 0,
				flags: 1, // Loop flag
				c4Speed: 8363,
				data: new Uint8Array(100),
				isLooped: true,
				isStereo: false,
				is16Bit: false,
			}

			const file = createTestS3M()
			file.instruments = [sample]

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			const decodedSample = decoded.instruments[0]!
			expect(decodedSample.loopStart).toBe(20)
			expect(decodedSample.loopEnd).toBe(80)
			expect(decodedSample.isLooped).toBe(true)
		})

		it('should handle different channel configurations', () => {
			const file = createTestS3M()
			// Enable different channel patterns
			for (let i = 0; i < 32; i++) {
				file.channels[i] = {
					enabled: i % 2 === 0,
					panning: (i / 32) * 2 - 1, // -1 to 1
				}
			}

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			expect(decoded.channels.length).toBe(32)
		})

		it('should handle long song names', () => {
			const file = createTestS3M()
			file.name = 'This is a very long song name that exceeds the limit'

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			// Name should be truncated to 28 characters
			expect(decoded.name.length).toBeLessThanOrEqual(28)
		})

		it('should handle high note values', () => {
			const pattern = createEmptyPattern()
			pattern.rows[0]![0] = createNoteCell(159, 1) // Very high note

			const file = createTestS3M()
			file.patterns = [pattern]

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			expect(decoded.patterns[0]!.rows[0]![0]!.note).toBe(159)
		})

		it('should handle volume column', () => {
			const pattern = createEmptyPattern()
			pattern.rows[0]![0] = createNoteCell(48, 1, 32) // Half volume

			const file = createTestS3M()
			file.patterns = [pattern]

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			expect(decoded.patterns[0]!.rows[0]![0]!.volume).toBe(32)
		})

		it('should handle effects', () => {
			const pattern = createEmptyPattern()
			const cell = createNoteCell(48, 1)
			cell.command = 20 // Set tempo
			cell.param = 140
			pattern.rows[0]![0] = cell

			const file = createTestS3M()
			file.patterns = [pattern]

			const encoded = encodeS3M(file)
			const decoded = decodeS3M(encoded)

			const decodedCell = decoded.patterns[0]!.rows[0]![0]!
			expect(decodedCell.command).toBe(20)
			expect(decodedCell.param).toBe(140)
		})
	})
})

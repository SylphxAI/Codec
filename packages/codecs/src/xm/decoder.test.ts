import { describe, expect, it } from 'bun:test'
import {
	createSimpleXM,
	decodeXM,
	encodeXM,
	getXMNoteName,
	getXMNoteNumber,
	isXM,
	parseXMInfo,
	xmCodec,
	type XMFile,
	type XMInstrument,
	type XMPattern,
	type XMSample,
} from './index'

describe('XM Codec', () => {
	// Helper to create a minimal XM file
	function createTestXM(): XMFile {
		const pattern: XMPattern = {
			rows: 64,
			data: [],
		}

		// Create empty pattern
		for (let row = 0; row < 64; row++) {
			pattern.data[row] = []
			for (let ch = 0; ch < 4; ch++) {
				pattern.data[row]![ch] = {
					note: 0,
					instrument: 0,
					volume: 0,
					effectType: 0,
					effectParam: 0,
				}
			}
		}

		// Add a simple note
		pattern.data[0]![0] = {
			note: 49, // C-4
			instrument: 1,
			volume: 64,
			effectType: 0,
			effectParam: 0,
		}

		const patternOrder = new Array(256).fill(0)
		patternOrder[0] = 0

		return {
			name: 'Test Module',
			trackerName: 'FastTracker v2.00   ',
			version: 0x0104,
			headerSize: 276,
			songLength: 1,
			restartPosition: 0,
			numChannels: 4,
			numPatterns: 1,
			numInstruments: 0,
			flags: 1,
			defaultTempo: 6,
			defaultBPM: 125,
			patternOrder,
			patterns: [pattern],
			instruments: [],
		}
	}

	describe('isXM', () => {
		it('should identify XM files', () => {
			const xm = encodeXM(createTestXM())
			expect(isXM(xm)).toBe(true)
		})

		it('should reject non-XM files', () => {
			expect(isXM(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isXM(new Uint8Array([0x4d, 0x54, 0x68, 0x64]))).toBe(false) // MIDI
		})

		it('should handle short data', () => {
			expect(isXM(new Uint8Array([0x45, 0x78]))).toBe(false)
		})
	})

	describe('getXMNoteName / getXMNoteNumber', () => {
		it('should convert note numbers to names', () => {
			expect(getXMNoteName(0)).toBe('---') // No note
			expect(getXMNoteName(1)).toBe('C-0')
			expect(getXMNoteName(49)).toBe('C-4') // Middle C
			expect(getXMNoteName(97)).toBe('===') // Key off
		})

		it('should convert note names to numbers', () => {
			expect(getXMNoteNumber('---')).toBe(0)
			expect(getXMNoteNumber('C-0')).toBe(1)
			expect(getXMNoteNumber('C-4')).toBe(49)
			expect(getXMNoteNumber('===')).toBe(97)
		})

		it('should handle sharps', () => {
			expect(getXMNoteName(2)).toBe('C#0')
			expect(getXMNoteNumber('C#0')).toBe(2)
			expect(getXMNoteNumber('F#3')).toBe(43)
		})

		it('should return fallback for invalid names', () => {
			expect(getXMNoteNumber('invalid')).toBe(0)
			expect(getXMNoteNumber('X4')).toBe(0)
		})
	})

	describe('encodeXM', () => {
		it('should encode basic XM file', () => {
			const xm = encodeXM(createTestXM())

			// Check magic
			const magic = new TextDecoder('ascii').decode(xm.slice(0, 17))
			expect(magic).toBe('Extended Module: ')
		})

		it('should encode header correctly', () => {
			const file = createTestXM()
			const xm = encodeXM(file)

			// Check magic
			expect(xm[0]).toBe(0x45) // 'E'
			expect(xm[1]).toBe(0x78) // 'x'
		})
	})

	describe('decodeXM', () => {
		it('should decode basic XM file', () => {
			const original = createTestXM()
			const encoded = encodeXM(original)
			const decoded = decodeXM(encoded)

			expect(decoded.name).toBe('Test Module')
			expect(decoded.numChannels).toBe(4)
			expect(decoded.numPatterns).toBe(1)
		})

		it('should parse patterns', () => {
			const original = createTestXM()
			const encoded = encodeXM(original)
			const decoded = decodeXM(encoded)

			expect(decoded.patterns.length).toBe(1)
			const pattern = decoded.patterns[0]!
			expect(pattern.rows).toBe(64)

			// Check the note we added
			const firstNote = pattern.data[0]?.[0]
			expect(firstNote).toBeDefined()
			expect(firstNote?.note).toBe(49) // C-4
		})

		it('should throw on invalid data', () => {
			expect(() => decodeXM(new Uint8Array([0, 0, 0, 0]))).toThrow()
		})
	})

	describe('parseXMInfo', () => {
		it('should parse XM info', () => {
			const xm = encodeXM(createTestXM())
			const info = parseXMInfo(xm)

			expect(info.name).toBe('Test Module')
			expect(info.numChannels).toBe(4)
			expect(info.numPatterns).toBe(1)
			expect(info.defaultTempo).toBe(6)
			expect(info.defaultBPM).toBe(125)
		})

		it('should estimate duration', () => {
			const xm = encodeXM(createTestXM())
			const info = parseXMInfo(xm)

			expect(info.duration).toBeGreaterThan(0)
		})
	})

	describe('createSimpleXM', () => {
		it('should create XM with default options', () => {
			const xm = createSimpleXM()
			expect(isXM(xm)).toBe(true)

			const decoded = decodeXM(xm)
			expect(decoded.defaultTempo).toBe(6)
			expect(decoded.defaultBPM).toBe(125)
			expect(decoded.numChannels).toBe(4)
		})

		it('should create XM with custom options', () => {
			const xm = createSimpleXM({
				name: 'Custom Module',
				tempo: 8,
				bpm: 140,
				channels: 8,
			})

			const decoded = decodeXM(xm)
			expect(decoded.name).toBe('Custom Module')
			expect(decoded.defaultTempo).toBe(8)
			expect(decoded.defaultBPM).toBe(140)
			expect(decoded.numChannels).toBe(8)
		})

		it('should handle long names', () => {
			const xm = createSimpleXM({
				name: 'This is a very long module name that exceeds the limit',
			})

			const decoded = decodeXM(xm)
			expect(decoded.name.length).toBeLessThanOrEqual(20)
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip basic XM', () => {
			const original = createTestXM()
			const encoded = encodeXM(original)
			const decoded = decodeXM(encoded)

			expect(decoded.name).toBe(original.name)
			expect(decoded.numChannels).toBe(original.numChannels)
			expect(decoded.numPatterns).toBe(original.numPatterns)
			expect(decoded.defaultTempo).toBe(original.defaultTempo)
			expect(decoded.defaultBPM).toBe(original.defaultBPM)
		})

		it('should preserve patterns', () => {
			const original = createTestXM()
			const encoded = encodeXM(original)
			const decoded = decodeXM(encoded)

			expect(decoded.patterns.length).toBe(original.patterns.length)
			const originalPattern = original.patterns[0]!
			const decodedPattern = decoded.patterns[0]!

			expect(decodedPattern.rows).toBe(originalPattern.rows)

			// Check first note
			const originalNote = originalPattern.data[0]?.[0]
			const decodedNote = decodedPattern.data[0]?.[0]
			expect(decodedNote?.note).toBe(originalNote?.note)
		})

		it('should handle empty patterns', () => {
			const xm = createSimpleXM()
			const decoded = decodeXM(xm)

			expect(decoded.patterns.length).toBeGreaterThan(0)
			const pattern = decoded.patterns[0]!
			expect(pattern.rows).toBe(64)
		})
	})

	describe('XMCodec class', () => {
		it('should identify XM format', () => {
			const xm = createSimpleXM()
			expect(xmCodec.isFormat(xm)).toBe(true)
		})

		it('should decode to AudioData', () => {
			const xm = createSimpleXM()
			const audio = xmCodec.decode(xm)

			expect(audio.sampleRate).toBe(44100)
			expect(audio.channels).toBeGreaterThan(0)
			expect(audio.samples.length).toBe(audio.channels)
		})

		it('should encode from AudioData', () => {
			const audio = {
				samples: [new Float32Array(1000), new Float32Array(1000)],
				sampleRate: 44100,
				channels: 2,
			}

			const xm = xmCodec.encode(audio)
			expect(isXM(xm)).toBe(true)
		})

		it('should decode to XMFile', () => {
			const xm = createSimpleXM()
			const file = xmCodec.decodeToXM(xm)

			expect(file.numChannels).toBeGreaterThan(0)
			expect(file.patterns.length).toBeGreaterThan(0)
		})

		it('should encode from XMFile', () => {
			const file = createTestXM()
			const xm = xmCodec.encodeFromXM(file)

			expect(isXM(xm)).toBe(true)
		})
	})

	describe('instruments', () => {
		it('should handle XM with instruments', () => {
			const file = createTestXM()

			// Add a simple instrument
			const sample: XMSample = {
				length: 8,
				loopStart: 0,
				loopLength: 0,
				volume: 64,
				finetune: 0,
				type: 0,
				panning: 128,
				relativeNote: 0,
				name: 'Test Sample',
				data: new Int8Array([0, 32, 64, 96, 64, 32, 0, -32]),
			}

			const instrument: XMInstrument = {
				name: 'Test Instrument',
				type: 0,
				numSamples: 1,
				sampleHeaderSize: 40,
				sampleForNote: new Array(96).fill(0),
				volumeEnvelope: {
					type: 0,
					numPoints: 0,
					sustainPoint: 0,
					loopStartPoint: 0,
					loopEndPoint: 0,
					points: [],
				},
				panningEnvelope: {
					type: 0,
					numPoints: 0,
					sustainPoint: 0,
					loopStartPoint: 0,
					loopEndPoint: 0,
					points: [],
				},
				vibratoType: 0,
				vibratoSweep: 0,
				vibratoDepth: 0,
				vibratoRate: 0,
				volumeFadeout: 0,
				samples: [sample],
			}

			file.instruments = [instrument]
			file.numInstruments = 1

			const encoded = encodeXM(file)
			const decoded = decodeXM(encoded)

			expect(decoded.numInstruments).toBe(1)
			expect(decoded.instruments.length).toBe(1)
			expect(decoded.instruments[0]?.name).toBe('Test Instrument')
			expect(decoded.instruments[0]?.samples.length).toBe(1)
		})

		it('should handle 16-bit samples', () => {
			const file = createTestXM()

			const sample: XMSample = {
				length: 16,
				loopStart: 0,
				loopLength: 0,
				volume: 64,
				finetune: 0,
				type: 0x10, // 16-bit flag
				panning: 128,
				relativeNote: 0,
				name: '16-bit Sample',
				data: new Int16Array([0, 1000, 2000, 3000, 2000, 1000, 0, -1000]),
			}

			const instrument: XMInstrument = {
				name: '16-bit Instrument',
				type: 0,
				numSamples: 1,
				sampleHeaderSize: 40,
				sampleForNote: new Array(96).fill(0),
				volumeEnvelope: {
					type: 0,
					numPoints: 0,
					sustainPoint: 0,
					loopStartPoint: 0,
					loopEndPoint: 0,
					points: [],
				},
				panningEnvelope: {
					type: 0,
					numPoints: 0,
					sustainPoint: 0,
					loopStartPoint: 0,
					loopEndPoint: 0,
					points: [],
				},
				vibratoType: 0,
				vibratoSweep: 0,
				vibratoDepth: 0,
				vibratoRate: 0,
				volumeFadeout: 0,
				samples: [sample],
			}

			file.instruments = [instrument]
			file.numInstruments = 1

			const encoded = encodeXM(file)
			const decoded = decodeXM(encoded)

			expect(decoded.instruments[0]?.samples[0]?.type & 0x10).toBeTruthy()
			expect(decoded.instruments[0]?.samples[0]?.data).toBeInstanceOf(Int16Array)
		})
	})

	describe('edge cases', () => {
		it('should handle pattern with effects', () => {
			const file = createTestXM()
			const pattern = file.patterns[0]!

			// Add some effects
			pattern.data[1]![0] = {
				note: 49,
				instrument: 1,
				volume: 64,
				effectType: 0x0f, // Set speed
				effectParam: 0x06,
			}

			const encoded = encodeXM(file)
			const decoded = decodeXM(encoded)

			const note = decoded.patterns[0]!.data[1]![0]
			expect(note?.effectType).toBe(0x0f)
			expect(note?.effectParam).toBe(0x06)
		})

		it('should handle multiple patterns', () => {
			const file = createTestXM()

			// Add another pattern
			const pattern2: XMPattern = {
				rows: 64,
				data: Array.from({ length: 64 }, () =>
					Array.from({ length: 4 }, () => ({
						note: 0,
						instrument: 0,
						volume: 0,
						effectType: 0,
						effectParam: 0,
					}))
				),
			}

			file.patterns.push(pattern2)
			file.numPatterns = 2
			file.patternOrder[1] = 1
			file.songLength = 2

			const encoded = encodeXM(file)
			const decoded = decodeXM(encoded)

			expect(decoded.numPatterns).toBe(2)
			expect(decoded.patterns.length).toBe(2)
		})

		it('should handle different channel counts', () => {
			for (const channels of [2, 8, 16, 32]) {
				const xm = createSimpleXM({ channels })
				const decoded = decodeXM(xm)
				expect(decoded.numChannels).toBe(channels)
			}
		})
	})
})

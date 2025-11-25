import { describe, expect, it } from 'bun:test'
import {
	createEmptyMod,
	createModFromAudio,
	decodeMod,
	encodeMod,
	getPeriodNoteName,
	getNoteNamePeriod,
	isMod,
	modToAudio,
	parseModInfo,
	type ModFile,
	type ModPattern,
	type ModSample,
	MOD_PERIOD_TABLE,
} from './index'

describe('MOD Codec', () => {
	// Helper to create a minimal MOD file
	function createTestMod(): ModFile {
		// Create a simple sample
		const sampleData = new Int8Array(1000)
		for (let i = 0; i < sampleData.length; i++) {
			sampleData[i] = Math.sin((i / 100) * Math.PI * 2) * 127
		}

		const sample: ModSample = {
			name: 'Test Sample',
			length: 1000,
			finetune: 0,
			volume: 64,
			repeatPoint: 0,
			repeatLength: 2,
			data: sampleData,
		}

		// Create empty samples for remaining slots
		const samples: ModSample[] = [sample]
		for (let i = 1; i < 31; i++) {
			samples.push({
				name: '',
				length: 0,
				finetune: 0,
				volume: 0,
				repeatPoint: 0,
				repeatLength: 2,
				data: new Int8Array(0),
			})
		}

		// Create a simple pattern
		const rows = []
		for (let r = 0; r < 64; r++) {
			const notes = []
			for (let c = 0; c < 4; c++) {
				if (r === 0 && c === 0) {
					// First note: C-3
					notes.push({ sample: 1, period: 428, effect: 0, effectParam: 0 })
				} else if (r === 16 && c === 0) {
					// Second note: E-3
					notes.push({ sample: 1, period: 339, effect: 0, effectParam: 0 })
				} else {
					notes.push({ sample: 0, period: 0, effect: 0, effectParam: 0 })
				}
			}
			rows.push(notes)
		}

		const pattern: ModPattern = { rows }

		return {
			title: 'Test Song',
			samples,
			songLength: 1,
			restartPosition: 0,
			patternTable: [0, ...Array(127).fill(0)],
			format: 'M.K.',
			channels: 4,
			patterns: [pattern],
		}
	}

	describe('isMod', () => {
		it('should identify MOD files', () => {
			const mod = encodeMod(createTestMod())
			expect(isMod(mod)).toBe(true)
		})

		it('should reject non-MOD files', () => {
			expect(isMod(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isMod(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isMod(new Uint8Array(100))).toBe(false)
		})

		it('should check signature at offset 1080', () => {
			const data = new Uint8Array(1084)
			// Add M.K. signature
			data[1080] = 'M'.charCodeAt(0)
			data[1081] = '.'.charCodeAt(0)
			data[1082] = 'K'.charCodeAt(0)
			data[1083] = '.'.charCodeAt(0)
			expect(isMod(data)).toBe(true)
		})
	})

	describe('getPeriodNoteName / getNoteNamePeriod', () => {
		it('should convert period to note name', () => {
			expect(getPeriodNoteName(428)).toBe('C-3')
			expect(getPeriodNoteName(856)).toBe('C-2')
			expect(getPeriodNoteName(214)).toBe('C-4')
			expect(getPeriodNoteName(0)).toBe('---')
		})

		it('should convert note name to period', () => {
			expect(getNoteNamePeriod('C-3')).toBe(428)
			expect(getNoteNamePeriod('C-2')).toBe(856)
			expect(getNoteNamePeriod('C-4')).toBe(214)
			expect(getNoteNamePeriod('---')).toBe(0)
		})

		it('should handle sharps', () => {
			expect(getPeriodNoteName(404)).toBe('C#3')
			expect(getNoteNamePeriod('C#3')).toBe(404)
		})

		it('should handle invalid names', () => {
			expect(getNoteNamePeriod('invalid')).toBe(0)
			expect(getNoteNamePeriod('X-2')).toBe(0)
		})

		it('should roundtrip notes', () => {
			for (let i = 0; i < MOD_PERIOD_TABLE.length; i++) {
				const period = MOD_PERIOD_TABLE[i]!
				const name = getPeriodNoteName(period)
				const backPeriod = getNoteNamePeriod(name)
				expect(backPeriod).toBe(period)
			}
		})
	})

	describe('encodeMod', () => {
		it('should encode basic MOD file', () => {
			const mod = encodeMod(createTestMod())

			// Check signature at offset 1080
			expect(mod[1080]).toBe('M'.charCodeAt(0))
			expect(mod[1081]).toBe('.'.charCodeAt(0))
			expect(mod[1082]).toBe('K'.charCodeAt(0))
			expect(mod[1083]).toBe('.'.charCodeAt(0))
		})

		it('should encode title', () => {
			const testMod = createTestMod()
			const mod = encodeMod(testMod)

			// Title is at offset 0-19
			const title = String.fromCharCode(...Array.from(mod.slice(0, 20))).trim()
			expect(title).toContain('Test Song')
		})

		it('should encode sample headers', () => {
			const mod = encodeMod(createTestMod())

			// First sample header starts at offset 20
			// Sample name is first 22 bytes
			const sampleName = String.fromCharCode(...Array.from(mod.slice(20, 42))).trim()
			expect(sampleName).toContain('Test Sample')

			// Length is at offset 42-43 (in words)
			const length = ((mod[42]! << 8) | mod[43]!) * 2
			expect(length).toBe(1000)
		})

		it('should encode song data', () => {
			const mod = encodeMod(createTestMod())

			// Song length at offset 950
			expect(mod[950]).toBe(1)

			// Restart position at offset 951
			expect(mod[951]).toBe(0)

			// Pattern table starts at offset 952
			expect(mod[952]).toBe(0)
		})
	})

	describe('decodeMod', () => {
		it('should decode basic MOD file', () => {
			const original = createTestMod()
			const encoded = encodeMod(original)
			const decoded = decodeMod(encoded)

			expect(decoded.format).toBe('M.K.')
			expect(decoded.channels).toBe(4)
			expect(decoded.songLength).toBe(1)
		})

		it('should parse title', () => {
			const original = createTestMod()
			const encoded = encodeMod(original)
			const decoded = decodeMod(encoded)

			expect(decoded.title).toContain('Test Song')
		})

		it('should parse samples', () => {
			const original = createTestMod()
			const encoded = encodeMod(original)
			const decoded = decodeMod(encoded)

			expect(decoded.samples.length).toBe(31)
			expect(decoded.samples[0]!.name).toContain('Test Sample')
			expect(decoded.samples[0]!.length).toBe(1000)
			expect(decoded.samples[0]!.volume).toBe(64)
		})

		it('should parse patterns', () => {
			const original = createTestMod()
			const encoded = encodeMod(original)
			const decoded = decodeMod(encoded)

			expect(decoded.patterns.length).toBeGreaterThan(0)
			const pattern = decoded.patterns[0]!
			expect(pattern.rows.length).toBe(64)
			expect(pattern.rows[0]!.length).toBe(4)

			// Check first note
			const firstNote = pattern.rows[0]![0]!
			expect(firstNote.sample).toBe(1)
			expect(firstNote.period).toBe(428)
		})

		it('should parse sample data', () => {
			const original = createTestMod()
			const encoded = encodeMod(original)
			const decoded = decodeMod(encoded)

			const sample = decoded.samples[0]!
			expect(sample.data.length).toBe(1000)

			// Sample should contain sine wave data (check a non-zero position)
			expect(sample.data[25]).not.toBe(0)
		})

		it('should throw on invalid data', () => {
			expect(() => decodeMod(new Uint8Array([0, 0, 0, 0]))).toThrow()
		})
	})

	describe('parseModInfo', () => {
		it('should parse MOD info', () => {
			const mod = encodeMod(createTestMod())
			const info = parseModInfo(mod)

			expect(info.format).toBe('M.K.')
			expect(info.channels).toBe(4)
			expect(info.songLength).toBe(1)
			expect(info.numPatterns).toBe(1)
			expect(info.numSamples).toBe(1)
			expect(info.duration).toBeGreaterThan(0)
		})

		it('should count patterns correctly', () => {
			const testMod = createTestMod()
			// Add more patterns to pattern table
			testMod.patternTable[1] = 2
			testMod.songLength = 2

			const mod = encodeMod(testMod)
			const info = parseModInfo(mod)

			expect(info.numPatterns).toBe(3) // 0, 1, 2
		})
	})

	describe('createEmptyMod', () => {
		it('should create empty MOD', () => {
			const mod = createEmptyMod('Empty', 4)

			expect(mod.title).toBe('Empty')
			expect(mod.channels).toBe(4)
			expect(mod.format).toBe('M.K.')
			expect(mod.samples.length).toBe(31)
			expect(mod.patterns.length).toBe(1)
		})

		it('should handle different channel counts', () => {
			const mod6 = createEmptyMod('Test', 6)
			expect(mod6.channels).toBe(6)
			expect(mod6.format).toBe('6CHN')

			const mod8 = createEmptyMod('Test', 8)
			expect(mod8.channels).toBe(8)
			expect(mod8.format).toBe('8CHN')
		})

		it('should truncate long titles', () => {
			const longTitle = 'This is a very long title that exceeds twenty characters'
			const mod = createEmptyMod(longTitle, 4)

			expect(mod.title.length).toBeLessThanOrEqual(20)
		})
	})

	describe('modToAudio', () => {
		it('should convert MOD to audio', () => {
			const mod = createTestMod()
			const audio = modToAudio(mod, 44100)

			expect(audio.sampleRate).toBe(44100)
			expect(audio.channels).toBe(2)
			expect(audio.samples.length).toBe(2)
			expect(audio.samples[0]!.length).toBeGreaterThan(0)
			expect(audio.samples[1]!.length).toBeGreaterThan(0)
		})

		it('should generate valid audio samples', () => {
			const mod = createTestMod()
			const audio = modToAudio(mod, 44100)

			// Check that samples are in valid range [-1, 1]
			for (const channel of audio.samples) {
				for (let i = 0; i < channel.length; i++) {
					expect(channel[i]).toBeGreaterThanOrEqual(-1)
					expect(channel[i]).toBeLessThanOrEqual(1)
				}
			}
		})

		it('should handle custom sample rate', () => {
			const mod = createTestMod()
			const audio = modToAudio(mod, 22050)

			expect(audio.sampleRate).toBe(22050)
		})
	})

	describe('createModFromAudio', () => {
		it('should create MOD from audio', () => {
			const samples = [new Float32Array(1000).fill(0.5)]
			const mod = createModFromAudio(samples, 44100)

			expect(isMod(mod)).toBe(true)
		})

		it('should handle custom format', () => {
			const samples = [new Float32Array(1000)]
			const mod = createModFromAudio(samples, 44100, { format: 'M!K!' })

			const decoded = decodeMod(mod)
			expect(decoded.format).toBe('M!K!')
		})

		it('should convert audio data correctly', () => {
			// Create simple sine wave
			const samples = [new Float32Array(1000)]
			for (let i = 0; i < 1000; i++) {
				samples[0]![i] = Math.sin((i / 100) * Math.PI * 2)
			}

			const mod = createModFromAudio(samples, 44100)
			const decoded = decodeMod(mod)

			expect(decoded.samples[0]!.data.length).toBe(1000)
			// Check non-zero position since sin(0) = 0
			expect(decoded.samples[0]!.data[25]).not.toBe(0)
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip basic MOD', () => {
			const original = createTestMod()
			const encoded = encodeMod(original)
			const decoded = decodeMod(encoded)

			expect(decoded.title.trim()).toBe(original.title)
			expect(decoded.format).toBe(original.format)
			expect(decoded.channels).toBe(original.channels)
			expect(decoded.songLength).toBe(original.songLength)
		})

		it('should preserve samples', () => {
			const original = createTestMod()
			const encoded = encodeMod(original)
			const decoded = decodeMod(encoded)

			expect(decoded.samples[0]!.name.trim()).toBe(original.samples[0]!.name)
			expect(decoded.samples[0]!.length).toBe(original.samples[0]!.length)
			expect(decoded.samples[0]!.volume).toBe(original.samples[0]!.volume)
			expect(decoded.samples[0]!.data.length).toBe(original.samples[0]!.data.length)
		})

		it('should preserve patterns', () => {
			const original = createTestMod()
			const encoded = encodeMod(original)
			const decoded = decodeMod(encoded)

			const origPattern = original.patterns[0]!
			const decPattern = decoded.patterns[0]!

			expect(decPattern.rows.length).toBe(origPattern.rows.length)

			// Check first note
			const origNote = origPattern.rows[0]![0]!
			const decNote = decPattern.rows[0]![0]!

			expect(decNote.sample).toBe(origNote.sample)
			expect(decNote.period).toBe(origNote.period)
			expect(decNote.effect).toBe(origNote.effect)
			expect(decNote.effectParam).toBe(origNote.effectParam)
		})

		it('should roundtrip audio conversion', () => {
			// Create audio -> MOD -> audio
			const originalSamples = [new Float32Array(1000)]
			for (let i = 0; i < 1000; i++) {
				originalSamples[0]![i] = Math.sin((i / 50) * Math.PI * 2) * 0.5
			}

			const modData = createModFromAudio(originalSamples, 44100)
			const decoded = decodeMod(modData)
			const audio = modToAudio(decoded, 44100)

			expect(audio.sampleRate).toBe(44100)
			expect(audio.channels).toBe(2)
			expect(audio.samples[0]!.length).toBeGreaterThan(0)
		})
	})

	describe('edge cases', () => {
		it('should handle empty samples', () => {
			const mod = createEmptyMod('Empty', 4)
			const encoded = encodeMod(mod)
			const decoded = decodeMod(encoded)

			expect(decoded.samples.length).toBe(31)
			expect(decoded.samples[0]!.length).toBe(0)
		})

		it('should handle multiple patterns', () => {
			const testMod = createTestMod()
			// Duplicate pattern
			testMod.patterns.push(testMod.patterns[0]!)
			testMod.patternTable[1] = 1
			testMod.songLength = 2

			const encoded = encodeMod(testMod)
			const decoded = decodeMod(encoded)

			expect(decoded.patterns.length).toBe(2)
			expect(decoded.songLength).toBe(2)
		})

		it('should handle effects', () => {
			const testMod = createTestMod()
			// Add volume effect
			testMod.patterns[0]!.rows[0]![0]!.effect = 0xc
			testMod.patterns[0]!.rows[0]![0]!.effectParam = 0x40

			const encoded = encodeMod(testMod)
			const decoded = decodeMod(encoded)

			const note = decoded.patterns[0]!.rows[0]![0]!
			expect(note.effect).toBe(0xc)
			expect(note.effectParam).toBe(0x40)
		})

		it('should handle finetune', () => {
			const testMod = createTestMod()
			testMod.samples[0]!.finetune = 7

			const encoded = encodeMod(testMod)
			const decoded = decodeMod(encoded)

			expect(decoded.samples[0]!.finetune).toBe(7)
		})

		it('should handle negative finetune', () => {
			const testMod = createTestMod()
			testMod.samples[0]!.finetune = -8

			const encoded = encodeMod(testMod)
			const decoded = decodeMod(encoded)

			expect(decoded.samples[0]!.finetune).toBe(-8)
		})

		it('should handle looping samples', () => {
			const testMod = createTestMod()
			testMod.samples[0]!.repeatPoint = 100
			testMod.samples[0]!.repeatLength = 200

			const encoded = encodeMod(testMod)
			const decoded = decodeMod(encoded)

			expect(decoded.samples[0]!.repeatPoint).toBe(100)
			expect(decoded.samples[0]!.repeatLength).toBe(200)
		})

		it('should handle max volume', () => {
			const testMod = createTestMod()
			testMod.samples[0]!.volume = 64

			const encoded = encodeMod(testMod)
			const decoded = decodeMod(encoded)

			expect(decoded.samples[0]!.volume).toBe(64)
		})

		it('should clamp volume above 64', () => {
			const testMod = createTestMod()
			testMod.samples[0]!.volume = 100

			const encoded = encodeMod(testMod)
			const decoded = decodeMod(encoded)

			expect(decoded.samples[0]!.volume).toBe(64)
		})
	})
})

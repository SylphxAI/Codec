import { describe, expect, it } from 'bun:test'
import {
	decodeCaf,
	encodeCaf,
	encodeCafMono,
	encodeCafStereo,
	isCaf,
	parseCafInfo,
	CafFormatId,
} from './index'

describe('CAF Codec', () => {
	// Create test tone (sine wave)
	function createSineWave(frequency: number, sampleRate: number, duration: number): Float32Array {
		const sampleCount = Math.floor(sampleRate * duration)
		const samples = new Float32Array(sampleCount)
		for (let i = 0; i < sampleCount; i++) {
			samples[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate)
		}
		return samples
	}

	// Create silence
	function createSilence(sampleCount: number): Float32Array {
		return new Float32Array(sampleCount)
	}

	describe('isCaf', () => {
		it('should identify CAF files', () => {
			const samples = createSilence(100)
			const caf = encodeCafMono(samples)
			expect(isCaf(caf)).toBe(true)
		})

		it('should reject non-CAF files', () => {
			expect(isCaf(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isCaf(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF
		})

		it('should handle short data', () => {
			expect(isCaf(new Uint8Array([]))).toBe(false)
			expect(isCaf(new Uint8Array([0x63, 0x61, 0x66, 0x66]))).toBe(false) // Just 'caff'
		})
	})

	describe('parseCafInfo', () => {
		it('should parse CAF info', () => {
			const samples = createSineWave(440, 44100, 0.5)
			const caf = encodeCafMono(samples, { sampleRate: 44100, bitsPerChannel: 16 })

			const info = parseCafInfo(caf)

			expect(info.numChannels).toBe(1)
			expect(info.sampleRate).toBe(44100)
			expect(info.bitsPerChannel).toBe(16)
			expect(info.format).toBe(CafFormatId.LINEAR_PCM)
			expect(info.sampleCount).toBe(samples.length)
			expect(info.duration).toBeCloseTo(0.5, 2)
			expect(info.isFloat).toBe(false)
			expect(info.isLittleEndian).toBe(false)
		})

		it('should parse stereo CAF', () => {
			const left = createSineWave(440, 48000, 0.25)
			const right = createSineWave(880, 48000, 0.25)
			const caf = encodeCafStereo(left, right, { sampleRate: 48000 })

			const info = parseCafInfo(caf)

			expect(info.numChannels).toBe(2)
			expect(info.sampleRate).toBe(48000)
		})

		it('should detect floating point format', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const caf = encodeCafMono(samples, { bitsPerChannel: 32, floatingPoint: true })

			const info = parseCafInfo(caf)

			expect(info.isFloat).toBe(true)
			expect(info.bitsPerChannel).toBe(32)
		})

		it('should detect little endian format', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const caf = encodeCafMono(samples, { bitsPerChannel: 16, littleEndian: true })

			const info = parseCafInfo(caf)

			expect(info.isLittleEndian).toBe(true)
		})
	})

	describe('encodeCaf', () => {
		it('should encode mono audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const caf = encodeCafMono(samples)

			expect(isCaf(caf)).toBe(true)
			expect(caf.length).toBeGreaterThan(64) // Header size
		})

		it('should encode stereo audio', () => {
			const left = createSineWave(440, 44100, 0.1)
			const right = createSineWave(880, 44100, 0.1)
			const caf = encodeCafStereo(left, right)

			expect(isCaf(caf)).toBe(true)
			const info = parseCafInfo(caf)
			expect(info.numChannels).toBe(2)
		})

		it('should encode multichannel audio', () => {
			const channels = [
				createSineWave(440, 44100, 0.1),
				createSineWave(550, 44100, 0.1),
				createSineWave(660, 44100, 0.1),
				createSineWave(880, 44100, 0.1),
			]
			const caf = encodeCaf(channels)

			const info = parseCafInfo(caf)
			expect(info.numChannels).toBe(4)
		})

		it('should handle empty input', () => {
			const caf = encodeCaf([])
			expect(caf.length).toBe(0)
		})

		it('should respect sample rate option', () => {
			const samples = createSilence(100)
			const caf = encodeCafMono(samples, { sampleRate: 22050 })

			const info = parseCafInfo(caf)
			expect(info.sampleRate).toBe(22050)
		})

		it('should encode 8-bit audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const caf = encodeCafMono(samples, { bitsPerChannel: 8 })

			const info = parseCafInfo(caf)
			expect(info.bitsPerChannel).toBe(8)
		})

		it('should encode 24-bit audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const caf = encodeCafMono(samples, { bitsPerChannel: 24 })

			const info = parseCafInfo(caf)
			expect(info.bitsPerChannel).toBe(24)
		})

		it('should encode 32-bit float audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const caf = encodeCafMono(samples, { bitsPerChannel: 32, floatingPoint: true })

			const info = parseCafInfo(caf)
			expect(info.bitsPerChannel).toBe(32)
			expect(info.format).toBe(CafFormatId.LINEAR_PCM)
			expect(info.isFloat).toBe(true)
		})

		it('should encode little endian audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const caf = encodeCafMono(samples, { bitsPerChannel: 16, littleEndian: true })

			const info = parseCafInfo(caf)
			expect(info.isLittleEndian).toBe(true)
		})
	})

	describe('decodeCaf', () => {
		it('should decode CAF audio', () => {
			const original = createSineWave(440, 44100, 0.1)
			const caf = encodeCafMono(original, { sampleRate: 44100 })

			const decoded = decodeCaf(caf)

			expect(decoded.info.numChannels).toBe(1)
			expect(decoded.info.sampleRate).toBe(44100)
			expect(decoded.samples.length).toBe(1)
			expect(decoded.samples[0]!.length).toBe(original.length)
		})

		it('should decode stereo audio', () => {
			const left = createSineWave(440, 44100, 0.1)
			const right = createSineWave(880, 44100, 0.1)
			const caf = encodeCafStereo(left, right)

			const decoded = decodeCaf(caf)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.samples[0]!.length).toBe(left.length)
			expect(decoded.samples[1]!.length).toBe(right.length)
		})

		it('should preserve sample values (16-bit)', () => {
			const original = new Float32Array([0, 0.5, -0.5, 1, -1])
			const caf = encodeCafMono(original, { bitsPerChannel: 16 })

			const decoded = decodeCaf(caf)

			for (let i = 0; i < original.length; i++) {
				// 16-bit has some quantization error
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})

		it('should preserve sample values (32-bit float)', () => {
			const original = new Float32Array([0, 0.5, -0.5, 0.123456, -0.987654])
			const caf = encodeCafMono(original, { bitsPerChannel: 32, floatingPoint: true })

			const decoded = decodeCaf(caf)

			for (let i = 0; i < original.length; i++) {
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 5)
			}
		})

		it('should decode little endian audio', () => {
			const original = new Float32Array([0, 0.25, 0.5, -0.25, -0.5])
			const caf = encodeCafMono(original, { bitsPerChannel: 16, littleEndian: true })

			const decoded = decodeCaf(caf)

			for (let i = 0; i < original.length; i++) {
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip sine wave', () => {
			const original = createSineWave(440, 44100, 0.05)

			const encoded = encodeCafMono(original, { bitsPerChannel: 16 })
			const decoded = decodeCaf(encoded)

			expect(decoded.samples[0]!.length).toBe(original.length)

			// Check a few samples (16-bit quantization will cause minor differences)
			for (let i = 0; i < 10; i++) {
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})

		it('should roundtrip various bit depths', () => {
			const original = new Float32Array([0, 0.25, 0.5, 0.75, -0.25, -0.5, -0.75])

			for (const bitsPerChannel of [8, 16, 24, 32] as const) {
				const encoded = encodeCafMono(original, { bitsPerChannel })
				const decoded = decodeCaf(encoded)

				expect(decoded.info.bitsPerChannel).toBe(bitsPerChannel)
				expect(decoded.samples[0]!.length).toBe(original.length)

				// Higher bit depths have better precision
				const precision = bitsPerChannel === 8 ? 1 : bitsPerChannel === 16 ? 3 : 5
				for (let i = 0; i < original.length; i++) {
					expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, precision)
				}
			}
		})

		it('should roundtrip stereo audio', () => {
			const left = createSineWave(440, 44100, 0.05)
			const right = createSineWave(880, 44100, 0.05)

			const encoded = encodeCafStereo(left, right)
			const decoded = decodeCaf(encoded)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.samples[0]!.length).toBe(left.length)
			expect(decoded.samples[1]!.length).toBe(right.length)
		})

		it('should roundtrip big endian (default)', () => {
			const original = createSineWave(440, 44100, 0.05)

			const encoded = encodeCafMono(original, { bitsPerChannel: 16, littleEndian: false })
			const decoded = decodeCaf(encoded)

			expect(decoded.samples[0]!.length).toBe(original.length)
			for (let i = 0; i < 10; i++) {
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})

		it('should roundtrip little endian', () => {
			const original = createSineWave(440, 44100, 0.05)

			const encoded = encodeCafMono(original, { bitsPerChannel: 16, littleEndian: true })
			const decoded = decodeCaf(encoded)

			expect(decoded.samples[0]!.length).toBe(original.length)
			for (let i = 0; i < 10; i++) {
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})

		it('should roundtrip floating point', () => {
			const original = new Float32Array([0, 0.123456, -0.654321, 0.999, -0.999])

			const encoded = encodeCafMono(original, { bitsPerChannel: 32, floatingPoint: true })
			const decoded = decodeCaf(encoded)

			for (let i = 0; i < original.length; i++) {
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 6)
			}
		})
	})
})

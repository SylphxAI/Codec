import { describe, expect, it } from 'bun:test'
import {
	decodeAiff,
	encodeAiff,
	encodeAiffMono,
	encodeAiffStereo,
	isAiff,
	parseAiffInfo,
} from './index'

describe('AIFF Codec', () => {
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

	describe('isAiff', () => {
		it('should identify AIFF files', () => {
			const samples = createSilence(100)
			const aiff = encodeAiffMono(samples)
			expect(isAiff(aiff)).toBe(true)
		})

		it('should reject non-AIFF files', () => {
			expect(isAiff(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isAiff(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF (WAV)
		})

		it('should handle short data', () => {
			expect(isAiff(new Uint8Array([]))).toBe(false)
			expect(isAiff(new Uint8Array([0x46, 0x4f, 0x52, 0x4d]))).toBe(false) // Just FORM
		})
	})

	describe('parseAiffInfo', () => {
		it('should parse AIFF info', () => {
			const samples = createSineWave(440, 44100, 0.5)
			const aiff = encodeAiffMono(samples, { sampleRate: 44100, bitsPerSample: 16 })

			const info = parseAiffInfo(aiff)

			expect(info.numChannels).toBe(1)
			expect(info.sampleRate).toBeCloseTo(44100, 0)
			expect(info.bitsPerSample).toBe(16)
			expect(info.isCompressed).toBe(false)
			expect(info.sampleCount).toBe(samples.length)
			expect(info.duration).toBeCloseTo(0.5, 2)
		})

		it('should parse stereo AIFF', () => {
			const left = createSineWave(440, 48000, 0.25)
			const right = createSineWave(880, 48000, 0.25)
			const aiff = encodeAiffStereo(left, right, { sampleRate: 48000 })

			const info = parseAiffInfo(aiff)

			expect(info.numChannels).toBe(2)
			expect(info.sampleRate).toBeCloseTo(48000, 0)
		})
	})

	describe('encodeAiff', () => {
		it('should encode mono audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const aiff = encodeAiffMono(samples)

			expect(isAiff(aiff)).toBe(true)
			expect(aiff.length).toBeGreaterThan(54) // Header size
		})

		it('should encode stereo audio', () => {
			const left = createSineWave(440, 44100, 0.1)
			const right = createSineWave(880, 44100, 0.1)
			const aiff = encodeAiffStereo(left, right)

			expect(isAiff(aiff)).toBe(true)
			const info = parseAiffInfo(aiff)
			expect(info.numChannels).toBe(2)
		})

		it('should encode multichannel audio', () => {
			const channels = [
				createSineWave(440, 44100, 0.1),
				createSineWave(550, 44100, 0.1),
				createSineWave(660, 44100, 0.1),
				createSineWave(880, 44100, 0.1),
			]
			const aiff = encodeAiff(channels)

			const info = parseAiffInfo(aiff)
			expect(info.numChannels).toBe(4)
		})

		it('should handle empty input', () => {
			const aiff = encodeAiff([])
			expect(aiff.length).toBe(0)
		})

		it('should respect sample rate option', () => {
			const samples = createSilence(100)
			const aiff = encodeAiffMono(samples, { sampleRate: 22050 })

			const info = parseAiffInfo(aiff)
			expect(info.sampleRate).toBeCloseTo(22050, 0)
		})

		it('should encode 8-bit audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const aiff = encodeAiffMono(samples, { bitsPerSample: 8 })

			const info = parseAiffInfo(aiff)
			expect(info.bitsPerSample).toBe(8)
		})

		it('should encode 24-bit audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const aiff = encodeAiffMono(samples, { bitsPerSample: 24 })

			const info = parseAiffInfo(aiff)
			expect(info.bitsPerSample).toBe(24)
		})
	})

	describe('decodeAiff', () => {
		it('should decode AIFF audio', () => {
			const original = createSineWave(440, 44100, 0.1)
			const aiff = encodeAiffMono(original, { sampleRate: 44100 })

			const decoded = decodeAiff(aiff)

			expect(decoded.info.numChannels).toBe(1)
			expect(decoded.info.sampleRate).toBeCloseTo(44100, 0)
			expect(decoded.samples.length).toBe(1)
			expect(decoded.samples[0]!.length).toBe(original.length)
		})

		it('should decode stereo audio', () => {
			const left = createSineWave(440, 44100, 0.1)
			const right = createSineWave(880, 44100, 0.1)
			const aiff = encodeAiffStereo(left, right)

			const decoded = decodeAiff(aiff)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.samples[0]!.length).toBe(left.length)
			expect(decoded.samples[1]!.length).toBe(right.length)
		})

		it('should preserve sample values (16-bit)', () => {
			const original = new Float32Array([0, 0.5, -0.5, 1, -1])
			const aiff = encodeAiffMono(original, { bitsPerSample: 16 })

			const decoded = decodeAiff(aiff)

			for (let i = 0; i < original.length; i++) {
				// 16-bit has some quantization error
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip sine wave', () => {
			const original = createSineWave(440, 44100, 0.05)

			const encoded = encodeAiffMono(original, { bitsPerSample: 16 })
			const decoded = decodeAiff(encoded)

			expect(decoded.samples[0]!.length).toBe(original.length)

			// Check a few samples (16-bit quantization will cause minor differences)
			for (let i = 0; i < 10; i++) {
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})

		it('should roundtrip various bit depths', () => {
			const original = new Float32Array([0, 0.25, 0.5, 0.75, -0.25, -0.5, -0.75])

			for (const bitsPerSample of [8, 16, 24, 32] as const) {
				const encoded = encodeAiffMono(original, { bitsPerSample })
				const decoded = decodeAiff(encoded)

				expect(decoded.info.bitsPerSample).toBe(bitsPerSample)
				expect(decoded.samples[0]!.length).toBe(original.length)

				// Higher bit depths have better precision
				const precision = bitsPerSample === 8 ? 1 : bitsPerSample === 16 ? 3 : 5
				for (let i = 0; i < original.length; i++) {
					expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, precision)
				}
			}
		})

		it('should roundtrip stereo audio', () => {
			const left = createSineWave(440, 44100, 0.05)
			const right = createSineWave(880, 44100, 0.05)

			const encoded = encodeAiffStereo(left, right)
			const decoded = decodeAiff(encoded)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.samples[0]!.length).toBe(left.length)
			expect(decoded.samples[1]!.length).toBe(right.length)
		})

		it('should handle different sample rates', () => {
			for (const sampleRate of [8000, 22050, 44100, 48000, 96000]) {
				const samples = createSineWave(440, sampleRate, 0.01)
				const encoded = encodeAiffMono(samples, { sampleRate })
				const decoded = decodeAiff(encoded)

				expect(decoded.info.sampleRate).toBeCloseTo(sampleRate, 0)
			}
		})
	})
})

import { describe, expect, it } from 'bun:test'
import {
	decodeWav,
	encodeWav,
	encodeWavMono,
	encodeWavStereo,
	isWav,
	parseWavInfo,
	WavFormat,
} from './index'

describe('WAV Codec', () => {
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

	describe('isWav', () => {
		it('should identify WAV files', () => {
			const samples = createSilence(100)
			const wav = encodeWavMono(samples)
			expect(isWav(wav)).toBe(true)
		})

		it('should reject non-WAV files', () => {
			expect(isWav(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isWav(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isWav(new Uint8Array([]))).toBe(false)
			expect(isWav(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // Just RIFF
		})
	})

	describe('parseWavInfo', () => {
		it('should parse WAV info', () => {
			const samples = createSineWave(440, 44100, 0.5)
			const wav = encodeWavMono(samples, { sampleRate: 44100, bitsPerSample: 16 })

			const info = parseWavInfo(wav)

			expect(info.numChannels).toBe(1)
			expect(info.sampleRate).toBe(44100)
			expect(info.bitsPerSample).toBe(16)
			expect(info.format).toBe(WavFormat.PCM)
			expect(info.sampleCount).toBe(samples.length)
			expect(info.duration).toBeCloseTo(0.5, 2)
		})

		it('should parse stereo WAV', () => {
			const left = createSineWave(440, 48000, 0.25)
			const right = createSineWave(880, 48000, 0.25)
			const wav = encodeWavStereo(left, right, { sampleRate: 48000 })

			const info = parseWavInfo(wav)

			expect(info.numChannels).toBe(2)
			expect(info.sampleRate).toBe(48000)
		})
	})

	describe('encodeWav', () => {
		it('should encode mono audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const wav = encodeWavMono(samples)

			expect(isWav(wav)).toBe(true)
			expect(wav.length).toBeGreaterThan(44) // Header size
		})

		it('should encode stereo audio', () => {
			const left = createSineWave(440, 44100, 0.1)
			const right = createSineWave(880, 44100, 0.1)
			const wav = encodeWavStereo(left, right)

			expect(isWav(wav)).toBe(true)
			const info = parseWavInfo(wav)
			expect(info.numChannels).toBe(2)
		})

		it('should encode multichannel audio', () => {
			const channels = [
				createSineWave(440, 44100, 0.1),
				createSineWave(550, 44100, 0.1),
				createSineWave(660, 44100, 0.1),
				createSineWave(880, 44100, 0.1),
			]
			const wav = encodeWav(channels)

			const info = parseWavInfo(wav)
			expect(info.numChannels).toBe(4)
		})

		it('should handle empty input', () => {
			const wav = encodeWav([])
			expect(wav.length).toBe(0)
		})

		it('should respect sample rate option', () => {
			const samples = createSilence(100)
			const wav = encodeWavMono(samples, { sampleRate: 22050 })

			const info = parseWavInfo(wav)
			expect(info.sampleRate).toBe(22050)
		})

		it('should encode 8-bit audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const wav = encodeWavMono(samples, { bitsPerSample: 8 })

			const info = parseWavInfo(wav)
			expect(info.bitsPerSample).toBe(8)
		})

		it('should encode 24-bit audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const wav = encodeWavMono(samples, { bitsPerSample: 24 })

			const info = parseWavInfo(wav)
			expect(info.bitsPerSample).toBe(24)
		})

		it('should encode 32-bit float audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const wav = encodeWavMono(samples, { bitsPerSample: 32, floatingPoint: true })

			const info = parseWavInfo(wav)
			expect(info.bitsPerSample).toBe(32)
			expect(info.format).toBe(WavFormat.IEEE_FLOAT)
		})
	})

	describe('decodeWav', () => {
		it('should decode WAV audio', () => {
			const original = createSineWave(440, 44100, 0.1)
			const wav = encodeWavMono(original, { sampleRate: 44100 })

			const decoded = decodeWav(wav)

			expect(decoded.info.numChannels).toBe(1)
			expect(decoded.info.sampleRate).toBe(44100)
			expect(decoded.samples.length).toBe(1)
			expect(decoded.samples[0]!.length).toBe(original.length)
		})

		it('should decode stereo audio', () => {
			const left = createSineWave(440, 44100, 0.1)
			const right = createSineWave(880, 44100, 0.1)
			const wav = encodeWavStereo(left, right)

			const decoded = decodeWav(wav)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.samples[0]!.length).toBe(left.length)
			expect(decoded.samples[1]!.length).toBe(right.length)
		})

		it('should preserve sample values (16-bit)', () => {
			const original = new Float32Array([0, 0.5, -0.5, 1, -1])
			const wav = encodeWavMono(original, { bitsPerSample: 16 })

			const decoded = decodeWav(wav)

			for (let i = 0; i < original.length; i++) {
				// 16-bit has some quantization error
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})

		it('should preserve sample values (32-bit float)', () => {
			const original = new Float32Array([0, 0.5, -0.5, 0.123456, -0.987654])
			const wav = encodeWavMono(original, { bitsPerSample: 32, floatingPoint: true })

			const decoded = decodeWav(wav)

			for (let i = 0; i < original.length; i++) {
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 5)
			}
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip sine wave', () => {
			const original = createSineWave(440, 44100, 0.05)

			const encoded = encodeWavMono(original, { bitsPerSample: 16 })
			const decoded = decodeWav(encoded)

			expect(decoded.samples[0]!.length).toBe(original.length)

			// Check a few samples (16-bit quantization will cause minor differences)
			for (let i = 0; i < 10; i++) {
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})

		it('should roundtrip various bit depths', () => {
			const original = new Float32Array([0, 0.25, 0.5, 0.75, -0.25, -0.5, -0.75])

			for (const bitsPerSample of [8, 16, 24, 32] as const) {
				const encoded = encodeWavMono(original, { bitsPerSample })
				const decoded = decodeWav(encoded)

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

			const encoded = encodeWavStereo(left, right)
			const decoded = decodeWav(encoded)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.samples[0]!.length).toBe(left.length)
			expect(decoded.samples[1]!.length).toBe(right.length)
		})
	})
})

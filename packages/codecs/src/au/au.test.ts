import { describe, expect, it } from 'bun:test'
import {
	AuEncoding,
	decodeAu,
	encodeAu,
	encodeAuMono,
	encodeAuStereo,
	isAu,
	parseAuHeader,
	parseAuInfo,
} from './index'

describe('AU Codec', () => {
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

	describe('isAu', () => {
		it('should identify AU files', () => {
			const samples = createSilence(100)
			const au = encodeAuMono(samples)
			expect(isAu(au)).toBe(true)
		})

		it('should reject non-AU files', () => {
			expect(isAu(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isAu(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF (WAV)
		})

		it('should handle short data', () => {
			expect(isAu(new Uint8Array([]))).toBe(false)
			expect(isAu(new Uint8Array([0x2e, 0x73, 0x6e, 0x64]))).toBe(false) // Just magic
		})
	})

	describe('parseAuHeader', () => {
		it('should parse AU header', () => {
			const samples = createSilence(100)
			const au = encodeAuMono(samples, { sampleRate: 44100 })

			const header = parseAuHeader(au)

			expect(header.sampleRate).toBe(44100)
			expect(header.numChannels).toBe(1)
			expect(header.encoding).toBe(AuEncoding.LINEAR_16)
		})

		it('should parse annotation', () => {
			const samples = createSilence(100)
			const au = encodeAuMono(samples, { annotation: 'Test audio' })

			const header = parseAuHeader(au)

			expect(header.annotation).toBe('Test audio')
		})
	})

	describe('parseAuInfo', () => {
		it('should parse AU info', () => {
			const samples = createSineWave(440, 44100, 0.5)
			const au = encodeAuMono(samples, { sampleRate: 44100, bitsPerSample: 16 })

			const info = parseAuInfo(au)

			expect(info.numChannels).toBe(1)
			expect(info.sampleRate).toBe(44100)
			expect(info.bitsPerSample).toBe(16)
			expect(info.encoding).toBe(AuEncoding.LINEAR_16)
			expect(info.sampleCount).toBe(samples.length)
			expect(info.duration).toBeCloseTo(0.5, 2)
		})

		it('should parse stereo AU', () => {
			const left = createSineWave(440, 48000, 0.25)
			const right = createSineWave(880, 48000, 0.25)
			const au = encodeAuStereo(left, right, { sampleRate: 48000 })

			const info = parseAuInfo(au)

			expect(info.numChannels).toBe(2)
			expect(info.sampleRate).toBe(48000)
		})
	})

	describe('encodeAu', () => {
		it('should encode mono audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const au = encodeAuMono(samples)

			expect(isAu(au)).toBe(true)
			expect(au.length).toBeGreaterThan(24) // Header size
		})

		it('should encode stereo audio', () => {
			const left = createSineWave(440, 44100, 0.1)
			const right = createSineWave(880, 44100, 0.1)
			const au = encodeAuStereo(left, right)

			expect(isAu(au)).toBe(true)
			const info = parseAuInfo(au)
			expect(info.numChannels).toBe(2)
		})

		it('should encode multichannel audio', () => {
			const channels = [
				createSineWave(440, 44100, 0.1),
				createSineWave(550, 44100, 0.1),
				createSineWave(660, 44100, 0.1),
				createSineWave(880, 44100, 0.1),
			]
			const au = encodeAu(channels)

			const info = parseAuInfo(au)
			expect(info.numChannels).toBe(4)
		})

		it('should handle empty input', () => {
			const au = encodeAu([])
			expect(au.length).toBe(0)
		})

		it('should respect sample rate option', () => {
			const samples = createSilence(100)
			const au = encodeAuMono(samples, { sampleRate: 22050 })

			const info = parseAuInfo(au)
			expect(info.sampleRate).toBe(22050)
		})

		it('should encode 8-bit audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const au = encodeAuMono(samples, { bitsPerSample: 8 })

			const info = parseAuInfo(au)
			expect(info.bitsPerSample).toBe(8)
			expect(info.encoding).toBe(AuEncoding.LINEAR_8)
		})

		it('should encode 24-bit audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const au = encodeAuMono(samples, { bitsPerSample: 24 })

			const info = parseAuInfo(au)
			expect(info.bitsPerSample).toBe(24)
			expect(info.encoding).toBe(AuEncoding.LINEAR_24)
		})

		it('should encode 32-bit audio', () => {
			const samples = createSineWave(440, 44100, 0.1)
			const au = encodeAuMono(samples, { bitsPerSample: 32 })

			const info = parseAuInfo(au)
			expect(info.bitsPerSample).toBe(32)
			expect(info.encoding).toBe(AuEncoding.LINEAR_32)
		})
	})

	describe('decodeAu', () => {
		it('should decode AU audio', () => {
			const original = createSineWave(440, 44100, 0.1)
			const au = encodeAuMono(original, { sampleRate: 44100 })

			const decoded = decodeAu(au)

			expect(decoded.info.numChannels).toBe(1)
			expect(decoded.info.sampleRate).toBe(44100)
			expect(decoded.samples.length).toBe(1)
			expect(decoded.samples[0]!.length).toBe(original.length)
		})

		it('should decode stereo audio', () => {
			const left = createSineWave(440, 44100, 0.1)
			const right = createSineWave(880, 44100, 0.1)
			const au = encodeAuStereo(left, right)

			const decoded = decodeAu(au)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.samples[0]!.length).toBe(left.length)
			expect(decoded.samples[1]!.length).toBe(right.length)
		})

		it('should preserve sample values (16-bit)', () => {
			const original = new Float32Array([0, 0.5, -0.5, 1, -1])
			const au = encodeAuMono(original, { bitsPerSample: 16 })

			const decoded = decodeAu(au)

			for (let i = 0; i < original.length; i++) {
				// 16-bit has some quantization error
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip sine wave', () => {
			const original = createSineWave(440, 44100, 0.05)

			const encoded = encodeAuMono(original, { bitsPerSample: 16 })
			const decoded = decodeAu(encoded)

			expect(decoded.samples[0]!.length).toBe(original.length)

			// Check a few samples (16-bit quantization will cause minor differences)
			for (let i = 0; i < 10; i++) {
				expect(decoded.samples[0]![i]).toBeCloseTo(original[i]!, 3)
			}
		})

		it('should roundtrip various bit depths', () => {
			const original = new Float32Array([0, 0.25, 0.5, 0.75, -0.25, -0.5, -0.75])

			for (const bitsPerSample of [8, 16, 24, 32] as const) {
				const encoded = encodeAuMono(original, { bitsPerSample })
				const decoded = decodeAu(encoded)

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

			const encoded = encodeAuStereo(left, right)
			const decoded = decodeAu(encoded)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.samples[0]!.length).toBe(left.length)
			expect(decoded.samples[1]!.length).toBe(right.length)
		})
	})
})

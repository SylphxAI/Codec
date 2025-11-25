import { describe, expect, it } from 'bun:test'
import { decodeFlac, encodeFlac, isFlac, parseFlacInfo } from './index'
import type { FlacAudioData } from './types'

describe('FLAC Codec', () => {
	// Create test audio with sine wave
	function createSineWave(
		sampleRate: number,
		duration: number,
		frequency: number,
		channels: number,
		bitsPerSample: number
	): FlacAudioData {
		const numSamples = Math.floor(sampleRate * duration)
		const maxValue = (1 << (bitsPerSample - 1)) - 1
		const samples: Int32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Int32Array(numSamples)
			const phaseOffset = (ch * Math.PI) / 4 // Slight phase offset per channel
			for (let i = 0; i < numSamples; i++) {
				const t = i / sampleRate
				channelSamples[i] = Math.round(Math.sin(2 * Math.PI * frequency * t + phaseOffset) * maxValue * 0.8)
			}
			samples.push(channelSamples)
		}

		return { samples, sampleRate, bitsPerSample }
	}

	// Create test audio with DC offset (constant)
	function createConstantAudio(
		sampleRate: number,
		numSamples: number,
		value: number,
		channels: number,
		bitsPerSample: number
	): FlacAudioData {
		const samples: Int32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Int32Array(numSamples)
			channelSamples.fill(value)
			samples.push(channelSamples)
		}

		return { samples, sampleRate, bitsPerSample }
	}

	// Create test audio with linear ramp
	function createRampAudio(
		sampleRate: number,
		numSamples: number,
		channels: number,
		bitsPerSample: number
	): FlacAudioData {
		const samples: Int32Array[] = []
		const maxValue = (1 << (bitsPerSample - 1)) - 1

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Int32Array(numSamples)
			for (let i = 0; i < numSamples; i++) {
				channelSamples[i] = Math.round(((i / numSamples) * 2 - 1) * maxValue * 0.8)
			}
			samples.push(channelSamples)
		}

		return { samples, sampleRate, bitsPerSample }
	}

	describe('isFlac', () => {
		it('should identify FLAC files', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const flac = encodeFlac(audio)
			expect(isFlac(flac)).toBe(true)
		})

		it('should reject non-FLAC files', () => {
			expect(isFlac(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isFlac(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isFlac(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF
		})

		it('should handle short data', () => {
			expect(isFlac(new Uint8Array([]))).toBe(false)
			expect(isFlac(new Uint8Array([0x66, 0x4c]))).toBe(false)
		})
	})

	describe('parseFlacInfo', () => {
		it('should parse stereo 16-bit info', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const flac = encodeFlac(audio)

			const info = parseFlacInfo(flac)

			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
			expect(info.bitsPerSample).toBe(16)
		})

		it('should parse mono 24-bit info', () => {
			const audio = createSineWave(48000, 0.1, 1000, 1, 24)
			const flac = encodeFlac(audio)

			const info = parseFlacInfo(flac)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBe(1)
			expect(info.bitsPerSample).toBe(24)
		})

		it('should parse total samples', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const flac = encodeFlac(audio)

			const info = parseFlacInfo(flac)

			expect(info.totalSamples).toBe(4410) // 0.1s * 44100
		})

		it('should calculate duration', () => {
			const audio = createSineWave(44100, 0.5, 440, 2, 16)
			const flac = encodeFlac(audio)

			const info = parseFlacInfo(flac)

			expect(info.duration).toBeCloseTo(0.5, 2)
		})
	})

	describe('encodeFlac', () => {
		it('should encode sine wave', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const flac = encodeFlac(audio)

			expect(isFlac(flac)).toBe(true)
			expect(flac.length).toBeGreaterThan(100)
		})

		it('should encode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1, 16)
			const flac = encodeFlac(audio)

			expect(isFlac(flac)).toBe(true)
		})

		it('should encode 8-bit audio', () => {
			const audio = createSineWave(22050, 0.1, 440, 1, 8)
			const flac = encodeFlac(audio)

			expect(isFlac(flac)).toBe(true)
		})

		it('should encode constant audio efficiently', () => {
			const audio = createConstantAudio(44100, 4096, 1000, 1, 16)
			const flac = encodeFlac(audio)

			// Constant audio should compress very well
			expect(isFlac(flac)).toBe(true)
			// Raw size would be 4096 * 2 = 8192 bytes
			expect(flac.length).toBeLessThan(1000)
		})

		it('should encode with custom block size', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const flac = encodeFlac(audio, { blockSize: 1024 })

			expect(isFlac(flac)).toBe(true)
		})
	})

	describe('decodeFlac', () => {
		it('should decode to original channels', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const flac = encodeFlac(audio)
			const decoded = decodeFlac(flac)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.info.channels).toBe(2)
		})

		it('should decode correct sample count', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const flac = encodeFlac(audio)
			const decoded = decodeFlac(flac)

			expect(decoded.samples[0]!.length).toBe(4410)
		})

		it('should decode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1, 16)
			const flac = encodeFlac(audio)
			const decoded = decodeFlac(flac)

			expect(decoded.samples.length).toBe(1)
		})
	})

	describe('roundtrip', () => {
		it('should preserve sine wave samples exactly', () => {
			const audio = createSineWave(44100, 0.05, 440, 2, 16)
			const flac = encodeFlac(audio)
			const decoded = decodeFlac(flac)

			// FLAC is lossless - samples should be identical
			for (let ch = 0; ch < 2; ch++) {
				for (let i = 0; i < audio.samples[ch]!.length; i++) {
					expect(decoded.samples[ch]![i]).toBe(audio.samples[ch]![i])
				}
			}
		})

		it('should preserve constant audio exactly', () => {
			const audio = createConstantAudio(44100, 1000, 12345, 1, 16)
			const flac = encodeFlac(audio)
			const decoded = decodeFlac(flac)

			for (let i = 0; i < audio.samples[0]!.length; i++) {
				expect(decoded.samples[0]![i]).toBe(12345)
			}
		})

		it('should preserve ramp audio exactly', () => {
			const audio = createRampAudio(44100, 1000, 1, 16)
			const flac = encodeFlac(audio)
			const decoded = decodeFlac(flac)

			for (let i = 0; i < audio.samples[0]!.length; i++) {
				expect(decoded.samples[0]![i]).toBe(audio.samples[0]![i])
			}
		})

		it('should preserve 24-bit samples exactly', () => {
			const audio = createSineWave(48000, 0.05, 1000, 2, 24)
			const flac = encodeFlac(audio)
			const decoded = decodeFlac(flac)

			for (let ch = 0; ch < 2; ch++) {
				for (let i = 0; i < audio.samples[ch]!.length; i++) {
					expect(decoded.samples[ch]![i]).toBe(audio.samples[ch]![i])
				}
			}
		})

		it('should preserve sample rate', () => {
			for (const rate of [8000, 22050, 44100, 48000, 96000]) {
				const audio = createSineWave(rate, 0.05, 440, 1, 16)
				const flac = encodeFlac(audio)
				const decoded = decodeFlac(flac)

				expect(decoded.info.sampleRate).toBe(rate)
			}
		})

		it('should handle different channel counts', () => {
			for (const channels of [1, 2]) {
				const audio = createSineWave(44100, 0.05, 440, channels, 16)
				const flac = encodeFlac(audio)
				const decoded = decodeFlac(flac)

				expect(decoded.samples.length).toBe(channels)
			}
		})
	})

	describe('compression', () => {
		it('should compress audio significantly', () => {
			const audio = createSineWave(44100, 0.5, 440, 2, 16)
			const flac = encodeFlac(audio)

			// Raw size: 0.5s * 44100 * 2 channels * 2 bytes = 88200 bytes
			const rawSize = audio.samples[0]!.length * 2 * 2

			// FLAC should compress sine wave well (typically 50-70% of original)
			expect(flac.length).toBeLessThan(rawSize)
		})

		it('should achieve high compression on constant audio', () => {
			const audio = createConstantAudio(44100, 44100, 0, 2, 16)
			const flac = encodeFlac(audio)

			// Raw size: 44100 * 2 * 2 = 176400 bytes
			const rawSize = audio.samples[0]!.length * 2 * 2

			// Constant audio should compress extremely well
			expect(flac.length).toBeLessThan(rawSize * 0.1)
		})
	})
})

import { describe, expect, it } from 'bun:test'
import { decodeTak, encodeTak, isTak, parseTakInfo } from './index'
import type { TakAudioData } from './types'

describe('TAK Codec', () => {
	// Create test audio with sine wave
	function createSineWave(
		sampleRate: number,
		duration: number,
		frequency: number,
		channels: number,
		bitsPerSample: number
	): TakAudioData {
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
	): TakAudioData {
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
	): TakAudioData {
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

	describe('isTak', () => {
		it('should identify TAK files', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const tak = encodeTak(audio)
			expect(isTak(tak)).toBe(true)
		})

		it('should reject non-TAK files', () => {
			expect(isTak(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isTak(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isTak(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
		})

		it('should handle short data', () => {
			expect(isTak(new Uint8Array([]))).toBe(false)
			expect(isTak(new Uint8Array([0x74, 0x42]))).toBe(false)
		})
	})

	describe('parseTakInfo', () => {
		it('should parse stereo 16-bit info', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const tak = encodeTak(audio)

			const info = parseTakInfo(tak)

			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
			expect(info.bitsPerSample).toBe(16)
		})

		it('should parse mono 24-bit info', () => {
			const audio = createSineWave(48000, 0.1, 1000, 1, 24)
			const tak = encodeTak(audio)

			const info = parseTakInfo(tak)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBe(1)
			expect(info.bitsPerSample).toBe(24)
		})

		it('should parse total samples', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const tak = encodeTak(audio)

			const info = parseTakInfo(tak)

			expect(info.totalSamples).toBe(4410) // 0.1s * 44100
		})

		it('should calculate duration', () => {
			const audio = createSineWave(44100, 0.5, 440, 2, 16)
			const tak = encodeTak(audio)

			const info = parseTakInfo(tak)

			expect(info.duration).toBeCloseTo(0.5, 2)
		})

		it('should include encoder info', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const tak = encodeTak(audio)

			const info = parseTakInfo(tak)

			expect(info.encoder).toBeDefined()
			expect(info.encoder).toContain('mconv')
		})
	})

	describe('encodeTak', () => {
		it('should encode sine wave', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const tak = encodeTak(audio)

			expect(isTak(tak)).toBe(true)
			expect(tak.length).toBeGreaterThan(100)
		})

		it('should encode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1, 16)
			const tak = encodeTak(audio)

			expect(isTak(tak)).toBe(true)
		})

		it('should encode 8-bit audio', () => {
			const audio = createSineWave(22050, 0.1, 440, 1, 8)
			const tak = encodeTak(audio)

			expect(isTak(tak)).toBe(true)
		})

		it('should encode constant audio', () => {
			const audio = createConstantAudio(44100, 4096, 1000, 1, 16)
			const tak = encodeTak(audio)

			expect(isTak(tak)).toBe(true)
		})

		it('should encode with custom frame size', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const tak = encodeTak(audio, { frameSize: 8192 })

			expect(isTak(tak)).toBe(true)
		})
	})

	describe('decodeTak', () => {
		it('should decode to original channels', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const tak = encodeTak(audio)
			const decoded = decodeTak(tak)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.info.channels).toBe(2)
		})

		it('should decode correct sample count', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const tak = encodeTak(audio)
			const decoded = decodeTak(tak)

			expect(decoded.samples[0]!.length).toBe(4410)
		})

		it('should decode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1, 16)
			const tak = encodeTak(audio)
			const decoded = decodeTak(tak)

			expect(decoded.samples.length).toBe(1)
		})
	})

	describe('roundtrip', () => {
		it('should preserve sine wave samples exactly', () => {
			const audio = createSineWave(44100, 0.05, 440, 2, 16)
			const tak = encodeTak(audio)
			const decoded = decodeTak(tak)

			// TAK is lossless - samples should be identical
			for (let ch = 0; ch < 2; ch++) {
				for (let i = 0; i < audio.samples[ch]!.length; i++) {
					expect(decoded.samples[ch]![i]).toBe(audio.samples[ch]![i])
				}
			}
		})

		it('should preserve constant audio exactly', () => {
			const audio = createConstantAudio(44100, 1000, 12345, 1, 16)
			const tak = encodeTak(audio)
			const decoded = decodeTak(tak)

			for (let i = 0; i < audio.samples[0]!.length; i++) {
				expect(decoded.samples[0]![i]).toBe(12345)
			}
		})

		it('should preserve ramp audio exactly', () => {
			const audio = createRampAudio(44100, 1000, 1, 16)
			const tak = encodeTak(audio)
			const decoded = decodeTak(tak)

			for (let i = 0; i < audio.samples[0]!.length; i++) {
				expect(decoded.samples[0]![i]).toBe(audio.samples[0]![i])
			}
		})

		it('should preserve 24-bit samples exactly', () => {
			const audio = createSineWave(48000, 0.05, 1000, 2, 24)
			const tak = encodeTak(audio)
			const decoded = decodeTak(tak)

			for (let ch = 0; ch < 2; ch++) {
				for (let i = 0; i < audio.samples[ch]!.length; i++) {
					expect(decoded.samples[ch]![i]).toBe(audio.samples[ch]![i])
				}
			}
		})

		it('should preserve sample rate', () => {
			for (const rate of [8000, 22050, 44100, 48000, 96000]) {
				const audio = createSineWave(rate, 0.05, 440, 1, 16)
				const tak = encodeTak(audio)
				const decoded = decodeTak(tak)

				expect(decoded.info.sampleRate).toBe(rate)
			}
		})

		it('should handle different channel counts', () => {
			for (const channels of [1, 2]) {
				const audio = createSineWave(44100, 0.05, 440, channels, 16)
				const tak = encodeTak(audio)
				const decoded = decodeTak(tak)

				expect(decoded.samples.length).toBe(channels)
			}
		})
	})

	describe('format validation', () => {
		it('should have correct magic number', () => {
			const audio = createSineWave(44100, 0.05, 440, 1, 16)
			const tak = encodeTak(audio)

			// Check magic "tBaK"
			expect(tak[0]).toBe(0x74)
			expect(tak[1]).toBe(0x42)
			expect(tak[2]).toBe(0x61)
			expect(tak[3]).toBe(0x4b)
		})

		it('should handle different bit depths', () => {
			for (const bps of [8, 16, 24]) {
				const audio = createSineWave(44100, 0.05, 440, 1, bps)
				const tak = encodeTak(audio)
				const decoded = decodeTak(tak)

				expect(decoded.info.bitsPerSample).toBe(bps)
			}
		})

		it('should reject empty audio', () => {
			const audio: TakAudioData = {
				samples: [],
				sampleRate: 44100,
				bitsPerSample: 16,
			}

			expect(() => encodeTak(audio)).toThrow('No audio data')
		})
	})
})

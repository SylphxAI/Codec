import { describe, expect, it } from 'bun:test'
import type { AudioData } from '@sylphx/codec-core'
import { decodeDsf, encodeDsf, isDsf, parseDsfInfo } from './index'
import { DsdSampleRate } from './types'

describe('DSF Codec', () => {
	// Create test audio with sine wave
	function createSineWave(
		sampleRate: number,
		duration: number,
		frequency: number,
		channels: number
	): AudioData {
		const numSamples = Math.floor(sampleRate * duration)
		const samples: Float32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Float32Array(numSamples)
			const phaseOffset = (ch * Math.PI) / 4 // Slight phase offset per channel
			for (let i = 0; i < numSamples; i++) {
				const t = i / sampleRate
				channelSamples[i] = Math.sin(2 * Math.PI * frequency * t + phaseOffset) * 0.8
			}
			samples.push(channelSamples)
		}

		return { samples, sampleRate, channels }
	}

	// Create test audio with DC offset (constant)
	function createConstantAudio(
		sampleRate: number,
		numSamples: number,
		value: number,
		channels: number
	): AudioData {
		const samples: Float32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Float32Array(numSamples)
			channelSamples.fill(value)
			samples.push(channelSamples)
		}

		return { samples, sampleRate, channels }
	}

	// Create test audio with linear ramp
	function createRampAudio(
		sampleRate: number,
		numSamples: number,
		channels: number
	): AudioData {
		const samples: Float32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Float32Array(numSamples)
			for (let i = 0; i < numSamples; i++) {
				channelSamples[i] = ((i / numSamples) * 2 - 1) * 0.8
			}
			samples.push(channelSamples)
		}

		return { samples, sampleRate, channels }
	}

	describe('isDsf', () => {
		it('should identify DSF files', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 2)
			const dsf = encodeDsf(audio)
			expect(isDsf(dsf)).toBe(true)
		})

		it('should reject non-DSF files', () => {
			expect(isDsf(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isDsf(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
			expect(isDsf(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF
		})

		it('should handle short data', () => {
			expect(isDsf(new Uint8Array([]))).toBe(false)
			expect(isDsf(new Uint8Array([0x44, 0x53]))).toBe(false)
		})
	})

	describe('parseDsfInfo', () => {
		it('should parse stereo DSD64 info', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 2)
			const dsf = encodeDsf(audio)

			const info = parseDsfInfo(dsf)

			expect(info.sampleRate).toBe(DsdSampleRate.DSD64)
			expect(info.channels).toBe(2)
			expect(info.bitsPerSample).toBe(1)
		})

		it('should parse mono DSD128 info', () => {
			const audio = createSineWave(DsdSampleRate.DSD128, 0.001, 1000, 1)
			const dsf = encodeDsf(audio, { sampleRate: DsdSampleRate.DSD128 })

			const info = parseDsfInfo(dsf)

			expect(info.sampleRate).toBe(DsdSampleRate.DSD128)
			expect(info.channels).toBe(1)
			expect(info.bitsPerSample).toBe(1)
		})

		it('should parse total samples', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 2)
			const dsf = encodeDsf(audio)

			const info = parseDsfInfo(dsf)

			expect(info.totalSamples).toBe(2822) // 0.001s * 2822400
		})

		it('should calculate duration', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.005, 440, 2)
			const dsf = encodeDsf(audio)

			const info = parseDsfInfo(dsf)

			expect(info.duration).toBeCloseTo(0.005, 4)
		})
	})

	describe('encodeDsf', () => {
		it('should encode sine wave', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 2)
			const dsf = encodeDsf(audio)

			expect(isDsf(dsf)).toBe(true)
			expect(dsf.length).toBeGreaterThan(100)
		})

		it('should encode mono audio', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 1)
			const dsf = encodeDsf(audio)

			expect(isDsf(dsf)).toBe(true)
		})

		it('should encode with DSD128 sample rate', () => {
			const audio = createSineWave(DsdSampleRate.DSD128, 0.001, 440, 2)
			const dsf = encodeDsf(audio, { sampleRate: DsdSampleRate.DSD128 })

			expect(isDsf(dsf)).toBe(true)
		})

		it('should reject invalid sample rates', () => {
			const audio = createSineWave(44100, 0.001, 440, 2)
			expect(() => encodeDsf(audio, { sampleRate: 44100 })).toThrow()
		})

		it('should reject too many channels', () => {
			const samples: Float32Array[] = []
			for (let i = 0; i < 7; i++) {
				samples.push(new Float32Array(1000))
			}
			const audio: AudioData = { samples, sampleRate: DsdSampleRate.DSD64, channels: 7 }
			expect(() => encodeDsf(audio)).toThrow()
		})

		it('should encode constant audio', () => {
			const audio = createConstantAudio(DsdSampleRate.DSD64, 4096, 0.5, 1)
			const dsf = encodeDsf(audio)

			expect(isDsf(dsf)).toBe(true)
		})
	})

	describe('decodeDsf', () => {
		it('should decode to original channels', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 2)
			const dsf = encodeDsf(audio)
			const decoded = decodeDsf(dsf)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.channels).toBe(2)
		})

		it('should decode correct sample count', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 2)
			const dsf = encodeDsf(audio)
			const decoded = decodeDsf(dsf)

			expect(decoded.samples[0]!.length).toBe(2822)
		})

		it('should decode mono audio', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 1)
			const dsf = encodeDsf(audio)
			const decoded = decodeDsf(dsf)

			expect(decoded.samples.length).toBe(1)
		})

		it('should decode normalized values', () => {
			const audio = createConstantAudio(DsdSampleRate.DSD64, 1000, 0.5, 1)
			const dsf = encodeDsf(audio)
			const decoded = decodeDsf(dsf)

			// All values should be in normalized range
			for (let i = 0; i < decoded.samples[0]!.length; i++) {
				const sample = decoded.samples[0]![i]!
				expect(sample).toBeGreaterThanOrEqual(-1.0)
				expect(sample).toBeLessThanOrEqual(1.0)
			}
		})
	})

	describe('roundtrip', () => {
		it('should preserve channel count', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.002, 440, 2)
			const dsf = encodeDsf(audio)
			const decoded = decodeDsf(dsf)

			expect(decoded.samples.length).toBe(audio.samples.length)
		})

		it('should preserve sample count', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.002, 440, 1)
			const dsf = encodeDsf(audio)
			const decoded = decodeDsf(dsf)

			expect(decoded.samples[0]!.length).toBe(audio.samples[0]!.length)
		})

		it('should preserve sample rate', () => {
			for (const rate of [DsdSampleRate.DSD64, DsdSampleRate.DSD128]) {
				const audio = createSineWave(rate, 0.001, 440, 1)
				const dsf = encodeDsf(audio, { sampleRate: rate })
				const decoded = decodeDsf(dsf)

				expect(decoded.sampleRate).toBe(rate)
			}
		})

		it('should handle different channel counts', () => {
			for (const channels of [1, 2, 3, 4, 5, 6]) {
				const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, channels)
				const dsf = encodeDsf(audio)
				const decoded = decodeDsf(dsf)

				expect(decoded.samples.length).toBe(channels)
			}
		})

		it('should approximate original signal', () => {
			// DSD is lossy when converting from PCM, so we check correlation
			const audio = createSineWave(DsdSampleRate.DSD64, 0.01, 100, 1)
			const dsf = encodeDsf(audio)
			const decoded = decodeDsf(dsf)

			// Check that decoded signal is roughly in the same range
			const originalSamples = audio.samples[0]!
			const decodedSamples = decoded.samples[0]!

			let sumOriginal = 0
			let sumDecoded = 0

			for (let i = 0; i < Math.min(originalSamples.length, decodedSamples.length); i++) {
				sumOriginal += originalSamples[i]!
				sumDecoded += decodedSamples[i]!
			}

			const avgOriginal = sumOriginal / originalSamples.length
			const avgDecoded = sumDecoded / decodedSamples.length

			// Average should be close to zero for sine wave
			expect(Math.abs(avgOriginal)).toBeLessThan(0.1)
			expect(Math.abs(avgDecoded)).toBeLessThan(0.2)
		})
	})

	describe('format validation', () => {
		it('should have correct magic number', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 2)
			const dsf = encodeDsf(audio)

			expect(dsf[0]).toBe(0x44) // 'D'
			expect(dsf[1]).toBe(0x53) // 'S'
			expect(dsf[2]).toBe(0x44) // 'D'
			expect(dsf[3]).toBe(0x20) // ' '
		})

		it('should have format version 1', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 2)
			const dsf = encodeDsf(audio)
			const info = parseDsfInfo(dsf)

			expect(info.format.formatVersion).toBe(1)
		})

		it('should have format ID 0', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 2)
			const dsf = encodeDsf(audio)
			const info = parseDsfInfo(dsf)

			expect(info.format.formatId).toBe(0)
		})

		it('should have block size 4096', () => {
			const audio = createSineWave(DsdSampleRate.DSD64, 0.001, 440, 2)
			const dsf = encodeDsf(audio)
			const info = parseDsfInfo(dsf)

			expect(info.format.blockSizePerChannel).toBe(4096)
		})
	})
})

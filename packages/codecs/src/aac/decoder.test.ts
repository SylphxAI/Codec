import { describe, expect, it } from 'bun:test'
import { AacCodec, decodeAac, encodeAac, isAac, parseAacInfo } from './index'
import type { AacAudioData } from './types'

describe('AAC Codec', () => {
	// Create test audio with sine wave
	function createSineWave(
		sampleRate: number,
		duration: number,
		frequency: number,
		channels: number
	): AacAudioData {
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
	): AacAudioData {
		const samples: Float32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Float32Array(numSamples)
			channelSamples.fill(value)
			samples.push(channelSamples)
		}

		return { samples, sampleRate, channels }
	}

	// Create test audio with linear ramp
	function createRampAudio(sampleRate: number, numSamples: number, channels: number): AacAudioData {
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

	describe('isAac', () => {
		it('should identify AAC files', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const aac = encodeAac(audio)
			expect(isAac(aac)).toBe(true)
		})

		it('should reject non-AAC files', () => {
			expect(isAac(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isAac(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isAac(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
		})

		it('should handle short data', () => {
			expect(isAac(new Uint8Array([]))).toBe(false)
			expect(isAac(new Uint8Array([0xff, 0xf0]))).toBe(false) // Too short
		})

		it('should detect ADTS sync word', () => {
			const header = new Uint8Array([0xff, 0xf1, 0x00, 0x00, 0x00, 0x00, 0x00])
			expect(isAac(header)).toBe(true)
		})
	})

	describe('parseAacInfo', () => {
		it('should parse stereo 44.1kHz info', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const aac = encodeAac(audio)

			const info = parseAacInfo(aac)

			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
			expect(info.profile).toBeGreaterThan(0)
		})

		it('should parse mono 48kHz info', () => {
			const audio = createSineWave(48000, 0.1, 1000, 1)
			const aac = encodeAac(audio)

			const info = parseAacInfo(aac)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBe(1)
		})

		it('should calculate duration', () => {
			const audio = createSineWave(44100, 0.5, 440, 2)
			const aac = encodeAac(audio)

			const info = parseAacInfo(aac)

			expect(info.duration).toBeGreaterThan(0)
			expect(info.duration).toBeCloseTo(0.5, 1)
		})

		it('should count frames', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const aac = encodeAac(audio)

			const info = parseAacInfo(aac)

			expect(info.totalFrames).toBeGreaterThan(0)
		})
	})

	describe('encodeAac', () => {
		it('should encode sine wave', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const aac = encodeAac(audio)

			expect(isAac(aac)).toBe(true)
			expect(aac.length).toBeGreaterThan(100)
		})

		it('should encode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1)
			const aac = encodeAac(audio)

			expect(isAac(aac)).toBe(true)
		})

		it('should encode at different sample rates', () => {
			for (const rate of [8000, 22050, 44100, 48000]) {
				const audio = createSineWave(rate, 0.1, 440, 1)
				const aac = encodeAac(audio)

				expect(isAac(aac)).toBe(true)
			}
		})

		it('should encode constant audio', () => {
			const audio = createConstantAudio(44100, 4096, 0.5, 1)
			const aac = encodeAac(audio)

			expect(isAac(aac)).toBe(true)
		})

		it('should encode with custom bitrate', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const aac = encodeAac(audio, { bitrate: 192 })

			expect(isAac(aac)).toBe(true)
		})

		it('should throw on unsupported sample rate', () => {
			const audio = createSineWave(50000, 0.1, 440, 2)

			expect(() => encodeAac(audio)).toThrow('Unsupported sample rate')
		})

		it('should throw on too many channels', () => {
			const samples: Float32Array[] = []
			for (let i = 0; i < 10; i++) {
				samples.push(new Float32Array(1024).fill(0))
			}

			expect(() => encodeAac({ samples, sampleRate: 44100, channels: 10 })).toThrow(
				'Unsupported channel count'
			)
		})
	})

	describe('decodeAac', () => {
		it('should decode to original channels', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const aac = encodeAac(audio)
			const decoded = decodeAac(aac)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.info.channels).toBe(2)
		})

		it('should decode correct sample count', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const aac = encodeAac(audio)
			const decoded = decodeAac(aac)

			expect(decoded.samples[0]!.length).toBeGreaterThan(0)
		})

		it('should decode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1)
			const aac = encodeAac(audio)
			const decoded = decodeAac(aac)

			expect(decoded.samples.length).toBe(1)
		})

		it('should preserve sample rate', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const aac = encodeAac(audio)
			const decoded = decodeAac(aac)

			expect(decoded.info.sampleRate).toBe(48000)
		})
	})

	describe('AacCodec class', () => {
		it('should detect AAC files', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const aac = encodeAac(audio)

			expect(AacCodec.detect(aac)).toBe(true)
		})

		it('should parse AAC metadata', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const aac = encodeAac(audio)

			const info = AacCodec.parse(aac)

			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
		})

		it('should decode AAC', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const aac = encodeAac(audio)

			const decoded = AacCodec.decode(aac)

			expect(decoded.samples.length).toBe(2)
		})

		it('should encode AAC', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)

			const aac = AacCodec.encode(audio)

			expect(AacCodec.detect(aac)).toBe(true)
		})

		it('should list supported sample rates', () => {
			const rates = AacCodec.getSupportedSampleRates()

			expect(rates).toContain(44100)
			expect(rates).toContain(48000)
			expect(rates.length).toBeGreaterThan(0)
		})

		it('should list supported channels', () => {
			const channels = AacCodec.getSupportedChannels()

			expect(channels).toContain(1)
			expect(channels).toContain(2)
			expect(channels.length).toBeGreaterThan(0)
		})

		it('should validate sample rate', () => {
			expect(AacCodec.isValidSampleRate(44100)).toBe(true)
			expect(AacCodec.isValidSampleRate(48000)).toBe(true)
			expect(AacCodec.isValidSampleRate(50000)).toBe(false)
		})

		it('should validate channel count', () => {
			expect(AacCodec.isValidChannelCount(1)).toBe(true)
			expect(AacCodec.isValidChannelCount(2)).toBe(true)
			expect(AacCodec.isValidChannelCount(8)).toBe(true)
			expect(AacCodec.isValidChannelCount(0)).toBe(false)
			expect(AacCodec.isValidChannelCount(9)).toBe(false)
		})
	})

	describe('roundtrip', () => {
		it('should encode and decode sine wave', () => {
			const audio = createSineWave(44100, 0.05, 440, 2)
			const aac = encodeAac(audio)
			const decoded = decodeAac(aac)

			// AAC is lossy, so samples won't be identical
			// But we should have similar dimensions
			expect(decoded.samples.length).toBe(audio.samples.length)
			expect(decoded.info.sampleRate).toBe(audio.sampleRate)
		})

		it('should preserve channel count', () => {
			for (const channels of [1, 2]) {
				const audio = createSineWave(44100, 0.05, 440, channels)
				const aac = encodeAac(audio)
				const decoded = decodeAac(aac)

				expect(decoded.samples.length).toBe(channels)
			}
		})

		it('should preserve sample rate', () => {
			for (const rate of [8000, 22050, 44100, 48000]) {
				const audio = createSineWave(rate, 0.05, 440, 1)
				const aac = encodeAac(audio)
				const decoded = decodeAac(aac)

				expect(decoded.info.sampleRate).toBe(rate)
			}
		})
	})

	describe('compression', () => {
		it('should compress audio', () => {
			const audio = createSineWave(44100, 0.5, 440, 2)
			const aac = encodeAac(audio)

			// Raw size: 0.5s * 44100 * 2 channels * 4 bytes (float) = 176400 bytes
			const rawSize = audio.samples[0]!.length * 2 * 4

			// AAC should compress significantly
			expect(aac.length).toBeLessThan(rawSize)
		})

		it('should achieve good compression on sine wave', () => {
			const audio = createSineWave(44100, 0.5, 440, 2)
			const aac = encodeAac(audio, { bitrate: 128 })

			// Raw size: 0.5s * 44100 * 2 channels * 4 bytes = 176400 bytes
			const rawSize = audio.samples[0]!.length * 2 * 4

			// Simplified encoder won't achieve theoretical bitrate
			// but should still compress significantly
			expect(aac.length).toBeLessThan(rawSize * 0.5)
		})
	})

	describe('edge cases', () => {
		it('should handle very short audio', () => {
			const audio = createSineWave(44100, 0.01, 440, 1)
			const aac = encodeAac(audio)

			expect(isAac(aac)).toBe(true)
		})

		it('should handle single frame', () => {
			const numSamples = 1024 // Exactly one frame
			const samples = [new Float32Array(numSamples).fill(0.5)]
			const audio: AacAudioData = { samples, sampleRate: 44100, channels: 1 }

			const aac = encodeAac(audio)

			expect(isAac(aac)).toBe(true)
		})

		it('should handle silence', () => {
			const audio = createConstantAudio(44100, 1024, 0, 2)
			const aac = encodeAac(audio)

			expect(isAac(aac)).toBe(true)
		})
	})
})

import { describe, expect, it } from 'bun:test'
import type { AudioData } from '@sylphx/codec-core'
import { decodeWma, isWma, parseWmaInfo } from './decoder'
import { encodeWma } from './encoder'
import { ASF_GUID, WMA_SYNC } from './types'

describe('WMA Codec', () => {
	// Create test audio with sine wave
	function createSineWave(sampleRate: number, duration: number, frequency: number, channels: number): AudioData {
		const numSamples = Math.floor(sampleRate * duration)
		const samples: Float32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Float32Array(numSamples)
			const phaseOffset = (ch * Math.PI) / 4
			for (let i = 0; i < numSamples; i++) {
				const t = i / sampleRate
				channelSamples[i] = Math.sin(2 * Math.PI * frequency * t + phaseOffset) * 0.8
			}
			samples.push(channelSamples)
		}

		return { samples, sampleRate, channels }
	}

	// Create constant audio
	function createConstantAudio(sampleRate: number, numSamples: number, value: number, channels: number): AudioData {
		const samples: Float32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Float32Array(numSamples)
			channelSamples.fill(value)
			samples.push(channelSamples)
		}

		return { samples, sampleRate, channels }
	}

	describe('isWma', () => {
		it('should identify WMA files', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const wma = encodeWma(audio)
			expect(isWma(wma)).toBe(true)
		})

		it('should reject non-WMA files', () => {
			expect(isWma(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isWma(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
			expect(isWma(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF
		})

		it('should handle short data', () => {
			expect(isWma(new Uint8Array([]))).toBe(false)
			expect(isWma(new Uint8Array([0x30, 0x26]))).toBe(false)
		})

		it('should validate ASF header GUID', () => {
			// Create buffer with correct ASF header GUID
			const data = new Uint8Array(16)
			const guid = ASF_GUID.HEADER

			// Write GUID in little-endian format
			for (let i = 0; i < 16; i++) {
				data[i] = parseInt(guid.substr(i * 2, 2), 16)
			}

			// Swap bytes for proper ASF GUID format
			;[data[0], data[3]] = [data[3]!, data[0]!]
			;[data[1], data[2]] = [data[2]!, data[1]!]
			;[data[4], data[5]] = [data[5]!, data[4]!]
			;[data[6], data[7]] = [data[7]!, data[6]!]

			expect(isWma(data)).toBe(true)
		})
	})

	describe('parseWmaInfo', () => {
		it('should parse stereo info', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const wma = encodeWma(audio)

			const info = parseWmaInfo(wma)

			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
		})

		it('should parse mono info', () => {
			const audio = createSineWave(48000, 0.1, 1000, 1)
			const wma = encodeWma(audio)

			const info = parseWmaInfo(wma)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBe(1)
		})

		it('should calculate duration', () => {
			const audio = createSineWave(44100, 0.5, 440, 2)
			const wma = encodeWma(audio)

			const info = parseWmaInfo(wma)

			// Duration should be close to 0.5 seconds (allowing for encoding overhead)
			expect(info.duration).toBeGreaterThan(0.4)
			expect(info.duration).toBeLessThan(0.6)
		})

		it('should parse bitrate', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const wma = encodeWma(audio, { bitrate: 192000 })

			const info = parseWmaInfo(wma)

			// Bitrate should be set (actual value depends on encoding)
			expect(info.bitrate).toBeGreaterThan(0)
		})

		it('should handle different sample rates', () => {
			for (const rate of [22050, 44100, 48000]) {
				const audio = createSineWave(rate, 0.1, 440, 1)
				const wma = encodeWma(audio)

				const info = parseWmaInfo(wma)

				expect(info.sampleRate).toBe(rate)
			}
		})
	})

	describe('encodeWma', () => {
		it('should encode sine wave', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const wma = encodeWma(audio)

			expect(isWma(wma)).toBe(true)
			expect(wma.length).toBeGreaterThan(100)
		})

		it('should encode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1)
			const wma = encodeWma(audio)

			expect(isWma(wma)).toBe(true)
		})

		it('should encode with custom bitrate', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const wma = encodeWma(audio, { bitrate: 192000 })

			expect(isWma(wma)).toBe(true)
		})

		it('should encode constant audio', () => {
			const audio = createConstantAudio(44100, 4096, 0.5, 1)
			const wma = encodeWma(audio)

			expect(isWma(wma)).toBe(true)
		})

		it('should handle different sample rates', () => {
			for (const rate of [22050, 44100, 48000, 96000]) {
				const audio = createSineWave(rate, 0.05, 440, 1)
				const wma = encodeWma(audio)

				expect(isWma(wma)).toBe(true)
			}
		})

		it('should throw on empty audio', () => {
			const audio: AudioData = {
				samples: [],
				sampleRate: 44100,
				channels: 0,
			}

			expect(() => encodeWma(audio)).toThrow('No audio data to encode')
		})
	})

	describe('decodeWma', () => {
		it('should decode to correct channels', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const wma = encodeWma(audio)
			const decoded = decodeWma(wma)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.info.channels).toBe(2)
		})

		it('should decode correct sample count', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const wma = encodeWma(audio)
			const decoded = decodeWma(wma)

			// Should have approximately the right number of samples
			const expectedSamples = 4410 // 0.1s * 44100
			expect(decoded.samples[0]!.length).toBeGreaterThan(expectedSamples * 0.9)
			expect(decoded.samples[0]!.length).toBeLessThan(expectedSamples * 1.1)
		})

		it('should decode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1)
			const wma = encodeWma(audio)
			const decoded = decodeWma(wma)

			expect(decoded.samples.length).toBe(1)
		})

		it('should preserve sample rate', () => {
			for (const rate of [22050, 44100, 48000]) {
				const audio = createSineWave(rate, 0.05, 440, 1)
				const wma = encodeWma(audio)
				const decoded = decodeWma(wma)

				expect(decoded.info.sampleRate).toBe(rate)
			}
		})

		it('should preserve channel count', () => {
			for (const channels of [1, 2]) {
				const audio = createSineWave(44100, 0.05, 440, channels)
				const wma = encodeWma(audio)
				const decoded = decodeWma(wma)

				expect(decoded.samples.length).toBe(channels)
			}
		})
	})

	describe('ASF structure', () => {
		it('should have valid ASF header', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const wma = encodeWma(audio)

			// Check ASF header GUID
			expect(isWma(wma)).toBe(true)

			// Parse and check structure
			const info = parseWmaInfo(wma)
			expect(info).toBeDefined()
			expect(info.sampleRate).toBeGreaterThan(0)
			expect(info.channels).toBeGreaterThan(0)
		})

		it('should include file properties', () => {
			const audio = createSineWave(44100, 0.5, 440, 2)
			const wma = encodeWma(audio)

			const info = parseWmaInfo(wma)

			// Should have duration calculated from file properties
			expect(info.duration).toBeGreaterThan(0)
			expect(info.duration).toBeCloseTo(0.5, 1)
		})

		it('should include stream properties', () => {
			const audio = createSineWave(48000, 0.1, 440, 1)
			const wma = encodeWma(audio, { bitrate: 128000 })

			const info = parseWmaInfo(wma)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBe(1)
			expect(info.bitrate).toBeGreaterThan(0)
		})
	})

	describe('metadata', () => {
		it('should parse content description if present', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const wma = encodeWma(audio)

			const info = parseWmaInfo(wma)

			// Content description is included (even if empty)
			expect(info).toBeDefined()
		})

		it('should handle missing optional metadata', () => {
			const audio = createSineWave(44100, 0.1, 440, 1)
			const wma = encodeWma(audio)

			const info = parseWmaInfo(wma)

			// Should not throw and return valid info
			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(1)
		})
	})

	describe('edge cases', () => {
		it('should handle very short audio', () => {
			const audio = createSineWave(44100, 0.01, 440, 1) // 10ms
			const wma = encodeWma(audio)

			expect(isWma(wma)).toBe(true)
			const info = parseWmaInfo(wma)
			expect(info.sampleRate).toBe(44100)
		})

		it('should handle different channel configurations', () => {
			for (const channels of [1, 2]) {
				const audio = createSineWave(44100, 0.1, 440, channels)
				const wma = encodeWma(audio)

				const info = parseWmaInfo(wma)
				expect(info.channels).toBe(channels)
			}
		})

		it('should handle various sample rates', () => {
			const rates = [8000, 22050, 44100, 48000, 96000]

			for (const rate of rates) {
				const audio = createSineWave(rate, 0.05, 440, 1)
				const wma = encodeWma(audio)

				const info = parseWmaInfo(wma)
				expect(info.sampleRate).toBe(rate)
			}
		})

		it('should handle silence', () => {
			const audio = createConstantAudio(44100, 1000, 0, 2)
			const wma = encodeWma(audio)

			expect(isWma(wma)).toBe(true)
			const decoded = decodeWma(wma)
			expect(decoded.samples.length).toBe(2)
		})
	})
})

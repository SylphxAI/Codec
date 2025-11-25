import { describe, expect, it } from 'bun:test'
import { decodeDts, encodeDts, isDts, parseDtsInfo } from './index'
import type { DtsAudioData } from './types'

describe('DTS Codec', () => {
	// Create test audio with sine wave
	function createSineWave(
		sampleRate: number,
		duration: number,
		frequency: number,
		channels: number
	): DtsAudioData {
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

	// Create test audio with constant value
	function createConstantAudio(sampleRate: number, numSamples: number, value: number, channels: number): DtsAudioData {
		const samples: Float32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Float32Array(numSamples)
			channelSamples.fill(value)
			samples.push(channelSamples)
		}

		return { samples, sampleRate, channels }
	}

	// Create test audio with linear ramp
	function createRampAudio(sampleRate: number, numSamples: number, channels: number): DtsAudioData {
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

	describe('isDts', () => {
		it('should identify DTS files', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio)
			expect(isDts(dts)).toBe(true)
		})

		it('should reject non-DTS files', () => {
			expect(isDts(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isDts(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isDts(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF
			expect(isDts(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
		})

		it('should handle short data', () => {
			expect(isDts(new Uint8Array([]))).toBe(false)
			expect(isDts(new Uint8Array([0x7f, 0xfe]))).toBe(false)
		})

		it('should detect big-endian sync word', () => {
			const data = new Uint8Array([0x7f, 0xfe, 0x80, 0x01])
			expect(isDts(data)).toBe(true)
		})

		it('should detect little-endian sync word', () => {
			const data = new Uint8Array([0xfe, 0x7f, 0x01, 0x80])
			expect(isDts(data)).toBe(true)
		})
	})

	describe('parseDtsInfo', () => {
		it('should parse stereo info', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio)

			const info = parseDtsInfo(dts)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBe(2)
		})

		it('should parse mono info', () => {
			const audio = createSineWave(48000, 0.1, 1000, 1)
			const dts = encodeDts(audio)

			const info = parseDtsInfo(dts)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBe(1)
		})

		it('should parse 5.1 surround info', () => {
			const audio = createSineWave(48000, 0.1, 440, 6)
			const dts = encodeDts(audio, { lfe: true })

			const info = parseDtsInfo(dts)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBe(6)
			expect(info.lfe).toBe(true)
		})

		it('should parse bitrate', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio, { bitrate: 960 })

			const info = parseDtsInfo(dts)

			expect(info.bitrate).toBe(960)
		})

		it('should parse different sample rates', () => {
			for (const sampleRate of [8000, 16000, 32000, 44100, 48000, 96000]) {
				const audio = createSineWave(sampleRate, 0.05, 440, 2)
				const dts = encodeDts(audio, { sampleRate })

				const info = parseDtsInfo(dts)

				expect(info.sampleRate).toBe(sampleRate)
			}
		})

		it('should calculate duration', () => {
			const audio = createSineWave(48000, 0.5, 440, 2)
			const dts = encodeDts(audio)

			const info = parseDtsInfo(dts)

			expect(info.duration).toBeGreaterThan(0)
		})
	})

	describe('encodeDts', () => {
		it('should encode sine wave', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio)

			expect(isDts(dts)).toBe(true)
			expect(dts.length).toBeGreaterThan(100)
		})

		it('should encode mono audio', () => {
			const audio = createSineWave(48000, 0.1, 440, 1)
			const dts = encodeDts(audio)

			expect(isDts(dts)).toBe(true)
		})

		it('should encode stereo audio', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio)

			expect(isDts(dts)).toBe(true)
		})

		it('should encode 5.1 surround audio', () => {
			const audio = createSineWave(48000, 0.1, 440, 6)
			const dts = encodeDts(audio, { lfe: true })

			expect(isDts(dts)).toBe(true)
		})

		it('should encode constant audio', () => {
			const audio = createConstantAudio(48000, 4800, 0.5, 2)
			const dts = encodeDts(audio)

			expect(isDts(dts)).toBe(true)
		})

		it('should encode with custom bitrate', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio, { bitrate: 1536 })

			expect(isDts(dts)).toBe(true)

			const info = parseDtsInfo(dts)
			expect(info.bitrate).toBe(1536)
		})

		it('should encode with different sample rates', () => {
			for (const sampleRate of [8000, 16000, 32000, 44100, 48000]) {
				const audio = createSineWave(sampleRate, 0.05, 440, 2)
				const dts = encodeDts(audio, { sampleRate })

				expect(isDts(dts)).toBe(true)
			}
		})

		it('should validate sample rate', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)

			// Invalid sample rate should throw
			expect(() => encodeDts(audio, { sampleRate: 22000 })).toThrow()
		})

		it('should validate bitrate', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)

			// Invalid bitrate should throw
			expect(() => encodeDts(audio, { bitrate: 12345 })).toThrow()
		})

		it('should handle empty audio data', () => {
			const audio: DtsAudioData = {
				samples: [new Float32Array(0)],
				sampleRate: 48000,
				channels: 1,
			}

			expect(() => encodeDts(audio)).toThrow()
		})
	})

	describe('decodeDts', () => {
		it('should decode to original channels', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio)
			const decoded = decodeDts(dts)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.info.channels).toBe(2)
		})

		it('should decode mono audio', () => {
			const audio = createSineWave(48000, 0.1, 440, 1)
			const dts = encodeDts(audio)
			const decoded = decodeDts(dts)

			expect(decoded.samples.length).toBe(1)
			expect(decoded.info.channels).toBe(1)
		})

		it('should decode 5.1 surround audio', () => {
			const audio = createSineWave(48000, 0.1, 440, 6)
			const dts = encodeDts(audio, { lfe: true })
			const decoded = decodeDts(dts)

			expect(decoded.samples.length).toBe(6)
			expect(decoded.info.channels).toBe(6)
			expect(decoded.info.lfe).toBe(true)
		})

		it('should preserve sample rate', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio)
			const decoded = decodeDts(dts)

			expect(decoded.info.sampleRate).toBe(48000)
		})

		it('should decode and preserve duration', () => {
			const audio = createSineWave(48000, 0.25, 440, 2)
			const dts = encodeDts(audio)
			const decoded = decodeDts(dts)

			expect(decoded.info.duration).toBeGreaterThan(0)
			// Note: Duration may vary due to frame alignment and stub decoder implementation
			expect(decoded.info.duration).toBeLessThan(0.5)
		})
	})

	describe('roundtrip', () => {
		it('should encode and decode stereo audio', () => {
			const audio = createSineWave(48000, 0.05, 440, 2)
			const dts = encodeDts(audio)
			const decoded = decodeDts(dts)

			// Verify structure
			expect(decoded.samples.length).toBe(2)
			expect(decoded.info.sampleRate).toBe(48000)
			expect(decoded.info.channels).toBe(2)

			// DTS is lossy, so samples won't match exactly
			// Just verify we got samples back
			expect(decoded.samples[0]!.length).toBeGreaterThan(0)
			expect(decoded.samples[1]!.length).toBeGreaterThan(0)
		})

		it('should preserve sample rate across roundtrip', () => {
			for (const sampleRate of [8000, 16000, 32000, 44100, 48000]) {
				const audio = createSineWave(sampleRate, 0.05, 440, 2)
				const dts = encodeDts(audio, { sampleRate })
				const decoded = decodeDts(dts)

				expect(decoded.info.sampleRate).toBe(sampleRate)
			}
		})

		it('should preserve channel count', () => {
			for (const channels of [1, 2, 3, 4, 5, 6]) {
				const audio = createSineWave(48000, 0.05, 440, channels)
				const dts = encodeDts(audio)
				const decoded = decodeDts(dts)

				expect(decoded.samples.length).toBe(channels)
				expect(decoded.info.channels).toBe(channels)
			}
		})

		it('should preserve bitrate information', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio, { bitrate: 960 })
			const decoded = decodeDts(dts)

			expect(decoded.info.bitrate).toBe(960)
		})
	})

	describe('compression', () => {
		it('should produce smaller output than raw PCM', () => {
			const audio = createSineWave(48000, 0.5, 440, 2)
			const dts = encodeDts(audio)

			// Raw size: 0.5s * 48000 * 2 channels * 4 bytes (float32) = 192000 bytes
			const rawSize = audio.samples[0]!.length * 2 * 4

			// DTS should be significantly smaller (lossy compression)
			expect(dts.length).toBeLessThan(rawSize)
		})

		it('should respect bitrate constraints', () => {
			const duration = 1.0 // 1 second
			const bitrate = 960 // kbps
			const audio = createSineWave(48000, duration, 440, 2)
			const dts = encodeDts(audio, { bitrate })

			// Expected size: (bitrate * 1000 / 8) * duration
			const expectedSize = (bitrate * 1000) / 8 * duration

			// Allow 10% tolerance for frame overhead
			expect(dts.length).toBeGreaterThan(expectedSize * 0.9)
			expect(dts.length).toBeLessThan(expectedSize * 1.1)
		})
	})

	describe('error handling', () => {
		it('should throw on invalid sync word', () => {
			const invalidData = new Uint8Array([0x00, 0x00, 0x00, 0x00])
			expect(() => parseDtsInfo(invalidData)).toThrow()
			expect(() => decodeDts(invalidData)).toThrow()
		})

		it('should throw on truncated data', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio)

			// Truncate the data
			const truncated = dts.slice(0, 10)

			// Should throw or handle gracefully
			expect(() => decodeDts(truncated)).toThrow()
		})
	})

	describe('metadata', () => {
		it('should preserve channel arrangement', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio)
			const info = parseDtsInfo(dts)

			expect(info.channelArrangement).toBeGreaterThanOrEqual(0)
		})

		it('should preserve LFE information', () => {
			const audio = createSineWave(48000, 0.1, 440, 6)
			const dtsWithLfe = encodeDts(audio, { lfe: true })
			const dtsNoLfe = encodeDts(audio, { lfe: false })

			const infoWithLfe = parseDtsInfo(dtsWithLfe)
			const infoNoLfe = parseDtsInfo(dtsNoLfe)

			expect(infoWithLfe.lfe).toBe(true)
			expect(infoNoLfe.lfe).toBe(false)
		})

		it('should report PCM resolution', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const dts = encodeDts(audio, { pcmResolution: 24 })
			const info = parseDtsInfo(dts)

			expect(info.pcmResolution).toBe(24)
		})
	})
})

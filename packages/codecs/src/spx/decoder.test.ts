import { describe, expect, it } from 'bun:test'
import type { AudioData } from '@sylphx/codec-core'
import { decodeSpeex, encodeSpeex, isSpeex, parseSpeexInfo } from './index'

describe('Speex Codec', () => {
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

	// Create test audio with constant value
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

	describe('isSpeex', () => {
		it('should identify Speex files in Ogg container', () => {
			const audio = createSineWave(16000, 0.1, 440, 1)
			const speex = encodeSpeex(audio)
			expect(isSpeex(speex)).toBe(true)
		})

		it('should reject non-Speex files', () => {
			expect(isSpeex(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isSpeex(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isSpeex(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe(false) // Just Ogg header
		})

		it('should reject files with too little data', () => {
			expect(isSpeex(new Uint8Array(10))).toBe(false)
		})
	})

	describe('parseSpeexInfo', () => {
		it('should parse basic Speex file info (narrowband)', () => {
			const audio = createSineWave(8000, 0.5, 440, 1)
			const speex = encodeSpeex(audio, { sampleRate: 8000 })
			const info = parseSpeexInfo(speex)

			expect(info.channels).toBe(1)
			expect(info.sampleRate).toBe(8000)
			expect(info.mode).toBe(0) // Narrowband
			expect(info.frameSize).toBe(160)
			expect(info.vbr).toBe(true)
		})

		it('should parse basic Speex file info (wideband)', () => {
			const audio = createSineWave(16000, 0.5, 440, 1)
			const speex = encodeSpeex(audio, { sampleRate: 16000 })
			const info = parseSpeexInfo(speex)

			expect(info.channels).toBe(1)
			expect(info.sampleRate).toBe(16000)
			expect(info.mode).toBe(1) // Wideband
			expect(info.frameSize).toBe(320)
		})

		it('should parse basic Speex file info (ultra-wideband)', () => {
			const audio = createSineWave(32000, 0.5, 440, 1)
			const speex = encodeSpeex(audio, { sampleRate: 32000 })
			const info = parseSpeexInfo(speex)

			expect(info.channels).toBe(1)
			expect(info.sampleRate).toBe(32000)
			expect(info.mode).toBe(2) // Ultra-wideband
			expect(info.frameSize).toBe(640)
		})

		it('should parse Speex with tags', () => {
			const audio = createSineWave(16000, 0.2, 440, 1)
			const speex = encodeSpeex(audio, {
				vendor: 'Test Encoder',
				tags: {
					TITLE: 'Test Audio',
					ARTIST: 'Test Artist',
				},
			})
			const info = parseSpeexInfo(speex)

			expect(info.vendor).toBe('Test Encoder')
			expect(info.tags?.TITLE).toBe('Test Audio')
			expect(info.tags?.ARTIST).toBe('Test Artist')
		})

		it('should parse duration from granule position', () => {
			const audio = createSineWave(16000, 1.0, 440, 1)
			const speex = encodeSpeex(audio)
			const info = parseSpeexInfo(speex)

			// Duration should be approximately 1 second (within 50ms tolerance)
			expect(info.duration).toBeGreaterThan(0.95)
			expect(info.duration).toBeLessThan(1.05)
		})
	})

	describe('encodeSpeex', () => {
		it('should encode mono audio at 16kHz', () => {
			const audio = createSineWave(16000, 0.1, 440, 1)
			const speex = encodeSpeex(audio)

			expect(isSpeex(speex)).toBe(true)
			expect(speex.length).toBeGreaterThan(100)
		})

		it('should encode mono audio at 8kHz (narrowband)', () => {
			const audio = createSineWave(8000, 0.1, 440, 1)
			const speex = encodeSpeex(audio, { sampleRate: 8000 })

			expect(isSpeex(speex)).toBe(true)
			const info = parseSpeexInfo(speex)
			expect(info.mode).toBe(0)
		})

		it('should encode mono audio at 32kHz (ultra-wideband)', () => {
			const audio = createSineWave(32000, 0.1, 440, 1)
			const speex = encodeSpeex(audio, { sampleRate: 32000 })

			expect(isSpeex(speex)).toBe(true)
			const info = parseSpeexInfo(speex)
			expect(info.mode).toBe(2)
		})

		it('should convert stereo to mono', () => {
			const audio = createSineWave(16000, 0.1, 440, 2)
			const speex = encodeSpeex(audio)

			expect(isSpeex(speex)).toBe(true)
			const info = parseSpeexInfo(speex)
			expect(info.channels).toBe(1) // Converted to mono
		})

		it('should resample from 44.1kHz to 16kHz', () => {
			const audio = createSineWave(44100, 0.1, 440, 1)
			const speex = encodeSpeex(audio, { sampleRate: 16000 })

			expect(isSpeex(speex)).toBe(true)

			const info = parseSpeexInfo(speex)
			expect(info.sampleRate).toBe(16000)
		})

		it('should encode with custom quality', () => {
			const audio = createSineWave(16000, 0.2, 440, 1)
			const highQuality = encodeSpeex(audio, { quality: 10 })
			const lowQuality = encodeSpeex(audio, { quality: 0 })

			// Higher quality should generally produce larger files
			expect(highQuality.length).toBeGreaterThan(0)
			expect(lowQuality.length).toBeGreaterThan(0)
		})

		it('should encode with VBR disabled', () => {
			const audio = createSineWave(16000, 0.1, 440, 1)
			const speex = encodeSpeex(audio, { vbr: false })

			expect(isSpeex(speex)).toBe(true)
			const info = parseSpeexInfo(speex)
			expect(info.vbr).toBe(false)
		})

		it('should encode with tags', () => {
			const audio = createSineWave(16000, 0.1, 440, 1)
			const speex = encodeSpeex(audio, {
				vendor: 'Custom Encoder',
				tags: {
					TITLE: 'Test Song',
					ARTIST: 'Test Artist',
					ALBUM: 'Test Album',
				},
			})

			const info = parseSpeexInfo(speex)
			expect(info.vendor).toBe('Custom Encoder')
			expect(info.tags?.TITLE).toBe('Test Song')
			expect(info.tags?.ARTIST).toBe('Test Artist')
			expect(info.tags?.ALBUM).toBe('Test Album')
		})

		it('should encode constant audio', () => {
			const audio = createConstantAudio(16000, 3200, 0.5, 1)
			const speex = encodeSpeex(audio)

			expect(isSpeex(speex)).toBe(true)
		})

		it('should handle short audio clips', () => {
			const audio = createSineWave(16000, 0.02, 440, 1) // 20ms (one frame)
			const speex = encodeSpeex(audio)

			expect(isSpeex(speex)).toBe(true)
		})

		it('should reject invalid sample rates', () => {
			const audio = createSineWave(22050, 0.1, 440, 1)
			expect(() => encodeSpeex(audio, { sampleRate: 22050 as any })).toThrow()
		})
	})

	describe('decodeSpeex', () => {
		it('should decode mono Speex file', () => {
			const original = createSineWave(16000, 0.2, 440, 1)
			const speex = encodeSpeex(original)
			const result = decodeSpeex(speex)

			expect(result.audio.channels).toBe(1)
			expect(result.audio.sampleRate).toBe(16000)
			expect(result.audio.samples[0]!.length).toBeGreaterThan(0)
		})

		it('should decode narrowband Speex', () => {
			const original = createSineWave(8000, 0.2, 440, 1)
			const speex = encodeSpeex(original, { sampleRate: 8000 })
			const result = decodeSpeex(speex)

			expect(result.audio.channels).toBe(1)
			expect(result.audio.sampleRate).toBe(8000)
			expect(result.info.mode).toBe(0)
		})

		it('should decode ultra-wideband Speex', () => {
			const original = createSineWave(32000, 0.2, 440, 1)
			const speex = encodeSpeex(original, { sampleRate: 32000 })
			const result = decodeSpeex(speex)

			expect(result.audio.channels).toBe(1)
			expect(result.audio.sampleRate).toBe(32000)
			expect(result.info.mode).toBe(2)
		})

		it('should preserve tags in decode result', () => {
			const original = createSineWave(16000, 0.1, 440, 1)
			const speex = encodeSpeex(original, {
				tags: {
					TITLE: 'Decode Test',
					ARTIST: 'Test Artist',
				},
			})
			const result = decodeSpeex(speex)

			expect(result.info.tags?.TITLE).toBe('Decode Test')
			expect(result.info.tags?.ARTIST).toBe('Test Artist')
		})
	})

	describe('encode-decode roundtrip', () => {
		it('should complete encode-decode cycle', () => {
			const original = createSineWave(16000, 0.5, 440, 1)
			const speex = encodeSpeex(original)
			const decoded = decodeSpeex(speex)

			// Verify structure
			expect(decoded.audio.channels).toBe(1)
			expect(decoded.audio.sampleRate).toBe(16000)
			expect(decoded.audio.samples.length).toBe(1)
			expect(decoded.audio.samples[0]!.length).toBeGreaterThan(0)
		})

		it('should handle different sample rates', () => {
			const sampleRates = [8000, 16000, 32000] as const

			for (const rate of sampleRates) {
				const original = createSineWave(rate, 0.1, 440, 1)
				const speex = encodeSpeex(original, { sampleRate: rate })
				const decoded = decodeSpeex(speex)

				expect(decoded.audio.sampleRate).toBe(rate)
			}
		})

		it('should preserve mono after stereo-to-mono conversion', () => {
			const original = createSineWave(16000, 0.1, 440, 2)
			const speex = encodeSpeex(original)
			const decoded = decodeSpeex(speex)

			expect(decoded.audio.channels).toBe(1)
		})
	})

	describe('edge cases', () => {
		it('should handle very short audio', () => {
			const audio = createSineWave(16000, 0.05, 440, 1)
			const speex = encodeSpeex(audio)

			expect(isSpeex(speex)).toBe(true)

			const decoded = decodeSpeex(speex)
			expect(decoded.audio.samples[0]!.length).toBeGreaterThan(0)
		})

		it('should handle silence', () => {
			const audio = createConstantAudio(16000, 3200, 0, 1)
			const speex = encodeSpeex(audio)

			expect(isSpeex(speex)).toBe(true)

			const decoded = decodeSpeex(speex)
			expect(decoded.audio.channels).toBe(1)
		})

		it('should handle full-scale audio', () => {
			const audio = createConstantAudio(16000, 3200, 1.0, 1)
			const speex = encodeSpeex(audio)

			expect(isSpeex(speex)).toBe(true)

			const decoded = decodeSpeex(speex)
			expect(decoded.audio.channels).toBe(1)
		})

		it('should reject invalid Speex data', () => {
			expect(() => decodeSpeex(new Uint8Array([0, 0, 0, 0]))).toThrow()
		})

		it('should handle truncated Speex data gracefully', () => {
			const audio = createSineWave(16000, 0.1, 440, 1)
			const speex = encodeSpeex(audio)
			const truncated = speex.slice(0, speex.length / 2)

			// Should handle truncated data without throwing
			const result = decodeSpeex(truncated)
			expect(result.audio.channels).toBe(1)
		})
	})

	describe('SpeexCodec class', () => {
		it('should provide static detection method', () => {
			const audio = createSineWave(16000, 0.1, 440, 1)
			const speex = encodeSpeex(audio)

			expect(isSpeex(speex)).toBe(true)
		})

		it('should provide sample rate validation', () => {
			const { SpeexCodec } = require('./codec')

			expect(SpeexCodec.isValidSampleRate(8000)).toBe(true)
			expect(SpeexCodec.isValidSampleRate(16000)).toBe(true)
			expect(SpeexCodec.isValidSampleRate(32000)).toBe(true)
			expect(SpeexCodec.isValidSampleRate(44100)).toBe(false)
		})

		it('should provide channel validation', () => {
			const { SpeexCodec } = require('./codec')

			expect(SpeexCodec.isValidChannelCount(1)).toBe(true)
			expect(SpeexCodec.isValidChannelCount(2)).toBe(true)
			expect(SpeexCodec.isValidChannelCount(3)).toBe(false)
		})

		it('should provide quality range', () => {
			const { SpeexCodec } = require('./codec')
			const range = SpeexCodec.getQualityRange()

			expect(range.min).toBe(0)
			expect(range.max).toBe(10)
			expect(range.default).toBe(8)
		})

		it('should provide recommended bitrates', () => {
			const { SpeexCodec } = require('./codec')
			const bitrates = SpeexCodec.getRecommendedBitrates()

			expect(bitrates.voip.sampleRate).toBe(8000)
			expect(bitrates.wideband.sampleRate).toBe(32000)
		})

		it('should estimate file size', () => {
			const { SpeexCodec } = require('./codec')
			const size = SpeexCodec.estimateFileSize(10, 16000, 8, true)

			expect(size).toBeGreaterThan(0)
			// 10 seconds at ~24kbps should be roughly 30KB
			expect(size).toBeGreaterThan(25000)
			expect(size).toBeLessThan(35000)
		})

		it('should get mode names', () => {
			const { SpeexCodec } = require('./codec')
			const modes = SpeexCodec.getModeNames()

			expect(modes[0]).toContain('Narrowband')
			expect(modes[1]).toContain('Wideband')
			expect(modes[2]).toContain('Ultra-wideband')
		})
	})
})

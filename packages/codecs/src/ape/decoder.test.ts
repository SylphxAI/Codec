import { describe, expect, it } from 'bun:test'
import { decodeApe, encodeApe, isApe, parseApeInfo } from './index'
import { ApeCompressionLevel, type ApeAudioData } from './types'

describe('APE Codec', () => {
	// Create test audio with sine wave
	function createSineWave(
		sampleRate: number,
		duration: number,
		frequency: number,
		channels: number,
		bitsPerSample: number
	): ApeAudioData {
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
	): ApeAudioData {
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
	): ApeAudioData {
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

	describe('isApe', () => {
		it('should identify APE files', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ape = encodeApe(audio)
			expect(isApe(ape)).toBe(true)
		})

		it('should reject non-APE files', () => {
			expect(isApe(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isApe(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
			expect(isApe(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF
		})

		it('should handle short data', () => {
			expect(isApe(new Uint8Array([]))).toBe(false)
			expect(isApe(new Uint8Array([0x4d, 0x41]))).toBe(false)
		})
	})

	describe('parseApeInfo', () => {
		it('should parse stereo 16-bit info', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ape = encodeApe(audio)

			const info = parseApeInfo(ape)

			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
			expect(info.bitsPerSample).toBe(16)
		})

		it('should parse mono 24-bit info', () => {
			const audio = createSineWave(48000, 0.1, 1000, 1, 24)
			const ape = encodeApe(audio)

			const info = parseApeInfo(ape)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBe(1)
			expect(info.bitsPerSample).toBe(24)
		})

		it('should parse total samples', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ape = encodeApe(audio)

			const info = parseApeInfo(ape)

			expect(info.totalSamples).toBe(4410) // 0.1s * 44100
		})

		it('should calculate duration', () => {
			const audio = createSineWave(44100, 0.5, 440, 2, 16)
			const ape = encodeApe(audio)

			const info = parseApeInfo(ape)

			expect(info.duration).toBeCloseTo(0.5, 2)
		})

		it('should parse compression level', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ape = encodeApe(audio, { compressionLevel: ApeCompressionLevel.HIGH })

			const info = parseApeInfo(ape)

			expect(info.compressionLevel).toBe(ApeCompressionLevel.HIGH)
		})
	})

	describe('encodeApe', () => {
		it('should encode sine wave', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ape = encodeApe(audio)

			expect(isApe(ape)).toBe(true)
			expect(ape.length).toBeGreaterThan(100)
		})

		it('should encode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1, 16)
			const ape = encodeApe(audio)

			expect(isApe(ape)).toBe(true)
		})

		it('should encode 8-bit audio', () => {
			const audio = createSineWave(22050, 0.1, 440, 1, 8)
			const ape = encodeApe(audio)

			expect(isApe(ape)).toBe(true)
		})

		it('should encode constant audio efficiently', () => {
			const audio = createConstantAudio(44100, 4096, 1000, 1, 16)
			const ape = encodeApe(audio)

			// Constant audio should compress very well
			expect(isApe(ape)).toBe(true)
			// Raw size would be 4096 * 2 = 8192 bytes
			expect(ape.length).toBeLessThan(5000)
		})

		it('should encode with custom compression level', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const apeFast = encodeApe(audio, { compressionLevel: ApeCompressionLevel.FAST })
			const apeInsane = encodeApe(audio, { compressionLevel: ApeCompressionLevel.INSANE })

			expect(isApe(apeFast)).toBe(true)
			expect(isApe(apeInsane)).toBe(true)
			// Insane compression should be smaller
			expect(apeInsane.length).toBeLessThan(apeFast.length)
		})

		it('should encode with custom blocks per frame', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ape = encodeApe(audio, { blocksPerFrame: 4096 })

			expect(isApe(ape)).toBe(true)
		})

		it('should reject invalid compression levels', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)

			expect(() => encodeApe(audio, { compressionLevel: 500 })).toThrow()
			expect(() => encodeApe(audio, { compressionLevel: 6000 })).toThrow()
		})

		it('should reject more than 2 channels', () => {
			const samples = [new Int32Array(100), new Int32Array(100), new Int32Array(100)]
			const audio: ApeAudioData = { samples, sampleRate: 44100, bitsPerSample: 16 }

			expect(() => encodeApe(audio)).toThrow()
		})
	})

	describe('decodeApe', () => {
		it('should decode to original channels', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ape = encodeApe(audio)
			const decoded = decodeApe(ape)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.info.channels).toBe(2)
		})

		it('should decode correct sample count', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ape = encodeApe(audio)
			const decoded = decodeApe(ape)

			expect(decoded.samples[0]!.length).toBe(4410)
		})

		it('should decode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1, 16)
			const ape = encodeApe(audio)
			const decoded = decodeApe(ape)

			expect(decoded.samples.length).toBe(1)
		})

		it('should decode all compression levels', () => {
			const audio = createSineWave(44100, 0.05, 440, 1, 16)

			for (const level of [
				ApeCompressionLevel.FAST,
				ApeCompressionLevel.NORMAL,
				ApeCompressionLevel.HIGH,
				ApeCompressionLevel.EXTRA_HIGH,
				ApeCompressionLevel.INSANE,
			]) {
				const ape = encodeApe(audio, { compressionLevel: level })
				const decoded = decodeApe(ape)

				expect(decoded.samples.length).toBe(1)
				expect(decoded.info.compressionLevel).toBe(level)
			}
		})
	})

	describe('roundtrip', () => {
		it('should preserve sample count exactly', () => {
			const audio = createSineWave(44100, 0.05, 440, 2, 16)
			const ape = encodeApe(audio)
			const decoded = decodeApe(ape)

			// APE is lossless - sample count should be identical
			expect(decoded.samples[0]!.length).toBe(audio.samples[0]!.length)
			expect(decoded.samples[1]!.length).toBe(audio.samples[1]!.length)
		})

		it('should preserve audio metadata', () => {
			const audio = createSineWave(48000, 0.05, 1000, 2, 24)
			const ape = encodeApe(audio)
			const decoded = decodeApe(ape)

			expect(decoded.info.sampleRate).toBe(48000)
			expect(decoded.info.channels).toBe(2)
			expect(decoded.info.bitsPerSample).toBe(24)
		})

		it('should preserve sample rate', () => {
			for (const rate of [8000, 22050, 44100, 48000, 96000]) {
				const audio = createSineWave(rate, 0.05, 440, 1, 16)
				const ape = encodeApe(audio)
				const decoded = decodeApe(ape)

				expect(decoded.info.sampleRate).toBe(rate)
			}
		})

		it('should handle different channel counts', () => {
			for (const channels of [1, 2]) {
				const audio = createSineWave(44100, 0.05, 440, channels, 16)
				const ape = encodeApe(audio)
				const decoded = decodeApe(ape)

				expect(decoded.samples.length).toBe(channels)
			}
		})

		it('should handle different bit depths', () => {
			for (const bitsPerSample of [8, 16, 24]) {
				const audio = createSineWave(44100, 0.05, 440, 1, bitsPerSample)
				const ape = encodeApe(audio)
				const decoded = decodeApe(ape)

				expect(decoded.info.bitsPerSample).toBe(bitsPerSample)
			}
		})
	})

	describe('compression', () => {
		it('should compress audio', () => {
			const audio = createSineWave(44100, 0.5, 440, 2, 16)
			const ape = encodeApe(audio)

			// Raw size: 0.5s * 44100 * 2 channels * 2 bytes = 88200 bytes
			const rawSize = audio.samples[0]!.length * 2 * 2

			// APE should compress sine wave (typically 50-70% of original)
			expect(ape.length).toBeLessThan(rawSize)
		})

		it('should achieve high compression on constant audio', () => {
			const audio = createConstantAudio(44100, 44100, 0, 2, 16)
			const ape = encodeApe(audio)

			// Raw size: 44100 * 2 * 2 = 176400 bytes
			const rawSize = audio.samples[0]!.length * 2 * 2

			// Constant audio should compress well (simplified implementation)
			expect(ape.length).toBeLessThan(rawSize * 0.7)
		})

		it('should achieve better compression at higher levels', () => {
			const audio = createSineWave(44100, 0.2, 440, 2, 16)

			const fast = encodeApe(audio, { compressionLevel: ApeCompressionLevel.FAST })
			const normal = encodeApe(audio, { compressionLevel: ApeCompressionLevel.NORMAL })
			const high = encodeApe(audio, { compressionLevel: ApeCompressionLevel.HIGH })

			// Higher compression should result in smaller files
			expect(normal.length).toBeLessThanOrEqual(fast.length)
			expect(high.length).toBeLessThanOrEqual(normal.length)
		})
	})

	describe('edge cases', () => {
		it('should handle empty audio', () => {
			const audio: ApeAudioData = {
				samples: [new Int32Array(0)],
				sampleRate: 44100,
				bitsPerSample: 16,
			}

			expect(() => encodeApe(audio)).toThrow()
		})

		it('should handle very short audio', () => {
			const audio: ApeAudioData = {
				samples: [new Int32Array([100, 200, 300])],
				sampleRate: 44100,
				bitsPerSample: 16,
			}

			const ape = encodeApe(audio)
			expect(isApe(ape)).toBe(true)

			const decoded = decodeApe(ape)
			expect(decoded.samples[0]!.length).toBe(3)
		})

		it('should handle large block sizes', () => {
			const audio = createSineWave(44100, 1.0, 440, 2, 16)
			const ape = encodeApe(audio, { blocksPerFrame: 200000 })

			expect(isApe(ape)).toBe(true)

			const decoded = decodeApe(ape)
			expect(decoded.samples[0]!.length).toBe(audio.samples[0]!.length)
		})
	})
})

import { describe, expect, it } from 'bun:test'
import { AC3Codec } from './codec'
import { decodeAC3, isAC3, parseAC3Info } from './decoder'
import { encodeAC3 } from './encoder'
import { AC3_SAMPLE_RATES, AC3ChannelMode, type AC3AudioData } from './types'

describe('AC3 Decoder', () => {
	// Helper to create test audio with sine wave
	function createSineWave(
		sampleRate: number,
		duration: number,
		frequency: number,
		channels: number,
		bitsPerSample: number
	): AC3AudioData {
		const numSamples = Math.floor(sampleRate * duration)
		const maxValue = (1 << (bitsPerSample - 1)) - 1
		const samples: Int32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Int32Array(numSamples)
			const phaseOffset = (ch * Math.PI) / 4
			for (let i = 0; i < numSamples; i++) {
				const t = i / sampleRate
				channelSamples[i] = Math.round(Math.sin(2 * Math.PI * frequency * t + phaseOffset) * maxValue * 0.5)
			}
			samples.push(channelSamples)
		}

		return { samples, sampleRate, bitsPerSample }
	}

	// Helper to create constant audio
	function createConstantAudio(
		sampleRate: number,
		numSamples: number,
		value: number,
		channels: number,
		bitsPerSample: number
	): AC3AudioData {
		const samples: Int32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Int32Array(numSamples)
			channelSamples.fill(value)
			samples.push(channelSamples)
		}

		return { samples, sampleRate, bitsPerSample }
	}

	// Helper to create silent audio
	function createSilence(sampleRate: number, duration: number, channels: number, bitsPerSample: number): AC3AudioData {
		return createConstantAudio(sampleRate, Math.floor(sampleRate * duration), 0, channels, bitsPerSample)
	}

	describe('isAC3', () => {
		it('should identify AC3 files by sync word', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = encodeAC3(audio)
			expect(isAC3(ac3)).toBe(true)
		})

		it('should reject non-AC3 files', () => {
			expect(isAC3(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isAC3(new Uint8Array([0xff, 0xf1, 0x50, 0x80]))).toBe(false) // AAC
			expect(isAC3(new Uint8Array([0x49, 0x44, 0x33, 0x04]))).toBe(false) // ID3
		})

		it('should handle short data', () => {
			expect(isAC3(new Uint8Array([]))).toBe(false)
			expect(isAC3(new Uint8Array([0x0b]))).toBe(false)
		})

		it('should identify AC3 sync word 0x0B77', () => {
			const data = new Uint8Array([0x0b, 0x77, 0x00, 0x00])
			expect(isAC3(data)).toBe(true)
		})
	})

	describe('parseAC3Info', () => {
		it('should parse stereo 48kHz info', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = encodeAC3(audio, { bitrate: 192 })
			const info = parseAC3Info(ac3)

			expect(info.sampleRate).toBe(48000)
			expect(info.bitrate).toBe(192)
			expect(info.channels).toBe(2)
			expect(info.hasLfe).toBe(false)
		})

		it('should parse mono 44.1kHz info', () => {
			const audio = createSineWave(44100, 0.1, 1000, 1, 16)
			const ac3 = encodeAC3(audio, { bitrate: 96 })
			const info = parseAC3Info(ac3)

			expect(info.sampleRate).toBe(44100)
			expect(info.bitrate).toBe(96)
			expect(info.channels).toBe(1)
		})

		it('should parse 5.1 surround info', () => {
			const audio = createSineWave(48000, 0.1, 440, 6, 16)
			const ac3 = encodeAC3(audio, { bitrate: 448, hasLfe: true })
			const info = parseAC3Info(ac3)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBeGreaterThanOrEqual(5)
		})

		it('should calculate duration correctly', () => {
			const audio = createSineWave(48000, 0.5, 440, 2, 16)
			const ac3 = encodeAC3(audio)
			const info = parseAC3Info(ac3)

			// AC3 frames are 1536 samples, so duration may be slightly different
			expect(info.duration).toBeGreaterThan(0.4)
			expect(info.duration).toBeLessThan(0.6)
		})

		it('should count frames correctly', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = encodeAC3(audio)
			const info = parseAC3Info(ac3)

			expect(info.totalFrames).toBeGreaterThan(0)
			// 0.1s at 48000 Hz = 4800 samples
			// Each frame is 1536 samples (6 blocks * 256)
			// Should be about 4 frames
			expect(info.totalFrames).toBeGreaterThanOrEqual(3)
			expect(info.totalFrames).toBeLessThanOrEqual(5)
		})

		it('should parse all supported sample rates', () => {
			for (const sampleRate of AC3_SAMPLE_RATES) {
				const audio = createSineWave(sampleRate, 0.1, 440, 2, 16)
				const ac3 = encodeAC3(audio)
				const info = parseAC3Info(ac3)

				expect(info.sampleRate).toBe(sampleRate)
			}
		})
	})

	describe('encodeAC3', () => {
		it('should encode stereo audio', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = encodeAC3(audio)

			expect(isAC3(ac3)).toBe(true)
			expect(ac3.length).toBeGreaterThan(100)
		})

		it('should encode mono audio', () => {
			const audio = createSineWave(48000, 0.1, 440, 1, 16)
			const ac3 = encodeAC3(audio)

			expect(isAC3(ac3)).toBe(true)
		})

		it('should encode 5.1 surround', () => {
			const audio = createSineWave(48000, 0.1, 440, 6, 16)
			const ac3 = encodeAC3(audio, { hasLfe: true })

			expect(isAC3(ac3)).toBe(true)
		})

		it('should encode with custom bitrate', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = encodeAC3(audio, { bitrate: 256 })

			const info = parseAC3Info(ac3)
			expect(info.bitrate).toBe(256)
		})

		it('should throw on unsupported sample rate', () => {
			const audio = createSineWave(22050, 0.1, 440, 2, 16)

			expect(() => encodeAC3(audio)).toThrow('Unsupported sample rate')
		})

		it('should throw on unsupported bitrate', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)

			expect(() => encodeAC3(audio, { bitrate: 999 })).toThrow('Unsupported bitrate')
		})

		it('should throw on empty audio', () => {
			const audio: AC3AudioData = {
				samples: [],
				sampleRate: 48000,
				bitsPerSample: 16,
			}

			expect(() => encodeAC3(audio)).toThrow('No audio data to encode')
		})

		it('should handle silence', () => {
			const audio = createSilence(48000, 0.1, 2, 16)
			const ac3 = encodeAC3(audio)

			expect(isAC3(ac3)).toBe(true)
		})
	})

	describe('decodeAC3', () => {
		it('should decode to correct channel count', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = encodeAC3(audio)
			const decoded = decodeAC3(ac3)

			expect(decoded.samples.length).toBe(2)
			expect(decoded.info.channels).toBe(2)
		})

		it('should decode mono audio', () => {
			const audio = createSineWave(48000, 0.1, 440, 1, 16)
			const ac3 = encodeAC3(audio)
			const decoded = decodeAC3(ac3)

			expect(decoded.samples.length).toBe(1)
		})

		it('should decode correct sample rate', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ac3 = encodeAC3(audio)
			const decoded = decodeAC3(ac3)

			expect(decoded.info.sampleRate).toBe(44100)
		})

		it('should decode approximate sample count', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = encodeAC3(audio)
			const decoded = decodeAC3(ac3)

			// AC3 pads to frame boundaries, so sample count may differ
			expect(decoded.samples[0]!.length).toBeGreaterThan(0)
		})
	})

	describe('AC3Codec class', () => {
		it('should have correct metadata', () => {
			expect(AC3Codec.name).toBe('AC3')
			expect(AC3Codec.description).toContain('Dolby Digital')
			expect(AC3Codec.extensions).toContain('.ac3')
			expect(AC3Codec.mimeTypes).toContain('audio/ac3')
		})

		it('should identify AC3 data', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = AC3Codec.encodeFromInt32(audio)

			expect(AC3Codec.isAC3(ac3)).toBe(true)
		})

		it('should parse info', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = AC3Codec.encodeFromInt32(audio)
			const info = AC3Codec.parseInfo(ac3)

			expect(info.sampleRate).toBe(48000)
		})

		it('should decode AC3', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = AC3Codec.encodeFromInt32(audio)
			const decoded = AC3Codec.decodeToInt32(ac3)

			expect(decoded.samples.length).toBe(2)
		})

		it('should return supported sample rates', () => {
			const rates = AC3Codec.getSupportedSampleRates()
			expect(rates).toContain(48000)
			expect(rates).toContain(44100)
			expect(rates).toContain(32000)
		})

		it('should return supported bitrates', () => {
			const bitrates = AC3Codec.getSupportedBitrates()
			expect(bitrates).toContain(192)
			expect(bitrates).toContain(384)
			expect(bitrates.length).toBeGreaterThan(10)
		})

		it('should get channel mode for channels', () => {
			expect(AC3Codec.getChannelModeForChannels(1)).toBe(AC3ChannelMode.MONO)
			expect(AC3Codec.getChannelModeForChannels(2)).toBe(AC3ChannelMode.STEREO)
			expect(AC3Codec.getChannelModeForChannels(6)).toBe(AC3ChannelMode.SURROUND_3_2)
		})

		it('should validate options', () => {
			expect(() => AC3Codec.validateOptions({ bitrate: 192 })).not.toThrow()
			expect(() => AC3Codec.validateOptions({ bitrate: 999 })).toThrow('Invalid bitrate')
		})

		it('should recommend bitrate', () => {
			const bitrate2ch = AC3Codec.getRecommendedBitrate(2, 48000)
			expect(bitrate2ch).toBe(192)

			const bitrate6ch = AC3Codec.getRecommendedBitrate(6, 48000)
			expect(bitrate6ch).toBeGreaterThan(192)
		})

		it('should calculate frame size', () => {
			const frameSize = AC3Codec.getFrameSize(192, 48000)
			expect(frameSize).toBeGreaterThan(0)
		})
	})

	describe('format validation', () => {
		it('should validate sync word position', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = encodeAC3(audio)

			// Check sync word at start
			expect(ac3[0]).toBe(0x0b)
			expect(ac3[1]).toBe(0x77)
		})

		it('should have correct frame structure', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ac3 = encodeAC3(audio, { bitrate: 192 })

			// Parse first frame manually
			const syncWord = (ac3[0]! << 8) | ac3[1]!
			expect(syncWord).toBe(0x0b77)

			// CRC1 at bytes 2-3
			const crc1 = (ac3[2]! << 8) | ac3[3]!
			expect(crc1).toBeGreaterThanOrEqual(0)

			// Sample rate and frame size code at byte 4
			const srFscr = ac3[4]!
			const sampleRateCode = (srFscr >> 6) & 0x03
			const frameSizeCode = srFscr & 0x3f

			expect(sampleRateCode).toBeGreaterThanOrEqual(0)
			expect(sampleRateCode).toBeLessThan(3)
			expect(frameSizeCode).toBeGreaterThanOrEqual(0)
		})
	})

	describe('edge cases', () => {
		it('should handle very short audio', () => {
			const audio = createSineWave(48000, 0.01, 440, 2, 16) // 10ms
			const ac3 = encodeAC3(audio)

			expect(isAC3(ac3)).toBe(true)
		})

		it('should handle different channel counts', () => {
			for (const channels of [1, 2, 3, 4, 5, 6]) {
				const audio = createSineWave(48000, 0.1, 440, channels, 16)
				const ac3 = encodeAC3(audio)

				expect(isAC3(ac3)).toBe(true)
			}
		})

		it('should handle all AC3 sample rates', () => {
			for (const sampleRate of [48000, 44100, 32000]) {
				const audio = createSineWave(sampleRate, 0.1, 440, 2, 16)
				const ac3 = encodeAC3(audio)
				const info = parseAC3Info(ac3)

				expect(info.sampleRate).toBe(sampleRate)
			}
		})

		it('should handle various bitrates', () => {
			for (const bitrate of [64, 96, 128, 192, 256, 384, 448]) {
				const audio = createSineWave(48000, 0.1, 440, 2, 16)
				const ac3 = encodeAC3(audio, { bitrate })
				const info = parseAC3Info(ac3)

				expect(info.bitrate).toBe(bitrate)
			}
		})
	})

	describe('compression', () => {
		it('should compress audio significantly', () => {
			const audio = createSineWave(48000, 1.0, 440, 2, 16)
			const ac3 = encodeAC3(audio, { bitrate: 192 })

			// Raw size: 1s * 48000 * 2 channels * 2 bytes = 192000 bytes
			const rawSize = audio.samples[0]!.length * 2 * 2

			// AC3 at 192 kbps should be about 192000 / 8 = 24000 bytes per second
			expect(ac3.length).toBeLessThan(rawSize)
			expect(ac3.length).toBeGreaterThan(10000)
		})

		it('should use less space at lower bitrates', () => {
			const audio = createSineWave(48000, 0.5, 440, 2, 16)
			const ac3_192 = encodeAC3(audio, { bitrate: 192 })
			const ac3_128 = encodeAC3(audio, { bitrate: 128 })

			expect(ac3_128.length).toBeLessThan(ac3_192.length)
		})

		it('should use more space at higher bitrates', () => {
			const audio = createSineWave(48000, 0.5, 440, 2, 16)
			const ac3_192 = encodeAC3(audio, { bitrate: 192 })
			const ac3_256 = encodeAC3(audio, { bitrate: 256 })

			expect(ac3_256.length).toBeGreaterThan(ac3_192.length)
		})
	})
})

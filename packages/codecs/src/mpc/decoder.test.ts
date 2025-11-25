import { describe, expect, it } from 'bun:test'
import type { AudioData } from '@sylphx/codec-core'
import {
	MpcCodec,
	MPCProfile,
	MPCVersion,
	decodeMpc,
	encodeMpc,
	isMpc,
	parseMpcInfo,
	parseSV7Header,
	parseSV8StreamHeader,
} from './index'

describe('MPC Codec', () => {
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

	// Create test audio data
	function createTestAudio(channels: number, sampleRate: number, duration: number): AudioData {
		const samples: Float32Array[] = []
		const frequencies = [440, 880]

		for (let ch = 0; ch < channels; ch++) {
			samples.push(createSineWave(frequencies[ch] ?? 440, sampleRate, duration))
		}

		return { samples, sampleRate, channels }
	}

	describe('isMpc', () => {
		it('should identify MPC SV8 files', () => {
			// "MPCK" magic
			const sv8Header = new Uint8Array([0x4d, 0x50, 0x43, 0x4b, 0x00, 0x00, 0x00, 0x00])
			expect(isMpc(sv8Header)).toBe(true)
		})

		it('should identify MPC SV7 files', () => {
			// "MP+" magic
			const sv7Header = new Uint8Array([0x4d, 0x50, 0x2b, 0x07, 0x00, 0x00, 0x00, 0x00])
			expect(isMpc(sv7Header)).toBe(true)
		})

		it('should reject non-MPC files', () => {
			expect(isMpc(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isMpc(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe(false) // MP3
			expect(isMpc(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // WAV
		})

		it('should handle short data', () => {
			expect(isMpc(new Uint8Array([]))).toBe(false)
			expect(isMpc(new Uint8Array([0x4d]))).toBe(false)
			expect(isMpc(new Uint8Array([0x4d, 0x50]))).toBe(false)
		})
	})

	describe('parseSV8StreamHeader', () => {
		it('should parse SV8 stream header', () => {
			// Create minimal SV8 file with stream header
			const data = new Uint8Array([
				0x4d,
				0x50,
				0x43,
				0x4b, // "MPCK"
				0x53,
				0x48, // "SH" packet type
				0x14, // packet size (20 bytes)
				0x00,
				0x00,
				0x00,
				0x00, // CRC
				0x08, // version 8
				0x00,
				0x22,
				0x56,
				0x00, // ~44100 samples
				0x00, // begin silence
				0x00, // sample rate index 0 (44100) + channels 2
				0x10, // audio block frames
			])

			const header = parseSV8StreamHeader(data, 0)
			expect(header).not.toBeNull()
			expect(header?.version).toBe(MPCVersion.SV8)
		})

		it('should return null for invalid data', () => {
			const data = new Uint8Array([0xff, 0xff, 0xff, 0xff])
			expect(parseSV8StreamHeader(data, 0)).toBeNull()
		})

		it('should return null for short data', () => {
			const data = new Uint8Array([0x4d, 0x50, 0x43])
			expect(parseSV8StreamHeader(data, 0)).toBeNull()
		})
	})

	describe('parseSV7Header', () => {
		it('should parse SV7 header', () => {
			// Create minimal SV7 header
			const data = new Uint8Array([
				0x4d,
				0x50,
				0x2b, // "MP+"
				0x07, // version 7
				0x0a,
				0x00,
				0x00,
				0x00, // frame count = 10
				0x1f, // max band = 31
				0x00, // stereo
				0x01, // mid-side stereo enabled
				0x00,
				0x00, // sample rate index 0 (44100)
				0x04,
				0x00, // profile = 4 (XTREME)
				0x08,
				0x00, // encoder version
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00, // padding
			])

			const header = parseSV7Header(data, 0)
			expect(header).not.toBeNull()
			expect(header?.version).toBe(MPCVersion.SV7)
			expect(header?.frameCount).toBe(10)
			expect(header?.channels).toBe(2)
			expect(header?.midSideStereo).toBe(true)
		})

		it('should return null for invalid magic', () => {
			const data = new Uint8Array([0xff, 0xff, 0xff, 0x07])
			expect(parseSV7Header(data, 0)).toBeNull()
		})

		it('should parse mono SV7 header', () => {
			const data = new Uint8Array([
				0x4d,
				0x50,
				0x2b, // "MP+"
				0x07, // version 7
				0x05,
				0x00,
				0x00,
				0x00, // frame count
				0x1f, // max band
				0x01, // mono
				0x00, // no mid-side
				0x00,
				0x00, // sample rate
				0x03,
				0x00, // profile
				0x08,
				0x00, // encoder
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
				0x00,
			])

			const header = parseSV7Header(data, 0)
			expect(header).not.toBeNull()
			expect(header?.channels).toBe(1)
		})
	})

	describe('encodeMpc', () => {
		it('should encode mono audio (SV8)', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mpc = encodeMpc(audio, { version: MPCVersion.SV8 })

			expect(mpc.length).toBeGreaterThan(0)
			expect(isMpc(mpc)).toBe(true)
		})

		it('should encode stereo audio (SV8)', () => {
			const audio = createTestAudio(2, 44100, 0.1)
			const mpc = encodeMpc(audio, { version: MPCVersion.SV8 })

			expect(mpc.length).toBeGreaterThan(0)
			expect(isMpc(mpc)).toBe(true)
		})

		it('should encode mono audio (SV7)', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mpc = encodeMpc(audio, { version: MPCVersion.SV7 })

			expect(mpc.length).toBeGreaterThan(0)
			expect(isMpc(mpc)).toBe(true)
		})

		it('should encode stereo audio (SV7)', () => {
			const audio = createTestAudio(2, 44100, 0.1)
			const mpc = encodeMpc(audio, { version: MPCVersion.SV7 })

			expect(mpc.length).toBeGreaterThan(0)
			expect(isMpc(mpc)).toBe(true)
		})

		it('should respect profile option', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mpc_standard = encodeMpc(audio, { profile: MPCProfile.STANDARD })
			const mpc_insane = encodeMpc(audio, { profile: MPCProfile.INSANE })

			// Higher profile should produce larger files
			expect(mpc_insane.length).toBeGreaterThan(mpc_standard.length)
		})

		it('should respect sample rate option', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mpc = encodeMpc(audio, { sampleRate: 44100 })

			const info = parseMpcInfo(mpc)
			expect(info.sampleRate).toBe(44100)
		})

		it('should handle different sample rates', () => {
			const sampleRates = [44100, 48000, 37800, 32000]

			for (const sampleRate of sampleRates) {
				const audio = createTestAudio(1, sampleRate, 0.05)
				const mpc = encodeMpc(audio, { sampleRate })

				const info = parseMpcInfo(mpc)
				expect(info.sampleRate).toBe(sampleRate)
			}
		})

		it('should throw error for unsupported sample rate', () => {
			const audio = createTestAudio(1, 96000, 0.05)
			expect(() => encodeMpc(audio, { sampleRate: 96000 })).toThrow()
		})

		it('should throw error for more than 2 channels', () => {
			const audio: AudioData = {
				samples: [new Float32Array(1000), new Float32Array(1000), new Float32Array(1000)],
				sampleRate: 44100,
				channels: 3,
			}
			expect(() => encodeMpc(audio)).toThrow()
		})

		it('should encode with mid-side stereo', () => {
			const audio = createTestAudio(2, 44100, 0.1)
			const mpc = encodeMpc(audio, { midSideStereo: true })

			expect(isMpc(mpc)).toBe(true)
		})
	})

	describe('parseMpcInfo', () => {
		it('should parse encoded SV8 info', () => {
			const audio = createTestAudio(2, 44100, 0.2)
			const mpc = encodeMpc(audio, { profile: MPCProfile.STANDARD, version: MPCVersion.SV8 })

			const info = parseMpcInfo(mpc)

			expect(info.version).toBe(MPCVersion.SV8)
			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
			expect(info.totalSamples).toBeGreaterThan(0)
			expect(info.duration).toBeGreaterThan(0)
			expect(info.bitrate).toBeGreaterThan(0)
		})

		it('should parse encoded SV7 info', () => {
			const audio = createTestAudio(2, 44100, 0.2)
			const mpc = encodeMpc(audio, { profile: MPCProfile.XTREME, version: MPCVersion.SV7 })

			const info = parseMpcInfo(mpc)

			expect(info.version).toBe(MPCVersion.SV7)
			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
			expect(info.totalSamples).toBeGreaterThan(0)
			expect(info.duration).toBeGreaterThan(0)
		})

		it('should parse mono MPC', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mpc = encodeMpc(audio)

			const info = parseMpcInfo(mpc)
			expect(info.channels).toBe(1)
		})

		it('should throw error for invalid data', () => {
			const invalidData = new Uint8Array([0xff, 0xff, 0xff, 0xff])
			expect(() => parseMpcInfo(invalidData)).toThrow()
		})
	})

	describe('decodeMpc', () => {
		it('should decode SV8 audio', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mpc = encodeMpc(audio, { version: MPCVersion.SV8 })

			const decoded = decodeMpc(mpc)

			expect(decoded.info.version).toBe(MPCVersion.SV8)
			expect(decoded.info.sampleRate).toBe(44100)
			expect(decoded.info.channels).toBe(1)
			expect(decoded.samples.length).toBe(1)
			expect(decoded.samples[0]!.length).toBeGreaterThan(0)
		})

		it('should decode SV7 audio', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mpc = encodeMpc(audio, { version: MPCVersion.SV7 })

			const decoded = decodeMpc(mpc)

			expect(decoded.info.version).toBe(MPCVersion.SV7)
			expect(decoded.info.sampleRate).toBe(44100)
			expect(decoded.info.channels).toBe(1)
			expect(decoded.samples.length).toBe(1)
		})

		it('should decode stereo MPC', () => {
			const audio = createTestAudio(2, 44100, 0.1)
			const mpc = encodeMpc(audio)

			const decoded = decodeMpc(mpc)

			expect(decoded.samples.length).toBe(2)
		})
	})

	describe('MpcCodec', () => {
		it('should detect MPC files', () => {
			const audio = createTestAudio(1, 44100, 0.05)
			const mpc = encodeMpc(audio)

			expect(MpcCodec.detect(mpc)).toBe(true)
			expect(MpcCodec.detect(new Uint8Array([0, 0, 0, 0]))).toBe(false)
		})

		it('should parse MPC metadata', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mpc = encodeMpc(audio, { profile: MPCProfile.XTREME })

			const info = MpcCodec.parse(mpc)
			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(1)
		})

		it('should encode and decode', () => {
			const audio = createTestAudio(1, 44100, 0.05)
			const encoded = MpcCodec.encode(audio)
			const decoded = MpcCodec.decode(encoded)

			expect(decoded.info.sampleRate).toBe(44100)
			expect(decoded.samples.length).toBe(1)
		})

		it('should validate sample rates', () => {
			expect(MpcCodec.isValidSampleRate(44100)).toBe(true)
			expect(MpcCodec.isValidSampleRate(48000)).toBe(true)
			expect(MpcCodec.isValidSampleRate(96000)).toBe(false)
		})

		it('should validate channel counts', () => {
			expect(MpcCodec.isValidChannelCount(1)).toBe(true)
			expect(MpcCodec.isValidChannelCount(2)).toBe(true)
			expect(MpcCodec.isValidChannelCount(3)).toBe(false)
		})

		it('should get recommended profile for quality', () => {
			expect(MpcCodec.getRecommendedProfile(0)).toBe(MPCProfile.TELEPHONE)
			expect(MpcCodec.getRecommendedProfile(5)).toBe(MPCProfile.STANDARD)
			expect(MpcCodec.getRecommendedProfile(10)).toBe(MPCProfile.EXPERIMENTAL)
		})

		it('should get profile bitrate', () => {
			expect(MpcCodec.getProfileBitrate(MPCProfile.TELEPHONE)).toBe(64)
			expect(MpcCodec.getProfileBitrate(MPCProfile.STANDARD)).toBe(128)
			expect(MpcCodec.getProfileBitrate(MPCProfile.INSANE)).toBe(180)
		})

		it('should estimate file size', () => {
			const size = MpcCodec.estimateFileSize(10, MPCProfile.STANDARD) // 10 seconds, ~128 kbps
			expect(size).toBeGreaterThan(150000) // Should be around 160000 bytes
		})

		it('should calculate duration', () => {
			const duration = MpcCodec.calculateDuration(160000, MPCProfile.STANDARD)
			expect(duration).toBeCloseTo(10, 0)
		})

		it('should list supported sample rates', () => {
			const rates = MpcCodec.getSupportedSampleRates()
			expect(rates).toContain(44100)
			expect(rates).toContain(48000)
			expect(rates.length).toBe(4)
		})

		it('should list supported profiles', () => {
			const profiles = MpcCodec.getSupportedProfiles()
			expect(profiles).toContain('STANDARD')
			expect(profiles).toContain('XTREME')
			expect(profiles.length).toBe(8)
		})

		it('should return format info', () => {
			expect(MpcCodec.getFormatName()).toBe('Musepack (MPC)')
			expect(MpcCodec.getFormatDescription()).toContain('High quality')
			expect(MpcCodec.getFileExtensions()).toContain('.mpc')
			expect(MpcCodec.getMimeTypes()).toContain('audio/x-musepack')
		})

		it('should report capabilities', () => {
			expect(MpcCodec.supportsMetadata()).toBe(true)
			expect(MpcCodec.supportsStreaming()).toBe(true)
			expect(MpcCodec.getMaxChannels()).toBe(2)
			expect(MpcCodec.getMinSampleRate()).toBe(32000)
			expect(MpcCodec.getMaxSampleRate()).toBe(48000)
		})
	})
})

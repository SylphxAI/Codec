import { describe, expect, it } from 'bun:test'
import {
	ChannelMode,
	Mp3Codec,
	MpegLayer,
	MpegVersion,
	decodeMp3,
	encodeMp3,
	findFrameSync,
	isMp3,
	parseFrameHeader,
	parseID3v2,
	parseMp3Info,
	type MP3AudioData,
} from './index'

describe('MP3 Codec', () => {
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
	function createTestAudio(channels: number, sampleRate: number, duration: number): MP3AudioData {
		const samples: Float32Array[] = []
		const frequencies = [440, 880, 660, 550]

		for (let ch = 0; ch < channels; ch++) {
			samples.push(createSineWave(frequencies[ch] ?? 440, sampleRate, duration))
		}

		return { samples, sampleRate, channels }
	}

	describe('isMp3', () => {
		it('should identify MP3 files with ID3v2', () => {
			const id3Header = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
			expect(isMp3(id3Header)).toBe(true)
		})

		it('should identify MP3 files with frame sync', () => {
			// 0xFFE = 11111111110 (11 sync bits)
			// Next bits: version=11 (MPEG-1), layer=01 (Layer III), protection=1
			const frameHeader = new Uint8Array([0xff, 0xfb, 0x90, 0x00])
			expect(isMp3(frameHeader)).toBe(true)
		})

		it('should reject non-MP3 files', () => {
			expect(isMp3(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isMp3(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // WAV
			expect(isMp3(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isMp3(new Uint8Array([]))).toBe(false)
			expect(isMp3(new Uint8Array([0xff]))).toBe(false)
		})
	})

	describe('findFrameSync', () => {
		it('should find frame sync at start', () => {
			const data = new Uint8Array([0xff, 0xfb, 0x90, 0x00])
			expect(findFrameSync(data)).toBe(0)
		})

		it('should find frame sync after offset', () => {
			const data = new Uint8Array([0x00, 0x00, 0xff, 0xfb, 0x90, 0x00])
			expect(findFrameSync(data, 0)).toBe(2)
		})

		it('should return -1 if no sync found', () => {
			const data = new Uint8Array([0x00, 0x00, 0x00, 0x00])
			expect(findFrameSync(data)).toBe(-1)
		})
	})

	describe('parseFrameHeader', () => {
		it('should parse MPEG-1 Layer III header', () => {
			// Create a valid MPEG-1 Layer III frame header
			// Sync: 0xFFE (11 bits), Version: 11 (MPEG-1), Layer: 01 (Layer III), Protection: 1
			// Bitrate: 1001 (128 kbps), Sample rate: 00 (44100), Padding: 0, Private: 0
			// Mode: 00 (Stereo), Mode ext: 00, Copyright: 0, Original: 1, Emphasis: 00
			const header = new Uint8Array([0xff, 0xfb, 0x90, 0x04])

			const parsed = parseFrameHeader(header, 0)
			expect(parsed).not.toBeNull()
			expect(parsed?.version).toBe(MpegVersion.MPEG_1)
			expect(parsed?.layer).toBe(MpegLayer.LAYER_III)
			expect(parsed?.protection).toBe(true)
			expect(parsed?.bitrate).toBe(128)
			expect(parsed?.sampleRate).toBe(44100)
			expect(parsed?.channelMode).toBe(ChannelMode.STEREO)
			expect(parsed?.samplesPerFrame).toBe(1152)
		})

		it('should parse MPEG-2 Layer III header', () => {
			// MPEG-2, Layer III, 64 kbps, 16000 Hz
			// 0xFF 0xF3: sync=0x7FF, version=10 (MPEG-2), layer=01 (Layer III), protection=1
			// 0x48: bitrate=0100 (64kbps for MPEG-2 Layer III), sampleRate=10 (16000 for MPEG-2)
			const header = new Uint8Array([0xff, 0xf3, 0x48, 0x04])

			const parsed = parseFrameHeader(header, 0)
			expect(parsed).not.toBeNull()
			expect(parsed?.version).toBe(MpegVersion.MPEG_2)
			expect(parsed?.layer).toBe(MpegLayer.LAYER_III)
			expect(parsed?.sampleRate).toBe(16000)
			expect(parsed?.samplesPerFrame).toBe(576)
		})

		it('should reject invalid sync', () => {
			const header = new Uint8Array([0x00, 0x00, 0x00, 0x00])
			expect(parseFrameHeader(header, 0)).toBeNull()
		})

		it('should reject reserved version', () => {
			// Version bits = 01 is reserved
			// 0xFF 0xEB: sync=0x7FF, version=01 (RESERVED), layer=01 (Layer III), protection=1
			const header = new Uint8Array([0xff, 0xeb, 0x90, 0x00])
			expect(parseFrameHeader(header, 0)).toBeNull()
		})

		it('should calculate correct frame size', () => {
			// MPEG-1, Layer III, 128 kbps, 44100 Hz
			const header = new Uint8Array([0xff, 0xfb, 0x90, 0x00])

			const parsed = parseFrameHeader(header, 0)
			expect(parsed).not.toBeNull()

			// Frame size = 144 * bitrate / sampleRate + padding
			// = 144 * 128000 / 44100 = 417.9 = 417
			expect(parsed?.frameSize).toBe(417)
		})
	})

	describe('parseID3v2', () => {
		it('should parse ID3v2 header', () => {
			// ID3v2.3 header with 100 bytes of tag data
			const data = new Uint8Array([
				0x49,
				0x44,
				0x33, // 'ID3'
				0x03, // version 3
				0x00, // revision 0
				0x00, // flags
				0x00,
				0x00,
				0x00,
				0x64, // size = 100 (synchsafe)
			])

			const tag = parseID3v2(data, 0)
			expect(tag).not.toBeNull()
			expect(tag?.header.version).toBe(3)
			expect(tag?.header.revision).toBe(0)
			expect(tag?.header.size).toBe(100)
		})

		it('should parse ID3v2.4 with synchsafe sizes', () => {
			const data = new Uint8Array([
				0x49,
				0x44,
				0x33, // 'ID3'
				0x04, // version 4
				0x00, // revision 0
				0x00, // flags
				0x00,
				0x00,
				0x01,
				0x00, // size = 128 (synchsafe)
			])

			const tag = parseID3v2(data, 0)
			expect(tag).not.toBeNull()
			expect(tag?.header.version).toBe(4)
			expect(tag?.header.size).toBe(128)
		})

		it('should return null for non-ID3 data', () => {
			const data = new Uint8Array([0xff, 0xfb, 0x90, 0x00])
			expect(parseID3v2(data, 0)).toBeNull()
		})
	})

	describe('encodeMp3', () => {
		it('should encode mono audio', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mp3 = encodeMp3(audio)

			expect(mp3.length).toBeGreaterThan(0)
			expect(isMp3(mp3)).toBe(true)
		})

		it('should encode stereo audio', () => {
			const audio = createTestAudio(2, 44100, 0.1)
			const mp3 = encodeMp3(audio)

			expect(mp3.length).toBeGreaterThan(0)
			expect(isMp3(mp3)).toBe(true)
		})

		it('should respect bitrate option', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mp3_128 = encodeMp3(audio, { bitrate: 128 })
			const mp3_320 = encodeMp3(audio, { bitrate: 320 })

			// Higher bitrate should produce larger files
			expect(mp3_320.length).toBeGreaterThan(mp3_128.length)
		})

		it('should respect sample rate option', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mp3 = encodeMp3(audio, { sampleRate: 44100 })

			const info = parseMp3Info(mp3)
			expect(info.sampleRate).toBe(44100)
		})

		it('should encode with metadata', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const metadata = new Map([
				['title', 'Test Song'],
				['artist', 'Test Artist'],
			])
			const mp3 = encodeMp3(audio, { metadata })

			const tag = parseID3v2(mp3, 0)
			expect(tag).not.toBeNull()
			expect(tag?.metadata.get('TIT2')).toBe('Test Song')
			expect(tag?.metadata.get('TPE1')).toBe('Test Artist')
		})

		it('should handle different sample rates', () => {
			const sampleRates = [44100, 48000, 32000, 22050, 24000, 16000]

			for (const sampleRate of sampleRates) {
				const audio = createTestAudio(1, sampleRate, 0.05)
				const mp3 = encodeMp3(audio, { sampleRate })

				const info = parseMp3Info(mp3)
				expect(info.sampleRate).toBe(sampleRate)
			}
		})
	})

	describe('parseMp3Info', () => {
		it('should parse encoded MP3 info', () => {
			const audio = createTestAudio(2, 44100, 0.2)
			const mp3 = encodeMp3(audio, { bitrate: 128 })

			const info = parseMp3Info(mp3)

			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
			expect(info.bitrate).toBe(128)
			expect(info.version).toBe(MpegVersion.MPEG_1)
			expect(info.layer).toBe(MpegLayer.LAYER_III)
			expect(info.frameCount).toBeGreaterThan(0)
			expect(info.duration).toBeGreaterThan(0)
		})

		it('should parse mono MP3', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mp3 = encodeMp3(audio, { channelMode: ChannelMode.MONO })

			const info = parseMp3Info(mp3)
			expect(info.channels).toBe(1)
			expect(info.channelMode).toBe(ChannelMode.MONO)
		})

		it('should detect ID3v2 tag', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const metadata = new Map([['title', 'Test']])
			const mp3 = encodeMp3(audio, { metadata })

			const info = parseMp3Info(mp3)
			expect(info.id3v2).not.toBeUndefined()
		})
	})

	describe('decodeMp3', () => {
		it('should decode MP3 audio', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mp3 = encodeMp3(audio)

			const decoded = decodeMp3(mp3)

			expect(decoded.info.sampleRate).toBe(44100)
			expect(decoded.info.channels).toBe(1)
			expect(decoded.samples.length).toBe(1)
			expect(decoded.samples[0]!.length).toBeGreaterThan(0)
		})

		it('should decode stereo MP3', () => {
			const audio = createTestAudio(2, 44100, 0.1)
			const mp3 = encodeMp3(audio)

			const decoded = decodeMp3(mp3)

			expect(decoded.samples.length).toBe(2)
		})
	})

	describe('Mp3Codec', () => {
		it('should detect MP3 files', () => {
			const audio = createTestAudio(1, 44100, 0.05)
			const mp3 = encodeMp3(audio)

			expect(Mp3Codec.detect(mp3)).toBe(true)
			expect(Mp3Codec.detect(new Uint8Array([0, 0, 0, 0]))).toBe(false)
		})

		it('should parse MP3 metadata', () => {
			const audio = createTestAudio(1, 44100, 0.1)
			const mp3 = encodeMp3(audio, { bitrate: 192 })

			const info = Mp3Codec.parse(mp3)
			expect(info.sampleRate).toBe(44100)
			expect(info.bitrate).toBe(192)
		})

		it('should encode and decode', () => {
			const audio = createTestAudio(1, 44100, 0.05)
			const encoded = Mp3Codec.encode(audio)
			const decoded = Mp3Codec.decode(encoded)

			expect(decoded.info.sampleRate).toBe(44100)
			expect(decoded.samples.length).toBe(1)
		})

		it('should validate sample rates', () => {
			expect(Mp3Codec.isValidSampleRate(44100)).toBe(true)
			expect(Mp3Codec.isValidSampleRate(48000)).toBe(true)
			expect(Mp3Codec.isValidSampleRate(96000)).toBe(false)
		})

		it('should validate bitrates', () => {
			expect(Mp3Codec.isValidBitrate(128)).toBe(true)
			expect(Mp3Codec.isValidBitrate(320)).toBe(true)
			expect(Mp3Codec.isValidBitrate(500)).toBe(false)
		})

		it('should validate channel counts', () => {
			expect(Mp3Codec.isValidChannelCount(1)).toBe(true)
			expect(Mp3Codec.isValidChannelCount(2)).toBe(true)
			expect(Mp3Codec.isValidChannelCount(3)).toBe(false)
		})

		it('should get recommended bitrate for quality', () => {
			expect(Mp3Codec.getRecommendedBitrate(0)).toBe(320) // Best
			expect(Mp3Codec.getRecommendedBitrate(5)).toBe(128) // Medium
			expect(Mp3Codec.getRecommendedBitrate(9)).toBe(64) // Worst
		})

		it('should estimate file size', () => {
			const size = Mp3Codec.estimateFileSize(10, 128) // 10 seconds, 128 kbps
			// 128 kbps = 16000 bytes/sec, so 10 sec = 160000 bytes
			expect(size).toBe(160000)
		})

		it('should calculate duration', () => {
			const duration = Mp3Codec.calculateDuration(160000, 128) // 160000 bytes, 128 kbps
			// 128 kbps = 16000 bytes/sec, so 160000 bytes = 10 sec
			expect(duration).toBe(10)
		})

		it('should list supported sample rates', () => {
			const rates = Mp3Codec.getSupportedSampleRates()
			expect(rates).toContain(44100)
			expect(rates).toContain(48000)
			expect(rates).toContain(32000)
			expect(rates.length).toBeGreaterThan(0)
		})

		it('should list supported bitrates', () => {
			const bitrates = Mp3Codec.getSupportedBitrates()
			expect(bitrates).toContain(128)
			expect(bitrates).toContain(192)
			expect(bitrates).toContain(320)
		})

		it('should list supported channel modes', () => {
			const modes = Mp3Codec.getSupportedChannelModes()
			expect(modes).toContain('STEREO')
			expect(modes).toContain('MONO')
		})
	})
})

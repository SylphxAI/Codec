import { describe, expect, it } from 'bun:test'
import { decodeOgg, encodeOgg, isOgg, parseOggInfo } from './index'
import type { OggAudioData } from './types'

describe('OGG Codec', () => {
	// Create test audio with sine wave
	function createSineWave(
		sampleRate: number,
		duration: number,
		frequency: number,
		channels: number,
		bitsPerSample: number
	): OggAudioData {
		const numSamples = Math.floor(sampleRate * duration)
		const maxValue = (1 << (bitsPerSample - 1)) - 1
		const samples: Int32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Int32Array(numSamples)
			const phaseOffset = (ch * Math.PI) / 4
			for (let i = 0; i < numSamples; i++) {
				const t = i / sampleRate
				channelSamples[i] = Math.round(Math.sin(2 * Math.PI * frequency * t + phaseOffset) * maxValue * 0.8)
			}
			samples.push(channelSamples)
		}

		return { samples, sampleRate, bitsPerSample }
	}

	// Create constant audio
	function createConstantAudio(
		sampleRate: number,
		numSamples: number,
		value: number,
		channels: number,
		bitsPerSample: number
	): OggAudioData {
		const samples: Int32Array[] = []

		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = new Int32Array(numSamples)
			channelSamples.fill(value)
			samples.push(channelSamples)
		}

		return { samples, sampleRate, bitsPerSample }
	}

	describe('isOgg', () => {
		it('should identify OGG files', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)
			expect(isOgg(ogg)).toBe(true)
		})

		it('should reject non-OGG files', () => {
			expect(isOgg(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isOgg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isOgg(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
		})

		it('should handle short data', () => {
			expect(isOgg(new Uint8Array([]))).toBe(false)
			expect(isOgg(new Uint8Array([0x4f, 0x67]))).toBe(false)
		})
	})

	describe('parseOggInfo', () => {
		it('should parse stereo info', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)

			const info = parseOggInfo(ogg)

			expect(info.streams.length).toBeGreaterThan(0)
			expect(info.streams[0]?.codecId).toBe('flac')
		})

		it('should parse sample rate', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)

			const info = parseOggInfo(ogg)

			expect(info.streams[0]?.flacInfo?.sampleRate).toBe(48000)
		})

		it('should parse channels', () => {
			const audio = createSineWave(44100, 0.1, 440, 1, 16)
			const ogg = encodeOgg(audio)

			const info = parseOggInfo(ogg)

			expect(info.streams[0]?.flacInfo?.channels).toBe(1)
		})

		it('should parse bits per sample', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 24)
			const ogg = encodeOgg(audio)

			const info = parseOggInfo(ogg)

			expect(info.streams[0]?.flacInfo?.bitsPerSample).toBe(24)
		})

		it('should indicate audio presence', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)

			const info = parseOggInfo(ogg)

			expect(info.hasAudio).toBe(true)
		})
	})

	describe('encodeOgg', () => {
		it('should encode stereo audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)

			expect(isOgg(ogg)).toBe(true)
			expect(ogg.length).toBeGreaterThan(100)
		})

		it('should encode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1, 16)
			const ogg = encodeOgg(audio)

			expect(isOgg(ogg)).toBe(true)
		})

		it('should encode 24-bit audio', () => {
			const audio = createSineWave(48000, 0.1, 440, 2, 24)
			const ogg = encodeOgg(audio)

			expect(isOgg(ogg)).toBe(true)
		})

		it('should encode constant audio', () => {
			const audio = createConstantAudio(44100, 4096, 1000, 1, 16)
			const ogg = encodeOgg(audio)

			expect(isOgg(ogg)).toBe(true)
		})
	})

	describe('decodeOgg', () => {
		it('should decode OGG structure', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)
			const decoded = decodeOgg(ogg)

			expect(decoded.pages.length).toBeGreaterThan(0)
		})

		it('should find BOS page', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)
			const decoded = decodeOgg(ogg)

			// First page should be BOS
			expect(decoded.pages[0]?.flags & 0x02).toBe(0x02)
		})

		it('should find EOS page', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)
			const decoded = decodeOgg(ogg)

			// Last page should be EOS
			const lastPage = decoded.pages[decoded.pages.length - 1]
			expect(lastPage?.flags & 0x04).toBe(0x04)
		})

		it('should parse stream info', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)
			const decoded = decodeOgg(ogg)

			expect(decoded.info.streams.length).toBe(1)
			expect(decoded.info.streams[0]?.codecId).toBe('flac')
		})
	})

	describe('roundtrip', () => {
		it('should preserve stream info', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)
			const decoded = decodeOgg(ogg)

			expect(decoded.info.streams[0]?.flacInfo?.sampleRate).toBe(44100)
			expect(decoded.info.streams[0]?.flacInfo?.channels).toBe(2)
			expect(decoded.info.streams[0]?.flacInfo?.bitsPerSample).toBe(16)
		})

		it('should preserve total samples', () => {
			const audio = createSineWave(44100, 0.1, 440, 2, 16)
			const ogg = encodeOgg(audio)
			const decoded = decodeOgg(ogg)

			expect(decoded.info.streams[0]?.flacInfo?.totalSamples).toBe(4410)
		})

		it('should handle different sample rates', () => {
			for (const rate of [22050, 44100, 48000]) {
				const audio = createSineWave(rate, 0.05, 440, 1, 16)
				const ogg = encodeOgg(audio)
				const decoded = decodeOgg(ogg)

				expect(decoded.info.streams[0]?.flacInfo?.sampleRate).toBe(rate)
			}
		})

		it('should handle different channel counts', () => {
			for (const channels of [1, 2]) {
				const audio = createSineWave(44100, 0.05, 440, channels, 16)
				const ogg = encodeOgg(audio)
				const decoded = decodeOgg(ogg)

				expect(decoded.info.streams[0]?.flacInfo?.channels).toBe(channels)
			}
		})
	})
})

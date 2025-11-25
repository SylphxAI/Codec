import { describe, expect, it } from 'bun:test'
import type { AudioData } from '@sylphx/codec-core'
import { decodeMka, decodeMkaAudio, encodeMka, isMka, parseMkaInfo } from './index'

describe('MKA Codec', () => {
	// Create test audio with sine wave
	function createTestAudio(sampleRate: number, channels: number, durationSec: number, frequency: number = 440): AudioData {
		const sampleCount = Math.floor(sampleRate * durationSec)
		const data = new Float32Array(sampleCount * channels)

		for (let i = 0; i < sampleCount; i++) {
			const t = i / sampleRate
			const sample = Math.sin(2 * Math.PI * frequency * t) * 0.5

			for (let ch = 0; ch < channels; ch++) {
				data[i * channels + ch] = sample
			}
		}

		return { sampleRate, channels, data }
	}

	// Create test audio with silence
	function createSilentAudio(sampleRate: number, channels: number, durationSec: number): AudioData {
		const sampleCount = Math.floor(sampleRate * durationSec)
		const data = new Float32Array(sampleCount * channels)
		return { sampleRate, channels, data }
	}

	describe('isMka', () => {
		it('should identify MKA files', () => {
			const audio = createTestAudio(8000, 1, 0.1)
			const mka = encodeMka(audio)
			expect(isMka(mka)).toBe(true)
		})

		it('should reject non-MKA files', () => {
			expect(isMka(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isMka(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isMka(new Uint8Array([0xff, 0xfb]))).toBe(false) // MP3
		})

		it('should handle short data', () => {
			expect(isMka(new Uint8Array([]))).toBe(false)
			expect(isMka(new Uint8Array([0x1a, 0x45]))).toBe(false)
		})

		it('should identify EBML magic bytes', () => {
			const ebmlMagic = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])
			expect(isMka(ebmlMagic)).toBe(true)
		})
	})

	describe('parseMkaInfo', () => {
		it('should parse MKA info', () => {
			const audio = createTestAudio(44100, 2, 0.1)
			const mka = encodeMka(audio)

			const info = parseMkaInfo(mka)

			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
		})

		it('should parse doc type', () => {
			const audio = createTestAudio(8000, 1, 0.05)
			const mka = encodeMka(audio)

			const info = parseMkaInfo(mka)

			expect(info.docType).toBe('matroska')
		})

		it('should have audio track', () => {
			const audio = createTestAudio(22050, 1, 0.1)
			const mka = encodeMka(audio)

			const info = parseMkaInfo(mka)

			expect(info.tracks.length).toBe(1)
			expect(info.tracks[0]?.type).toBe(2) // AUDIO
			expect(info.tracks[0]?.codecId).toBe('A_PCM/INT/LIT')
		})

		it('should parse audio settings from track', () => {
			const audio = createTestAudio(48000, 2, 0.05)
			const mka = encodeMka(audio)

			const info = parseMkaInfo(mka)

			expect(info.tracks[0]?.audio.samplingFrequency).toBe(48000)
			expect(info.tracks[0]?.audio.channels).toBe(2)
			expect(info.tracks[0]?.audio.bitDepth).toBe(16)
		})

		it('should parse mono audio', () => {
			const audio = createTestAudio(16000, 1, 0.05)
			const mka = encodeMka(audio)

			const info = parseMkaInfo(mka)

			expect(info.channels).toBe(1)
		})

		it('should parse stereo audio', () => {
			const audio = createTestAudio(44100, 2, 0.05)
			const mka = encodeMka(audio)

			const info = parseMkaInfo(mka)

			expect(info.channels).toBe(2)
		})
	})

	describe('encodeMka', () => {
		it('should encode mono audio', () => {
			const audio = createTestAudio(8000, 1, 0.1)
			const mka = encodeMka(audio)

			expect(isMka(mka)).toBe(true)
			expect(mka.length).toBeGreaterThan(100)
		})

		it('should encode stereo audio', () => {
			const audio = createTestAudio(44100, 2, 0.1)
			const mka = encodeMka(audio)

			expect(isMka(mka)).toBe(true)
			expect(mka.length).toBeGreaterThan(100)
		})

		it('should encode with custom options', () => {
			const audio = createTestAudio(22050, 1, 0.05)
			const mka = encodeMka(audio, { bitDepth: 24 })

			expect(isMka(mka)).toBe(true)
		})

		it('should encode different sample rates', () => {
			for (const sampleRate of [8000, 16000, 22050, 44100, 48000]) {
				const audio = createTestAudio(sampleRate, 1, 0.05)
				const mka = encodeMka(audio)

				expect(isMka(mka)).toBe(true)
			}
		})

		it('should encode silent audio', () => {
			const audio = createSilentAudio(8000, 1, 0.1)
			const mka = encodeMka(audio)

			expect(isMka(mka)).toBe(true)
		})
	})

	describe('decodeMka', () => {
		it('should decode MKA file', () => {
			const audio = createTestAudio(8000, 1, 0.1)
			const mka = encodeMka(audio)
			const decoded = decodeMka(mka)

			expect(decoded.info.sampleRate).toBe(8000)
			expect(decoded.info.channels).toBe(1)
		})

		it('should parse clusters', () => {
			const audio = createTestAudio(8000, 1, 0.1)
			const mka = encodeMka(audio)
			const decoded = decodeMka(mka)

			expect(decoded.clusters.length).toBeGreaterThan(0)
		})

		it('should have blocks in clusters', () => {
			const audio = createTestAudio(8000, 1, 0.05)
			const mka = encodeMka(audio)
			const decoded = decodeMka(mka)

			expect(decoded.clusters.length).toBeGreaterThan(0)
			expect(decoded.clusters[0]?.blocks.length).toBeGreaterThan(0)
		})

		it('should parse muxing app', () => {
			const audio = createTestAudio(8000, 1, 0.05)
			const mka = encodeMka(audio)
			const decoded = decodeMka(mka)

			expect(decoded.info.muxingApp).toBe('mconv')
		})

		it('should decode stereo file', () => {
			const audio = createTestAudio(44100, 2, 0.05)
			const mka = encodeMka(audio)
			const decoded = decodeMka(mka)

			expect(decoded.info.channels).toBe(2)
		})
	})

	describe('decodeMkaAudio', () => {
		it('should decode to AudioData', () => {
			const original = createTestAudio(8000, 1, 0.1)
			const mka = encodeMka(original)
			const decoded = decodeMkaAudio(mka)

			expect(decoded).not.toBeNull()
			expect(decoded!.sampleRate).toBe(8000)
			expect(decoded!.channels).toBe(1)
			expect(decoded!.data.length).toBeGreaterThan(0)
		})

		it('should decode stereo audio', () => {
			const original = createTestAudio(44100, 2, 0.1)
			const mka = encodeMka(original)
			const decoded = decodeMkaAudio(mka)

			expect(decoded).not.toBeNull()
			expect(decoded!.sampleRate).toBe(44100)
			expect(decoded!.channels).toBe(2)
		})

		it('should decode silent audio', () => {
			const original = createSilentAudio(8000, 1, 0.1)
			const mka = encodeMka(original)
			const decoded = decodeMkaAudio(mka)

			expect(decoded).not.toBeNull()
			expect(decoded!.data.length).toBeGreaterThan(0)

			// Check that audio is mostly silent
			const sum = decoded!.data.reduce((acc, val) => acc + Math.abs(val), 0)
			const avg = sum / decoded!.data.length
			expect(avg).toBeLessThan(0.01)
		})
	})

	describe('roundtrip', () => {
		it('should preserve sample rate', () => {
			const original = createTestAudio(22050, 1, 0.1)

			const encoded = encodeMka(original)
			const decoded = decodeMka(encoded)

			expect(decoded.info.sampleRate).toBe(22050)
		})

		it('should preserve channel count', () => {
			const original = createTestAudio(44100, 2, 0.1)

			const encoded = encodeMka(original)
			const decoded = decodeMka(encoded)

			expect(decoded.info.channels).toBe(2)
		})

		it('should decode PCM audio', () => {
			const original = createTestAudio(8000, 1, 0.1)

			const encoded = encodeMka(original)
			const decoded = decodeMkaAudio(encoded)

			expect(decoded).not.toBeNull()
			expect(decoded!.sampleRate).toBe(8000)
			expect(decoded!.channels).toBe(1)
		})

		it('should handle different sample rates', () => {
			for (const sampleRate of [8000, 16000, 22050, 44100]) {
				const original = createTestAudio(sampleRate, 1, 0.05)
				const encoded = encodeMka(original)
				const decoded = decodeMka(encoded)

				expect(decoded.info.sampleRate).toBe(sampleRate)
			}
		})

		it('should preserve audio approximately', () => {
			const original = createTestAudio(8000, 1, 0.1, 440)

			const encoded = encodeMka(original)
			const decoded = decodeMkaAudio(encoded)

			expect(decoded).not.toBeNull()

			// Check that decoded audio has similar characteristics
			// (PCM with 16-bit quantization will have some loss)
			const originalMax = Math.max(...Array.from(original.data).map(Math.abs))
			const decodedMax = Math.max(...Array.from(decoded!.data).map(Math.abs))

			expect(decodedMax).toBeGreaterThan(0.3) // Should have significant amplitude
			expect(decodedMax).toBeLessThan(0.7) // But not exceed our 0.5 peak by too much
		})

		it('should preserve sample count approximately', () => {
			const original = createTestAudio(8000, 1, 0.1)

			const encoded = encodeMka(original)
			const decoded = decodeMkaAudio(encoded)

			expect(decoded).not.toBeNull()

			// Due to frame boundaries, sample count may differ slightly
			const originalSampleCount = original.data.length / original.channels
			const decodedSampleCount = decoded!.data.length / decoded!.channels

			const diff = Math.abs(originalSampleCount - decodedSampleCount)
			expect(diff).toBeLessThan(originalSampleCount * 0.05) // Within 5%
		})

		it('should handle mono to stereo via options', () => {
			const original = createTestAudio(22050, 1, 0.05)

			const encoded = encodeMka(original, { channels: 2 })
			const decoded = decodeMka(encoded)

			expect(decoded.info.channels).toBe(2)
		})
	})

	describe('edge cases', () => {
		it('should handle very short audio', () => {
			const audio = createTestAudio(8000, 1, 0.01) // 10ms

			const encoded = encodeMka(audio)
			const decoded = decodeMka(encoded)

			expect(decoded.info.sampleRate).toBe(8000)
		})

		it('should handle different bit depths', () => {
			const audio = createTestAudio(8000, 1, 0.05)

			for (const bitDepth of [8, 16, 24]) {
				const encoded = encodeMka(audio, { bitDepth })
				const info = parseMkaInfo(encoded)

				expect(info.tracks[0]?.audio.bitDepth).toBe(bitDepth)
			}
		})

		it('should handle high sample rates', () => {
			const audio = createTestAudio(96000, 2, 0.05)

			const encoded = encodeMka(audio)
			const decoded = decodeMka(encoded)

			expect(decoded.info.sampleRate).toBe(96000)
		})

		it('should encode and decode maximum amplitude', () => {
			const sampleRate = 8000
			const channels = 1
			const data = new Float32Array(80) // 10ms at 8kHz
			data.fill(1.0) // Maximum positive amplitude

			const audio: AudioData = { sampleRate, channels, data }
			const encoded = encodeMka(audio)
			const decoded = decodeMkaAudio(encoded)

			expect(decoded).not.toBeNull()
			const max = Math.max(...Array.from(decoded!.data))
			expect(max).toBeGreaterThan(0.9) // Should be close to 1.0 (with quantization)
		})

		it('should encode and decode minimum amplitude', () => {
			const sampleRate = 8000
			const channels = 1
			const data = new Float32Array(80) // 10ms at 8kHz
			data.fill(-1.0) // Maximum negative amplitude

			const audio: AudioData = { sampleRate, channels, data }
			const encoded = encodeMka(audio)
			const decoded = decodeMkaAudio(encoded)

			expect(decoded).not.toBeNull()
			const min = Math.min(...Array.from(decoded!.data))
			expect(min).toBeLessThan(-0.9) // Should be close to -1.0 (with quantization)
		})
	})
})

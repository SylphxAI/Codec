import { describe, expect, it } from 'bun:test'
import type { AudioData } from '@sylphx/codec-core'
import { decodeM4a, decodeM4aAudio, encodeM4a, isM4a, parseM4aInfo } from './index'

describe('M4A Codec', () => {
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

	describe('isM4a', () => {
		it('should identify M4A files', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio)
			expect(isM4a(m4a)).toBe(true)
		})

		it('should reject non-M4A files', () => {
			expect(isM4a(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isM4a(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isM4a(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
		})

		it('should handle short data', () => {
			expect(isM4a(new Uint8Array([]))).toBe(false)
			expect(isM4a(new Uint8Array([0, 0, 0, 8]))).toBe(false)
		})

		it('should detect M4A brand', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio, { brand: 'M4A ' })
			expect(isM4a(m4a)).toBe(true)
		})

		it('should detect mp42 brand', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio, { brand: 'mp42' })
			expect(isM4a(m4a)).toBe(true)
		})
	})

	describe('parseM4aInfo', () => {
		it('should parse stereo 44.1kHz info', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio)

			const info = parseM4aInfo(m4a)

			expect(info.sampleRate).toBe(44100)
			expect(info.channels).toBe(2)
			expect(info.codec).toBe('mp4a')
		})

		it('should parse mono 48kHz info', () => {
			const audio = createSineWave(48000, 0.1, 1000, 1)
			const m4a = encodeM4a(audio, { sampleRate: 48000 })

			const info = parseM4aInfo(m4a)

			expect(info.sampleRate).toBe(48000)
			expect(info.channels).toBe(1)
		})

		it('should parse ftyp brand', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio)

			const info = parseM4aInfo(m4a)

			expect(info.ftyp.majorBrand).toBe('M4A ')
		})

		it('should have audio track', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio)

			const info = parseM4aInfo(m4a)

			expect(info.audioTrack).toBeDefined()
			expect(info.audioTrack?.codec).toBe('mp4a')
		})

		it('should parse duration', () => {
			const audio = createSineWave(44100, 1.0, 440, 2)
			const m4a = encodeM4a(audio)

			const info = parseM4aInfo(m4a)

			// Duration should be approximately 1 second
			expect(info.duration).toBeGreaterThan(0.9)
			expect(info.duration).toBeLessThan(1.1)
		})

		it('should parse bitrate', () => {
			const audio = createSineWave(44100, 0.5, 440, 2)
			const m4a = encodeM4a(audio, { bitrate: 192 })

			const info = parseM4aInfo(m4a)

			expect(info.bitrate).toBeDefined()
			expect(info.bitrate).toBeGreaterThan(0)
		})
	})

	describe('encodeM4a', () => {
		it('should encode mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1)
			const m4a = encodeM4a(audio)

			expect(isM4a(m4a)).toBe(true)
			expect(m4a.length).toBeGreaterThan(100)
		})

		it('should encode stereo audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio)

			expect(isM4a(m4a)).toBe(true)
			expect(m4a.length).toBeGreaterThan(100)
		})

		it('should encode with custom sample rate', () => {
			const audio = createSineWave(48000, 0.1, 440, 2)
			const m4a = encodeM4a(audio, { sampleRate: 48000 })

			const info = parseM4aInfo(m4a)
			expect(info.sampleRate).toBe(48000)
		})

		it('should encode with custom brand', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio, { brand: 'mp42' })

			const info = parseM4aInfo(m4a)
			expect(info.ftyp.majorBrand).toBe('mp42')
		})

		it('should throw on empty audio', () => {
			const audio: AudioData = {
				samples: [new Float32Array(0)],
				sampleRate: 44100,
				channels: 1,
			}
			expect(() => encodeM4a(audio)).toThrow('No audio samples to encode')
		})
	})

	describe('decodeM4a', () => {
		it('should decode M4A container', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio)
			const decoded = decodeM4a(m4a)

			expect(decoded.info.sampleRate).toBe(44100)
			expect(decoded.info.channels).toBe(2)
		})

		it('should have mdat data', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio)
			const decoded = decodeM4a(m4a)

			expect(decoded.mdatData).toBeDefined()
			expect(decoded.mdatData!.length).toBeGreaterThan(0)
		})

		it('should parse boxes', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio)
			const decoded = decodeM4a(m4a)

			expect(decoded.boxes.length).toBeGreaterThan(0)
			// Should have ftyp, moov, mdat
			const types = decoded.boxes.map((b) => b.type)
			expect(types).toContain('ftyp')
			expect(types).toContain('moov')
			expect(types).toContain('mdat')
		})

		it('should parse audio track', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio)
			const decoded = decodeM4a(m4a)

			expect(decoded.info.audioTrack).toBeDefined()
			expect(decoded.info.audioTrack?.channelCount).toBe(2)
		})
	})

	describe('decodeM4aAudio', () => {
		it('should decode to AudioData structure', () => {
			const audio = createSineWave(44100, 0.1, 440, 2)
			const m4a = encodeM4a(audio)
			const decoded = decodeM4aAudio(m4a)

			expect(decoded.sampleRate).toBe(44100)
			expect(decoded.channels).toBe(2)
			expect(decoded.samples.length).toBe(2)
		})

		it('should handle mono audio', () => {
			const audio = createSineWave(44100, 0.1, 440, 1)
			const m4a = encodeM4a(audio)
			const decoded = decodeM4aAudio(m4a)

			expect(decoded.channels).toBe(1)
			expect(decoded.samples.length).toBe(1)
		})
	})

	describe('roundtrip', () => {
		it('should preserve metadata', () => {
			const original = createSineWave(44100, 0.2, 440, 2)

			const encoded = encodeM4a(original)
			const decoded = decodeM4a(encoded)

			expect(decoded.info.sampleRate).toBe(44100)
			expect(decoded.info.channels).toBe(2)
		})

		it('should handle different sample rates', () => {
			for (const sampleRate of [22050, 44100, 48000]) {
				const original = createSineWave(sampleRate, 0.1, 440, 2)
				const encoded = encodeM4a(original, { sampleRate })
				const decoded = decodeM4a(encoded)

				expect(decoded.info.sampleRate).toBe(sampleRate)
			}
		})

		it('should handle different channel counts', () => {
			for (const channels of [1, 2]) {
				const original = createSineWave(44100, 0.1, 440, channels)
				const encoded = encodeM4a(original)
				const decoded = decodeM4a(encoded)

				expect(decoded.info.channels).toBe(channels)
			}
		})

		it('should preserve codec format', () => {
			const original = createSineWave(44100, 0.1, 440, 2)

			const encoded = encodeM4a(original, { codec: 'aac' })
			const decoded = decodeM4a(encoded)

			expect(decoded.info.codec).toBe('mp4a')
		})

		it('should have valid box structure', () => {
			const original = createSineWave(44100, 0.1, 440, 2)

			const encoded = encodeM4a(original)
			const decoded = decodeM4a(encoded)

			// Verify essential boxes exist
			const hasRequiredBoxes = (boxes: any[]): boolean => {
				const types = new Set(boxes.map((b) => b.type))
				return types.has('ftyp') && types.has('moov') && types.has('mdat')
			}

			expect(hasRequiredBoxes(decoded.boxes)).toBe(true)
		})
	})

	describe('error handling', () => {
		it('should throw on invalid M4A data', () => {
			const invalid = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])
			expect(() => parseM4aInfo(invalid)).toThrow()
		})

		it('should throw on missing moov box', () => {
			// Create minimal ftyp only
			const ftyp = new Uint8Array(20)
			ftyp[3] = 20 // size
			ftyp[4] = 0x66 // 'f'
			ftyp[5] = 0x74 // 't'
			ftyp[6] = 0x79 // 'y'
			ftyp[7] = 0x70 // 'p'
			expect(() => parseM4aInfo(ftyp)).toThrow('Invalid M4A: missing moov box')
		})

		it('should throw on missing audio track', () => {
			// This would require creating a valid M4A without audio track
			// For now, we test with completely invalid data
			const invalid = new Uint8Array(100)
			// Set up minimal structure that passes initial checks but has no audio
			invalid[3] = 20 // ftyp size
			invalid[4] = 0x66 // 'f'
			invalid[5] = 0x74 // 't'
			invalid[6] = 0x79 // 'y'
			invalid[7] = 0x70 // 'p'
			expect(() => parseM4aInfo(invalid)).toThrow()
		})
	})
})

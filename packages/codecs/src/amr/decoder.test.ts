import { describe, expect, it } from 'bun:test'
import {
	decodeAmr,
	encodeAmr,
	encodeAmrFromPcm,
	getAmrVariant,
	isAmr,
	parseAmrInfo,
	createSilenceFrame,
	validateAmrFrame,
	AmrVariant,
	AMR_NB_SAMPLES_PER_FRAME,
	AMR_WB_SAMPLES_PER_FRAME,
	AMR_NB_FRAME_SIZES,
	AMR_WB_FRAME_SIZES,
	type AmrFrame,
} from './index'

describe('AMR Codec', () => {
	describe('isAmr', () => {
		it('should identify AMR-NB files', () => {
			const frames = [createSilenceFrame(AmrVariant.NB, 7)]
			const amr = encodeAmr(frames, { variant: AmrVariant.NB })
			expect(isAmr(amr)).toBe(true)
		})

		it('should identify AMR-WB files', () => {
			const frames = [createSilenceFrame(AmrVariant.WB, 8)]
			const amr = encodeAmr(frames, { variant: AmrVariant.WB })
			expect(isAmr(amr)).toBe(true)
		})

		it('should reject non-AMR files', () => {
			expect(isAmr(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isAmr(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF
		})

		it('should handle short data', () => {
			expect(isAmr(new Uint8Array([]))).toBe(false)
			expect(isAmr(new Uint8Array([0x23, 0x21, 0x41]))).toBe(false) // Just "#!A"
		})
	})

	describe('getAmrVariant', () => {
		it('should detect AMR-NB', () => {
			const frames = [createSilenceFrame(AmrVariant.NB, 7)]
			const amr = encodeAmr(frames, { variant: AmrVariant.NB })
			expect(getAmrVariant(amr)).toBe(AmrVariant.NB)
		})

		it('should detect AMR-WB', () => {
			const frames = [createSilenceFrame(AmrVariant.WB, 8)]
			const amr = encodeAmr(frames, { variant: AmrVariant.WB })
			expect(getAmrVariant(amr)).toBe(AmrVariant.WB)
		})

		it('should return null for non-AMR', () => {
			expect(getAmrVariant(new Uint8Array([0, 0, 0, 0]))).toBeNull()
		})
	})

	describe('createSilenceFrame', () => {
		it('should create valid NB silence frame', () => {
			const frame = createSilenceFrame(AmrVariant.NB, 7)
			expect(frame.mode).toBe(7)
			expect(frame.data.length).toBe(AMR_NB_FRAME_SIZES[7])
		})

		it('should create valid WB silence frame', () => {
			const frame = createSilenceFrame(AmrVariant.WB, 8)
			expect(frame.mode).toBe(8)
			expect(frame.data.length).toBe(AMR_WB_FRAME_SIZES[8])
		})

		it('should create frames for all NB modes', () => {
			for (let mode = 0; mode < 8; mode++) {
				const frame = createSilenceFrame(AmrVariant.NB, mode)
				expect(frame.mode).toBe(mode)
				expect(frame.data.length).toBe(AMR_NB_FRAME_SIZES[mode])
			}
		})

		it('should create frames for all WB modes', () => {
			for (let mode = 0; mode < 9; mode++) {
				const frame = createSilenceFrame(AmrVariant.WB, mode)
				expect(frame.mode).toBe(mode)
				expect(frame.data.length).toBe(AMR_WB_FRAME_SIZES[mode])
			}
		})

		it('should throw for invalid mode', () => {
			expect(() => createSilenceFrame(AmrVariant.NB, 16)).toThrow()
		})
	})

	describe('validateAmrFrame', () => {
		it('should validate correct NB frame', () => {
			const frame = createSilenceFrame(AmrVariant.NB, 7)
			expect(validateAmrFrame(frame, AmrVariant.NB)).toBe(true)
		})

		it('should validate correct WB frame', () => {
			const frame = createSilenceFrame(AmrVariant.WB, 8)
			expect(validateAmrFrame(frame, AmrVariant.WB)).toBe(true)
		})

		it('should reject frame with wrong size', () => {
			const frame: AmrFrame = { mode: 7, data: new Uint8Array(10) }
			expect(validateAmrFrame(frame, AmrVariant.NB)).toBe(false)
		})

		it('should reject frame with invalid mode', () => {
			const frame: AmrFrame = { mode: 16, data: new Uint8Array(31) }
			expect(validateAmrFrame(frame, AmrVariant.NB)).toBe(false)
		})
	})

	describe('encodeAmr', () => {
		it('should encode AMR-NB with magic header', () => {
			const frames = [createSilenceFrame(AmrVariant.NB, 7)]
			const amr = encodeAmr(frames, { variant: AmrVariant.NB })

			// Check magic
			const magic = new TextDecoder('ascii').decode(amr.slice(0, 6))
			expect(magic).toBe('#!AMR\n')
		})

		it('should encode AMR-WB with magic header', () => {
			const frames = [createSilenceFrame(AmrVariant.WB, 8)]
			const amr = encodeAmr(frames, { variant: AmrVariant.WB })

			// Check magic
			const magic = new TextDecoder('ascii').decode(amr.slice(0, 9))
			expect(magic).toBe('#!AMR-WB\n')
		})

		it('should encode multiple frames', () => {
			const frames = [
				createSilenceFrame(AmrVariant.NB, 7),
				createSilenceFrame(AmrVariant.NB, 7),
				createSilenceFrame(AmrVariant.NB, 7),
			]
			const amr = encodeAmr(frames, { variant: AmrVariant.NB })

			expect(isAmr(amr)).toBe(true)
			const info = parseAmrInfo(amr)
			expect(info.frameCount).toBe(3)
		})

		it('should encode frames with different modes', () => {
			const frames = [
				createSilenceFrame(AmrVariant.NB, 0),
				createSilenceFrame(AmrVariant.NB, 4),
				createSilenceFrame(AmrVariant.NB, 7),
			]
			const amr = encodeAmr(frames, { variant: AmrVariant.NB })

			const decoded = decodeAmr(amr)
			expect(decoded.frames[0]!.mode).toBe(0)
			expect(decoded.frames[1]!.mode).toBe(4)
			expect(decoded.frames[2]!.mode).toBe(7)
		})

		it('should throw for invalid frame mode', () => {
			const frames: AmrFrame[] = [{ mode: 16, data: new Uint8Array(31) }]
			expect(() => encodeAmr(frames, { variant: AmrVariant.NB })).toThrow()
		})

		it('should throw for invalid frame size', () => {
			const frames: AmrFrame[] = [{ mode: 7, data: new Uint8Array(10) }]
			expect(() => encodeAmr(frames, { variant: AmrVariant.NB })).toThrow()
		})
	})

	describe('parseAmrInfo', () => {
		it('should parse AMR-NB info', () => {
			const frames = [
				createSilenceFrame(AmrVariant.NB, 7),
				createSilenceFrame(AmrVariant.NB, 7),
			]
			const amr = encodeAmr(frames, { variant: AmrVariant.NB })
			const info = parseAmrInfo(amr)

			expect(info.variant).toBe(AmrVariant.NB)
			expect(info.sampleRate).toBe(8000)
			expect(info.numChannels).toBe(1)
			expect(info.frameCount).toBe(2)
			expect(info.duration).toBeCloseTo(0.04, 3) // 2 frames * 20ms
			expect(info.bitrate).toBeGreaterThan(0)
		})

		it('should parse AMR-WB info', () => {
			const frames = [
				createSilenceFrame(AmrVariant.WB, 8),
				createSilenceFrame(AmrVariant.WB, 8),
				createSilenceFrame(AmrVariant.WB, 8),
			]
			const amr = encodeAmr(frames, { variant: AmrVariant.WB })
			const info = parseAmrInfo(amr)

			expect(info.variant).toBe(AmrVariant.WB)
			expect(info.sampleRate).toBe(16000)
			expect(info.numChannels).toBe(1)
			expect(info.frameCount).toBe(3)
			expect(info.duration).toBeCloseTo(0.06, 3) // 3 frames * 20ms
		})

		it('should calculate correct duration', () => {
			const frameCount = 50 // 1 second worth of frames
			const frames = Array.from({ length: frameCount }, () =>
				createSilenceFrame(AmrVariant.NB, 7)
			)
			const amr = encodeAmr(frames, { variant: AmrVariant.NB })
			const info = parseAmrInfo(amr)

			expect(info.duration).toBeCloseTo(1.0, 1)
		})
	})

	describe('decodeAmr', () => {
		it('should decode AMR-NB frames', () => {
			const frames = [
				createSilenceFrame(AmrVariant.NB, 7),
				createSilenceFrame(AmrVariant.NB, 7),
			]
			const amr = encodeAmr(frames, { variant: AmrVariant.NB })
			const decoded = decodeAmr(amr)

			expect(decoded.info.variant).toBe(AmrVariant.NB)
			expect(decoded.frames.length).toBe(2)
			expect(decoded.frames[0]!.mode).toBe(7)
			expect(decoded.frames[0]!.data.length).toBe(AMR_NB_FRAME_SIZES[7])
		})

		it('should decode AMR-WB frames', () => {
			const frames = [
				createSilenceFrame(AmrVariant.WB, 8),
				createSilenceFrame(AmrVariant.WB, 8),
			]
			const amr = encodeAmr(frames, { variant: AmrVariant.WB })
			const decoded = decodeAmr(amr)

			expect(decoded.info.variant).toBe(AmrVariant.WB)
			expect(decoded.frames.length).toBe(2)
			expect(decoded.frames[0]!.mode).toBe(8)
		})

		it('should preserve frame data', () => {
			const originalData = new Uint8Array(AMR_NB_FRAME_SIZES[7]!)
			for (let i = 0; i < originalData.length; i++) {
				originalData[i] = i % 256
			}

			const frames: AmrFrame[] = [{ mode: 7, data: originalData }]
			const amr = encodeAmr(frames, { variant: AmrVariant.NB })
			const decoded = decodeAmr(amr)

			expect(decoded.frames[0]!.data).toEqual(originalData)
		})
	})

	describe('encodeAmrFromPcm', () => {
		it('should encode NB from PCM samples', () => {
			const samples = new Float32Array(AMR_NB_SAMPLES_PER_FRAME * 2) // 2 frames
			const amr = encodeAmrFromPcm(samples, { variant: AmrVariant.NB, mode: 7 })

			expect(isAmr(amr)).toBe(true)
			const info = parseAmrInfo(amr)
			expect(info.variant).toBe(AmrVariant.NB)
			expect(info.frameCount).toBe(2)
		})

		it('should encode WB from PCM samples', () => {
			const samples = new Float32Array(AMR_WB_SAMPLES_PER_FRAME * 3) // 3 frames
			const amr = encodeAmrFromPcm(samples, { variant: AmrVariant.WB, mode: 8 })

			expect(isAmr(amr)).toBe(true)
			const info = parseAmrInfo(amr)
			expect(info.variant).toBe(AmrVariant.WB)
			expect(info.frameCount).toBe(3)
		})

		it('should handle partial frames', () => {
			const samples = new Float32Array(AMR_NB_SAMPLES_PER_FRAME + 50) // 1.3 frames
			const amr = encodeAmrFromPcm(samples, { variant: AmrVariant.NB })

			const info = parseAmrInfo(amr)
			expect(info.frameCount).toBe(2) // Should round up
		})

		it('should use default parameters', () => {
			const samples = new Float32Array(AMR_NB_SAMPLES_PER_FRAME)
			const amr = encodeAmrFromPcm(samples)

			expect(isAmr(amr)).toBe(true)
			const info = parseAmrInfo(amr)
			expect(info.variant).toBe(AmrVariant.NB) // Default
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip AMR-NB frames', () => {
			const original = [
				createSilenceFrame(AmrVariant.NB, 0),
				createSilenceFrame(AmrVariant.NB, 4),
				createSilenceFrame(AmrVariant.NB, 7),
			]

			const encoded = encodeAmr(original, { variant: AmrVariant.NB })
			const decoded = decodeAmr(encoded)

			expect(decoded.frames.length).toBe(original.length)
			for (let i = 0; i < original.length; i++) {
				expect(decoded.frames[i]!.mode).toBe(original[i]!.mode)
				expect(decoded.frames[i]!.data).toEqual(original[i]!.data)
			}
		})

		it('should roundtrip AMR-WB frames', () => {
			const original = [
				createSilenceFrame(AmrVariant.WB, 0),
				createSilenceFrame(AmrVariant.WB, 4),
				createSilenceFrame(AmrVariant.WB, 8),
			]

			const encoded = encodeAmr(original, { variant: AmrVariant.WB })
			const decoded = decodeAmr(encoded)

			expect(decoded.frames.length).toBe(original.length)
			for (let i = 0; i < original.length; i++) {
				expect(decoded.frames[i]!.mode).toBe(original[i]!.mode)
				expect(decoded.frames[i]!.data).toEqual(original[i]!.data)
			}
		})

		it('should preserve frame data through roundtrip', () => {
			// Create frame with specific data pattern
			const frameData = new Uint8Array(AMR_NB_FRAME_SIZES[7]!)
			for (let i = 0; i < frameData.length; i++) {
				frameData[i] = (i * 17) % 256
			}

			const original: AmrFrame[] = [{ mode: 7, data: frameData }]
			const encoded = encodeAmr(original, { variant: AmrVariant.NB })
			const decoded = decodeAmr(encoded)

			expect(decoded.frames[0]!.data).toEqual(frameData)
		})
	})
})

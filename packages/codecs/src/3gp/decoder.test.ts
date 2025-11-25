import { describe, expect, it } from 'bun:test'
import type { VideoData } from '@sylphx/codec-core'
import {
	decode3GP,
	decode3GPToVideo,
	encode3GP,
	is3GP,
	parse3GPInfo,
} from './index'

describe('3GP Codec', () => {
	// Create test VideoData with solid color frames
	function createTestVideoData(
		width: number,
		height: number,
		frameCount: number,
		color: number[]
	): VideoData {
		const frames = []
		for (let i = 0; i < frameCount; i++) {
			const data = new Uint8Array(width * height * 4)
			for (let j = 0; j < width * height; j++) {
				data[j * 4] = color[0]!
				data[j * 4 + 1] = color[1]!
				data[j * 4 + 2] = color[2]!
				data[j * 4 + 3] = 255
			}
			frames.push({ data })
		}
		return {
			width,
			height,
			frameRate: 15,
			frameCount,
			duration: frameCount / 15,
			codec: 'h263',
			hasAudio: false,
			frames,
		}
	}

	// Create gradient frame
	function createGradientVideoData(
		width: number,
		height: number,
		frameCount: number
	): VideoData {
		const frames = []
		for (let f = 0; f < frameCount; f++) {
			const data = new Uint8Array(width * height * 4)
			const hue = (f / frameCount) * 255
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const i = (y * width + x) * 4
					data[i] = Math.round((x / width) * 255)
					data[i + 1] = Math.round((y / height) * 255)
					data[i + 2] = Math.round(hue)
					data[i + 3] = 255
				}
			}
			frames.push({ data })
		}
		return {
			width,
			height,
			frameRate: 15,
			frameCount,
			duration: frameCount / 15,
			codec: 'h263',
			hasAudio: false,
			frames,
		}
	}

	describe('is3GP', () => {
		it('should identify 3GP files', () => {
			const video = createTestVideoData(176, 144, 1, [255, 0, 0])
			const threegp = encode3GP(video)
			expect(is3GP(threegp)).toBe(true)
		})

		it('should identify 3GP with different brands', () => {
			const video = createTestVideoData(176, 144, 1, [255, 0, 0])
			const threegp = encode3GP(video, { brand: '3gp5' })
			expect(is3GP(threegp)).toBe(true)
		})

		it('should reject non-3GP files', () => {
			expect(is3GP(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(is3GP(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(is3GP(new Uint8Array([]))).toBe(false)
			expect(is3GP(new Uint8Array([0, 0, 0, 8]))).toBe(false)
		})
	})

	describe('parse3GPInfo', () => {
		it('should parse 3GP info', () => {
			const video = createTestVideoData(176, 144, 3, [255, 0, 0])
			const threegp = encode3GP(video)

			const info = parse3GPInfo(threegp)

			expect(info.width).toBe(176)
			expect(info.height).toBe(144)
			expect(info.hasVideo).toBe(true)
		})

		it('should parse ftyp brand', () => {
			const video = createTestVideoData(176, 144, 1, [255, 0, 0])
			const threegp = encode3GP(video)

			const info = parse3GPInfo(threegp)

			expect(info.ftyp.majorBrand).toBe('3gp6')
		})

		it('should parse custom brand', () => {
			const video = createTestVideoData(176, 144, 1, [255, 0, 0])
			const threegp = encode3GP(video, { brand: '3gp5' })

			const info = parse3GPInfo(threegp)

			expect(info.ftyp.majorBrand).toBe('3gp5')
		})

		it('should have video track', () => {
			const video = createTestVideoData(176, 144, 1, [255, 0, 0])
			const threegp = encode3GP(video)

			const info = parse3GPInfo(threegp)

			expect(info.videoTrack).toBeDefined()
			expect(info.videoTrack?.codec).toBe('s263')
		})

		it('should calculate frame rate', () => {
			const video = createTestVideoData(176, 144, 3, [255, 0, 0])
			const threegp = encode3GP(video, { frameRate: 15 })

			const info = parse3GPInfo(threegp)

			expect(info.frameRate).toBeCloseTo(15, 0)
		})
	})

	describe('encode3GP', () => {
		it('should encode single frame', () => {
			const video = createTestVideoData(176, 144, 1, [255, 0, 0])
			const threegp = encode3GP(video)

			expect(is3GP(threegp)).toBe(true)
			expect(threegp.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const video = createTestVideoData(176, 144, 3, [255, 0, 0])
			const threegp = encode3GP(video)

			expect(is3GP(threegp)).toBe(true)
		})

		it('should encode with custom options', () => {
			const video = createTestVideoData(176, 144, 2, [128, 128, 128])
			const threegp = encode3GP(video, {
				frameRate: 10,
				brand: '3gp5',
				maxWidth: 128,
				maxHeight: 96,
			})

			expect(is3GP(threegp)).toBe(true)
		})

		it('should respect max dimensions', () => {
			const video = createTestVideoData(320, 240, 1, [255, 0, 0])
			const threegp = encode3GP(video, { maxWidth: 176, maxHeight: 144 })

			const info = parse3GPInfo(threegp)

			expect(info.width).toBe(176)
			expect(info.height).toBe(144)
		})

		it('should handle mobile-typical dimensions', () => {
			const dimensions = [
				[176, 144], // QCIF
				[128, 96], // Sub-QCIF
			]

			for (const [width, height] of dimensions) {
				const video = createTestVideoData(width, height, 1, [128, 64, 192])
				const threegp = encode3GP(video)

				expect(is3GP(threegp)).toBe(true)
			}
		})
	})

	describe('decode3GP', () => {
		it('should decode 3GP video', () => {
			const original = createTestVideoData(176, 144, 2, [255, 0, 0])
			const threegp = encode3GP(original)
			const decoded = decode3GP(threegp)

			expect(decoded.info.width).toBe(176)
			expect(decoded.info.height).toBe(144)
			expect(decoded.info.hasVideo).toBe(true)
		})

		it('should have mdat data', () => {
			const video = createTestVideoData(176, 144, 1, [255, 255, 255])
			const threegp = encode3GP(video)
			const decoded = decode3GP(threegp)

			expect(decoded.mdatData).toBeDefined()
			expect(decoded.mdatData!.length).toBeGreaterThan(0)
		})

		it('should parse tracks', () => {
			const video = createTestVideoData(176, 144, 1, [100, 150, 200])
			const threegp = encode3GP(video)
			const decoded = decode3GP(threegp)

			expect(decoded.info.tracks.length).toBe(1)
			expect(decoded.info.tracks[0]?.type).toBe('video')
		})

		it('should parse H.263 codec', () => {
			const video = createTestVideoData(176, 144, 1, [255, 0, 0])
			const threegp = encode3GP(video)
			const decoded = decode3GP(threegp)

			expect(decoded.info.videoTrack?.codec).toBe('s263')
		})
	})

	describe('decode3GPToVideo', () => {
		it('should decode to VideoData', () => {
			const original = createTestVideoData(176, 144, 2, [200, 100, 50])
			const threegp = encode3GP(original)
			const decoded = decode3GPToVideo(threegp)

			expect(decoded.width).toBe(176)
			expect(decoded.height).toBe(144)
			expect(decoded.frameCount).toBe(2)
		})

		it('should include metadata', () => {
			const original = createTestVideoData(176, 144, 3, [255, 0, 0])
			const threegp = encode3GP(original, { frameRate: 15 })
			const decoded = decode3GPToVideo(threegp)

			expect(decoded.frameRate).toBeCloseTo(15, 0)
			expect(decoded.codec).toBe('s263')
			expect(decoded.hasAudio).toBe(false)
		})

		it('should handle duration', () => {
			const original = createTestVideoData(176, 144, 15, [0, 255, 0])
			const threegp = encode3GP(original, { frameRate: 15 })
			const decoded = decode3GPToVideo(threegp)

			expect(decoded.duration).toBeCloseTo(1, 0)
		})
	})

	describe('roundtrip', () => {
		it('should preserve dimensions', () => {
			const original = createTestVideoData(176, 144, 2, [200, 100, 50])

			const encoded = encode3GP(original)
			const decoded = decode3GP(encoded)

			expect(decoded.info.width).toBe(176)
			expect(decoded.info.height).toBe(144)
		})

		it('should preserve frame count', () => {
			const original = createTestVideoData(176, 144, 5, [128, 128, 128])

			const encoded = encode3GP(original)
			const decoded = decode3GPToVideo(encoded)

			expect(decoded.frameCount).toBe(5)
		})

		it('should handle different frame rates', () => {
			for (const frameRate of [10, 15, 20]) {
				const original = createTestVideoData(176, 144, 3, [128, 64, 192])
				const encoded = encode3GP(original, { frameRate })
				const decoded = decode3GPToVideo(encoded)

				expect(decoded.frameRate).toBeCloseTo(frameRate, 0)
			}
		})

		it('should handle small videos', () => {
			const original = createTestVideoData(128, 96, 1, [255, 255, 0])

			const encoded = encode3GP(original)
			const decoded = decode3GP(encoded)

			expect(decoded.info.width).toBe(128)
			expect(decoded.info.height).toBe(96)
		})

		it('should downscale large videos', () => {
			const original = createTestVideoData(320, 240, 1, [0, 255, 255])

			const encoded = encode3GP(original, { maxWidth: 176, maxHeight: 144 })
			const decoded = decode3GP(encoded)

			expect(decoded.info.width).toBe(176)
			expect(decoded.info.height).toBe(144)
		})
	})

	describe('mobile video constraints', () => {
		it('should create QCIF video', () => {
			const video = createTestVideoData(176, 144, 5, [255, 0, 0])
			const threegp = encode3GP(video)
			const decoded = decode3GP(threegp)

			expect(decoded.info.width).toBe(176)
			expect(decoded.info.height).toBe(144)
		})

		it('should use low frame rate', () => {
			const video = createTestVideoData(176, 144, 3, [0, 255, 0])
			const threegp = encode3GP(video, { frameRate: 10 })
			const decoded = decode3GPToVideo(threegp)

			expect(decoded.frameRate).toBeCloseTo(10, 0)
		})

		it('should work with typical mobile settings', () => {
			const video = createTestVideoData(176, 144, 30, [128, 128, 128])
			const threegp = encode3GP(video, {
				frameRate: 15,
				brand: '3gp6',
				maxWidth: 176,
				maxHeight: 144,
			})

			const decoded = decode3GP(threegp)

			expect(decoded.info.width).toBe(176)
			expect(decoded.info.height).toBe(144)
			expect(decoded.info.videoTrack?.sampleCount).toBe(30)
		})
	})

	describe('error handling', () => {
		it('should throw on empty frames', () => {
			const video: VideoData = {
				width: 176,
				height: 144,
				frameRate: 15,
				frameCount: 0,
				duration: 0,
				codec: 'h263',
				hasAudio: false,
				frames: [],
			}

			expect(() => encode3GP(video)).toThrow('No frames to encode')
		})

		it('should throw on invalid 3GP data', () => {
			const invalid = new Uint8Array([0, 0, 0, 8, 'm', 'd', 'a', 't'])
			expect(() => parse3GPInfo(invalid)).toThrow()
		})
	})
})

import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import {
	YuvFormat,
	createYuvStream,
	decodeYuv,
	decodeYuvFrame,
	encodeYuv,
	encodeYuvFrame,
	getYuvFrameSize,
	parseYuvInfo,
	yuvFrameToImage,
} from './index'

describe('YUV Codec', () => {
	// Create test image with solid color
	function createTestImage(width: number, height: number, color: number[]): ImageData {
		const data = new Uint8Array(width * height * 4)
		for (let i = 0; i < width * height; i++) {
			data[i * 4] = color[0]!
			data[i * 4 + 1] = color[1]!
			data[i * 4 + 2] = color[2]!
			data[i * 4 + 3] = 255
		}
		return { width, height, data }
	}

	// Create gradient image
	function createGradientImage(width: number, height: number): ImageData {
		const data = new Uint8Array(width * height * 4)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4
				data[i] = Math.round((x / width) * 255)
				data[i + 1] = Math.round((y / height) * 255)
				data[i + 2] = 128
				data[i + 3] = 255
			}
		}
		return { width, height, data }
	}

	describe('getYuvFrameSize', () => {
		it('should calculate I420 frame size', () => {
			// 16x16: Y=256, U=64, V=64 = 384
			expect(getYuvFrameSize(16, 16, YuvFormat.I420)).toBe(384)
		})

		it('should calculate YV12 frame size', () => {
			expect(getYuvFrameSize(16, 16, YuvFormat.YV12)).toBe(384)
		})

		it('should calculate NV12 frame size', () => {
			expect(getYuvFrameSize(16, 16, YuvFormat.NV12)).toBe(384)
		})

		it('should calculate YUYV frame size', () => {
			// 16x16: 2 bytes per pixel = 512
			expect(getYuvFrameSize(16, 16, YuvFormat.YUYV)).toBe(512)
		})

		it('should calculate YUV444 frame size', () => {
			// 16x16: 3 bytes per pixel = 768
			expect(getYuvFrameSize(16, 16, YuvFormat.YUV444)).toBe(768)
		})
	})

	describe('parseYuvInfo', () => {
		it('should parse YUV info', () => {
			const img = createTestImage(16, 16, [128, 128, 128])
			const yuv = encodeYuv([img, img], { format: YuvFormat.I420 })

			const info = parseYuvInfo(yuv, { width: 16, height: 16, format: YuvFormat.I420 })

			expect(info.width).toBe(16)
			expect(info.height).toBe(16)
			expect(info.format).toBe(YuvFormat.I420)
			expect(info.frameCount).toBe(2)
			expect(info.frameSize).toBe(384)
		})
	})

	describe('encodeYuvFrame', () => {
		it('should encode I420 frame', () => {
			const img = createTestImage(16, 16, [255, 0, 0])
			const yuv = encodeYuvFrame(img, { format: YuvFormat.I420 })

			expect(yuv.length).toBe(384)
		})

		it('should encode YV12 frame', () => {
			const img = createTestImage(16, 16, [0, 255, 0])
			const yuv = encodeYuvFrame(img, { format: YuvFormat.YV12 })

			expect(yuv.length).toBe(384)
		})

		it('should encode NV12 frame', () => {
			const img = createTestImage(16, 16, [0, 0, 255])
			const yuv = encodeYuvFrame(img, { format: YuvFormat.NV12 })

			expect(yuv.length).toBe(384)
		})

		it('should encode NV21 frame', () => {
			const img = createTestImage(16, 16, [255, 255, 0])
			const yuv = encodeYuvFrame(img, { format: YuvFormat.NV21 })

			expect(yuv.length).toBe(384)
		})

		it('should encode YUYV frame', () => {
			const img = createTestImage(16, 16, [255, 0, 255])
			const yuv = encodeYuvFrame(img, { format: YuvFormat.YUYV })

			expect(yuv.length).toBe(512)
		})

		it('should encode UYVY frame', () => {
			const img = createTestImage(16, 16, [0, 255, 255])
			const yuv = encodeYuvFrame(img, { format: YuvFormat.UYVY })

			expect(yuv.length).toBe(512)
		})

		it('should encode YUV444 frame', () => {
			const img = createTestImage(16, 16, [128, 128, 128])
			const yuv = encodeYuvFrame(img, { format: YuvFormat.YUV444 })

			expect(yuv.length).toBe(768)
		})
	})

	describe('encodeYuv', () => {
		it('should encode multiple frames', () => {
			const frames = [
				createTestImage(16, 16, [255, 0, 0]),
				createTestImage(16, 16, [0, 255, 0]),
				createTestImage(16, 16, [0, 0, 255]),
			]
			const yuv = encodeYuv(frames, { format: YuvFormat.I420 })

			expect(yuv.length).toBe(384 * 3)
		})

		it('should handle empty input', () => {
			const yuv = encodeYuv([])
			expect(yuv.length).toBe(0)
		})
	})

	describe('decodeYuvFrame', () => {
		it('should decode I420 frame', () => {
			const img = createTestImage(16, 16, [200, 100, 50])
			const yuv = encodeYuvFrame(img, { format: YuvFormat.I420 })
			const decoded = decodeYuvFrame(yuv, { width: 16, height: 16, format: YuvFormat.I420 })

			expect(decoded.width).toBe(16)
			expect(decoded.height).toBe(16)
			expect(decoded.data.length).toBe(16 * 16 * 4)
		})

		it('should decode YUV444 frame', () => {
			const img = createTestImage(16, 16, [100, 150, 200])
			const yuv = encodeYuvFrame(img, { format: YuvFormat.YUV444 })
			const decoded = decodeYuvFrame(yuv, { width: 16, height: 16, format: YuvFormat.YUV444 })

			expect(decoded.width).toBe(16)
			expect(decoded.height).toBe(16)
		})
	})

	describe('decodeYuv', () => {
		it('should decode YUV stream', () => {
			const frames = [createTestImage(16, 16, [255, 0, 0]), createTestImage(16, 16, [0, 255, 0])]
			const yuv = encodeYuv(frames, { format: YuvFormat.I420 })
			const stream = decodeYuv(yuv, { width: 16, height: 16, format: YuvFormat.I420 })

			expect(stream.info.frameCount).toBe(2)
			expect(stream.frames.length).toBe(2)
		})
	})

	describe('yuvFrameToImage', () => {
		it('should convert frame to image', () => {
			const img = createTestImage(16, 16, [128, 128, 128])
			const yuv = encodeYuv([img], { format: YuvFormat.I420 })
			const stream = decodeYuv(yuv, { width: 16, height: 16, format: YuvFormat.I420 })

			const image = yuvFrameToImage(stream.frames[0]!, stream.info)

			expect(image.width).toBe(16)
			expect(image.height).toBe(16)
		})
	})

	describe('createYuvStream', () => {
		it('should create stream object', () => {
			const frames = [createTestImage(16, 16, [255, 0, 0]), createTestImage(16, 16, [0, 255, 0])]
			const stream = createYuvStream(frames, { format: YuvFormat.I420 })

			expect(stream.info.width).toBe(16)
			expect(stream.info.height).toBe(16)
			expect(stream.info.frameCount).toBe(2)
			expect(stream.frames.length).toBe(2)
		})

		it('should handle empty input', () => {
			const stream = createYuvStream([])

			expect(stream.info.frameCount).toBe(0)
			expect(stream.frames.length).toBe(0)
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip I420', () => {
			const original = createTestImage(16, 16, [200, 100, 50])
			const yuv = encodeYuvFrame(original, { format: YuvFormat.I420 })
			const decoded = decodeYuvFrame(yuv, { width: 16, height: 16, format: YuvFormat.I420 })

			// YUV conversion has some loss, check approximate values
			expect(decoded.data[0]).toBeGreaterThan(150)
			expect(decoded.data[0]).toBeLessThan(250)
		})

		it('should roundtrip YUV444 with better precision', () => {
			const original = createTestImage(16, 16, [128, 128, 128])
			const yuv = encodeYuvFrame(original, { format: YuvFormat.YUV444 })
			const decoded = decodeYuvFrame(yuv, { width: 16, height: 16, format: YuvFormat.YUV444 })

			// YUV444 has no chroma subsampling, should be closer
			expect(Math.abs(decoded.data[0]! - 128)).toBeLessThan(20)
			expect(Math.abs(decoded.data[1]! - 128)).toBeLessThan(20)
			expect(Math.abs(decoded.data[2]! - 128)).toBeLessThan(20)
		})

		it('should roundtrip YUYV', () => {
			const original = createTestImage(16, 16, [100, 150, 200])
			const yuv = encodeYuvFrame(original, { format: YuvFormat.YUYV })
			const decoded = decodeYuvFrame(yuv, { width: 16, height: 16, format: YuvFormat.YUYV })

			expect(decoded.width).toBe(16)
			expect(decoded.height).toBe(16)
		})

		it('should roundtrip multiple frames', () => {
			const frames = [
				createTestImage(16, 16, [255, 0, 0]),
				createTestImage(16, 16, [0, 255, 0]),
				createTestImage(16, 16, [0, 0, 255]),
			]

			for (const format of [YuvFormat.I420, YuvFormat.NV12, YuvFormat.YUYV] as const) {
				const yuv = encodeYuv(frames, { format })
				const stream = decodeYuv(yuv, { width: 16, height: 16, format })

				expect(stream.frames.length).toBe(3)
			}
		})

		it('should handle gradient images', () => {
			const original = createGradientImage(32, 32)
			const yuv = encodeYuvFrame(original, { format: YuvFormat.I420 })
			const decoded = decodeYuvFrame(yuv, { width: 32, height: 32, format: YuvFormat.I420 })

			expect(decoded.width).toBe(32)
			expect(decoded.height).toBe(32)
		})
	})
})

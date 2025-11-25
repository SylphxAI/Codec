import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import {
	decodeY4m,
	decodeY4mFrame,
	decodeY4mFrames,
	encodeY4m,
	encodeY4mFrames,
	isY4m,
	parseY4mHeader,
	parseY4mInfo,
	Y4mColorSpace,
	Y4mInterlace,
} from './index'

describe('Y4M Codec', () => {
	// Create test frame with solid color
	function createTestFrame(width: number, height: number, color: number[]): ImageData {
		const data = new Uint8Array(width * height * 4)
		for (let i = 0; i < width * height; i++) {
			data[i * 4] = color[0]!
			data[i * 4 + 1] = color[1]!
			data[i * 4 + 2] = color[2]!
			data[i * 4 + 3] = 255
		}
		return { width, height, data }
	}

	// Create gradient frame
	function createGradientFrame(width: number, height: number): ImageData {
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

	describe('isY4m', () => {
		it('should identify Y4M files', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const y4m = encodeY4mFrames([frame])
			expect(isY4m(y4m)).toBe(true)
		})

		it('should reject non-Y4M files', () => {
			expect(isY4m(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isY4m(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isY4m(new Uint8Array([]))).toBe(false)
			expect(isY4m(new Uint8Array([0x59, 0x55, 0x56]))).toBe(false) // Just YUV
		})
	})

	describe('parseY4mHeader', () => {
		it('should parse Y4M header', () => {
			const frame = createTestFrame(32, 24, [0, 255, 0])
			const y4m = encodeY4mFrames([frame])

			const header = parseY4mHeader(y4m)

			expect(header.width).toBe(32)
			expect(header.height).toBe(24)
			expect(header.frameRateNum).toBe(30)
			expect(header.frameRateDen).toBe(1)
		})

		it('should parse frame rate', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const y4m = encodeY4mFrames([frame], { frameRate: [24000, 1001] })

			const header = parseY4mHeader(y4m)

			expect(header.frameRateNum).toBe(24000)
			expect(header.frameRateDen).toBe(1001)
		})
	})

	describe('parseY4mInfo', () => {
		it('should parse Y4M info', () => {
			const frames = [
				createTestFrame(32, 24, [255, 0, 0]),
				createTestFrame(32, 24, [0, 255, 0]),
				createTestFrame(32, 24, [0, 0, 255]),
			]
			const y4m = encodeY4mFrames(frames)

			const info = parseY4mInfo(y4m)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.frameCount).toBe(3)
			expect(info.frameRate).toBe(30)
			expect(info.duration).toBeCloseTo(0.1, 2)
		})
	})

	describe('encodeY4mFrames', () => {
		it('should encode frames', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const y4m = encodeY4mFrames([frame])

			expect(isY4m(y4m)).toBe(true)
			expect(y4m.length).toBeGreaterThan(100)
		})

		it('should encode with custom frame rate', () => {
			const frame = createTestFrame(16, 16, [0, 255, 0])
			const y4m = encodeY4mFrames([frame], { frameRate: 60 })

			const header = parseY4mHeader(y4m)
			expect(header.frameRateNum).toBe(60)
		})

		it('should encode with 4:2:2 color space', () => {
			const frame = createTestFrame(16, 16, [0, 0, 255])
			const y4m = encodeY4mFrames([frame], { colorSpace: Y4mColorSpace.C422 })

			const header = parseY4mHeader(y4m)
			expect(header.colorSpace).toBe(Y4mColorSpace.C422)
		})

		it('should encode with 4:4:4 color space', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const y4m = encodeY4mFrames([frame], { colorSpace: Y4mColorSpace.C444 })

			const header = parseY4mHeader(y4m)
			expect(header.colorSpace).toBe(Y4mColorSpace.C444)
		})

		it('should encode mono', () => {
			const frame = createTestFrame(16, 16, [200, 200, 200])
			const y4m = encodeY4mFrames([frame], { colorSpace: Y4mColorSpace.CMONO })

			const header = parseY4mHeader(y4m)
			expect(header.colorSpace).toBe(Y4mColorSpace.CMONO)
		})

		it('should encode interlaced', () => {
			const frame = createTestFrame(16, 16, [100, 150, 200])
			const y4m = encodeY4mFrames([frame], { interlace: Y4mInterlace.TOP_FIRST })

			const header = parseY4mHeader(y4m)
			expect(header.interlace).toBe(Y4mInterlace.TOP_FIRST)
		})
	})

	describe('decodeY4m', () => {
		it('should decode Y4M video', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
			]
			const y4m = encodeY4mFrames(frames)
			const decoded = decodeY4m(y4m)

			expect(decoded.header.width).toBe(16)
			expect(decoded.header.height).toBe(16)
			expect(decoded.frames.length).toBe(2)
		})

		it('should decode frame Y plane', () => {
			const frame = createTestFrame(8, 8, [255, 255, 255])
			const y4m = encodeY4mFrames([frame])
			const decoded = decodeY4m(y4m)

			// White should have high Y values
			expect(decoded.frames[0]!.y[0]).toBeGreaterThan(200)
		})
	})

	describe('decodeY4mFrames', () => {
		it('should decode to RGBA frames', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])
			const y4m = encodeY4mFrames([original])
			const decoded = decodeY4mFrames(y4m)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(16)
			expect(decoded[0]!.height).toBe(16)
		})
	})

	describe('decodeY4mFrame', () => {
		it('should decode specific frame', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const y4m = encodeY4mFrames(frames)

			const frame1 = decodeY4mFrame(y4m, 1)
			expect(frame1.width).toBe(16)
			expect(frame1.height).toBe(16)
		})

		it('should throw for invalid frame index', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const y4m = encodeY4mFrames([frame])

			expect(() => decodeY4mFrame(y4m, 5)).toThrow('Invalid frame index')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip solid color', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])

			const encoded = encodeY4mFrames([original])
			const decoded = decodeY4mFrames(encoded)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(original.width)
			expect(decoded[0]!.height).toBe(original.height)

			// Color should be approximately preserved (YUV conversion may cause slight changes)
			// Check center pixel
			const idx = (8 * 16 + 8) * 4
			expect(decoded[0]!.data[idx]).toBeGreaterThan(150)
			expect(decoded[0]!.data[idx]).toBeLessThan(250)
		})

		it('should roundtrip gradient', () => {
			const original = createGradientFrame(32, 32)

			const encoded = encodeY4mFrames([original])
			const decoded = decodeY4mFrames(encoded)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(32)
			expect(decoded[0]!.height).toBe(32)
		})

		it('should roundtrip multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]

			const encoded = encodeY4mFrames(frames)
			const decoded = decodeY4mFrames(encoded)

			expect(decoded.length).toBe(3)
		})

		it('should roundtrip with 4:2:2', () => {
			const original = createTestFrame(16, 16, [128, 64, 192])

			const encoded = encodeY4mFrames([original], { colorSpace: Y4mColorSpace.C422 })
			const decoded = decodeY4mFrames(encoded)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(16)
		})

		it('should roundtrip with 4:4:4', () => {
			const original = createTestFrame(16, 16, [100, 150, 200])

			const encoded = encodeY4mFrames([original], { colorSpace: Y4mColorSpace.C444 })
			const decoded = decodeY4mFrames(encoded)

			expect(decoded.length).toBe(1)
		})

		it('should roundtrip mono', () => {
			const original = createTestFrame(16, 16, [128, 128, 128])

			const encoded = encodeY4mFrames([original], { colorSpace: Y4mColorSpace.CMONO })
			const decoded = decodeY4mFrames(encoded)

			expect(decoded.length).toBe(1)
		})
	})
})

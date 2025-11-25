import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import {
	decodeAvi,
	decodeAviFrame,
	decodeAviFrames,
	encodeAvi,
	isAvi,
	parseAviInfo,
} from './index'

describe('AVI Codec', () => {
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

	describe('isAvi', () => {
		it('should identify AVI files', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const avi = encodeAvi([frame])
			expect(isAvi(avi)).toBe(true)
		})

		it('should reject non-AVI files', () => {
			expect(isAvi(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isAvi(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isAvi(new Uint8Array([]))).toBe(false)
			expect(isAvi(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // Just RIFF
		})
	})

	describe('parseAviInfo', () => {
		it('should parse AVI info', () => {
			const frames = [
				createTestFrame(32, 24, [255, 0, 0]),
				createTestFrame(32, 24, [0, 255, 0]),
				createTestFrame(32, 24, [0, 0, 255]),
			]
			const avi = encodeAvi(frames)

			const info = parseAviInfo(avi)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.totalFrames).toBe(3)
			expect(info.frameRate).toBe(30)
		})

		it('should parse custom frame rate', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const avi = encodeAvi([frame], { frameRate: 60 })

			const info = parseAviInfo(avi)

			expect(info.frameRate).toBe(60)
		})
	})

	describe('encodeAvi', () => {
		it('should encode single frame', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const avi = encodeAvi([frame])

			expect(isAvi(avi)).toBe(true)
			expect(avi.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const avi = encodeAvi(frames)

			expect(isAvi(avi)).toBe(true)
			const info = parseAviInfo(avi)
			expect(info.totalFrames).toBe(3)
		})

		it('should encode with custom options', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const avi = encodeAvi([frame], { frameRate: 24, jpegQuality: 90 })

			expect(isAvi(avi)).toBe(true)
			const info = parseAviInfo(avi)
			expect(info.frameRate).toBe(24)
		})
	})

	describe('decodeAvi', () => {
		it('should decode AVI video', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
			]
			const avi = encodeAvi(frames)
			const decoded = decodeAvi(avi)

			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)
			expect(decoded.videoFrames.length).toBe(2)
		})

		it('should have non-empty frame data', () => {
			const frame = createTestFrame(8, 8, [255, 255, 255])
			const avi = encodeAvi([frame])
			const decoded = decodeAvi(avi)

			expect(decoded.videoFrames[0]!.length).toBeGreaterThan(0)
		})
	})

	describe('decodeAviFrames', () => {
		it('should decode to RGBA frames', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])
			const avi = encodeAvi([original])
			const decoded = decodeAviFrames(avi)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(16)
			expect(decoded[0]!.height).toBe(16)
		})

		it('should decode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const avi = encodeAvi(frames)
			const decoded = decodeAviFrames(avi)

			expect(decoded.length).toBe(3)
		})
	})

	describe('decodeAviFrame', () => {
		it('should decode specific frame', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const avi = encodeAvi(frames)

			const frame1 = decodeAviFrame(avi, 1)
			expect(frame1.width).toBe(16)
			expect(frame1.height).toBe(16)
		})

		it('should throw for invalid frame index', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const avi = encodeAvi([frame])

			expect(() => decodeAviFrame(avi, 5)).toThrow('Invalid frame index')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip solid color', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])

			const encoded = encodeAvi([original])
			const decoded = decodeAviFrames(encoded)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(original.width)
			expect(decoded[0]!.height).toBe(original.height)

			// Color should be approximately preserved (MJPEG lossy)
			const centerIdx = (8 * 16 + 8) * 4
			expect(decoded[0]!.data[centerIdx]).toBeGreaterThan(150)
			expect(decoded[0]!.data[centerIdx]).toBeLessThan(250)
		})

		it('should roundtrip gradient', () => {
			const original = createGradientFrame(32, 32)

			const encoded = encodeAvi([original])
			const decoded = decodeAviFrames(encoded)

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

			const encoded = encodeAvi(frames)
			const decoded = decodeAviFrames(encoded)

			expect(decoded.length).toBe(3)
			for (const frame of decoded) {
				expect(frame.width).toBe(16)
				expect(frame.height).toBe(16)
			}
		})

		it('should roundtrip with different sizes', () => {
			for (const size of [8, 16, 32, 64]) {
				const original = createTestFrame(size, size, [128, 64, 192])
				const encoded = encodeAvi([original])
				const decoded = decodeAviFrames(encoded)

				expect(decoded.length).toBe(1)
				expect(decoded[0]!.width).toBe(size)
				expect(decoded[0]!.height).toBe(size)
			}
		})
	})
})

import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import {
	createFlicAnimation,
	decodeFlic,
	decodeFlicFrame,
	encodeFlic,
	isFlic,
	parseFlicInfo,
} from './index'
import { FLIC_MAGIC_FLC } from './types'

describe('FLIC Codec', () => {
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

	describe('isFlic', () => {
		it('should identify FLIC files', () => {
			const img = createTestImage(16, 16, [255, 0, 0])
			const flic = encodeFlic([img])
			expect(isFlic(flic)).toBe(true)
		})

		it('should reject non-FLIC files', () => {
			expect(isFlic(new Uint8Array([0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isFlic(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isFlic(new Uint8Array([]))).toBe(false)
			expect(isFlic(new Uint8Array([0x11, 0xaf]))).toBe(false)
		})
	})

	describe('parseFlicInfo', () => {
		it('should parse FLIC info', () => {
			const img = createTestImage(32, 24, [0, 255, 0])
			const flic = encodeFlic([img, img], { delay: 100 })

			const info = parseFlicInfo(flic)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.frameCount).toBe(2)
			expect(info.delay).toBe(100)
			expect(info.isFLC).toBe(true)
		})
	})

	describe('encodeFlic', () => {
		it('should encode single frame', () => {
			const img = createTestImage(8, 8, [255, 0, 0])
			const flic = encodeFlic([img])

			expect(isFlic(flic)).toBe(true)
			expect(flic.length).toBeGreaterThan(128) // Header size
		})

		it('should encode multiple frames', () => {
			const frames = [
				createTestImage(8, 8, [255, 0, 0]),
				createTestImage(8, 8, [0, 255, 0]),
				createTestImage(8, 8, [0, 0, 255]),
			]
			const flic = encodeFlic(frames)

			expect(isFlic(flic)).toBe(true)
		})

		it('should handle empty input', () => {
			const flic = encodeFlic([])
			expect(flic.length).toBe(0)
		})

		it('should respect delay option', () => {
			const img = createTestImage(8, 8, [128, 128, 128])
			const flic = encodeFlic([img], { delay: 150 })

			const info = parseFlicInfo(flic)
			expect(info.delay).toBe(150)
		})
	})

	describe('decodeFlic', () => {
		it('should decode FLIC animation', () => {
			const frames = [createTestImage(16, 16, [255, 0, 0]), createTestImage(16, 16, [0, 255, 0])]
			const flic = encodeFlic(frames, { delay: 50 })

			const anim = decodeFlic(flic)

			expect(anim.info.width).toBe(16)
			expect(anim.info.height).toBe(16)
			expect(anim.info.frameCount).toBe(2)
			expect(anim.frames.length).toBe(2)
		})

		it('should decode frame images', () => {
			const img = createTestImage(8, 8, [200, 100, 50])
			const flic = encodeFlic([img])

			const anim = decodeFlic(flic)

			expect(anim.frames[0]!.image.width).toBe(8)
			expect(anim.frames[0]!.image.height).toBe(8)
			expect(anim.frames[0]!.image.data.length).toBe(8 * 8 * 4)
		})

		it('should preserve frame timestamps', () => {
			const frames = [
				createTestImage(8, 8, [255, 0, 0]),
				createTestImage(8, 8, [0, 255, 0]),
				createTestImage(8, 8, [0, 0, 255]),
			]
			const flic = encodeFlic(frames, { delay: 100 })

			const anim = decodeFlic(flic)

			expect(anim.frames[0]!.timestamp).toBe(0)
			expect(anim.frames[1]!.timestamp).toBe(100)
			expect(anim.frames[2]!.timestamp).toBe(200)
		})
	})

	describe('decodeFlicFrame', () => {
		it('should decode single frame', () => {
			const frames = [createTestImage(8, 8, [255, 0, 0]), createTestImage(8, 8, [0, 255, 0])]
			const flic = encodeFlic(frames)

			const frame = decodeFlicFrame(flic, 0)

			expect(frame).not.toBeNull()
			expect(frame!.width).toBe(8)
			expect(frame!.height).toBe(8)
		})

		it('should return null for invalid index', () => {
			const img = createTestImage(8, 8, [128, 128, 128])
			const flic = encodeFlic([img])

			expect(decodeFlicFrame(flic, -1)).toBeNull()
			expect(decodeFlicFrame(flic, 10)).toBeNull()
		})
	})

	describe('createFlicAnimation', () => {
		it('should create animation object', () => {
			const frames = [createTestImage(16, 12, [255, 0, 0]), createTestImage(16, 12, [0, 255, 0])]

			const anim = createFlicAnimation(frames, { delay: 80 })

			expect(anim.info.width).toBe(16)
			expect(anim.info.height).toBe(12)
			expect(anim.info.frameCount).toBe(2)
			expect(anim.info.delay).toBe(80)
			expect(anim.frames.length).toBe(2)
		})

		it('should handle empty input', () => {
			const anim = createFlicAnimation([])

			expect(anim.info.frameCount).toBe(0)
			expect(anim.frames.length).toBe(0)
		})
	})

	describe('roundtrip', () => {
		it('should encode and decode correctly', () => {
			const original = [
				createTestImage(16, 16, [255, 0, 0]),
				createTestImage(16, 16, [0, 255, 0]),
				createTestImage(16, 16, [0, 0, 255]),
			]

			const encoded = encodeFlic(original, { delay: 66 })
			const decoded = decodeFlic(encoded)

			expect(decoded.frames.length).toBe(3)
			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)

			// Check frame dimensions
			for (const frame of decoded.frames) {
				expect(frame.image.width).toBe(16)
				expect(frame.image.height).toBe(16)
			}
		})

		it('should handle gradient images', () => {
			const original = [createGradientImage(32, 32)]

			const encoded = encodeFlic(original)
			const decoded = decodeFlic(encoded)

			expect(decoded.frames.length).toBe(1)
			expect(decoded.frames[0]!.image.width).toBe(32)
			expect(decoded.frames[0]!.image.height).toBe(32)
		})

		it('should handle delta compression', () => {
			// Create frames with small differences
			const frame1 = createTestImage(16, 16, [100, 100, 100])
			const frame2 = createTestImage(16, 16, [100, 100, 100])
			// Modify a few pixels in frame2
			frame2.data[0] = 200
			frame2.data[1] = 50
			frame2.data[2] = 50

			const encoded = encodeFlic([frame1, frame2])
			const decoded = decodeFlic(encoded)

			expect(decoded.frames.length).toBe(2)
		})
	})
})

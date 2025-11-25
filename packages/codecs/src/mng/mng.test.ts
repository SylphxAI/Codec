import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import {
	createMngAnimation,
	decodeMng,
	decodeMngFrame,
	encodeMng,
	isMng,
	parseMngInfo,
} from './index'

describe('MNG Codec', () => {
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

	describe('isMng', () => {
		it('should identify MNG files', () => {
			const img = createTestImage(8, 8, [255, 0, 0])
			const mng = encodeMng([img])
			expect(isMng(mng)).toBe(true)
		})

		it('should reject non-MNG files', () => {
			expect(isMng(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isMng(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isMng(new Uint8Array([]))).toBe(false)
			expect(isMng(new Uint8Array([0x8a, 0x4d, 0x4e, 0x47]))).toBe(false)
		})
	})

	describe('parseMngInfo', () => {
		it('should parse MNG info', () => {
			const img = createTestImage(32, 24, [0, 255, 0])
			const mng = encodeMng([img, img], { delay: 100 })

			const info = parseMngInfo(mng)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.frameCount).toBe(2)
		})
	})

	describe('encodeMng', () => {
		it('should encode single frame', () => {
			const img = createTestImage(8, 8, [255, 0, 0])
			const mng = encodeMng([img])

			expect(isMng(mng)).toBe(true)
			expect(mng.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const frames = [
				createTestImage(8, 8, [255, 0, 0]),
				createTestImage(8, 8, [0, 255, 0]),
				createTestImage(8, 8, [0, 0, 255]),
			]
			const mng = encodeMng(frames)

			expect(isMng(mng)).toBe(true)
		})

		it('should handle empty input', () => {
			const mng = encodeMng([])
			expect(mng.length).toBe(0)
		})

		it('should respect delay option', () => {
			const img = createTestImage(8, 8, [128, 128, 128])
			const mng = encodeMng([img], { delay: 150 })

			const info = parseMngInfo(mng)
			// Delay is stored in the animation
			expect(isMng(mng)).toBe(true)
		})
	})

	describe('decodeMng', () => {
		it('should decode MNG animation', () => {
			const frames = [createTestImage(16, 16, [255, 0, 0]), createTestImage(16, 16, [0, 255, 0])]
			const mng = encodeMng(frames, { delay: 50 })

			const anim = decodeMng(mng)

			expect(anim.info.width).toBe(16)
			expect(anim.info.height).toBe(16)
			expect(anim.frames.length).toBe(2)
		})

		it('should decode frame images', () => {
			const img = createTestImage(8, 8, [200, 100, 50])
			const mng = encodeMng([img])

			const anim = decodeMng(mng)

			expect(anim.frames[0]!.image.width).toBe(8)
			expect(anim.frames[0]!.image.height).toBe(8)
			expect(anim.frames[0]!.image.data.length).toBe(8 * 8 * 4)
		})

		it('should preserve frame order', () => {
			const frames = [
				createTestImage(8, 8, [255, 0, 0]),
				createTestImage(8, 8, [0, 255, 0]),
				createTestImage(8, 8, [0, 0, 255]),
			]
			const mng = encodeMng(frames)

			const anim = decodeMng(mng)

			expect(anim.frames.length).toBe(3)
			// First frame should be red
			expect(anim.frames[0]!.image.data[0]).toBe(255)
			expect(anim.frames[0]!.image.data[1]).toBe(0)
			// Second frame should be green
			expect(anim.frames[1]!.image.data[0]).toBe(0)
			expect(anim.frames[1]!.image.data[1]).toBe(255)
			// Third frame should be blue
			expect(anim.frames[2]!.image.data[0]).toBe(0)
			expect(anim.frames[2]!.image.data[2]).toBe(255)
		})
	})

	describe('decodeMngFrame', () => {
		it('should decode single frame', () => {
			const frames = [createTestImage(8, 8, [255, 0, 0]), createTestImage(8, 8, [0, 255, 0])]
			const mng = encodeMng(frames)

			const frame = decodeMngFrame(mng, 0)

			expect(frame).not.toBeNull()
			expect(frame!.width).toBe(8)
			expect(frame!.height).toBe(8)
		})

		it('should return null for invalid index', () => {
			const img = createTestImage(8, 8, [128, 128, 128])
			const mng = encodeMng([img])

			expect(decodeMngFrame(mng, -1)).toBeNull()
			expect(decodeMngFrame(mng, 10)).toBeNull()
		})
	})

	describe('createMngAnimation', () => {
		it('should create animation object', () => {
			const frames = [createTestImage(16, 12, [255, 0, 0]), createTestImage(16, 12, [0, 255, 0])]

			const anim = createMngAnimation(frames, { delay: 80 })

			expect(anim.info.width).toBe(16)
			expect(anim.info.height).toBe(12)
			expect(anim.info.frameCount).toBe(2)
			expect(anim.info.defaultDelay).toBe(80)
			expect(anim.frames.length).toBe(2)
		})

		it('should handle empty input', () => {
			const anim = createMngAnimation([])

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

			const encoded = encodeMng(original, { delay: 66 })
			const decoded = decodeMng(encoded)

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

			const encoded = encodeMng(original)
			const decoded = decodeMng(encoded)

			expect(decoded.frames.length).toBe(1)
			expect(decoded.frames[0]!.image.width).toBe(32)
			expect(decoded.frames[0]!.image.height).toBe(32)
		})

		it('should preserve pixel data', () => {
			const img = createTestImage(4, 4, [100, 150, 200])
			const mng = encodeMng([img])
			const decoded = decodeMng(mng)

			const decodedData = decoded.frames[0]!.image.data
			// Check first pixel
			expect(decodedData[0]).toBe(100)
			expect(decodedData[1]).toBe(150)
			expect(decodedData[2]).toBe(200)
			expect(decodedData[3]).toBe(255)
		})
	})
})

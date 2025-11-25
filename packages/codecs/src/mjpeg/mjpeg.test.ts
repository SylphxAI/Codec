import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import { encodeJpeg } from '../jpeg'
import {
	addMjpegFrame,
	createMjpegStream,
	decodeMjpeg,
	decodeMjpegFrame,
	encodeMjpeg,
	encodeMjpegStream,
	extractMjpegFrames,
	isMjpeg,
	parseMjpegInfo,
} from './index'

describe('MJPEG Codec', () => {
	// Create test image
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

	// Create raw MJPEG stream from images
	function createTestMjpegStream(images: ImageData[]): Uint8Array {
		const jpegFrames = images.map((img) => encodeJpeg(img, { quality: 80 }))
		let totalSize = 0
		for (const frame of jpegFrames) {
			totalSize += frame.length
		}
		const result = new Uint8Array(totalSize)
		let offset = 0
		for (const frame of jpegFrames) {
			result.set(frame, offset)
			offset += frame.length
		}
		return result
	}

	describe('isMjpeg', () => {
		it('should identify MJPEG streams', () => {
			const img = createTestImage(8, 8, [255, 0, 0])
			const stream = createTestMjpegStream([img])
			expect(isMjpeg(stream)).toBe(true)
		})

		it('should reject non-MJPEG data', () => {
			expect(isMjpeg(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isMjpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isMjpeg(new Uint8Array([]))).toBe(false)
			expect(isMjpeg(new Uint8Array([0xff]))).toBe(false)
		})
	})

	describe('parseMjpegInfo', () => {
		it('should parse stream info', () => {
			const img1 = createTestImage(16, 8, [255, 0, 0])
			const img2 = createTestImage(16, 8, [0, 255, 0])
			const stream = createTestMjpegStream([img1, img2])

			const info = parseMjpegInfo(stream, 30)

			expect(info.width).toBe(16)
			expect(info.height).toBe(8)
			expect(info.frameCount).toBe(2)
			expect(info.frameRate).toBe(30)
		})

		it('should handle single frame', () => {
			const img = createTestImage(8, 8, [128, 128, 128])
			const stream = createTestMjpegStream([img])

			const info = parseMjpegInfo(stream)

			expect(info.frameCount).toBe(1)
		})
	})

	describe('decodeMjpeg', () => {
		it('should decode stream to frames', () => {
			const img1 = createTestImage(8, 8, [255, 0, 0])
			const img2 = createTestImage(8, 8, [0, 255, 0])
			const img3 = createTestImage(8, 8, [0, 0, 255])
			const stream = createTestMjpegStream([img1, img2, img3])

			const result = decodeMjpeg(stream)

			expect(result.frames.length).toBe(3)
			expect(result.info.frameCount).toBe(3)
			expect(result.frames[0]!.index).toBe(0)
			expect(result.frames[1]!.index).toBe(1)
			expect(result.frames[2]!.index).toBe(2)
		})

		it('should decode with frame range', () => {
			const images = Array.from({ length: 5 }, (_, i) => createTestImage(8, 8, [i * 50, 0, 0]))
			const stream = createTestMjpegStream(images)

			const result = decodeMjpeg(stream, { startFrame: 1, endFrame: 3 })

			expect(result.frames.length).toBe(3) // frames 1, 2, 3
			expect(result.frames[0]!.index).toBe(1)
			expect(result.frames[2]!.index).toBe(3)
		})

		it('should decode frames to ImageData', () => {
			const img = createTestImage(8, 8, [200, 100, 50])
			const stream = createTestMjpegStream([img])

			const result = decodeMjpeg(stream, { decodeFrames: true })

			expect(result.frames[0]!.image).toBeDefined()
			expect(result.frames[0]!.image!.width).toBe(8)
			expect(result.frames[0]!.image!.height).toBe(8)
		})
	})

	describe('decodeMjpegFrame', () => {
		it('should decode single frame', () => {
			const img1 = createTestImage(8, 8, [255, 0, 0])
			const img2 = createTestImage(8, 8, [0, 255, 0])
			const stream = createTestMjpegStream([img1, img2])

			const frame = decodeMjpegFrame(stream, 1)

			expect(frame).not.toBeNull()
			expect(frame!.width).toBe(8)
			expect(frame!.height).toBe(8)
		})

		it('should return null for invalid index', () => {
			const img = createTestImage(8, 8, [128, 128, 128])
			const stream = createTestMjpegStream([img])

			expect(decodeMjpegFrame(stream, -1)).toBeNull()
			expect(decodeMjpegFrame(stream, 5)).toBeNull()
		})
	})

	describe('extractMjpegFrames', () => {
		it('should extract all frames as JPEG data', () => {
			const img1 = createTestImage(8, 8, [255, 0, 0])
			const img2 = createTestImage(8, 8, [0, 255, 0])
			const stream = createTestMjpegStream([img1, img2])

			const frames = extractMjpegFrames(stream)

			expect(frames.length).toBe(2)
			// Each frame should be valid JPEG (starts with SOI)
			expect(frames[0]![0]).toBe(0xff)
			expect(frames[0]![1]).toBe(0xd8)
			expect(frames[1]![0]).toBe(0xff)
			expect(frames[1]![1]).toBe(0xd8)
		})
	})

	describe('encodeMjpeg', () => {
		it('should encode images to MJPEG stream', () => {
			const img1 = createTestImage(8, 8, [255, 0, 0])
			const img2 = createTestImage(8, 8, [0, 255, 0])

			const stream = encodeMjpeg([img1, img2], { quality: 80 })

			expect(isMjpeg(stream)).toBe(true)
			// Should have two frames
			const frames = extractMjpegFrames(stream)
			expect(frames.length).toBe(2)
		})

		it('should handle empty input', () => {
			const stream = encodeMjpeg([])
			expect(stream.length).toBe(0)
		})
	})

	describe('createMjpegStream', () => {
		it('should create stream object', () => {
			const img1 = createTestImage(16, 8, [255, 0, 0])
			const img2 = createTestImage(16, 8, [0, 255, 0])

			const stream = createMjpegStream([img1, img2], { frameRate: 24 })

			expect(stream.info.width).toBe(16)
			expect(stream.info.height).toBe(8)
			expect(stream.info.frameCount).toBe(2)
			expect(stream.info.frameRate).toBe(24)
			expect(stream.frames.length).toBe(2)
		})

		it('should preserve frame images', () => {
			const img = createTestImage(8, 8, [128, 128, 128])

			const stream = createMjpegStream([img])

			expect(stream.frames[0]!.image).toBe(img)
		})
	})

	describe('encodeMjpegStream', () => {
		it('should encode stream to raw data', () => {
			const img1 = createTestImage(8, 8, [255, 0, 0])
			const img2 = createTestImage(8, 8, [0, 255, 0])
			const stream = createMjpegStream([img1, img2])

			const encoded = encodeMjpegStream(stream)

			expect(isMjpeg(encoded)).toBe(true)
			const frames = extractMjpegFrames(encoded)
			expect(frames.length).toBe(2)
		})
	})

	describe('addMjpegFrame', () => {
		it('should add frame to existing stream', () => {
			const img1 = createTestImage(8, 8, [255, 0, 0])
			const stream = createMjpegStream([img1])

			const img2 = createTestImage(8, 8, [0, 255, 0])
			const newStream = addMjpegFrame(stream, img2)

			expect(newStream.info.frameCount).toBe(2)
			expect(newStream.frames.length).toBe(2)
			expect(newStream.frames[1]!.index).toBe(1)
		})
	})

	describe('roundtrip', () => {
		it('should encode and decode correctly', () => {
			const images = [
				createTestImage(16, 16, [255, 0, 0]),
				createTestImage(16, 16, [0, 255, 0]),
				createTestImage(16, 16, [0, 0, 255]),
			]

			const encoded = encodeMjpeg(images, { quality: 95 })
			const decoded = decodeMjpeg(encoded, { decodeFrames: true })

			expect(decoded.frames.length).toBe(3)
			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)

			// Check that decoded frames have valid dimensions
			for (const frame of decoded.frames) {
				expect(frame.image!.width).toBe(16)
				expect(frame.image!.height).toBe(16)
			}
		})
	})
})

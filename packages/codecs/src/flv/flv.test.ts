import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import {
	decodeFlv,
	encodeFlv,
	isFlv,
	parseFlvHeader,
	parseFlvInfo,
	FlvTagType,
} from './index'

describe('FLV Codec', () => {
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

	describe('isFlv', () => {
		it('should identify FLV files', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const flv = encodeFlv([frame])
			expect(isFlv(flv)).toBe(true)
		})

		it('should reject non-FLV files', () => {
			expect(isFlv(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isFlv(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isFlv(new Uint8Array([]))).toBe(false)
			expect(isFlv(new Uint8Array([0x46, 0x4c, 0x56]))).toBe(false) // Just FLV
		})
	})

	describe('parseFlvHeader', () => {
		it('should parse FLV header', () => {
			const frame = createTestFrame(32, 24, [0, 255, 0])
			const flv = encodeFlv([frame])

			const header = parseFlvHeader(flv)

			expect(header.version).toBe(1)
			expect(header.hasVideo).toBe(true)
			expect(header.dataOffset).toBe(9)
		})
	})

	describe('parseFlvInfo', () => {
		it('should parse FLV info', () => {
			const frames = [
				createTestFrame(32, 24, [255, 0, 0]),
				createTestFrame(32, 24, [0, 255, 0]),
				createTestFrame(32, 24, [0, 0, 255]),
			]
			const flv = encodeFlv(frames)

			const info = parseFlvInfo(flv)

			expect(info.header.hasVideo).toBe(true)
			expect(info.metadata.width).toBe(32)
			expect(info.metadata.height).toBe(24)
		})

		it('should parse frame rate', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const flv = encodeFlv([frame], { frameRate: 60 })

			const info = parseFlvInfo(flv)

			expect(info.metadata.framerate).toBe(60)
		})
	})

	describe('encodeFlv', () => {
		it('should encode single frame', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const flv = encodeFlv([frame])

			expect(isFlv(flv)).toBe(true)
			expect(flv.length).toBeGreaterThan(50)
		})

		it('should encode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const flv = encodeFlv(frames)

			expect(isFlv(flv)).toBe(true)
		})

		it('should encode with custom options', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const flv = encodeFlv([frame], { frameRate: 24, quality: 90 })

			expect(isFlv(flv)).toBe(true)
			const info = parseFlvInfo(flv)
			expect(info.metadata.framerate).toBe(24)
		})
	})

	describe('decodeFlv', () => {
		it('should decode FLV video', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
			]
			const flv = encodeFlv(frames)
			const decoded = decodeFlv(flv)

			expect(decoded.info.header.hasVideo).toBe(true)
			expect(decoded.tags.length).toBeGreaterThan(0)
		})

		it('should have video tags', () => {
			const frame = createTestFrame(8, 8, [255, 255, 255])
			const flv = encodeFlv([frame])
			const decoded = decodeFlv(flv)

			const videoTags = decoded.tags.filter((t) => t.type === FlvTagType.VIDEO)
			expect(videoTags.length).toBeGreaterThan(0)
		})

		it('should have metadata', () => {
			const frame = createTestFrame(32, 24, [100, 150, 200])
			const flv = encodeFlv([frame])
			const decoded = decodeFlv(flv)

			expect(decoded.info.metadata.width).toBe(32)
			expect(decoded.info.metadata.height).toBe(24)
		})
	})

	describe('roundtrip', () => {
		it('should preserve header info', () => {
			const frames = [
				createTestFrame(16, 16, [200, 100, 50]),
				createTestFrame(16, 16, [50, 100, 200]),
			]

			const encoded = encodeFlv(frames)
			const decoded = decodeFlv(encoded)

			expect(decoded.info.header.hasVideo).toBe(true)
			expect(decoded.info.metadata.width).toBe(16)
			expect(decoded.info.metadata.height).toBe(16)
		})

		it('should preserve metadata', () => {
			const original = createTestFrame(32, 32, [128, 128, 128])

			const encoded = encodeFlv([original], { frameRate: 25 })
			const decoded = decodeFlv(encoded)

			expect(decoded.info.metadata.framerate).toBe(25)
		})

		it('should create correct number of video tags', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]

			const encoded = encodeFlv(frames)
			const decoded = decodeFlv(encoded)

			const videoTags = decoded.tags.filter((t) => t.type === FlvTagType.VIDEO)
			expect(videoTags.length).toBe(3)
		})

		it('should handle different sizes', () => {
			for (const size of [8, 16, 32, 64]) {
				const original = createTestFrame(size, size, [128, 64, 192])
				const encoded = encodeFlv([original])
				const decoded = decodeFlv(encoded)

				expect(decoded.info.metadata.width).toBe(size)
				expect(decoded.info.metadata.height).toBe(size)
			}
		})
	})
})

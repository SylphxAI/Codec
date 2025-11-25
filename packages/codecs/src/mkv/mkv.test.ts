import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import { decodeMkv, decodeMkvFrames, encodeMkv, isMkv, parseMkvInfo } from './index'

describe('MKV Codec', () => {
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

	describe('isMkv', () => {
		it('should identify MKV files', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const mkv = encodeMkv([frame])
			expect(isMkv(mkv)).toBe(true)
		})

		it('should reject non-MKV files', () => {
			expect(isMkv(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isMkv(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isMkv(new Uint8Array([]))).toBe(false)
			expect(isMkv(new Uint8Array([0x1a, 0x45]))).toBe(false)
		})
	})

	describe('parseMkvInfo', () => {
		it('should parse MKV info', () => {
			const frames = [
				createTestFrame(32, 24, [255, 0, 0]),
				createTestFrame(32, 24, [0, 255, 0]),
				createTestFrame(32, 24, [0, 0, 255]),
			]
			const mkv = encodeMkv(frames)

			const info = parseMkvInfo(mkv)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.hasVideo).toBe(true)
		})

		it('should parse doc type', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const mkv = encodeMkv([frame])

			const info = parseMkvInfo(mkv)

			expect(info.docType).toBe('matroska')
		})

		it('should parse WebM doc type', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const mkv = encodeMkv([frame], { docType: 'webm' })

			const info = parseMkvInfo(mkv)

			expect(info.docType).toBe('webm')
		})

		it('should have video track', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const mkv = encodeMkv([frame])

			const info = parseMkvInfo(mkv)

			expect(info.tracks.length).toBe(1)
			expect(info.tracks[0]?.type).toBe(1) // VIDEO
			expect(info.tracks[0]?.codecId).toBe('V_MJPEG')
		})

		it('should parse video dimensions from track', () => {
			const frame = createTestFrame(64, 48, [128, 128, 128])
			const mkv = encodeMkv([frame])

			const info = parseMkvInfo(mkv)

			expect(info.tracks[0]?.video?.pixelWidth).toBe(64)
			expect(info.tracks[0]?.video?.pixelHeight).toBe(48)
		})
	})

	describe('encodeMkv', () => {
		it('should encode single frame', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const mkv = encodeMkv([frame])

			expect(isMkv(mkv)).toBe(true)
			expect(mkv.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const mkv = encodeMkv(frames)

			expect(isMkv(mkv)).toBe(true)
		})

		it('should encode with custom options', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const mkv = encodeMkv([frame], { frameRate: 24, quality: 90 })

			expect(isMkv(mkv)).toBe(true)
		})
	})

	describe('decodeMkv', () => {
		it('should decode MKV file', () => {
			const frames = [createTestFrame(16, 16, [255, 0, 0]), createTestFrame(16, 16, [0, 255, 0])]
			const mkv = encodeMkv(frames)
			const decoded = decodeMkv(mkv)

			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)
			expect(decoded.info.hasVideo).toBe(true)
		})

		it('should parse clusters', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const mkv = encodeMkv(frames)
			const decoded = decodeMkv(mkv)

			expect(decoded.clusters.length).toBe(3)
		})

		it('should have blocks in clusters', () => {
			const frame = createTestFrame(8, 8, [255, 255, 255])
			const mkv = encodeMkv([frame])
			const decoded = decodeMkv(mkv)

			expect(decoded.clusters.length).toBe(1)
			expect(decoded.clusters[0]?.blocks.length).toBe(1)
		})

		it('should parse muxing app', () => {
			const frame = createTestFrame(16, 16, [100, 150, 200])
			const mkv = encodeMkv([frame])
			const decoded = decodeMkv(mkv)

			expect(decoded.info.muxingApp).toBe('mconv')
		})
	})

	describe('decodeMkvFrames', () => {
		it('should decode to RGBA frames', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])
			const mkv = encodeMkv([original])
			const decoded = decodeMkvFrames(mkv)

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
			const mkv = encodeMkv(frames)
			const decoded = decodeMkvFrames(mkv)

			expect(decoded.length).toBe(3)
		})
	})

	describe('roundtrip', () => {
		it('should preserve dimensions', () => {
			const frames = [createTestFrame(16, 16, [200, 100, 50]), createTestFrame(16, 16, [50, 100, 200])]

			const encoded = encodeMkv(frames)
			const decoded = decodeMkv(encoded)

			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)
		})

		it('should decode MJPEG frames', () => {
			const original = createTestFrame(32, 32, [128, 128, 128])

			const encoded = encodeMkv([original])
			const decoded = decodeMkvFrames(encoded)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(32)
			expect(decoded[0]!.height).toBe(32)
		})

		it('should handle different sizes', () => {
			for (const size of [8, 16, 32, 64]) {
				const original = createTestFrame(size, size, [128, 64, 192])
				const encoded = encodeMkv([original])
				const decoded = decodeMkv(encoded)

				expect(decoded.info.width).toBe(size)
				expect(decoded.info.height).toBe(size)
			}
		})

		it('should preserve color approximately', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])

			const encoded = encodeMkv([original])
			const decoded = decodeMkvFrames(encoded)

			expect(decoded.length).toBe(1)

			// Check center pixel (JPEG lossy so approximate)
			const idx = (8 * 16 + 8) * 4
			expect(decoded[0]!.data[idx]).toBeGreaterThan(150)
			expect(decoded[0]!.data[idx]).toBeLessThan(250)
		})

		it('should preserve frame count', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
				createTestFrame(16, 16, [255, 255, 0]),
				createTestFrame(16, 16, [255, 0, 255]),
			]

			const encoded = encodeMkv(frames)
			const decoded = decodeMkvFrames(encoded)

			expect(decoded.length).toBe(5)
		})
	})
})

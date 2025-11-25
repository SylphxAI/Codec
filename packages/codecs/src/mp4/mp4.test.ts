import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import {
	decodeMp4,
	decodeMp4Frames,
	encodeMp4,
	isMp4,
	parseMp4Info,
} from './index'

describe('MP4 Codec', () => {
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

	describe('isMp4', () => {
		it('should identify MP4 files', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const mp4 = encodeMp4([frame])
			expect(isMp4(mp4)).toBe(true)
		})

		it('should reject non-MP4 files', () => {
			expect(isMp4(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isMp4(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isMp4(new Uint8Array([]))).toBe(false)
			expect(isMp4(new Uint8Array([0, 0, 0, 8]))).toBe(false)
		})
	})

	describe('parseMp4Info', () => {
		it('should parse MP4 info', () => {
			const frames = [
				createTestFrame(32, 24, [255, 0, 0]),
				createTestFrame(32, 24, [0, 255, 0]),
				createTestFrame(32, 24, [0, 0, 255]),
			]
			const mp4 = encodeMp4(frames)

			const info = parseMp4Info(mp4)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.hasVideo).toBe(true)
		})

		it('should parse ftyp brand', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const mp4 = encodeMp4([frame])

			const info = parseMp4Info(mp4)

			expect(info.ftyp.majorBrand).toBe('isom')
		})

		it('should have video track', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const mp4 = encodeMp4([frame])

			const info = parseMp4Info(mp4)

			expect(info.videoTrack).toBeDefined()
			expect(info.videoTrack?.codec).toBe('jpeg')
		})
	})

	describe('encodeMp4', () => {
		it('should encode single frame', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const mp4 = encodeMp4([frame])

			expect(isMp4(mp4)).toBe(true)
			expect(mp4.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const mp4 = encodeMp4(frames)

			expect(isMp4(mp4)).toBe(true)
		})

		it('should encode with custom options', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const mp4 = encodeMp4([frame], { frameRate: 24, quality: 90 })

			expect(isMp4(mp4)).toBe(true)
		})
	})

	describe('decodeMp4', () => {
		it('should decode MP4 video', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
			]
			const mp4 = encodeMp4(frames)
			const decoded = decodeMp4(mp4)

			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)
			expect(decoded.info.hasVideo).toBe(true)
		})

		it('should have mdat data', () => {
			const frame = createTestFrame(8, 8, [255, 255, 255])
			const mp4 = encodeMp4([frame])
			const decoded = decodeMp4(mp4)

			expect(decoded.mdatData).toBeDefined()
			expect(decoded.mdatData!.length).toBeGreaterThan(0)
		})

		it('should parse tracks', () => {
			const frame = createTestFrame(32, 24, [100, 150, 200])
			const mp4 = encodeMp4([frame])
			const decoded = decodeMp4(mp4)

			expect(decoded.info.tracks.length).toBe(1)
			expect(decoded.info.tracks[0]?.type).toBe('video')
		})
	})

	describe('decodeMp4Frames', () => {
		it('should decode to RGBA frames', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])
			const mp4 = encodeMp4([original])
			const decoded = decodeMp4Frames(mp4)

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
			const mp4 = encodeMp4(frames)
			const decoded = decodeMp4Frames(mp4)

			expect(decoded.length).toBe(3)
		})
	})

	describe('roundtrip', () => {
		it('should preserve dimensions', () => {
			const frames = [
				createTestFrame(16, 16, [200, 100, 50]),
				createTestFrame(16, 16, [50, 100, 200]),
			]

			const encoded = encodeMp4(frames)
			const decoded = decodeMp4(encoded)

			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)
		})

		it('should decode JPEG frames', () => {
			const original = createTestFrame(32, 32, [128, 128, 128])

			const encoded = encodeMp4([original])
			const decoded = decodeMp4Frames(encoded)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(32)
			expect(decoded[0]!.height).toBe(32)
		})

		it('should handle different sizes', () => {
			for (const size of [8, 16, 32, 64]) {
				const original = createTestFrame(size, size, [128, 64, 192])
				const encoded = encodeMp4([original])
				const decoded = decodeMp4(encoded)

				expect(decoded.info.width).toBe(size)
				expect(decoded.info.height).toBe(size)
			}
		})

		it('should preserve color approximately', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])

			const encoded = encodeMp4([original])
			const decoded = decodeMp4Frames(encoded)

			expect(decoded.length).toBe(1)

			// Check center pixel (JPEG lossy so approximate)
			const idx = (8 * 16 + 8) * 4
			expect(decoded[0]!.data[idx]).toBeGreaterThan(150)
			expect(decoded[0]!.data[idx]).toBeLessThan(250)
		})
	})
})

import { describe, expect, it } from 'bun:test'
import type { VideoData } from '@sylphx/codec-core'
import { decodeOgv, decodeOgvToVideo, isOgv, parseOgvInfo } from './decoder'
import { encodeOgv } from './encoder'

describe('OGV Codec', () => {
	// Create test video with solid color frames
	function createTestVideo(
		width: number,
		height: number,
		frameCount: number,
		fps: number
	): VideoData {
		const frames = []
		const frameDuration = 1000 / fps

		for (let i = 0; i < frameCount; i++) {
			const imageData = new Uint8Array(width * height * 4)
			// Fill with color based on frame index
			const r = (i * 50) % 256
			const g = (i * 100) % 256
			const b = (i * 150) % 256

			for (let j = 0; j < width * height; j++) {
				imageData[j * 4] = r
				imageData[j * 4 + 1] = g
				imageData[j * 4 + 2] = b
				imageData[j * 4 + 3] = 255 // Alpha
			}

			frames.push({
				image: {
					width,
					height,
					data: imageData,
				},
				timestamp: i * frameDuration,
				duration: frameDuration,
			})
		}

		return {
			width,
			height,
			frames,
			duration: frameCount * frameDuration,
			fps,
		}
	}

	describe('isOgv', () => {
		it('should identify OGV files', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			expect(isOgv(ogv)).toBe(true)
		})

		it('should reject non-OGV files', () => {
			expect(isOgv(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isOgv(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isOgv(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
		})

		it('should reject OGG files without Theora', () => {
			// OggS header but not Theora
			const data = new Uint8Array(100)
			data[0] = 0x4f // 'O'
			data[1] = 0x67 // 'g'
			data[2] = 0x67 // 'g'
			data[3] = 0x53 // 'S'
			data[4] = 0 // Version
			data[5] = 0x02 // BOS flag
			data[26] = 1 // Segment count
			data[27] = 7 // Segment size
			// Not Theora signature
			data[28] = 0x01
			data[29] = 0x76 // 'v'
			data[30] = 0x6f // 'o'

			expect(isOgv(data)).toBe(false)
		})

		it('should handle short data', () => {
			expect(isOgv(new Uint8Array([]))).toBe(false)
			expect(isOgv(new Uint8Array([0x4f, 0x67]))).toBe(false)
		})
	})

	describe('parseOgvInfo', () => {
		it('should parse video dimensions', () => {
			const video = createTestVideo(640, 480, 5, 30)
			const ogv = encodeOgv(video)

			const info = parseOgvInfo(ogv)

			expect(info.width).toBe(640)
			expect(info.height).toBe(480)
		})

		it('should parse frame rate', () => {
			const video = createTestVideo(320, 240, 5, 25)
			const ogv = encodeOgv(video)

			const info = parseOgvInfo(ogv)

			expect(info.fps).toBeCloseTo(25, 0)
		})

		it('should indicate video presence', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)

			const info = parseOgvInfo(ogv)

			expect(info.hasVideo).toBe(true)
		})

		it('should parse Theora stream info', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)

			const info = parseOgvInfo(ogv)

			expect(info.streams.length).toBeGreaterThan(0)
			expect(info.streams[0]?.codecId).toBe('theora')
			expect(info.streams[0]?.codecName).toBe('Theora')
		})

		it('should parse Theora header details', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)

			const info = parseOgvInfo(ogv)
			const theora = info.streams[0]?.theoraInfo

			expect(theora).toBeDefined()
			expect(theora?.pictureWidth).toBe(320)
			expect(theora?.pictureHeight).toBe(240)
			expect(theora?.versionMajor).toBe(3)
			expect(theora?.versionMinor).toBe(2)
		})
	})

	describe('encodeOgv', () => {
		it('should encode video to OGV', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)

			expect(isOgv(ogv)).toBe(true)
			expect(ogv.length).toBeGreaterThan(100)
		})

		it('should encode different dimensions', () => {
			const video = createTestVideo(640, 480, 3, 30)
			const ogv = encodeOgv(video)

			expect(isOgv(ogv)).toBe(true)
			const info = parseOgvInfo(ogv)
			expect(info.width).toBe(640)
			expect(info.height).toBe(480)
		})

		it('should encode different frame rates', () => {
			const video = createTestVideo(320, 240, 5, 60)
			const ogv = encodeOgv(video)

			expect(isOgv(ogv)).toBe(true)
			const info = parseOgvInfo(ogv)
			expect(info.fps).toBeCloseTo(60, 0)
		})

		it('should encode with custom quality', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video, { quality: 32 })

			expect(isOgv(ogv)).toBe(true)
		})

		it('should encode with custom keyframe interval', () => {
			const video = createTestVideo(320, 240, 10, 30)
			const ogv = encodeOgv(video, { keyframeInterval: 5 })

			expect(isOgv(ogv)).toBe(true)
		})

		it('should encode video with no frames', () => {
			const video = createTestVideo(320, 240, 0, 30)
			const ogv = encodeOgv(video)

			expect(isOgv(ogv)).toBe(true)
		})
	})

	describe('decodeOgv', () => {
		it('should decode OGV structure', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgv(ogv)

			expect(decoded.pages.length).toBeGreaterThan(0)
			expect(decoded.videoPackets.length).toBeGreaterThan(0)
		})

		it('should find BOS page', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgv(ogv)

			// First page should be BOS
			expect(decoded.pages[0]?.flags & 0x02).toBe(0x02)
		})

		it('should find EOS page', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgv(ogv)

			// Last page should be EOS
			const lastPage = decoded.pages[decoded.pages.length - 1]
			expect(lastPage?.flags & 0x04).toBe(0x04)
		})

		it('should extract video packets', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgv(ogv)

			// Should have video packets (excluding header packets)
			expect(decoded.videoPackets.length).toBeGreaterThan(0)
		})

		it('should parse stream info', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgv(ogv)

			expect(decoded.info.streams.length).toBeGreaterThan(0)
			expect(decoded.info.streams[0]?.codecId).toBe('theora')
		})
	})

	describe('decodeOgvToVideo', () => {
		it('should decode OGV to VideoData', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgvToVideo(ogv)

			expect(decoded.width).toBe(320)
			expect(decoded.height).toBe(240)
			expect(decoded.frames.length).toBeGreaterThan(0)
		})

		it('should preserve dimensions', () => {
			const video = createTestVideo(640, 480, 3, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgvToVideo(ogv)

			expect(decoded.width).toBe(640)
			expect(decoded.height).toBe(480)
		})

		it('should have frame data', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgvToVideo(ogv)

			expect(decoded.frames[0]?.image.width).toBe(320)
			expect(decoded.frames[0]?.image.height).toBe(240)
			expect(decoded.frames[0]?.image.data.length).toBe(320 * 240 * 4)
		})
	})

	describe('roundtrip', () => {
		it('should preserve video dimensions', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgvToVideo(ogv)

			expect(decoded.width).toBe(video.width)
			expect(decoded.height).toBe(video.height)
		})

		it('should preserve frame count', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgvToVideo(ogv)

			expect(decoded.frames.length).toBe(video.frames.length)
		})

		it('should preserve frame rate', () => {
			const video = createTestVideo(320, 240, 5, 30)
			const ogv = encodeOgv(video)
			const decoded = decodeOgvToVideo(ogv)

			expect(decoded.fps).toBeCloseTo(video.fps, 0)
		})

		it('should handle different dimensions', () => {
			for (const [width, height] of [
				[160, 120],
				[320, 240],
				[640, 480],
			]) {
				const video = createTestVideo(width, height, 3, 30)
				const ogv = encodeOgv(video)
				const decoded = decodeOgvToVideo(ogv)

				expect(decoded.width).toBe(width)
				expect(decoded.height).toBe(height)
			}
		})

		it('should handle different frame rates', () => {
			for (const fps of [15, 24, 30, 60]) {
				const video = createTestVideo(320, 240, 3, fps)
				const ogv = encodeOgv(video)
				const decoded = decodeOgvToVideo(ogv)

				expect(decoded.fps).toBeCloseTo(fps, 0)
			}
		})
	})
})

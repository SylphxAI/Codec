import { describe, expect, it } from 'bun:test'
import type { ImageData, VideoData } from '@sylphx/codec-core'
import { WebmCodec, createWebmCodec, decodeWebm, decodeWebmToVideo, encodeWebm, isWebm, parseWebmInfo } from './index'

describe('WebM Codec', () => {
	// Create test VideoData
	function createTestVideo(width: number, height: number, numFrames: number, fps: number = 30): VideoData {
		const frames = []
		const frameDuration = 1000 / fps

		for (let i = 0; i < numFrames; i++) {
			const data = new Uint8Array(width * height * 4)
			// Create different colors for each frame
			const r = (i * 50) % 256
			const g = (i * 100) % 256
			const b = (i * 150) % 256

			for (let j = 0; j < width * height; j++) {
				data[j * 4] = r
				data[j * 4 + 1] = g
				data[j * 4 + 2] = b
				data[j * 4 + 3] = 255
			}

			frames.push({
				image: { width, height, data },
				timestamp: i * frameDuration,
				duration: frameDuration,
			})
		}

		return {
			width,
			height,
			frames,
			duration: numFrames * frameDuration,
			fps,
		}
	}

	describe('isWebm', () => {
		it('should identify WebM files', () => {
			const video = createTestVideo(16, 16, 2, 30)
			const webm = encodeWebm(video)
			expect(isWebm(webm)).toBe(true)
		})

		it('should reject non-WebM files', () => {
			expect(isWebm(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isWebm(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should reject Matroska files with docType=matroska', () => {
			// Create EBML header with docType=matroska
			const header = new Uint8Array([
				0x1a, 0x45, 0xdf, 0xa3, // EBML ID
				0x9f, // Size = 31
				0x42, 0x86, 0x81, 0x01, // EBMLVersion = 1
				0x42, 0xf7, 0x81, 0x01, // EBMLReadVersion = 1
				0x42, 0xf2, 0x81, 0x04, // EBMLMaxIDLength = 4
				0x42, 0xf3, 0x81, 0x08, // EBMLMaxSizeLength = 8
				0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72, 0x6f, 0x73, 0x6b, 0x61, // DocType = "matroska"
			])
			expect(isWebm(header)).toBe(false)
		})

		it('should handle short data', () => {
			expect(isWebm(new Uint8Array([]))).toBe(false)
			expect(isWebm(new Uint8Array([0x1a, 0x45]))).toBe(false)
		})

		it('should handle corrupted EBML header', () => {
			expect(isWebm(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0xff, 0xff]))).toBe(false)
		})
	})

	describe('parseWebmInfo', () => {
		it('should parse WebM info', () => {
			const video = createTestVideo(32, 24, 3, 24)
			const webm = encodeWebm(video)

			const info = parseWebmInfo(webm)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.hasVideo).toBe(true)
			expect(info.docType).toBe('webm')
		})

		it('should parse doc type as webm', () => {
			const video = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(video)

			const info = parseWebmInfo(webm)

			expect(info.docType).toBe('webm')
		})

		it('should have video track', () => {
			const video = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(video)

			const info = parseWebmInfo(webm)

			expect(info.tracks.length).toBe(1)
			expect(info.tracks[0]?.type).toBe(1) // VIDEO
			expect(info.tracks[0]?.codecId).toBe('V_UNCOMPRESSED')
		})

		it('should parse video dimensions from track', () => {
			const video = createTestVideo(64, 48, 1, 30)
			const webm = encodeWebm(video)

			const info = parseWebmInfo(webm)

			expect(info.tracks[0]?.video?.pixelWidth).toBe(64)
			expect(info.tracks[0]?.video?.pixelHeight).toBe(48)
		})

		it('should parse frame rate', () => {
			const video = createTestVideo(32, 32, 1, 24)
			const webm = encodeWebm(video, { frameRate: 24 })

			const info = parseWebmInfo(webm)

			expect(info.fps).toBeCloseTo(24, 0)
		})
	})

	describe('encodeWebm', () => {
		it('should encode single frame', () => {
			const video = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(video)

			expect(isWebm(webm)).toBe(true)
			expect(webm.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const video = createTestVideo(16, 16, 3, 30)
			const webm = encodeWebm(video)

			expect(isWebm(webm)).toBe(true)
		})

		it('should encode with custom frame rate', () => {
			const video = createTestVideo(16, 16, 1, 60)
			const webm = encodeWebm(video, { frameRate: 60 })

			expect(isWebm(webm)).toBe(true)
		})

		it('should throw on empty video', () => {
			const video: VideoData = {
				width: 16,
				height: 16,
				frames: [],
				duration: 0,
				fps: 30,
			}

			expect(() => encodeWebm(video)).toThrow('No frames to encode')
		})
	})

	describe('decodeWebm', () => {
		it('should decode WebM file', () => {
			const video = createTestVideo(16, 16, 2, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)
			expect(decoded.info.hasVideo).toBe(true)
			expect(decoded.info.docType).toBe('webm')
		})

		it('should parse clusters', () => {
			const video = createTestVideo(16, 16, 3, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			expect(decoded.clusters.length).toBe(3)
		})

		it('should have blocks in clusters', () => {
			const video = createTestVideo(8, 8, 1, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			expect(decoded.clusters.length).toBe(1)
			expect(decoded.clusters[0]?.blocks.length).toBe(1)
		})

		it('should parse muxing app', () => {
			const video = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			expect(decoded.info.muxingApp).toBe('mconv-webm')
		})

		it('should parse writing app', () => {
			const video = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			expect(decoded.info.writingApp).toBe('mconv WebM encoder')
		})

		it('should throw on invalid EBML header', () => {
			const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
			expect(() => decodeWebm(invalid)).toThrow('Invalid WebM: missing EBML header')
		})

		it('should throw on non-webm DocType', () => {
			// Create EBML header with docType=matroska
			const header = new Uint8Array([
				0x1a, 0x45, 0xdf, 0xa3, // EBML ID
				0xa0, // Size
				0x42, 0x86, 0x81, 0x01, // EBMLVersion = 1
				0x42, 0xf7, 0x81, 0x01, // EBMLReadVersion = 1
				0x42, 0xf2, 0x81, 0x04, // EBMLMaxIDLength = 4
				0x42, 0xf3, 0x81, 0x08, // EBMLMaxSizeLength = 8
				0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72, 0x6f, 0x73, 0x6b, 0x61, // DocType = "matroska"
				0x42, 0x87, 0x81, 0x04, // DocTypeVersion = 4
				0x42, 0x85, 0x81, 0x02, // DocTypeReadVersion = 2
				0x18, 0x53, 0x80, 0x67, 0x40, 0x00, // Segment with size 0
			])
			expect(() => decodeWebm(header)).toThrow('Invalid WebM: DocType is "matroska", expected "webm"')
		})
	})

	describe('decodeWebmToVideo', () => {
		it('should decode to VideoData', () => {
			const original = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(original)
			const decoded = decodeWebmToVideo(webm)

			expect(decoded.width).toBe(16)
			expect(decoded.height).toBe(16)
			expect(decoded.frames.length).toBe(1)
		})

		it('should decode multiple frames', () => {
			const original = createTestVideo(16, 16, 3, 30)
			const webm = encodeWebm(original)
			const decoded = decodeWebmToVideo(webm)

			expect(decoded.frames.length).toBe(3)
		})

		it('should preserve frame rate', () => {
			const original = createTestVideo(16, 16, 2, 24)
			const webm = encodeWebm(original, { frameRate: 24 })
			const decoded = decodeWebmToVideo(webm)

			expect(decoded.fps).toBeCloseTo(24, 0)
		})

		it('should have video track info', () => {
			const video = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			expect(decoded.info.tracks.length).toBeGreaterThan(0)
			expect(decoded.info.hasVideo).toBe(true)
		})
	})

	describe('WebmCodec class', () => {
		it('should implement VideoCodec interface', () => {
			const codec = new WebmCodec()

			expect(codec.format).toBe('webm')
			expect(typeof codec.decode).toBe('function')
			expect(typeof codec.encode).toBe('function')
		})

		it('should decode with codec.decode()', () => {
			const codec = new WebmCodec()
			const original = createTestVideo(16, 16, 2, 30)
			const webm = encodeWebm(original)

			const decoded = codec.decode(webm)

			expect(decoded.width).toBe(16)
			expect(decoded.height).toBe(16)
			expect(decoded.frames.length).toBe(2)
		})

		it('should encode with codec.encode()', () => {
			const codec = new WebmCodec()
			const video = createTestVideo(16, 16, 1, 30)

			const encoded = codec.encode(video)

			expect(isWebm(encoded)).toBe(true)
		})

		it('should encode with quality option', () => {
			const codec = new WebmCodec()
			const video = createTestVideo(16, 16, 1, 30)

			const encoded = codec.encode(video, { quality: 90 })

			expect(isWebm(encoded)).toBe(true)
		})
	})

	describe('createWebmCodec', () => {
		it('should create WebM codec instance', () => {
			const codec = createWebmCodec()

			expect(codec.format).toBe('webm')
			expect(codec).toBeInstanceOf(WebmCodec)
		})
	})

	describe('roundtrip', () => {
		it('should preserve dimensions', () => {
			const original = createTestVideo(32, 24, 2, 30)
			const encoded = encodeWebm(original)
			const decoded = decodeWebmToVideo(encoded)

			expect(decoded.width).toBe(32)
			expect(decoded.height).toBe(24)
		})

		it('should preserve frame count', () => {
			const original = createTestVideo(16, 16, 5, 30)
			const encoded = encodeWebm(original)
			const decoded = decodeWebmToVideo(encoded)

			expect(decoded.frames.length).toBe(5)
		})

		it('should preserve approximate duration', () => {
			const original = createTestVideo(16, 16, 10, 30)
			const encoded = encodeWebm(original)
			const decoded = decodeWebmToVideo(encoded)

			// Allow tolerance for rounding - original is ~333ms (10 frames at 30fps)
			expect(decoded.duration).toBeGreaterThan(300)
			expect(decoded.duration).toBeLessThan(400)
		})

		it('should handle different sizes', () => {
			for (const size of [8, 16, 32, 64]) {
				const original = createTestVideo(size, size, 1, 30)
				const encoded = encodeWebm(original)
				const decoded = decodeWebmToVideo(encoded)

				expect(decoded.width).toBe(size)
				expect(decoded.height).toBe(size)
			}
		})

		it('should handle different frame rates', () => {
			for (const fps of [24, 30, 60]) {
				const original = createTestVideo(16, 16, 2, fps)
				const encoded = encodeWebm(original, { frameRate: fps })
				const decoded = decodeWebmToVideo(encoded)

				// Allow 2 fps tolerance for rounding
				expect(Math.abs(decoded.fps - fps)).toBeLessThan(2)
			}
		})
	})

	describe('EBML structure', () => {
		it('should have correct EBML magic bytes', () => {
			const video = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(video)

			expect(webm[0]).toBe(0x1a)
			expect(webm[1]).toBe(0x45)
			expect(webm[2]).toBe(0xdf)
			expect(webm[3]).toBe(0xa3)
		})

		it('should include Segment element', () => {
			const video = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			expect(decoded.segments.length).toBeGreaterThan(0)
		})

		it('should include Info element with TimestampScale', () => {
			const video = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			expect(decoded.info.timestampScale).toBeGreaterThan(0)
		})

		it('should include Tracks element', () => {
			const video = createTestVideo(16, 16, 1, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			expect(decoded.info.tracks.length).toBeGreaterThan(0)
		})

		it('should include Cluster elements', () => {
			const video = createTestVideo(16, 16, 2, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			expect(decoded.clusters.length).toBeGreaterThan(0)
		})

		it('should mark keyframes correctly', () => {
			const video = createTestVideo(16, 16, 3, 30)
			const webm = encodeWebm(video)
			const decoded = decodeWebm(webm)

			// First frame should be keyframe
			expect(decoded.clusters[0]?.blocks[0]?.keyframe).toBe(true)
		})
	})
})

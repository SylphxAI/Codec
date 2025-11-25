import { describe, expect, it } from 'bun:test'
import type { VideoData } from '@sylphx/codec-core'
import {
	decodeMov,
	decodeMovFrames,
	decodeMovToVideo,
	isMov,
	parseMovInfo,
} from './decoder'
import { encodeMov } from './encoder'

describe('MOV Codec', () => {
	// Create test VideoData
	function createTestVideo(width: number, height: number, frameCount: number): VideoData {
		const frames = []
		for (let i = 0; i < frameCount; i++) {
			const data = new Uint8Array(width * height * 4)
			// Create gradient based on frame index
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4
					data[idx] = Math.round((x / width) * 255)
					data[idx + 1] = Math.round((y / height) * 255)
					data[idx + 2] = Math.round((i / frameCount) * 255)
					data[idx + 3] = 255
				}
			}
			frames.push({
				image: { width, height, data },
				timestamp: (i * 1000) / 30,
				duration: 1000 / 30,
			})
		}

		return {
			width,
			height,
			frames,
			duration: (frameCount * 1000) / 30,
			fps: 30,
		}
	}

	describe('isMov', () => {
		it('should identify MOV files with qt brand', () => {
			const video = createTestVideo(16, 16, 1)
			const mov = encodeMov(video, { brand: 'qt  ' })
			expect(isMov(mov)).toBe(true)
		})

		it('should identify MOV files with M4V brand', () => {
			const video = createTestVideo(16, 16, 1)
			const mov = encodeMov(video, { brand: 'M4V ' })
			expect(isMov(mov)).toBe(true)
		})

		it('should reject non-MOV files', () => {
			expect(isMov(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isMov(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should reject MP4 files (isom brand)', () => {
			// Create ftyp with isom brand (MP4, not MOV)
			const data = new Uint8Array(20)
			data[0] = 0
			data[1] = 0
			data[2] = 0
			data[3] = 20 // size
			data[4] = 'f'.charCodeAt(0)
			data[5] = 't'.charCodeAt(0)
			data[6] = 'y'.charCodeAt(0)
			data[7] = 'p'.charCodeAt(0)
			data[8] = 'i'.charCodeAt(0)
			data[9] = 's'.charCodeAt(0)
			data[10] = 'o'.charCodeAt(0)
			data[11] = 'm'.charCodeAt(0)
			expect(isMov(data)).toBe(false)
		})

		it('should handle short data', () => {
			expect(isMov(new Uint8Array([]))).toBe(false)
			expect(isMov(new Uint8Array([0, 0, 0, 8]))).toBe(false)
		})
	})

	describe('parseMovInfo', () => {
		it('should parse MOV info', () => {
			const video = createTestVideo(32, 24, 3)
			const mov = encodeMov(video)

			const info = parseMovInfo(mov)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.hasVideo).toBe(true)
		})

		it('should parse ftyp brand as QuickTime', () => {
			const video = createTestVideo(16, 16, 1)
			const mov = encodeMov(video)

			const info = parseMovInfo(mov)

			expect(info.ftyp.majorBrand).toBe('qt  ')
		})

		it('should have video track with jpeg codec', () => {
			const video = createTestVideo(16, 16, 1)
			const mov = encodeMov(video)

			const info = parseMovInfo(mov)

			expect(info.videoTrack).toBeDefined()
			expect(info.videoTrack?.codec).toBe('jpeg')
		})

		it('should parse correct frame rate', () => {
			const video = createTestVideo(16, 16, 2)
			const mov = encodeMov(video, { frameRate: 24 })

			const info = parseMovInfo(mov)

			expect(info.frameRate).toBeCloseTo(24, 0)
		})
	})

	describe('encodeMov', () => {
		it('should encode single frame', () => {
			const video = createTestVideo(16, 16, 1)
			const mov = encodeMov(video)

			expect(isMov(mov)).toBe(true)
			expect(mov.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const video = createTestVideo(16, 16, 3)
			const mov = encodeMov(video)

			expect(isMov(mov)).toBe(true)
		})

		it('should encode with custom options', () => {
			const video = createTestVideo(16, 16, 1)
			const mov = encodeMov(video, { frameRate: 24, quality: 90 })

			expect(isMov(mov)).toBe(true)
		})

		it('should encode with different dimensions', () => {
			for (const size of [8, 16, 32, 64]) {
				const video = createTestVideo(size, size, 1)
				const mov = encodeMov(video)

				expect(isMov(mov)).toBe(true)
			}
		})
	})

	describe('decodeMov', () => {
		it('should decode MOV video', () => {
			const video = createTestVideo(16, 16, 2)
			const mov = encodeMov(video)
			const decoded = decodeMov(mov)

			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)
			expect(decoded.info.hasVideo).toBe(true)
		})

		it('should have mdat data', () => {
			const video = createTestVideo(8, 8, 1)
			const mov = encodeMov(video)
			const decoded = decodeMov(mov)

			expect(decoded.mdatData).toBeDefined()
			expect(decoded.mdatData!.length).toBeGreaterThan(0)
		})

		it('should parse tracks', () => {
			const video = createTestVideo(32, 24, 1)
			const mov = encodeMov(video)
			const decoded = decodeMov(mov)

			expect(decoded.info.tracks.length).toBe(1)
			expect(decoded.info.tracks[0]?.type).toBe('video')
		})

		it('should parse timescale and duration', () => {
			const video = createTestVideo(16, 16, 3)
			const mov = encodeMov(video, { timescale: 30000 })
			const decoded = decodeMov(mov)

			expect(decoded.info.timescale).toBe(30000)
			expect(decoded.info.duration).toBeGreaterThan(0)
		})
	})

	describe('decodeMovFrames', () => {
		it('should decode to RGBA frames', () => {
			const video = createTestVideo(16, 16, 1)
			const mov = encodeMov(video)
			const frames = decodeMovFrames(mov)

			expect(frames.length).toBe(1)
			expect(frames[0]!.width).toBe(16)
			expect(frames[0]!.height).toBe(16)
		})

		it('should decode multiple frames', () => {
			const video = createTestVideo(16, 16, 3)
			const mov = encodeMov(video)
			const frames = decodeMovFrames(mov)

			expect(frames.length).toBe(3)
		})

		it('should preserve dimensions', () => {
			const video = createTestVideo(32, 24, 2)
			const mov = encodeMov(video)
			const frames = decodeMovFrames(mov)

			expect(frames.length).toBe(2)
			expect(frames[0]!.width).toBe(32)
			expect(frames[0]!.height).toBe(24)
		})
	})

	describe('decodeMovToVideo', () => {
		it('should decode to VideoData', () => {
			const original = createTestVideo(16, 16, 2)
			const mov = encodeMov(original)
			const decoded = decodeMovToVideo(mov)

			expect(decoded.width).toBe(16)
			expect(decoded.height).toBe(16)
			expect(decoded.frames.length).toBe(2)
		})

		it('should preserve frame metadata', () => {
			const original = createTestVideo(16, 16, 3)
			const mov = encodeMov(original, { frameRate: 24 })
			const decoded = decodeMovToVideo(mov)

			expect(decoded.fps).toBeCloseTo(24, 0)
			expect(decoded.frames.length).toBe(3)
			expect(decoded.frames[0]!.timestamp).toBeDefined()
			expect(decoded.frames[0]!.duration).toBeDefined()
		})

		it('should throw on empty video', () => {
			// Create invalid MOV without decodable frames
			const data = new Uint8Array(100)
			data[0] = 0
			data[1] = 0
			data[2] = 0
			data[3] = 20 // ftyp size
			data[4] = 'f'.charCodeAt(0)
			data[5] = 't'.charCodeAt(0)
			data[6] = 'y'.charCodeAt(0)
			data[7] = 'p'.charCodeAt(0)
			data[8] = 'q'.charCodeAt(0)
			data[9] = 't'.charCodeAt(0)
			data[10] = ' '.charCodeAt(0)
			data[11] = ' '.charCodeAt(0)

			expect(() => decodeMovToVideo(data)).toThrow()
		})
	})

	describe('roundtrip', () => {
		it('should preserve dimensions', () => {
			const original = createTestVideo(16, 16, 2)
			const encoded = encodeMov(original)
			const decoded = decodeMov(encoded)

			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)
		})

		it('should decode JPEG frames', () => {
			const original = createTestVideo(32, 32, 1)
			const encoded = encodeMov(original)
			const frames = decodeMovFrames(encoded)

			expect(frames.length).toBe(1)
			expect(frames[0]!.width).toBe(32)
			expect(frames[0]!.height).toBe(32)
		})

		it('should handle different sizes', () => {
			for (const size of [8, 16, 32, 64]) {
				const original = createTestVideo(size, size, 1)
				const encoded = encodeMov(original)
				const decoded = decodeMov(encoded)

				expect(decoded.info.width).toBe(size)
				expect(decoded.info.height).toBe(size)
			}
		})

		it('should preserve color approximately', () => {
			const original = createTestVideo(16, 16, 1)
			const encoded = encodeMov(original)
			const decoded = decodeMovFrames(encoded)

			expect(decoded.length).toBe(1)

			// Check that we have valid RGBA data
			expect(decoded[0]!.data.length).toBe(16 * 16 * 4)

			// Check that alpha channel is preserved
			const idx = (8 * 16 + 8) * 4
			expect(decoded[0]!.data[idx + 3]).toBe(255)
		})

		it('should encode and decode to VideoData', () => {
			const original = createTestVideo(32, 24, 3)
			const encoded = encodeMov(original)
			const decoded = decodeMovToVideo(encoded)

			expect(decoded.width).toBe(32)
			expect(decoded.height).toBe(24)
			expect(decoded.frames.length).toBe(3)
		})

		it('should handle high quality encoding', () => {
			const original = createTestVideo(16, 16, 1)
			const encoded = encodeMov(original, { quality: 95 })
			const decoded = decodeMovFrames(encoded)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(16)
			expect(decoded[0]!.height).toBe(16)
		})
	})
})

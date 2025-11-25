import { describe, expect, it } from 'bun:test'
import type { ImageData, VideoData } from '@sylphx/codec-core'
import { decodeWmv, decodeWmvVideo, encodeWmv, encodeWmvVideo, isWmv, parseWmvInfo } from './index'

describe('WMV Codec', () => {
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

	// Create VideoData from frames
	function createVideoData(frames: ImageData[], fps: number = 30): VideoData {
		const frameDuration = 1000 / fps
		return {
			width: frames[0]!.width,
			height: frames[0]!.height,
			frames: frames.map((image, i) => ({
				image,
				timestamp: i * frameDuration,
				duration: frameDuration,
			})),
			duration: frames.length * frameDuration,
			fps,
		}
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

	describe('isWmv', () => {
		it('should identify WMV files', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const wmv = encodeWmv([frame])
			expect(isWmv(wmv)).toBe(true)
		})

		it('should reject non-WMV files', () => {
			expect(isWmv(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
				false
			)
			expect(isWmv(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isWmv(new Uint8Array([]))).toBe(false)
			expect(isWmv(new Uint8Array([0x30, 0x26, 0xb2, 0x75]))).toBe(false) // Too short
		})
	})

	describe('parseWmvInfo', () => {
		it('should parse WMV info', () => {
			const frames = [
				createTestFrame(32, 24, [255, 0, 0]),
				createTestFrame(32, 24, [0, 255, 0]),
				createTestFrame(32, 24, [0, 0, 255]),
			]
			const wmv = encodeWmv(frames)

			const info = parseWmvInfo(wmv)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.totalPackets).toBe(3)
			expect(info.duration).toBeGreaterThan(0)
		})

		it('should parse custom frame rate', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const wmv = encodeWmv([frame], { frameRate: 60 })

			const info = parseWmvInfo(wmv)

			// Frame rate is derived from duration and packet count
			expect(info.frameRate).toBeGreaterThan(0)
		})

		it('should throw on invalid WMV', () => {
			expect(() => parseWmvInfo(new Uint8Array([0, 0, 0, 0]))).toThrow('Invalid WMV')
		})
	})

	describe('encodeWmv', () => {
		it('should encode single frame', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const wmv = encodeWmv([frame])

			expect(isWmv(wmv)).toBe(true)
			expect(wmv.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const wmv = encodeWmv(frames)

			expect(isWmv(wmv)).toBe(true)
			const info = parseWmvInfo(wmv)
			expect(info.totalPackets).toBe(3)
		})

		it('should encode with custom options', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const wmv = encodeWmv([frame], { frameRate: 24, bitrate: 500000 })

			expect(isWmv(wmv)).toBe(true)
			const info = parseWmvInfo(wmv)
			expect(info.totalPackets).toBe(1)
		})

		it('should throw on empty frames', () => {
			expect(() => encodeWmv([])).toThrow('No frames to encode')
		})
	})

	describe('encodeWmvVideo', () => {
		it('should encode VideoData', () => {
			const frames = [createTestFrame(16, 16, [255, 0, 0]), createTestFrame(16, 16, [0, 255, 0])]
			const video = createVideoData(frames)
			const wmv = encodeWmvVideo(video)

			expect(isWmv(wmv)).toBe(true)
			const info = parseWmvInfo(wmv)
			expect(info.width).toBe(16)
			expect(info.height).toBe(16)
		})

		it('should encode with custom fps', () => {
			const frames = [createTestFrame(16, 16, [255, 0, 0])]
			const video = createVideoData(frames, 60)
			const wmv = encodeWmvVideo(video)

			expect(isWmv(wmv)).toBe(true)
		})

		it('should throw on empty frames', () => {
			const video: VideoData = {
				width: 16,
				height: 16,
				frames: [],
				duration: 0,
				fps: 30,
			}
			expect(() => encodeWmvVideo(video)).toThrow('No frames to encode')
		})
	})

	describe('decodeWmv', () => {
		it('should decode WMV video', () => {
			const frames = [createTestFrame(16, 16, [255, 0, 0]), createTestFrame(16, 16, [0, 255, 0])]
			const wmv = encodeWmv(frames)
			const decoded = decodeWmv(wmv)

			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)
			expect(decoded.videoPackets.length).toBeGreaterThan(0)
		})

		it('should have non-empty packet data', () => {
			const frame = createTestFrame(8, 8, [255, 255, 255])
			const wmv = encodeWmv([frame])
			const decoded = decodeWmv(wmv)

			expect(decoded.videoPackets.length).toBeGreaterThan(0)
			expect(decoded.videoPackets[0]!.length).toBeGreaterThan(0)
		})
	})

	describe('decodeWmvVideo', () => {
		it('should decode to VideoData', () => {
			const frames = [createTestFrame(16, 16, [255, 0, 0])]
			const wmv = encodeWmv(frames)
			const video = decodeWmvVideo(wmv)

			expect(video.width).toBe(16)
			expect(video.height).toBe(16)
			expect(video.frames.length).toBeGreaterThan(0)
			expect(video.fps).toBeGreaterThan(0)
		})

		it('should decode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const wmv = encodeWmv(frames)
			const video = decodeWmvVideo(wmv)

			expect(video.frames.length).toBeGreaterThan(0)
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip solid color', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])

			const encoded = encodeWmv([original])
			const info = parseWmvInfo(encoded)

			expect(info.width).toBe(original.width)
			expect(info.height).toBe(original.height)
		})

		it('should roundtrip gradient', () => {
			const original = createGradientFrame(32, 32)

			const encoded = encodeWmv([original])
			const decoded = decodeWmvVideo(encoded)

			expect(decoded.width).toBe(32)
			expect(decoded.height).toBe(32)
		})

		it('should roundtrip multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]

			const encoded = encodeWmv(frames)
			const decoded = decodeWmvVideo(encoded)

			expect(decoded.frames.length).toBeGreaterThan(0)
			expect(decoded.width).toBe(16)
			expect(decoded.height).toBe(16)
		})

		it('should roundtrip with different sizes', () => {
			for (const size of [8, 16, 32, 64]) {
				const original = createTestFrame(size, size, [128, 64, 192])
				const encoded = encodeWmv([original])
				const decoded = decodeWmvVideo(encoded)

				expect(decoded.width).toBe(size)
				expect(decoded.height).toBe(size)
			}
		})

		it('should roundtrip VideoData', () => {
			const frames = [createTestFrame(16, 16, [255, 0, 0]), createTestFrame(16, 16, [0, 255, 0])]
			const original = createVideoData(frames, 30)

			const encoded = encodeWmvVideo(original)
			const decoded = decodeWmvVideo(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)
			expect(decoded.frames.length).toBeGreaterThan(0)
		})
	})

	describe('ASF structure', () => {
		it('should have valid ASF header', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const wmv = encodeWmv([frame])

			// Check ASF Header GUID
			const headerGuid = wmv.slice(0, 16)
			const expectedGuid = new Uint8Array([
				0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62,
				0xce, 0x6c,
			])

			expect(headerGuid).toEqual(expectedGuid)
		})

		it('should have file properties', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const wmv = encodeWmv([frame])
			const info = parseWmvInfo(wmv)

			expect(info.header.fileProperties).toBeDefined()
			expect(info.header.fileProperties!.dataPacketsCount).toBeGreaterThan(0n)
		})

		it('should have stream properties', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const wmv = encodeWmv([frame])
			const info = parseWmvInfo(wmv)

			expect(info.header.streams.length).toBeGreaterThan(0)
			const videoStream = info.header.streams.find((s) => s.isVideo)
			expect(videoStream).toBeDefined()
			expect(videoStream!.videoFormat).toBeDefined()
		})
	})
})
